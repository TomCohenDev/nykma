"""The cutter for a talking-head take (spec.md §6.11). `bun run take` runs it; it can also run alone:

    .venv/Scripts/python py/take.py <clip dir> --cut <cut.json> --take <take.json> --report <cut.md> [--fps 30]
        [--lexicon brands/<brand>/spelling.json] [--mic <file>] [--retranscribe] [--no-face]

<clip dir> is what `bun run footage` unpacked: numbered frames, audio.wav and meta.json. cut.json holds the decisions
(the script's lines, a try picked by hand, highlights, spellings, trims), take.json is what the ad imports, and cut.md is
the cut as a table for the user. Only cut.json is edited by hand; a rerun rebuilds the other two from it in seconds,
because what Whisper heard is cached beside the frames.

How it cuts, in order:

1. The voice. With --mic, a separate mic track is lined up with the camera's sound (cross-correlation, checked for
   drift) and becomes the voice. Then a gentle chain: high-pass at 80 Hz, denoise only when the room is audibly noisy
   (and only part way, since full-strength denoise sounds gated), a de-esser and 3:1 compression -> voice.wav.
2. What was said. Silero VAD (inside faster-whisper) splits the take at pauses, and Whisper hears each piece on its
   own. Run on the whole take, Whisper merges a line said three times into one and loses the retakes, which are the
   whole point here.
3. Which try. Every stretch that could be a script line is scored (how much of the line it covers, how little else it
   says, whether it starts and ends like the line). Each line gets its *last complete* try, in script order, the way
   Descript's Remove Retakes and an editor do it: a speaker restarts because they didn't like the first one.
   Without a script, a sentence whose opening comes again within the next few is an earlier try.
4. Inside the try: a restart with no pause ("tomorrow morning, ten- tomorrow morning ten new ones") loses its first
   half, a stutter its repeat, um/uh/אה/אממ go, and a pause over --pause seconds becomes a jump cut, so what stays
   is about 0.25 s of air, never zero.
5. Cut points sit a little before the first word and after the last (a word's tail is quiet and Whisper ends it
   early), never inside another word, snapped to the ad's frames so sound and picture cut on the same frame.
6. The face. OpenCV finds the face in a few frames of every scene, so the ad frames it without guessing.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import subprocess
import sys
from difflib import SequenceMatcher
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(Path(__file__).resolve().parent), str(Path(__file__).resolve().parent / "blender")]

import whisper  # noqa: E402  (no model loads until something is heard)
from tl import clean  # noqa: E402  (the same rule as said(): no case, punctuation or niqqud)

SR = 16000
HOP = 160  # 10 ms of energy per value
PRE = 0.10  # seconds kept before a part's first word
POST = 0.16  # ... and after its last, before the tail is checked
TAIL_MAX = 0.30  # a quiet tail can run this much past where Whisper ends the word
HEAD_MAX = 0.12  # ... and a soft onset this much before it starts
GUARD = 0.03  # never closer than this to a word that isn't kept
DEFAULT_PAUSE = 0.5  # a longer pause inside a line becomes a jump cut
NOISY = -60.0  # dBFS: a room tone above this is denoised
TRANSCRIPT = 3  # bump when what's cached beside the frames changes shape
FILLERS = {"אה", "אהה", "אההה", "אמ", "אממ", "אמממ", "ממ", "אהם", "um", "umm", "uh", "uhh", "uhm", "erm", "er", "ah", "eh", "hmm", "mm", "mhm"}
COUNT_IN = {"אחת", "אחד", "שתיים", "שתים", "שלוש", "one", "two", "three", "1", "2", "3", "123"}
PREFIX = "והבלמשכ"  # Hebrew one-letter prefixes Whisper sometimes writes as a word of their own

HEB = re.compile(r"[֐-׿]")


# ── small helpers ────────────────────────────────────────────────────────────────

def read_json(path: Path, default=None):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default


def write_json(path: Path, obj, indent: int | None = 1) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=indent) + "\n", encoding="utf-8")


def rel(p: Path) -> str:
    p = Path(p).resolve()
    return p.relative_to(ROOT).as_posix() if p.is_relative_to(ROOT) else str(p)


def public(p: Path) -> str:
    return Path(p).resolve().relative_to(ROOT / "public").as_posix()


def ffmpeg(*args: str) -> str:
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-y", *args], capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode:
        raise SystemExit("ffmpeg failed: " + "\n".join(r.stderr.strip().splitlines()[-4:]))
    return r.stderr


def load(path: Path) -> np.ndarray:
    from faster_whisper.audio import decode_audio
    return decode_audio(str(path), sampling_rate=SR)


def energy(audio: np.ndarray) -> np.ndarray:
    """dB of every 10 ms."""
    n = len(audio) // HOP
    frames = audio[: n * HOP].reshape(n, HOP).astype(np.float64)
    return 10 * np.log10(np.mean(frames ** 2, axis=1) + 1e-12)


def fmt(t: float) -> str:
    return f"{t:.2f}"


# ── 1. the voice ─────────────────────────────────────────────────────────────────

def envelope(audio: np.ndarray) -> np.ndarray:
    e = energy(audio)
    e = np.clip(e - np.percentile(e, 20), 0, None)
    return (e - e.mean()) / (e.std() + 1e-9)


def lag_of(a: np.ndarray, b: np.ndarray, max_lag: int) -> tuple[int, float]:
    """The shift of b against a (b[t + lag] matches a[t]) within ±max_lag, and how sure (a correlation, 0..1)."""
    n = 1 << int(math.ceil(math.log2(len(a) + len(b))))
    c = np.fft.irfft(np.fft.rfft(b, n) * np.conj(np.fft.rfft(a, n)), n)
    lags = np.concatenate([np.arange(0, max_lag + 1), np.arange(-max_lag, 0)])
    vals = np.concatenate([c[: max_lag + 1], c[-max_lag:]])
    k = int(np.argmax(vals))
    norm = math.sqrt(float(np.dot(a, a)) * float(np.dot(b, b))) or 1.0
    return int(lags[k]), float(vals[k] / norm)


def sync_mic(cam_wav: Path, mic: Path, out: Path, seconds: float) -> dict:
    """A separate mic lined up with the camera's sound: mic time = camera time + offset. Writes it at the camera's length."""
    cam, m = load(cam_wav), load(mic)
    ec, em = envelope(cam), envelope(m)
    lag, sure = lag_of(ec, em, max_lag=min(len(em), len(ec), 100 * 120))
    # Refine to the sample on a loud stretch of the camera's track.
    e = energy(cam)
    win = 20 * 100
    if len(e) > win:
        loud = int(np.argmax(np.convolve(e > np.percentile(e, 60), np.ones(win), "valid")))
    else:
        loud = 0
    a0 = loud * HOP
    seg = cam[a0: a0 + win * HOP]
    coarse = lag * HOP
    b0 = max(0, a0 + coarse - 800)
    seg_m = m[b0: b0 + len(seg) + 1600]
    fine = coarse
    if len(seg) > 1600 and len(seg_m) > len(seg):
        sub, _ = lag_of(seg - seg.mean(), seg_m[: len(seg)] - seg_m[: len(seg)].mean(), 800)
        fine = b0 - a0 + sub
    offset = fine / SR
    # Drift: the same lag measured near the start and near the end.
    drift = None
    third = len(ec) // 3
    if third > 3000:
        l1, _ = lag_of(ec[:third], em[max(0, lag): max(0, lag) + third] if lag >= 0 else np.concatenate([np.zeros(-lag), em])[:third], 300)
        tail = ec[-third:]
        start = len(ec) - third + lag
        em_t = em[max(0, start): max(0, start) + third]
        if len(em_t) == third:
            l2, _ = lag_of(tail, em_t, 300)
            drift = round((l2 - l1) * HOP / SR * 1000)
    shift = ["-ss", f"{offset:.5f}", "-i", str(mic)] if offset >= 0 else ["-i", str(mic)]
    delay = [] if offset >= 0 else ["-af", f"adelay={-offset * 1000:.1f}:all=1,apad"]
    ffmpeg(*shift, *(delay or ["-af", "apad"]), "-t", f"{seconds:.3f}", "-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le", str(out))
    return {"offset": round(offset, 4), "sure": round(sure, 3), "drift_ms": drift}


def clean_voice(src: Path, out: Path, floor: float, speech: float, mode: str) -> list[str]:
    """The voice chain. Returns what it did, in words."""
    steps, did = ["highpass=f=80"], ["high-pass at 80 Hz"]
    if mode == "on" or (mode == "auto" and floor > NOISY):
        # Part way: afftdn's nr is how many dB it takes off the noise. 10 is gentle; 100% denoise sounds gated.
        steps.append(f"afftdn=nr=10:nf={max(-80, min(-20, round(floor)))}:tn=1")
        did.append(f"denoise (room tone {floor:.0f} dBFS)")
    thr = 10 ** ((speech - 8) / 20)
    steps += ["deesser=i=0.35:m=0.5:f=0.5", f"acompressor=threshold={thr:.5f}:ratio=3:attack=10:release=150:knee=4"]
    did += ["de-esser", "3:1 compression"]
    ffmpeg("-i", str(src), "-af", ",".join(steps), "-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le", str(out))
    return did


# ── 2. what was said ─────────────────────────────────────────────────────────────

def hear(audio: np.ndarray, lang: str | None, prompt: str | None) -> list[dict]:
    """Utterances, each heard on its own: [{start, end, words: [{text, start, end, p}]}], times in the take."""
    from faster_whisper.vad import VadOptions, get_speech_timestamps
    spans = get_speech_timestamps(audio, VadOptions(threshold=0.45, min_silence_duration_ms=260, speech_pad_ms=60, min_speech_duration_ms=150, max_speech_duration_s=28))
    model = whisper._model(whisper.model_for(lang))
    out = []
    for n, s in enumerate(spans):
        a, b = s["start"], s["end"]
        chunk = audio[a:b]
        segments, _ = model.transcribe(chunk, language=lang, word_timestamps=True, vad_filter=False, condition_on_previous_text=False,
                                       beam_size=5, initial_prompt=prompt or None)
        words = []
        for seg in segments:
            # Whisper invents a sentence for a cough or a breath now and then ("תודה רבה", "Thank you.").
            if seg.no_speech_prob > 0.7 and seg.avg_logprob < -1.0:
                continue
            for w in seg.words or []:
                text = w.word.strip()
                if not text:
                    continue
                st = a / SR + float(w.start)
                en = a / SR + float(w.end)
                words.append({"text": text, "start": round(min(st + whisper.LEAD, en), 3), "end": round(en, 3), "p": round(float(w.probability), 2)})
        out.append({"start": round(a / SR, 3), "end": round(b / SR, 3), "words": words})
        print(f"\r  heard {n + 1}/{len(spans)}", end="", flush=True)
    print()
    return [u for u in out if u["words"]]


# ── 3. which try ─────────────────────────────────────────────────────────────────

def strip_prefix(t: str) -> str:
    return t[1:] if len(t) > 3 and t[0] in PREFIX and HEB.match(t) else t


def same(a: str, b: str) -> bool:
    if a == b:
        return True
    if not a or not b:
        return False
    if strip_prefix(a) == strip_prefix(b):
        return True
    # Whisper's near-spellings of a word (לידס for לידים): the same stem of three letters, a letter or two apart.
    if min(len(a), len(b)) >= 4 and a[:3] == b[:3] and abs(len(a) - len(b)) <= 2:
        return True
    return min(len(a), len(b)) >= 3 and SequenceMatcher(None, a, b).ratio() >= 0.75


def score(line: list[str], heard: list[str]) -> dict:
    """How well a stretch of heard words says a line."""
    mapped = []
    for h in heard:
        hit = next((t for t in line if same(t, h)), None)
        mapped.append(hit if hit is not None else "\0" + h)
    blocks = SequenceMatcher(None, line, mapped, autojunk=False).get_matching_blocks()
    pairs = [(m.a + k, m.b + k) for m in blocks for k in range(m.size)]
    hit = len(pairs)
    cov = hit / max(1, len(line))
    prec = hit / max(1, len(heard))
    f1 = 2 * cov * prec / (cov + prec) if hit else 0.0
    la = {a for a, _ in pairs}
    lb = {b for _, b in pairs}
    head = any(a in la for a in range(min(2, len(line)))) and any(b in lb for b in range(min(3, len(heard))))
    tail = any(a in la for a in range(max(0, len(line) - 2), len(line))) and any(b in lb for b in range(max(0, len(heard) - 3), len(heard)))
    return {"cov": round(cov, 3), "prec": round(prec, 3), "f1": round(f1, 3), "head": head, "tail": tail}


def tokens(text: str) -> list[str]:
    return [t for t in (clean(w) for w in text.split()) if t]


def candidates(line: list[str], words: list[dict], toks: list[str]) -> list[dict]:
    """The tries of this line in the take, in time order: stretches of heard words that start like it, end like it or
    where the speaker stopped, and say about as much. Overlapping stretches are one try, the one that fits best."""
    if not line:
        return []
    heads = [i for i, t in enumerate(toks) if any(same(t, x) for x in line[:2])]
    tails = {j for j, t in enumerate(toks) if any(same(t, x) for x in line[-2:])}
    stops = {j for j, w in enumerate(words) if j + 1 == len(words) or words[j + 1]["u"] != w["u"]}
    starts = {i for i, w in enumerate(words) if i == 0 or words[i - 1]["u"] != w["u"]}
    n = len(line)
    out = []
    for i in heads:
        for j in range(i, min(len(toks), i + 2 * n + 4)):
            if j not in tails and j not in stops and j != i + n - 1:
                continue
            s = score(line, toks[i: j + 1])
            if s["f1"] < 0.4:
                continue
            # A try starts and ends where the speaker did: a word Whisper misheard at the end still belongs to it.
            fit = s["f1"] + 0.08 * (j in stops) + 0.04 * (i in starts)
            out.append({"i": i, "j": j, "start": words[i]["start"], "end": words[j]["end"], "fit": round(fit, 3), **s})
    tries: list[dict] = []
    for c in sorted(out, key=lambda c: -c["fit"]):
        if all(c["j"] < t["i"] or c["i"] > t["j"] for t in tries):
            tries.append(c)
    tries.sort(key=lambda c: c["i"])
    for c in tries:
        c["complete"] = c["cov"] >= 0.75 and c["head"] and c["tail"]
    return tries


def choose(lines: list[dict], words: list[dict]) -> list[dict | None]:
    """One try per line, in script order, each line's last complete one (or the one picked in cut.json)."""
    toks = [clean(w["text"]) for w in words]
    cands = []
    for ln in lines:
        cs = candidates(tokens(ln["line"]), words, toks)
        if ln.get("at"):
            # A line anchored where it was said (a take cut without a script) is looked for only there.
            a0, a1 = ln["at"]
            cs = [c for c in cs if c["start"] >= a0 - 1.0 and c["end"] <= a1 + 1.0] or cs
        done = [c for c in cs if c["complete"]]
        for c in cs:
            c["value"] = (2.0 + 0.3 * c["f1"] + 0.6 * (done.index(c) / max(1, len(done) - 1) if len(done) > 1 else 0)) if c["complete"] else c["f1"]
        pick = ln.get("pick")
        if isinstance(pick, int) and 1 <= pick <= len(cs):
            for k, c in enumerate(cs):
                c["value"] = 100.0 if k == pick - 1 else -1.0
        ln["_tries"] = cs
        cands.append(cs)
    # Dynamic programming over the lines: tries in order, never overlapping; a line can go unfound.
    SKIP = -0.2
    best = [{-1: (0.0, None)}]  # per line: last word used -> (score, back pointer)
    for k, cs in enumerate(cands):
        row: dict[int, tuple[float, tuple | None]] = {}
        for end, (val, _) in best[-1].items():
            cur = row.get(end)
            if cur is None or val + SKIP > cur[0]:
                row[end] = (val + SKIP, (end, None))
            for ci, c in enumerate(cs):
                if c["i"] <= end or c["value"] < 0:
                    continue
                v = val + c["value"]
                cur = row.get(c["j"])
                if cur is None or v > cur[0]:
                    row[c["j"]] = (v, (end, ci))
        best.append(row)
    end = max(best[-1], key=lambda e: best[-1][e][0])
    picks: list[dict | None] = [None] * len(lines)
    for k in range(len(lines), 0, -1):
        _, back = best[k][end]
        prev, ci = back
        picks[k - 1] = cands[k - 1][ci] if ci is not None else None
        end = prev
    return picks


