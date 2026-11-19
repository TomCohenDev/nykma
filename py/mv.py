"""Audio-first pipeline: ElevenLabs audio → analysis → timeline.json → mix, plus Blender renders.

    .venv/Scripts/python py/mv.py voices [--json] [--id ID]   list ElevenLabs voices (default marked), or look up one
    .venv/Scripts/python py/mv.py build <slug>            gen + timeline + mix (cached, only pays for changes)
    .venv/Scripts/python py/mv.py build <slug> --estimate credits this build would use; calls nothing paid
    .venv/Scripts/python py/mv.py build <slug> --test-line [voice id]   one line only, to hear it first
    .venv/Scripts/python py/mv.py gen <slug> [--force id,id]
    .venv/Scripts/python py/mv.py timeline <slug>
    .venv/Scripts/python py/mv.py mix <slug>
    .venv/Scripts/python py/mv.py words <audio> [--lang he] [--text "..."]   Whisper word times beside the file
    .venv/Scripts/python py/mv.py blender <slug> --scene <file> --preview --frames 1,300
    .venv/Scripts/python py/mv.py blender <slug> --scene <file> --layer     plates for <Plate>
    .venv/Scripts/python py/mv.py blender <slug> --scene <file> --video     standalone mp4 with mix.wav

An ad's audio is public/ads/<slug>/spec.json (+ your own files beside it). Everything generated
goes in public/ads/<slug>/gen/, timeline.json included. py/README.md has the spec format.
"""
import argparse
import hashlib
import io
import json
import math
import os
import re
import shlex
import shutil
import subprocess
import sys
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable, Iterator

ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(Path(__file__).resolve().parent), str(Path(__file__).resolve().parent / "blender")]

import eleven  # noqa: E402  (no SDK or key until the first paid call)
import whisper  # noqa: E402  (no model loads until a recording is aligned)
from tl import clean as clean_word  # noqa: E402  (the same rule as Blender's said())

DEFAULT_FORMAT = "mp3_44100_128"  # voice + sfx; works on every tier, set "output_format" in spec to upgrade
MUSIC_FORMAT = "mp3_44100_128"  # "auto" picks 192 kbps for music_v2+, which needs the Creator tier
TAG_RE = re.compile(r"\[[^\]]*\]")  # ElevenLabs audio tags like [whispers]: performed, not spoken
HEBREW_RE = re.compile(r"[\u0590-\u05ff\ufb1d-\ufb4f]")
RESERVED_IDS = {"music", "stems", "rms", "low", "mid", "high", "all"}  # keys of --force, energy and onsets
ASSUMED_MUSIC_S = 60  # --estimate, when the model picks the length
RATE = 48000
PEAK_CEILING = -1.5  # dBTP


# ── project paths and caching ────────────────────────────────────────────────

class Project:
    def __init__(self, slug: str):
        self.slug = slug
        self.dir = ROOT / "public" / "ads" / slug
        self.gen = self.dir / "gen"
        spec_path = self.dir / "spec.json"
        if not spec_path.exists():
            raise SystemExit(f"No spec at {spec_path}")
        self.spec = json.loads(spec_path.read_text(encoding="utf-8"))
        self.fps = int(self.spec.get("fps", 30))
        self.fmt = self.spec.get("output_format", DEFAULT_FORMAT)
        self.ext = self.fmt.split("_")[0].replace("pcm", "wav")
        self.lang = (self.spec.get("lang") or "").split("-")[0] or None
        ids = [x["id"] for x in self.spec.get("voices", []) + self.spec.get("sfx", [])]
        if len(ids) != len(set(ids)) or RESERVED_IDS & set(ids):
            raise SystemExit(f"Voice and sfx ids must be unique and not one of {sorted(RESERVED_IDS)}: {ids}")

    def asset(self, rel: str) -> Path:
        p = self.dir / rel
        if not p.exists():
            raise SystemExit(f"Missing file {p}")
        return p

    def public_path(self, p: Path) -> str:
        """Path as a cue or asset() wants it (relative to public/)."""
        return p.relative_to(ROOT / "public").as_posix()


def _hash(obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True).encode()).hexdigest()[:16]


def file_hash(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()[:16] if p.exists() else "missing"


def write_json(p: Path, obj) -> None:
    p.write_text(json.dumps(obj, indent=1, ensure_ascii=False), encoding="utf-8")


def read_json(p: Path, default=None):
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else default


@dataclass
class Item:
    """One thing to make. `req` is everything that decides its output: the same request is never paid twice."""
    key: str  # what --force names; also the cache stamp
    label: str
    outs: list[Path]
    req: object
    run: Callable[[], None]
    credits: float | None = 0  # None: nobody publishes the rate
    note: str = ""
    stale: bool = False  # something it's made from is about to change

    def due(self, p: Project, force: set[str]) -> bool:
        stamp = p.gen / f"{self.key}.req"
        fresh = stamp.exists() and stamp.read_text() == _hash(self.req) and all(o.exists() for o in self.outs)
        return self.stale or self.key in force or not fresh

    def stamp(self, p: Project) -> None:
        (p.gen / f"{self.key}.req").write_text(_hash(self.req))


# ── what a spec asks for ─────────────────────────────────────────────────────

def language(p: Project, v: dict) -> str | None:
    """The voice's language: its own, else the ad's. Hebrew text with neither still counts as Hebrew."""
    code = v.get("language_code") or p.lang
    if not code and HEBREW_RE.search(TAG_RE.sub("", v.get("text", ""))):
        return "he"
    return code


def voice_item(p: Project, v: dict) -> Item:
    vid = v["id"]
    # Effective values go in the request, so a new default model is a new request.
    voice_id = v.get("voice_id", eleven.DEFAULT_VOICE)
    model = v.get("model_id", eleven.DEFAULT_TTS_MODEL)
    extra = {k: v[k] for k in ("voice_settings", "seed", "previous_text", "next_text",
                               "apply_text_normalization", "audio_effects") if k in v}
    code = language(p, v)
    if code == "he" and model not in eleven.HEBREW_MODELS:
        # The API would ignore the language code without a word and read it unintelligibly.
        raise SystemExit(f"Voice {vid!r} is Hebrew but {model} doesn't support it. Use one of {eleven.HEBREW_MODELS}.")
    if code and (model in eleven.HEBREW_MODELS or "language_code" in v):
        extra["language_code"] = code
    text, fmt = v["text"], p.fmt
    limit = eleven.MODEL_CHAR_LIMITS.get(model)
    if limit and len(text) > limit:
        raise SystemExit(f"Voice {vid!r} has {len(text)} characters; {model} takes {limit}.")
    audio_out, align_out = p.gen / f"voice.{vid}.{p.ext}", p.gen / f"voice.{vid}.align.json"

    def run() -> None:
        audio, alignment = eleven.tts(text, voice_id, model, fmt, **extra)
        audio_out.write_bytes(audio)
        write_json(align_out, {"characters": alignment})

    rate = eleven.CREDITS_PER_CHAR.get(model, eleven.CREDITS_PER_CHAR_DEFAULT)
    return Item(vid, f"voice {vid}: speaking ({model}{', ' + code if code else ''})", [audio_out, align_out],
                [text, voice_id, model, extra, fmt], run, len(text) * rate, f"{len(text)} chars")


def aligned_voice_item(p: Project, v: dict) -> Item:
    """A real human reading: we only need word times. Whisper finds them here for free, or ElevenLabs' forced
    alignment with `"align": "eleven"`. With no `text`, the words are what Whisper hears."""
    vid, src = v["id"], p.asset(v["file"])
    engine = v.get("align", "whisper")
    if engine not in ("whisper", "eleven"):
        raise SystemExit(f'Voice {vid!r}: "align" is "whisper" or "eleven", not {engine!r}.')
    text = TAG_RE.sub(" ", v["text"]) if "text" in v else None
    if engine == "eleven" and text is None:
        raise SystemExit(f"Voice {vid!r}: forced alignment needs the words, so give it a \"text\".")
    out = p.gen / f"voice.{vid}.align.json"
    code = language(p, v)

    if engine == "eleven":
        return Item(vid, f"voice {vid}: aligning recording (ElevenLabs)", [out], [text, file_hash(src)],
                    lambda: write_json(out, eleven.align(src, text)), None, "forced alignment: no published rate")

    model = v.get("whisper_model", whisper.model_for(code))

    def run() -> None:
        r = whisper.align(src, text, code, model) if text is not None else whisper.transcribe(src, code, model)
        if r.get("matched", 1) < whisper.MIN_MATCHED:
            print(f"warning: Whisper heard {r['matched']:.0%} of voice {vid!r} word for word. The rest are timed "
                  f'between their neighbours: check the captions, or try "align": "eleven".')
        write_json(out, r)

    return Item(vid, f"voice {vid}: {'aligning' if text is not None else 'transcribing'} recording (Whisper {model}, "
                     "on this machine)", [out], ["whisper", text, file_hash(src), code, model, whisper.LEAD], run, 0, "free")


def sfx_item(p: Project, s: dict) -> Item:
    sid, text, fmt = s["id"], s["text"], p.fmt
    # Only what the spec asks for; anything left out (length included) is the model's call.
    extra = {dst: s[src] for src, dst in (("duration", "duration_seconds"), ("prompt_influence", "prompt_influence"),
                                          ("loop", "loop"), ("model_id", "model_id")) if src in s}
    out = p.gen / f"sfx.{sid}.{p.ext}"

    def run() -> None:
        out.write_bytes(eleven.sfx(text, fmt, **extra))

    credits = s["duration"] * eleven.SFX_CREDITS_PER_SECOND if "duration" in s else eleven.SFX_CREDITS_AUTO
    return Item(sid, f"sfx {sid}: generating", [out], [text, extra, fmt], run, credits,
                f"{s['duration']} s" if "duration" in s else "length is the model's call")


def music_script_item(p: Project, m: dict) -> Item:
    """Music made on the spot in code: re-runs when the command or the files it names change."""
    out = p.dir / m["file"]
    files = [ROOT / t for t in shlex.split(m["script"], posix=True) if (ROOT / t).is_file()]

    def run() -> None:
        subprocess.run(m["script"], shell=True, cwd=ROOT, check=True)
        if not out.exists():
            raise SystemExit(f"{m['script']!r} didn't write {out}")

    return Item("music", f"music: running {m['script']}", [out], [m["script"], [file_hash(f) for f in files]], run)


def music_item(p: Project, m: dict) -> Item:
    """Prompt only, no plan and no length unless you give one: the model decides the structure,
    duration, vocals and lyrics. The sections it chose come back in the metadata."""
    model = m.get("model_id", eleven.DEFAULT_MUSIC_MODEL)
    fmt = m.get("output_format", MUSIC_FORMAT)
    length_ms = int(m["length_s"] * 1000) if m.get("length_s") else None
    instrumental = bool(m.get("instrumental"))
    out = music_out(p)

    def run() -> None:
        audio, meta = eleven.music(m["prompt"], model, fmt, length_ms, instrumental)
        out.write_bytes(audio)
        write_json(p.gen / "music.meta.json", meta)

    seconds = m.get("length_s") or p.spec.get("duration") or ASSUMED_MUSIC_S
    return Item("music", f"music: composing with {model} (this takes a while)", [out, p.gen / "music.meta.json"],
                [m["prompt"], model, fmt, length_ms, instrumental], run, seconds / 60 * eleven.MUSIC_CREDITS_PER_MIN,
                f"{seconds} s" + ("" if m.get("length_s") or p.spec.get("duration") else ", assumed: the model picks the length"))


def stems_item(p: Project, m: dict, stale: bool) -> Item:
    src = (p.dir / m["file"]) if "file" in m else music_out(p)
    stem_dir, marker = p.gen / "stems", p.gen / "stems" / "_done"

    def run() -> None:
        shutil.rmtree(stem_dir, ignore_errors=True)
        stem_dir.mkdir()
        with zipfile.ZipFile(io.BytesIO(eleven.stems(src, p.fmt))) as z:
            for info in z.infolist():
                if info.is_dir():
                    continue
                name = re.sub(r"[^a-z0-9.]+", "_", Path(info.filename).name.lower())
                (stem_dir / name).write_bytes(z.read(info))
        marker.write_text("")

    if src.exists() and not stale:
        import soundfile
        seconds, note = soundfile.info(str(src)).duration, ""
    else:
        seconds = m.get("length_s") or p.spec.get("duration") or ASSUMED_MUSIC_S
        note = "length assumed"
    return Item("stems", "stems: separating", [marker], [file_hash(src), p.fmt], run,
                seconds / 60 * eleven.STEMS_CREDITS_PER_MIN, f"{seconds:.0f} s {note}".strip(), stale)


def plan(p: Project, force: set[str]) -> Iterator[Item]:
    """Everything the spec asks for, in order. A generator, so each item sees what the one before it made."""
    m = p.spec.get("music")
    made_music = False
    if m and "script" in m:
        item = music_script_item(p, m)
    elif m and "file" not in m:
        item = music_item(p, m)
    else:
        item = None
    if item:
        made_music = item.due(p, force)
        yield item
    if m and m.get("stems"):
        yield stems_item(p, m, made_music)
    for v in p.spec.get("voices", []):
        yield aligned_voice_item(p, v) if "file" in v else voice_item(p, v)
    for s in p.spec.get("sfx", []):
        if "file" not in s:
            yield sfx_item(p, s)


def test_line_item(p: Project, voice: str) -> Item:
    """The first line of a voice (the first one, unless named), through the same request as the build.
    A one-line voice is the real item, so the build won't pay for it again."""
    spoken = [v for v in p.spec.get("voices", []) if "file" not in v and (not voice or v["id"] == voice)]
    if not spoken:
        raise SystemExit(f"No generated voice {voice!r} in the spec." if voice else "No generated voice in the spec.")
    v = spoken[0]
    line = next((ln.strip() for ln in v["text"].splitlines() if TAG_RE.sub("", ln).strip()), None)
    if line is None:
        raise SystemExit(f"Voice {v['id']!r} has nothing to say.")
    return voice_item(p, v if line == v["text"].strip() else {**v, "id": f"test.{v['id']}", "text": line})


def warn(p: Project) -> None:
    m = p.spec.get("music") or {}
    if "prompt" in m and not m.get("instrumental") and (p.lang == "he" or HEBREW_RE.search(m["prompt"])):
        print("warning: sung Hebrew lyrics aren't confirmed to work in ElevenLabs. Test them before promising them "
              "in a pitch, or set music.instrumental, or use your own track.")


def gen(p: Project, force: set[str], items: Iterable[Item] | None = None) -> None:
    p.gen.mkdir(parents=True, exist_ok=True)
    warn(p)
    for it in (plan(p, force) if items is None else items):
        if not it.due(p, force):
            print(f"{it.key}: cached")
            continue
        print(it.label)
        try:
            it.run()
        except Exception as e:  # The SDK's errors can print headers, so report only what helps.
            if getattr(e, "status_code", None) is None:
                raise
            raise SystemExit(f"{it.key}: ElevenLabs answered {e.status_code}: {e.body}") from None
        it.stamp(p)


def estimate(p: Project, force: set[str], items: Iterable[Item] | None = None) -> float:
    """Prints what a build would cost. Reads the spec and the cache stamps, and calls nothing."""
    warn(p)
    total, unpriced, rows = 0.0, [], []
    for it in (plan(p, force) if items is None else items):
        if not it.due(p, force):
            rows.append((it.key, "cached", 0, it.note))
            continue
        if it.credits is None:
            unpriced.append(it.key)
            rows.append((it.key, "to make", "?", it.note))
            continue
        total += it.credits
        rows.append((it.key, "to make", round(it.credits), it.note))
    print(f"estimate for {p.slug}:")
    for key, state, credits, note in rows:
        print(f"  {key:<20} {state:<8} {credits:>8}  {note}")
    print(f"  {'total':<20} {'':<8} {round(total):>8}  credits, nothing was called")
    if unpriced:
        print(f"  not in the total: {', '.join(unpriced)}")
    print("  Rates are from ElevenLabs' public pages (py/eleven.py), so this is a guide, not a quote.")
    return total


def music_out(p: Project) -> Path:
    fmt = (p.spec.get("music") or {}).get("output_format", MUSIC_FORMAT)
    ext = "mp3" if fmt == "auto" else fmt.split("_")[0].replace("pcm", "wav")
    return p.gen / f"music.{ext}"


def music_path(p: Project) -> Path | None:
    m = p.spec.get("music")
    if not m:
        return None
    if "file" in m:
        return p.asset(m["file"])
    out = music_out(p)
    if not out.exists():
        raise SystemExit("No music yet. Run gen first.")
    return out


def voice_path(p: Project, v: dict) -> Path:
    return p.asset(v["file"]) if "file" in v else p.gen / f"voice.{v['id']}.{p.ext}"


def sfx_path(p: Project, s: dict) -> Path:
    return p.asset(s["file"]) if "file" in s else p.gen / f"sfx.{s['id']}.{p.ext}"


# ── words, lines, sections ───────────────────────────────────────────────────

def words_from_chars(al: dict) -> list[dict]:
    """TTS character alignment → words (split on whitespace). Audio tags are performed, not said,
    so their characters are dropped here, whatever spaces they hold."""
    chars = al.get("characters", [])
    starts = al.get("character_start_times_seconds", [])
    ends = al.get("character_end_times_seconds", [])
    tags = {i for m in TAG_RE.finditer("".join(chars)) for i in range(m.start(), m.end())}
    words, cur, pos = [], None, 0
    for c, s, e in zip(chars, starts, ends):
        hidden = pos in tags
        pos += len(c)
        if hidden or c.isspace():
            if cur:
                words.append(cur)
            cur = None
            continue
        if cur is None:
            cur = {"text": c, "start": s, "end": e}
        else:
            cur["text"] += c
            cur["end"] = e
    if cur:
        words.append(cur)
    return words


def find_words(obj) -> list[dict]:
    """Pull word timestamps out of a music/detailed metadata blob, whatever it nests them in."""
    if isinstance(obj, list) and obj and all(isinstance(x, dict) for x in obj):
        keys = set(obj[0])
        tk = next((k for k in ("word", "text") if k in keys), None)
        sk = next((k for k in sorted(keys) if k.startswith("start")), None)
        ek = next((k for k in sorted(keys) if k.startswith("end")), None)
        if tk and sk and ek:
            div = 1000.0 if sk.endswith("ms") else 1.0
            return [{"text": w[tk], "start": w[sk] / div, "end": w[ek] / div} for w in obj if str(w[tk]).strip()]
    if isinstance(obj, dict):
        for v in obj.values():
            found = find_words(v)
            if found:
                return found
    if isinstance(obj, list):
        for v in obj:
            found = find_words(v)
            if found:
                return found
    return []


def lines_from_text(text: str, words: list[dict], track: str) -> list[dict]:
    """Group words back into the lines of the original text (newline-separated)."""
    lines, i = [], 0
    for line in text.splitlines():
        n = len(line.split())
        if n == 0:
            continue
        chunk = words[i:i + n]
        if len(chunk) < n:
            break
        lines.append({"text": " ".join(line.split()), "start": chunk[0]["start"], "end": chunk[-1]["end"], "track": track})
        i += n
    return lines


def plan_sections(comp: dict) -> tuple[list[dict], list[str]]:
    """(sections with exact times, lyric lines) from either plan format."""
    sections, lyrics, t = [], [], 0.0
    if "chunks" in comp:  # music_v2 / v2.5
        for i, c in enumerate(comp["chunks"]):
            dur = (c.get("duration_ms") or (c.get("end_ms", 0) - c.get("start_ms", 0))) / 1000
            text = c.get("text", "")
            mt = re.match(r"\s*\[([^\]]+)\]", text)
            sections.append({"name": mt.group(1) if mt else f"Part {i + 1}", "start": round(t, 4), "end": round(t + dur, 4)})
            body = re.sub(r"\[[^\]]*\]|\{[^}]*\}", "", text)
            lyrics += [ln.strip() for ln in body.splitlines() if ln.strip()]
            t += dur
    else:  # music_v1
        for s in comp.get("sections", []):
            dur = s["duration_ms"] / 1000
            sections.append({"name": s["section_name"], "start": round(t, 4), "end": round(t + dur, 4)})
            lyrics += [ln for ln in s.get("lines", []) if ln.strip()]
            t += dur
    return sections, lyrics


# ── placement: "at" can be seconds or a musical reference ────────────────────

AT_RE = re.compile(r"^(section|beat|bar|marker|word):(.+?)(?:([+-]\d+(?:\.\d+)?))?$")


class Pending(Exception):
    """The reference exists in the spec but hasn't been placed yet (try again later)."""


def resolve_at(at, tl: dict, known: set[str] = frozenset()) -> float:
    """12.5 | "section:Chorus" | "beat:17" | "bar:5-0.25" | "marker:reveal+0.1" |
    "word:<voice id>:<word>[#n]+0.2" → seconds.

    Beats and bars count from 1, like a musician would. `word:` finds the n-th (default
    first) time a voice says that word, ignoring case, punctuation and niqqud. `known` holds
    the ids/markers that will exist once everything is placed, so a forward reference waits
    (Pending) instead of failing.
    """
    if isinstance(at, (int, float)):
        return float(at)
    m = AT_RE.match(str(at).strip())
    if not m:
        raise SystemExit(f'Bad "at": {at!r}')
    kind, ref, off = m.group(1), m.group(2), float(m.group(3) or 0)
    if kind == "section":
        hit = next((s for s in tl["sections"] if s["name"].lower() == ref.lower()), None)
        if not hit:
            raise SystemExit(f"No section {ref!r}. Have: {[s['name'] for s in tl['sections']]}")
        return hit["start"] + off
    if kind == "marker":
        hit = next((mk for mk in tl["markers"] if mk["name"] == ref), None)
        if not hit:
            if f"marker:{ref}" in known:
                raise Pending(at)
            raise SystemExit(f"No marker {ref!r}")
        return hit["t"] + off
    if kind == "word":
        track, _, word = ref.partition(":")
        word, _, nth = word.partition("#")
        hits = [w for w in tl["words"] if w["track"] == track and clean_word(w["text"]) == clean_word(word)]
        if not hits:
            if f"voice:{track}" in known and not any(w["track"] == track for w in tl["words"]):
                raise Pending(at)
            said = " ".join(w["text"] for w in tl["words"] if w["track"] == track)
            raise SystemExit(f"Voice {track!r} never says {word!r}. It says: {said}")
        n = int(nth or 1)
        if n > len(hits):
            raise SystemExit(f"Voice {track!r} says {word!r} only {len(hits)} time(s)")
        return hits[n - 1]["start"] + off
    seq = tl["beats"] if kind == "beat" else tl["downbeats"]
    n = int(ref)
    if not 1 <= n <= len(seq):
        raise SystemExit(f"{kind}:{n} out of range (1..{len(seq)})")
    return seq[n - 1] + off


# ── timeline ─────────────────────────────────────────────────────────────────

def timeline(p: Project) -> dict:
    import analyze

    p.gen.mkdir(parents=True, exist_ok=True)
    fps = p.fps
    tl = {"version": 1, "slug": p.slug, "fps": fps, "duration": 0.0, "frames": 0, "bpm": 0.0,
          "sections": [], "beats": [], "downbeats": [], "onsets": {}, "energy": {},
          "words": [], "lines": [], "clips": [], "markers": []}

    music = music_path(p)
    m = p.spec.get("music") or {}
    if music:
        stems = sorted((p.gen / "stems").glob("*.*")) if m.get("stems") else []
        drums = next((s for s in stems if "drum" in s.name), None)
        _, dur = analyze.load(music)
        n = int(round(dur * fps))
        a = analyze.full(music, fps, n, beat_source=drums)
        tl.update(duration=a["duration"], bpm=a["bpm"], beats=a["beats"], downbeats=a["downbeats"],
                  onsets=a["onsets"], energy=a["energy"])
        if "grid" in m:
            # Known tempo (your own track, or a BPM you asked the model for): an exact grid
            # beats detection, which drifts by a few ms and can miss beat one.
            g = m["grid"]
            step, t0, per_bar = 60.0 / g["bpm"], float(g.get("offset", 0)), int(g.get("beats_per_bar", 4))
            k = int((a["duration"] - t0) / step) + 1
            tl["bpm"] = g["bpm"]
            tl["beats"] = [round(t0 + i * step, 4) for i in range(k)]
            tl["downbeats"] = tl["beats"][::per_bar]
        for s in stems:
            key = s.stem.replace(".", "_")
            tl["energy"][key], tl["onsets"][key] = analyze.envelope(s, fps, n)
        tl["clips"].append({"id": "music", "kind": "music", "file": p.public_path(music), "start": 0.0,
                            "end": a["duration"], "gain_db": m.get("gain_db", 0)})

        meta = read_json(p.gen / "music.meta.json", {}) if "file" not in m else {}
        comp = meta.get("composition_plan")  # what the model chose; a report, not a constraint
        lyrics = []
        if comp:
            tl["sections"], lyrics = plan_sections(comp)
        # Your own list wins, then the model's plan, then what the audio shows.
        tl["sections"] = m.get("sections") or tl["sections"] or analyze.sections(a["samples"], a["duration"], tl["downbeats"])
        lyric_words = find_words(meta)
        if lyric_words:
            tl["words"] += [{**w, "track": "lyrics"} for w in lyric_words]
            tl["lines"] += lines_from_text("\n".join(lyrics), lyric_words, "lyrics")

    # Markers, voices and sfx can reference each other (a voice after another voice's word,
    # a marker on a word, an sfx on a marker), so place them in whatever order resolves.
    items = [("marker", x) for x in p.spec.get("markers", [])] + [("voice", x) for x in p.spec.get("voices", [])] \
        + [("sfx", x) for x in p.spec.get("sfx", [])]
    known = {f"marker:{x['name']}" for k, x in items if k == "marker"} | {f"voice:{x['id']}" for k, x in items if k == "voice"}
    end = tl["duration"]
    while items:
        left = []
        for kind, x in items:
            try:
                at = resolve_at(x.get("at", 0), tl, known)
            except Pending:
                left.append((kind, x))
                continue
            if at < 0:
                raise SystemExit(f"{x.get('name') or x.get('id')}: \"at\" lands before the start ({at:.3f} s)")
            if kind == "marker":
                tl["markers"].append({"name": x["name"], "t": round(at, 4)})
                continue
            src = voice_path(p, x) if kind == "voice" else sfx_path(p, x)
            if not src.exists():
                raise SystemExit(f"Missing {src}. Run gen first.")
            _, dur = analyze.load(src)
            if kind == "voice":
                al = read_json(p.gen / f"voice.{x['id']}.align.json", {})
                words = words_from_chars(al["characters"]) if isinstance(al.get("characters"), dict) \
                    else [w for w in al.get("words", []) if str(w.get("text", "")).strip()]
                words = [{"text": w["text"], "start": round(w["start"] + at, 4), "end": round(w["end"] + at, 4),
                          "track": x["id"]} for w in words if TAG_RE.sub("", w["text"]).strip()]
                tl["words"] += words
                if "text" in x:
                    tl["lines"] += lines_from_text(TAG_RE.sub(" ", x["text"]), words, x["id"])
                else:  # transcribed: Whisper's own segments are the lines
                    tl["lines"] += [{"text": ln["text"], "start": round(ln["start"] + at, 4), "end": round(ln["end"] + at, 4),
                                     "track": x["id"]} for ln in al.get("lines", [])]
            tl["clips"].append({"id": x["id"], "kind": kind, "file": p.public_path(src), "start": round(at, 4),
                                "end": round(at + dur, 4), "gain_db": x.get("gain_db", 0),
                                **({"mix": False} if x.get("mix") is False else {})})
            end = max(end, at + dur)
        if len(left) == len(items):
            raise SystemExit(f"Circular placement: {[x.get('at') for _, x in left]}")
        items = left
    tl["markers"].sort(key=lambda mk: mk["t"])

    # The frame count is the length. Everything else follows it, so nothing can disagree by a frame.
    tl["frames"] = int(round(float(p.spec.get("duration", end + p.spec.get("tail", 0))) * fps))
    if tl["frames"] <= 0:
        raise SystemExit("Nothing to time: no music, voices or sfx, and no duration.")
    tl["duration"] = round(tl["frames"] / fps, 4)

    # Per-clip envelopes on the global grid (voice energy for captions, lip flaps, etc.).
    for c in tl["clips"]:
        if c["kind"] != "music":
            tl["energy"][c["id"]], tl["onsets"][c["id"]] = analyze.envelope(ROOT / "public" / c["file"], fps, tl["frames"], c["start"])
    for k, v in tl["energy"].items():  # pad/trim every curve to exactly `frames`
        tl["energy"][k] = (v + [0.0] * tl["frames"])[: tl["frames"]]

    # A short `duration` cuts the music: nothing past the end should be left to cue to.
    d = tl["duration"]
    tl["beats"] = [t for t in tl["beats"] if t < d]
    tl["downbeats"] = [t for t in tl["downbeats"] if t < d]
    tl["onsets"] = {k: [t for t in v if t < d] for k, v in tl["onsets"].items()}
    tl["sections"] = [{**s, "end": min(s["end"], d)} for s in tl["sections"] if s["start"] < d]

    tl["words"].sort(key=lambda w: w["start"])
    tl["lines"].sort(key=lambda w: w["start"])
    tl["mix"] = p.public_path(p.gen / "mix.wav")
    write_json(p.gen / "timeline.json", tl)
    print(f"timeline: {tl['duration']:.2f}s, {tl['frames']} frames @ {fps}fps, {tl['bpm']} BPM, "
          f"{len(tl['beats'])} beats, {len(tl['sections'])} sections, {len(tl['words'])} words, {len(tl['clips'])} clips")
    return tl


# ── mix (ffmpeg) ─────────────────────────────────────────────────────────────

def ffmpeg(*args: str) -> str:
    r = subprocess.run(["ffmpeg", "-hide_banner", *args], capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode:
        raise SystemExit(f"ffmpeg failed:\n{r.stderr[-1500:]}")
    return r.stderr


def loudness(path: Path) -> tuple[float, float]:
    """(integrated LUFS, true peak dBTP), measured the way render.ts measures."""
    err = ffmpeg("-i", str(path), "-af", "loudnorm=print_format=json", "-f", "null", "-")
    j = json.loads(err[err.rindex("{"):err.rindex("}") + 1])
    return float(j["input_i"]), float(j["input_tp"])


def normalise(raw: Path, out: Path, lufs: float, samples: int) -> tuple[float, float]:
    """A straight gain to the target, re-measured until it lands. loudnorm alone reshapes the dynamics
    whenever the gain would pass the ceiling, which pumps a beat, so peaks go to a true-peak limiter
    instead (at 4x, with its lookahead delay compensated so nothing moves)."""
    i, tp = loudness(raw)
    fit = f"apad=whole_len={samples},atrim=end_sample={samples}"
    if not math.isfinite(i):  # Silence: there's nothing to raise.
        ffmpeg("-y", "-i", str(raw), "-af", fit, "-ar", str(RATE), "-c:a", "pcm_s16le", str(out))
        return i, tp
    gain = lufs - i
    for _ in range(5):
        chain = f"volume={gain:.3f}dB"
        if tp + gain > PEAK_CEILING:
            limit = 10 ** ((PEAK_CEILING - 0.3) / 20)
            chain = (f"aresample={RATE * 4},{chain},alimiter=limit={limit:.4f}:attack=1:release=60:level=disabled:latency=1,"
                     f"aresample={RATE}")
        ffmpeg("-y", "-i", str(raw), "-af", f"{chain},{fit}", "-ar", str(RATE), "-ac", "2", "-c:a", "pcm_s16le", str(out))
        got_i, got_tp = loudness(out)
        if abs(got_i - lufs) <= 0.1:
            break
        gain += lufs - got_i  # The limiter took some off: push by what's missing.
    return got_i, got_tp


def mix(p: Project) -> Path:
    """One mix.wav for every renderer, cut to exactly the timeline's frames."""
    tl = read_json(p.gen / "timeline.json") or timeline(p)
    opts = p.spec.get("mix") or {}
    duck = float(opts.get("duck_db", 8))
    lufs = float(opts.get("lufs", -14))
    fade = float(opts.get("fade_out", 0))
    seconds = tl["frames"] / tl["fps"]
    samples = int(round(seconds * RATE))

    inputs, chains = [], {"music": [], "voice": [], "sfx": []}
    for c in tl["clips"]:
        if c.get("mix") is False:  # played by the composition at its own cues, not baked in
            continue
        i = len(inputs) // 2  # inputs holds "-i", path pairs
        inputs += ["-i", str(ROOT / "public" / c["file"])]
        ms = int(round(c["start"] * 1000))
        chains[c["kind"]].append(f"[{i}:a]aresample={RATE},aformat=channel_layouts=stereo,adelay={ms}:all=1,volume={c['gain_db']}dB")
    if not inputs:
        raise SystemExit("Nothing to mix")

    f, buses = [], []
    for kind, items in chains.items():
        if not items:
            continue
        for j, ch in enumerate(items):
            f.append(f"{ch}[{kind}{j}]")
        ins = "".join(f"[{kind}{j}]" for j in range(len(items)))
        f.append(f"{ins}amix=inputs={len(items)}:normalize=0:duration=longest[{kind}]" if len(items) > 1 else f"{ins}anull[{kind}]")
        buses.append(kind)
    if "music" in buses and "voice" in buses and duck > 0:
        # Sidechain: the music dips by roughly `duck_db` while anyone is talking. The key is padded
        # with silence because the compressor stops at the end of its shorter input.
        ratio = max(1.5, 10 ** (duck / 20))
        f.append("[voice]asplit=2[voice_out][vkey]")
        f.append("[vkey]apad[vpad]")
        f.append(f"[music][vpad]sidechaincompress=threshold=0.02:ratio={ratio:.2f}:attack=15:release=350[music_out]")
        buses = [{"music": "music_out", "voice": "voice_out"}.get(b, b) for b in buses]
    # Fades go in before the level is set, so they're counted in the loudness.
    tail = f",afade=t=out:st={seconds - fade:.4f}:d={fade}" if fade > 0 else ""
    ins = "".join(f"[{b}]" for b in buses)
    f.append(f"{ins}amix=inputs={len(buses)}:normalize=0:duration=longest,"
             f"apad=whole_len={samples},atrim=end_sample={samples}{tail}[out]")

    raw, out = p.gen / "mix.raw.wav", p.gen / "mix.wav"
    ffmpeg("-y", *inputs, "-filter_complex", ";".join(f), "-map", "[out]", "-ar", str(RATE), "-ac", "2", "-c:a", "pcm_f32le", str(raw))
    i, tp = normalise(raw, out, lufs, samples)
    raw.unlink()
    print(f"mix: {out.relative_to(ROOT).as_posix()} ({i:.1f} LUFS, {tp:.1f} dBTP, {seconds:.3f} s)")
    return out


# ── Blender ──────────────────────────────────────────────────────────────────

VENV_PY = ".venv/Scripts/python" if os.name == "nt" else ".venv/bin/python"  # for messages


def _version(path: Path) -> tuple:
    return tuple(int(n) for n in re.findall(r"\d+", path.parent.name))


def blender_exe() -> str:
    """BLENDER= (environment, then .env.local, then .env), then PATH, then the Mac app, then the two usual Windows
    installs, newest first."""
    env = os.environ.get("BLENDER") or eleven.dotenv("BLENDER")
    if env:
        if not Path(env).exists():
            raise SystemExit(f"BLENDER is set to {env}, which doesn't exist.")
        return env
    found = shutil.which("blender")
    if found:
        return found
    for app in (Path("/Applications/Blender.app"), Path.home() / "Applications/Blender.app"):
        if (app / "Contents/MacOS/Blender").exists():
            return str(app / "Contents/MacOS/Blender")
    program_files = Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Blender Foundation"
    local = Path(os.environ.get("LOCALAPPDATA", "")) / "Programs"
    for hits in (program_files.glob("Blender */blender.exe"), local.glob("blender-*/blender.exe")):
        for c in sorted(hits, key=_version, reverse=True):
            return str(c)
    raise SystemExit("Blender not found. Set BLENDER=<path to blender.exe, or Blender.app/Contents/MacOS/Blender>.")


def blender(p: Project, scene: str, preview: bool, frames: str | None, layer: bool, video: bool, ratio: str) -> None:
    """Render a Blender scene against the ad's timeline.

    --frames: stills in out/<slug>/blender/. --video: the same folder + an mp4 with mix.wav.
    --layer: ####.png in public/ads/<slug>/gen/blender/<scene>/ for <Plate>, no audio.
    """
    if not (frames or layer or video):
        raise SystemExit("Say what to render: --frames 1,300 for stills, --layer for plates, --video for an mp4.")
    if video and (layer or frames):
        raise SystemExit("--video renders the whole scene: it can't go with --layer or --frames.")
    tl_path = p.gen / "timeline.json"
    if not tl_path.exists():
        raise SystemExit(f"No timeline yet. Run: {VENV_PY} py/mv.py build {p.slug}")
    if video and not (p.gen / "mix.wav").exists():
        raise SystemExit(f"No mix yet. Run: {VENV_PY} py/mv.py build {p.slug}")
    scene_path = (ROOT / scene).resolve()
    if not scene_path.exists():
        raise SystemExit(f"No scene at {scene_path}")
    name = scene_path.stem + ("-preview" if preview else "") + ("" if ratio == "16x9" else f"-{ratio}")
    out_dir = (p.gen / "blender" / name) if layer else (ROOT / "out" / p.slug / "blender" / name)
    out_dir.mkdir(parents=True, exist_ok=True)
    if not frames:  # A shorter render mustn't leave old frames on the end of the sequence.
        for old in out_dir.glob("*.png"):
            old.unlink()

    paths = [(Path(__file__).resolve().parent / "blender").as_posix(), scene_path.parent.as_posix()]
    args = [blender_exe(), "--background", "--factory-startup",
            "--python-exit-code", "1",  # Otherwise a crashed scene exits 0 with nothing rendered.
            "--python-expr", f"import sys; sys.path[:0] = {paths!r}",  # Blender ignores PYTHONPATH.
            "--python", str(scene_path), "--",
            "--timeline", str(tl_path), "--out", str(out_dir), "--ratio", ratio]
    if preview:
        args.append("--preview")
    if frames:
        args += ["--frames", frames]
    if layer:
        args.append("--layer")
    r = subprocess.run(args)
    if r.returncode:
        raise SystemExit(f"Blender failed on {scene} (exit {r.returncode}): see the traceback above.")
    pngs = sorted(out_dir.glob("*.png"))
    if not pngs:
        raise SystemExit(f"Blender wrote nothing to {out_dir}")
    if layer and not frames:
        first = int(pngs[0].stem)
        src = p.public_path(out_dir)
        print(f'plates: {len(pngs)} files. <Plate src="{src}/####.png" first={{{first}}} length={{{len(pngs)}}} />'
              + (f"  inside <Sequence from={{{first - 1}}}>" if first > 1 else ""))
    elif video:
        mux(out_dir, p.gen / "mix.wav", out_dir.with_suffix(".mp4"), p.fps)
    else:
        print(f"stills: {out_dir}")


def mux(frames_dir: Path, audio: Path, out: Path, fps: int) -> None:
    """Numbered PNGs + audio → H.264 mp4. File number n is timeline frame n - 1, so a scene that renders
    only a slice of the timeline starts the audio there too and stays in sync."""
    pngs = sorted(frames_dir.glob("*.png"))
    numbers = [int(f.stem) for f in pngs]
    first, n = numbers[0], len(numbers)
    if numbers != list(range(first, first + n)):
        raise SystemExit(f"Gaps in the frames in {frames_dir}")
    digits = len(pngs[0].stem)
    ffmpeg("-y", "-loglevel", "error", "-framerate", str(fps), "-start_number", str(first), "-i", str(frames_dir / f"%0{digits}d.png"),
           "-ss", f"{(first - 1) / fps:.6f}", "-i", str(audio), "-map", "0:v", "-map", "1:a",
           "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "320k", "-frames:v", str(n), "-t", f"{n / fps:.6f}", "-movflags", "+faststart", str(out))
    print(f"mux: {out} ({n} frames)")


# ── CLI ──────────────────────────────────────────────────────────────────────

def main() -> None:
    for stream in (sys.stdout, sys.stderr):  # A Windows console is often cp1252, and errors can quote Hebrew.
        stream.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    vs = sub.add_parser("voices")
    vs.add_argument("--json", action="store_true", help="for the desk's settings page")
    vs.add_argument("--id", help="look up one voice by its id")
    for name in ("build", "gen", "timeline", "mix"):
        s = sub.add_parser(name)
        s.add_argument("slug")
        s.add_argument("--force", default="", help="comma-separated ids to regenerate: music,stems,<voice id>,<sfx id>")
        if name == "build":
            s.add_argument("--estimate", action="store_true", help="print the credits it would use and stop")
            s.add_argument("--test-line", nargs="?", const="", metavar="VOICE", help="generate one line only (first voice by default)")
    b = sub.add_parser("blender")
    b.add_argument("slug")
    b.add_argument("--scene", required=True)
    b.add_argument("--preview", action="store_true", help="half size, fewer samples")
    b.add_argument("--frames", help="Blender frames (first is 1) to render as stills, e.g. 1,120,480")
    b.add_argument("--layer", action="store_true", help="PNG plates under public/ads/<slug>/gen/blender/<scene>/ for <Plate>")
    b.add_argument("--video", action="store_true", help="a standalone mp4 with mix.wav under out/<slug>/blender/")
    b.add_argument("--ratio", default="16x9", choices=("16x9", "1x1", "9x16"))
    w = sub.add_parser("words", help="Whisper word times for any recording, e.g. a clip's audio.wav")
    w.add_argument("audio")
    w.add_argument("--lang", help="language code, e.g. he. Whisper guesses when it's left out")
    w.add_argument("--text", help="the script, if you know it: its words come back, timed")
    w.add_argument("--out", help="default: words.json beside the audio")
    a = ap.parse_args()

    if a.cmd == "voices" and (a.json or a.id):
        def info(v):
            return {"id": v.voice_id, "name": v.name, "labels": dict(v.labels or {}), "preview": v.preview_url,
                    "category": v.category}
        try:
            found = info(eleven.voice(a.id)) if a.id else [info(v) for v in eleven.voices()]
        except SystemExit:
            raise
        except Exception as e:  # The SDK's not-found and auth errors: one short line, never the key.
            raise SystemExit(f"ElevenLabs didn't return {'that voice' if a.id else 'the voices'} ({getattr(e, 'status_code', None) or type(e).__name__}).") from None
        print(json.dumps(found, ensure_ascii=False))
        return
    if a.cmd == "voices":
        for v in eleven.voices():
            labels = ", ".join(f"{k}={val}" for k, val in (v.labels or {}).items())
            mark = "  (default)" if v.voice_id == eleven.DEFAULT_VOICE else ""
            print(f"{v.voice_id}  {v.name:<28} {labels}{mark}")
        return

    if a.cmd == "words":
        src = Path(a.audio).resolve()
        if not src.exists():
            raise SystemExit(f"No file at {src}")
        r = whisper.align(src, a.text, a.lang) if a.text else whisper.transcribe(src, a.lang)
        out = Path(a.out) if a.out else src.parent / "words.json"
        write_json(out, r)
        heard = f", {r['matched']:.0%} heard word for word" if "matched" in r else ""
        print(f"{len(r['words'])} words{heard} → {out.relative_to(ROOT).as_posix() if out.is_relative_to(ROOT) else out}")
        return

    p = Project(a.slug)
    if a.cmd == "blender":
        return blender(p, a.scene, a.preview, a.frames, a.layer, a.video, a.ratio)
    force = {s for s in a.force.split(",") if s}
    if a.cmd == "build":
        items = [test_line_item(p, a.test_line)] if a.test_line is not None else None
        if a.estimate:
            estimate(p, force, items)
            return
        if items:
            gen(p, force, items)
            print(f"Listen to {items[0].outs[0].relative_to(ROOT).as_posix()} before building the rest.")
            return
    if a.cmd in ("build", "gen"):
        gen(p, force)
    if a.cmd in ("build", "timeline"):
        timeline(p)
    if a.cmd in ("build", "mix"):
        mix(p)


if __name__ == "__main__":
    main()