REDO_WITHIN = 60.0  # seconds: an opening said again this soon is a retake, not a refrain


def opening(u: dict) -> list[str]:
    t = [x for x in (clean(w["text"]) for w in u["words"]) if x]
    while t and t[0] in COUNT_IN:
        t = t[1:]
    return t


def resays(a: list[str], b: list[str]) -> bool:
    """b opens the way a does: the speaker started a again."""
    if len(a) < 2 or len(b) < 2 or not same(a[0], b[0]):
        return False
    k = min(4, len(a))
    if k < 3:
        return a[:k] == b[:k] and len(a) == k
    return score(a[:k], b[: k + 1])["cov"] >= 0.75


def free_cut(utts: list[dict], words: list[dict]) -> tuple[list[dict], list[dict], dict[int, str]]:
    """A take with no script, cut the way an editor would: an utterance whose opening comes again within a minute is an
    earlier try, and so is everything after it up to the new start. Count-ins go. What's left, grouped into sentences,
    is the lines. Returns the lines (anchored to where they were said), their picks, and why each left-out word went."""
    n = len(utts)
    why: dict[int, str] = {}
    for a in range(n):
        if a in why:
            continue
        oa = opening(utts[a])
        if not oa:
            why[a] = "a count-in"
            continue
        for b in range(a + 1, n):
            if utts[b]["start"] - utts[a]["start"] > REDO_WITHIN:
                break
            if resays(oa, opening(utts[b])):
                for x in range(a, b):
                    why.setdefault(x, f"an earlier try, started again at {fmt(utts[b]['start'])}")
                break
    first = {}
    for k, w in enumerate(words):
        first.setdefault(w["u"], k)
    groups: list[list[int]] = []
    for u in range(n):
        if u in why:
            continue
        prev = groups[-1][-1] if groups else None
        joined = prev is not None and prev == u - 1 and not re.search(r"[.?!]$", utts[prev]["words"][-1]["text"]) \
            and utts[u]["start"] - utts[prev]["end"] < 1.2 and sum(len(utts[x]["words"]) for x in groups[-1]) < 25
        if joined:
            groups[-1].append(u)
        else:
            groups.append([u])
    lines, picks = [], []
    for k, g in enumerate(groups):
        i = first[g[0]]
        j = first[g[-1]] + len(utts[g[-1]]["words"]) - 1
        # The count-in at the start of an utterance isn't part of the line.
        while i < j and clean(words[i]["text"]) in COUNT_IN:
            i += 1
        text = " ".join(w["text"] for w in words[i: j + 1])
        lines.append({"id": f"s{k + 1}", "line": text, "at": [round(words[i]["start"], 2), round(words[j]["end"], 2)]})
        picks.append({"i": i, "j": j, "f1": 1.0, "complete": True})
    left = {k: why[w["u"]] for k, w in enumerate(words) if w["u"] in why}
    return lines, picks, left


# ── 4. inside the try ────────────────────────────────────────────────────────────

def restarts(toks: list[str], line: list[str]) -> set[int]:
    """Words of a try said again straight after: the first saying goes. Not when the line itself repeats them."""
    drop: set[int] = set()
    n = len(toks)
    for k in range(min(5, n // 2), 0, -1):
        for p in range(n - k):
            if any(x in drop for x in range(p, p + k)):
                continue
            gram = toks[p: p + k]
            for gap in range(0, 3):
                q = p + k + gap
                if q + k > n:
                    break
                between = toks[p + k: q]
                if gap and not all(len(x) <= 3 or any(y.startswith(x) for y in toks[q: q + k + 1]) for x in between):
                    continue
                if [*map(strip_prefix, toks[q: q + k])] != [*map(strip_prefix, gram)]:
                    continue
                in_line = sum(1 for i in range(len(line) - k + 1) if [*map(strip_prefix, line[i: i + k])] == [*map(strip_prefix, gram)])
                if in_line >= 2 or (k == 1 and gap == 0 and len(gram[0]) <= 1):
                    continue
                drop.update(range(p, q))
                break
    return drop


def parts_of(ws: list[dict], drop: set[int], all_words: list[dict], first: int, pause: float, e: np.ndarray, floor: float) -> list[dict]:
    """The stretches of the take a line plays: split at dropped words and at pauses over `pause`."""
    kept = [(k, w) for k, w in enumerate(ws) if k not in drop]
    groups: list[list[tuple[int, dict]]] = []
    for k, w in kept:
        if groups and k - 1 == groups[-1][-1][0] and w["start"] - groups[-1][-1][1]["end"] <= pause:
            groups[-1].append((k, w))
        else:
            groups.append([(k, w)])
    loud = floor + 9
    parts = []
    for g in groups:
        k0, w0 = g[0]
        k1, w1 = g[-1]
        gi0, gi1 = first + k0, first + k1  # in all_words
        lo = all_words[gi0 - 1]["end"] + GUARD if gi0 > 0 else 0.0
        hi = all_words[gi1 + 1]["start"] - GUARD if gi1 + 1 < len(all_words) else w1["end"] + 1.0
        a = max(lo, w0["start"] - PRE)
        # A soft onset Whisper started late: back up while it's still voiced.
        t = int(a * 100)
        stop = max(int(lo * 100), int((w0["start"] - PRE - HEAD_MAX) * 100))
        while t - 1 >= stop and t - 1 < len(e) and e[t - 1] > loud:
            t -= 1
        a = max(lo, t / 100)
        b = min(hi, w1["end"] + POST)
        # A quiet tail Whisper ended early: run on while it's still voiced.
        t = int(b * 100)
        stop = min(int(hi * 100), int((w1["end"] + TAIL_MAX) * 100), len(e))
        while t < stop and e[t] > loud:
            t += 1
        b = min(hi, max(b, t / 100 + 0.04))
        parts.append({"in": a, "out": b, "words": [w for _, w in g]})
    return parts


# ── 6. the face ──────────────────────────────────────────────────────────────────

YUNET = "face_detection_yunet_2023mar.onnx"
YUNET_URL = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/" + YUNET
YUNET_SHA = "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"


def yunet() -> Path | None:
    """OpenCV's YuNet face model (MIT, 230 KB), downloaded once to ~/.cache/nykma/ and checked against its hash."""
    path = Path.home() / ".cache" / "nykma" / YUNET
    if not path.exists():
        import urllib.request
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            data = urllib.request.urlopen(YUNET_URL, timeout=30).read()
        except Exception as e:  # offline: the cut still works, the face is framed by hand
            print(f"  couldn't download the face model ({type(e).__name__}); skipping the face")
            return None
        if hashlib.sha256(data).hexdigest() != YUNET_SHA:
            print("  the face model didn't match its hash; skipping the face")
            return None
        path.write_bytes(data)
    return path


def face_at(det, clip: Path, idx: int) -> list[float] | None:
    """The biggest face in frame idx (from 1): [cx, cy, w, h] as fractions of the frame."""
    import cv2
    img = cv2.imread(str(clip / f"{idx:05d}.jpg"))
    if img is None:
        return None
    h, w = img.shape[:2]
    s = 480 / w
    small = cv2.resize(img, (480, round(h * s)))
    det.setInputSize((small.shape[1], small.shape[0]))
    _, found = det.detect(small)
    if found is None or not len(found):
        return None
    x, y, fw, fh = max(found[:, :4].tolist(), key=lambda r: r[2] * r[3])
    sw, sh = small.shape[1], small.shape[0]
    return [(x + fw / 2) / sw, (y + fh / 2) / sh, fw / sw, fh / sh]


def faces(clip: Path, meta: dict, spans: list[list[tuple[float, float]]]) -> tuple[list[list[float] | None], list[list[float | None]]]:
    """The face in each scene, [cx, cy, w, h] as fractions of the frame (the median over a few frames, None if unseen),
    and for each cut inside a scene how far the head jumps across it (a fraction of the frame's width)."""
    try:
        import cv2
    except ImportError:
        return [None] * len(spans), [[None] * max(0, len(sp) - 1) for sp in spans]
    model = yunet()
    if not model:
        return [None] * len(spans), [[None] * max(0, len(sp) - 1) for sp in spans]
    cv2.setLogLevel(0) if hasattr(cv2, "setLogLevel") else None
    det = cv2.FaceDetectorYN.create(str(model), "", (480, 480), 0.7)
    fps, n = meta["fps"], meta["frames"]
    frame = lambda t: min(n, max(1, int(t * fps) + 1))  # noqa: E731
    boxes_of, jumps_of = [], []
    for sp in spans:
        total = sum(b - a for a, b in sp) or 1
        times = []
        for a, b in sp:
            k = max(1, round(6 * (b - a) / total))
            times += [a + (b - a) * (i + 0.5) / k for i in range(k)]
        boxes = [f for f in (face_at(det, clip, frame(t)) for t in times[:10]) if f]
        boxes_of.append([round(float(v), 3) for v in np.median(np.array(boxes), axis=0)] if boxes else None)
        jumps = []
        for (a0, b0), (a1, b1) in zip(sp, sp[1:]):
            x, y = face_at(det, clip, frame(b0 - 0.5 / fps)), face_at(det, clip, frame(a1))
            jumps.append(round(math.hypot(x[0] - y[0], (x[1] - y[1]) * meta["height"] / meta["width"]) + abs(x[3] - y[3]), 3) if x and y else None)
        jumps_of.append(jumps)
    return boxes_of, jumps_of


# ── checking the cut ─────────────────────────────────────────────────────────────

def verify(take: dict, lang: str | None) -> list[str]:
    """The cut's voice, played part after part as the ad will, heard again by Whisper and compared with the words kept.
    A word missing is one a cut clipped; a word extra is a stray syllable or a retake left in. Returns report lines."""
    voice = ROOT / "public" / take["voice"]
    out = voice.parent / "cut-check.wav"
    parts = [(s["id"], p) for s in take["scenes"] for p in s["parts"]]
    graph = ";".join(f"[0:a]atrim={p['in']}:{p['out']},asetpts=PTS-STARTPTS[a{k}]" for k, (_, p) in enumerate(parts))
    graph += ";" + "".join(f"[a{k}]" for k in range(len(parts))) + f"concat=n={len(parts)}:v=0:a=1[out]"
    ffmpeg("-i", str(voice), "-filter_complex", graph, "-map", "[out]", "-ac", "1", "-ar", str(SR), str(out))
    audio = load(out)
    print("Hearing the cut again…")
    heard = [w for u in hear(audio, lang, None) for w in u["words"]]
    fps = take["fps"]
    # Where each scene starts in the cut, in seconds, to name the scene of a word heard.
    starts, at = [], 0
    for s in take["scenes"]:
        starts.append((at / fps, s["id"]))
        at += s["frames"]
    scene_at = lambda t: next((sid for st, sid in reversed(starts) if t >= st - 0.05), starts[0][1])  # noqa: E731
    want = [(s["id"], w["t"]) for s in take["scenes"] for w in s["words"]]
    a = [clean(t) for _, t in want]
    b = [clean(w["text"]) for w in heard]
    problems = []
    for op, i1, i2, j1, j2 in SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if op == "equal":
            continue
        kept = " ".join(t for _, t in want[i1:i2])
        got = " ".join(w["text"] for w in heard[j1:j2])
        sid = want[i1][0] if i1 < len(want) else scene_at(heard[j1]["start"]) if j1 < len(heard) else "end"
        if op == "replace" and i2 - i1 == j2 - j1 and all(same(x, y) for x, y in zip(a[i1:i2], b[j1:j2])):
            continue  # the same words, spelt the other way
        if op == "delete":
            problems.append(f"| {sid} | {kept} | (nothing) | a cut may clip it: listen |")
        elif op == "insert":
            problems.append(f"| {scene_at(heard[j1]['start'])} | (nothing) | {got} | a stray sound or a retake left in |")
        else:
            problems.append(f"| {sid} | {kept} | {got} | heard differently: a clipped word, or Whisper |")
    match = SequenceMatcher(None, a, b, autojunk=False).ratio()
    print(f"  the cut, heard again: {match:.0%} the same words; {len(problems)} place{'s' if len(problems) != 1 else ''} to listen to")
    if not problems:
        return [f"Heard again, the cut says every kept word and nothing else ({match:.0%} the same)."]
    return [f"Heard again, the cut is {match:.0%} the same words. Where it differs (Whisper mishears too, so listen before you change anything):", "",
            "| Scene | Kept | Heard | Likely |", "|---|---|---|---|", *problems]


# ── spelling and captions ────────────────────────────────────────────────────────

def spell(words: list[dict], fixes: dict[str, str]) -> list[dict]:
    """Whisper's spellings fixed from the lexicon (keys match without punctuation), and a one-letter prefix Whisper
    wrote apart joined to its word with a maqaf: ב + -css, -> ב־CSS,"""
    keyed = {clean(k): v for k, v in fixes.items()}

    def fix(text: str) -> str:
        if text in fixes:
            return fixes[text]
        lead = re.match(r"^[-־]+", text)
        core = text[lead.end():] if lead else text
        m = re.match(r"^(.*?)([.,?!:;״\"]*)$", core)
        body, punct = m.group(1), m.group(2)
        k = clean(body)
        if k in keyed:
            return keyed[k] + (punct if not re.search(r"[.,?!:;]$", keyed[k]) else "")
        return core

    out = []
    for w in words:
        prev = out[-1] if out else None
        if prev and len(prev["text"]) == 1 and prev["text"] in PREFIX and (w["text"].startswith("-") or not HEB.search(w["text"])):
            prev["text"] = prev["text"] + "־" + fix(w["text"])
            prev["end"] = w["end"]
            continue
        out.append({**w, "text": fix(w["text"])})
    return out


def marked(text: str, hl: list[str]) -> bool:
    t = clean(text)
    return any(h and (clean(h) == t or (len(clean(h)) >= 3 and clean(h) in t)) for h in hl)


# ── the cut ──────────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("clip", help="the unpacked clip: public/ads/<slug>/gen/footage/<name>/")
    ap.add_argument("--cut", required=True, help="cut.json: the decisions (made on the first run)")
    ap.add_argument("--take", required=True, help="take.json: what the ad imports")
    ap.add_argument("--report", required=True, help="cut.md: the cut as a table")
    ap.add_argument("--fps", type=int, default=30, help="the ad's frame rate")
    ap.add_argument("--lexicon", help="the brand's spellings, {heard: written}")
    ap.add_argument("--mic", help="a separate mic recording of the same take")
    ap.add_argument("--retranscribe", action="store_true", help="hear the take again instead of using the cache")
    ap.add_argument("--no-face", action="store_true")
    ap.add_argument("--verify", action="store_true", help="hear the cut voice again and compare it with the words kept")
    a = ap.parse_args()

    clip = Path(a.clip).resolve()
    meta = read_json(clip / "meta.json")
    if not meta:
        raise SystemExit(f"{rel(clip)} isn't an unpacked clip (no meta.json). Run bun run footage first.")
    cut_path, take_path, report_path = Path(a.cut), Path(a.take), Path(a.report)
    cut = read_json(cut_path, {}) or {}
    lang = cut.get("lang")
    pause = float(cut.get("pause", DEFAULT_PAUSE))
    fps = a.fps
    lexicon = read_json(Path(a.lexicon), {}) if a.lexicon else {}
    lexicon = {k: v for k, v in (lexicon or {}).items() if not k.startswith("_")}
    fixes = {**lexicon, **cut.get("fix", {})}

    # 1. The voice.
    cam = clip / "audio.wav"
    if not cam.exists():
        raise SystemExit(f"{meta['name']} has no sound to cut by.")
    notes: list[str] = []
    mic_info = None
    src = cam
    mic = a.mic or cut.get("mic")
    if mic:
        mic_path = (ROOT / mic) if not Path(mic).is_absolute() else Path(mic)
        if not mic_path.exists():
            raise SystemExit(f"No mic recording at {mic}")
        synced = clip / "mic.wav"
        if a.retranscribe or not synced.exists() or synced.stat().st_mtime < mic_path.stat().st_mtime:
            mic_info = sync_mic(cam, mic_path, synced, meta["seconds"])
            write_json(clip / "mic.json", mic_info)
        else:
            mic_info = read_json(clip / "mic.json")
        src = synced
        cut["mic"] = rel(mic_path)
        if mic_info and mic_info.get("sure", 1) < 0.3:
            notes.append(f"The mic lined up with the camera only loosely (correlation {mic_info['sure']}): check the lips at a cut.")
        if mic_info and mic_info.get("drift_ms") and abs(mic_info["drift_ms"]) > 40:
            notes.append(f"The mic drifts {mic_info['drift_ms']} ms against the camera over the take: lips will slip late in it.")

    audio = load(src)
    e = energy(audio)

    # 2. What was said, from the cache when the recording and settings haven't changed.
    prompt = ", ".join(v for v in dict.fromkeys(fixes.values()) if not HEB.search(v))[:400]
    key = hashlib.sha256(json.dumps([TRANSCRIPT, src.stat().st_size, round(src.stat().st_mtime), lang, whisper.model_for(lang), prompt]).encode()).hexdigest()[:16]
    cache_path = clip / "take-words.json"
    cache = read_json(cache_path)
    if a.retranscribe or not cache or cache.get("key") != key:
        print(f"Hearing {rel(src)} ({meta['seconds']:.0f} s), one utterance at a time…")
        utts = hear(audio, lang, prompt)
        cache = {"key": key, "model": whisper.model_for(lang), "utterances": utts}
        write_json(cache_path, cache, indent=None)
    utts = cache["utterances"]
    words = [{**w, "u": k} for k, u in enumerate(utts) for w in u["words"]]
    if not words:
        raise SystemExit("Whisper heard no words in the take.")
    speech = np.zeros(len(e), bool)
    for u in utts:
        speech[int(u["start"] * 100): int(u["end"] * 100)] = True
    floor = float(np.percentile(e[~speech], 50)) if (~speech).sum() > 50 else float(np.percentile(e, 10))
    level = float(np.percentile(e[speech], 90)) if speech.sum() > 50 else -20.0
    # An editor's export can gate the pauses to digital silence: measure tails against the voice, not against -120 dB.
    gate = max(floor, level - 45)

    # 1, continued: the cleaned voice.
    mode = str(cut.get("clean", "auto"))
    voice = clip / "voice.wav"
    chain = []
    if mode != "off":
        stamp = json.dumps([mode, round(floor), round(level), src.stat().st_size])
        if a.retranscribe or not voice.exists() or read_json(clip / "voice.json", {}).get("stamp") != stamp:
            chain = clean_voice(src, voice, floor, level, mode)
            write_json(clip / "voice.json", {"stamp": stamp, "chain": chain})
        else:
            chain = read_json(clip / "voice.json", {}).get("chain", [])
    voice_src = voice if mode != "off" else src

    # 3. Which try.
    lines = cut.get("lines")
    free = not lines
    free_left: dict[int, str] = {}
    if free:
        lines, picks, free_left = free_cut(utts, words)
        for ln in lines:
            ln["_tries"] = []
        notes.append("There was no script, so the lines are the take's own sentences, less the ones said again (cut.json now has them, "
                     "anchored where they were said). Check that nothing you meant to keep is under Left out.")
    ids = [ln["id"] for ln in lines]
    if len(set(ids)) != len(ids):
        raise SystemExit("cut.json: two lines share an id.")
    if not free:
        picks = choose(lines, words)

    # 4-5. Inside each try, and the cut points.
    scenes, used = [], set()
    for ln, c in zip(lines, picks):
        if c is None:
            scenes.append({"id": ln["id"], "line": ln["line"], "missing": True})
            continue
        ws = words[c["i"]: c["j"] + 1]
        toks = [clean(w["text"]) for w in ws]
        drop = restarts(toks, tokens(ln["line"]))
        drop |= {k for k, t in enumerate(toks) if t in FILLERS and t not in tokens(ln["line"])}
        parts = parts_of(ws, drop, words, c["i"], float(ln.get("pause", pause)), e, gate)
        trim = ln.get("trim")
        if trim and parts:
            parts[0]["in"] += float(trim[0])
            parts[-1]["out"] += float(trim[1])
        used.update(range(c["i"], c["j"] + 1))
        # Frames: each part snapped to the ad's frames, so picture and sound cut on the same one.
        at = 0
        out_parts, out_words = [], []
        hl = ln.get("hl", [])
        for p in parts:
            fa = math.floor(p["in"] * fps + 1e-6)
            fb = max(fa + 1, math.ceil(p["out"] * fps - 1e-6))
            pin, n = fa / fps, fb - fa
            for w in spell(p["words"], {**fixes, **ln.get("fix", {})}):
                out_words.append({"t": w["text"], "at": at + max(0, round((w["start"] - pin) * fps)), "end": at + min(n, round((w["end"] - pin) * fps)), "hl": marked(w["text"], hl)})
            out_parts.append({"in": round(pin, 4), "out": round(fb / fps, 4), "at": at, "frames": n})
            at += n
        dropped = [ws[k]["text"] for k in sorted(drop)]
        scenes.append({
            "id": ln["id"], "line": ln["line"], "frames": at, "parts": out_parts, "words": out_words,
            "try": {"n": ln["_tries"].index(c) + 1 if c in ln["_tries"] else 1, "of": max(1, len(ln["_tries"])), "f1": c["f1"], "complete": c["complete"]},
            **({"dropped": dropped} if dropped else {}),
            # Every try of the line, so the desk can offer another one.
            "tries": [{"n": k + 1, "from": round(t["start"], 2), "to": round(t["end"], 2), "complete": t["complete"],
                       "text": " ".join(w["text"] for w in words[t["i"]: t["j"] + 1])} for k, t in enumerate(ln["_tries"])],
        })

    # 6. The face.
    found = [s for s in scenes if not s.get("missing")]
    if not a.no_face:
        boxes, jumps = faces(clip, meta, [[(p["in"], p["out"]) for p in s["parts"]] for s in found])
        for s, f, js in zip(found, boxes, jumps):
            s["face"] = f
            # A jump cut where the head moves wants a punch-in to hide it; one where it holds still can stay.
            for p, j in zip(s["parts"][1:], js):
                p["jump"] = j
        seen = [s["face"] for s in found if s.get("face")]
        if len(seen) < len(found):
            notes.append(f"No face found in {len(found) - len(seen)} of {len(found)} scenes: frame those by hand (`focus`).")
    face_all = [round(float(v), 3) for v in np.median(np.array([s["face"] for s in found if s.get("face")]), axis=0)] if any(s.get("face") for s in found) else None

    # What was left out, and why.
    left = []
    owner = {}
    for ln in lines:
        for k, c in enumerate(ln["_tries"]):
            for x in range(c["i"], c["j"] + 1):
                owner.setdefault(x, (ln["id"], k + 1, c["complete"]))
    run: list[int] = []

    def flush():
        if not run:
            return
        ws = [words[x] for x in run]
        o = owner.get(run[0]) or owner.get(run[-1])
        text = " ".join(w["text"] for w in ws)
        t = [clean(w["text"]) for w in ws]
        # A stretch that says the opening of a line and stops is a false start of it.
        start_of = next((ln["id"] for ln in lines if len(t) >= 2 and score(tokens(ln["line"])[: len(t) + 1], t)["prec"] >= 0.6), None)
        if free_left.get(run[0]):
            why = free_left[run[0]]
        elif o:
            why = f"try {o[1]} of {o[0]}" + ("" if o[2] else ", broken off")
        elif all(x in COUNT_IN for x in t):
            why = "a count-in"
        elif start_of:
            why = f"a false start of {start_of}"
        else:
            why = "not in the script"
        left.append({"from": ws[0]["start"], "to": ws[-1]["end"], "text": text, "why": why})
        run.clear()

    for x in range(len(words)):
        if x in used:
            flush()
        elif run and (x - 1 != run[-1] or free_left.get(x) != free_left.get(run[-1])):
            flush()
            run.append(x)
        else:
            run.append(x)
    flush()
    off_script = [l for l in left if l["why"] == "not in the script" and len(l["text"].split()) >= 3]
    if off_script and not free:
        notes.append(f"{len(off_script)} stretch{'es' if len(off_script) > 1 else ''} said but not in the script, left out. A speaker who improvised a line wants it in: add it to cut.json's lines.")
    missing = [s["id"] for s in scenes if s.get("missing")]
    if missing:
        notes.append(f"Not found in the take: {', '.join(missing)}. Said differently? Put what was said in that line in cut.json, or take the line out.")
    picked = {ln["id"] for ln in lines if ln.get("pick")}
    loose = [s["id"] for s in found if not s["try"]["complete"] and s["id"] not in picked]
    if loose:
        notes.append(f"No complete try of {', '.join(loose)}: the best partial one is used. Listen to it.")
    chosen = [f"{s['id']} (try {s['try']['n']})" for s in found if s["id"] in picked]
    if chosen:
        notes.append(f"Picked by hand in cut.json: {', '.join(chosen)}" + ("; " + ", ".join(s["id"] for s in found if s["id"] in picked and not s["try"]["complete"]) + " broken off" if any(s["id"] in picked and not s["try"]["complete"] for s in found) else "") + ".")

    # Write: cut.json keeps the decisions, take.json the cut, cut.md the table.
    if free:
        cut["lines"] = [{"id": ln["id"], "line": ln["line"], "at": ln["at"]} for ln in lines]
    for ln in cut.get("lines", []):
        ln.pop("_tries", None)
    cut.setdefault("clip", meta["name"])
    cut.setdefault("pause", pause)
    cut.setdefault("clean", mode)
    write_json(cut_path, cut)

    total = sum(s.get("frames", 0) for s in scenes)
    take = {
        "about": "Made by bun run take from cut.json; edit that, not this. spec.md §6.11.",
        "fps": fps,
        "clip": {"name": meta["name"], "src": meta["src"], "fps": meta["fps"], "frames": meta["frames"], "width": meta["width"], "height": meta["height"]},
        "voice": public(voice_src),
        "face": face_all,
        "frames": total,
        "scenes": [s for s in scenes if not s.get("missing")],
        "missing": missing,
        "left": [{"from": round(l["from"], 2), "to": round(l["to"], 2), "text": l["text"], "why": l["why"]} for l in left],
    }
    write_json(take_path, take)

    def says(s: dict) -> str:
        return " ".join(w["t"] for w in s["words"]).replace("|", "\\|")

    md = [f"# The cut: {meta['name']}", "",
          f"Made by `bun run take` on {meta['name']} ({meta['seconds']:.1f} s). {len(take['scenes'])} scenes, {total / fps:.1f} s. "
          "Change a decision in `cut.json` (a line's text, `pick` for another try, `hl`, `fix`, `trim`, `pause`) and run it again.", ""]
    md += ["| Scene | From the take | Try | Says | Left out inside |", "|---|---|---|---|---|"]
    for s in scenes:
        if s.get("missing"):
            md.append(f"| {s['id']} | not found | | {s['line'].replace('|', '/')} | |")
            continue
        span = ", ".join(f"{fmt(p['in'])}-{fmt(p['out'])}" for p in s["parts"])
        t = s["try"]
        tag = f"{t['n']} of {t['of']}" + ("" if t["complete"] else " (partial)")
        md.append(f"| {s['id']} | {span} | {tag} | {says(s)} | {' '.join(s.get('dropped', []))} |")
    md += ["", "## Left out", "", "| From | To | What | Why |", "|---|---|---|---|"]
    md += [f"| {fmt(l['from'])} | {fmt(l['to'])} | {l['text'].replace('|', '/')} | {l['why']} |" for l in left]
    md += ["", "## The sound", ""]
    if mic_info:
        md.append(f"- The mic ({rel(Path(cut['mic']) if not Path(cut['mic']).is_absolute() else Path(cut['mic']))}) is the voice, lined up at mic = camera + {mic_info['offset']} s"
                  + (f", drift {mic_info['drift_ms']} ms over the take" if mic_info.get("drift_ms") is not None else "") + ".")
    md.append(f"- Room tone {floor:.0f} dBFS, speech peaks around {level:.0f} dBFS.")
    md.append(f"- Voice: {', '.join(chain) if chain else 'as recorded'} -> `{public(voice_src)}`.")
    if face_all:
        md.append(f"- Face (median): centre {face_all[0]:.2f}, {face_all[1]:.2f} of the frame, {face_all[3]:.2f} of its height tall.")
    # A word Whisper stretched past a second usually hides a pause or a retake inside it.
    long = [f"{s['id']} \"{w['t']}\"" for s in take["scenes"] for w in s["words"] if w["end"] - w["at"] >= fps]
    if long:
        notes.append(f"Words a second or longer, often a pause or a retake inside: {', '.join(long[:8])}. Look at them in cut.md and listen.")
    if a.verify:
        md += ["", "## Verify", ""] + verify(take, lang)
    if notes:
        md += ["", "## Check", ""] + [f"- {n}" for n in notes]
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text("\n".join(md) + "\n", encoding="utf-8")

    for s in scenes:
        if s.get("missing"):
            print(f"  {s['id']:<12} not found")
            continue
        print(f"  {s['id']:<12} {s['frames']:>5} f  try {s['try']['n']}/{s['try']['of']}{'' if s['try']['complete'] else ' partial'}  {says(s)[:90]}")
    print(f"{len(take['scenes'])} scenes, {total} frames ({total / fps:.1f} s) -> {rel(take_path)}; the table: {rel(report_path)}")
    for n in notes:
        print(f"  check: {n}")


if __name__ == "__main__":
    main()
