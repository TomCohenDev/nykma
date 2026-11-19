"""Word times from a recording, on this machine, through faster-whisper (MIT). Free, and no key.

    transcribe(path, lang)        what Whisper hears: words and lines (its segments), with times
    align(path, text, lang)       a known script laid on what Whisper hears: the script's own words, with times

Whisper writes down what it hears, so `align` matches its words to the script's (case, punctuation and niqqud
ignored) and fills each word it misheard from the time between its neighbours. The script's words always come back
in order and complete, so `word:` cues and lines work as they do for ElevenLabs' forced alignment. `matched` says how
much of the script Whisper heard word for word; mv.py warns below MIN_MATCHED.

Whisper's word times lean early. Against ElevenLabs' own timing on two Hebrew ads (109 words, Nov 2026) it started words
48 and 78 ms early, so starts move LEAD later. That left 78-86% of them within 2 frames and 83-90% within 3, where forced
alignment is closer, so use `"align": "eleven"` for a cut that has to land on the exact frame.

Models download once to the Hugging Face cache (~1.6 GB) and run on the CPU. Hebrew uses ivrit.ai's fine-tune of
large-v3-turbo (Apache 2.0), which hears Hebrew far better than stock Whisper.
"""
from difflib import SequenceMatcher
from pathlib import Path

from tl import clean

MODELS = {"he": "ivrit-ai/whisper-large-v3-turbo-ct2"}
DEFAULT_MODEL = "large-v3-turbo"
MIN_MATCHED = 0.8
LEAD = 0.05  # seconds: see above

_models = {}


def model_for(lang: str | None) -> str:
    return MODELS.get(lang or "", DEFAULT_MODEL)


def _model(name: str):
    if name not in _models:
        try:
            from faster_whisper import WhisperModel
        except ImportError:
            raise SystemExit("faster-whisper isn't installed. Run: .venv/bin/python -m pip install -r py/requirements.txt") from None
        _models[name] = WhisperModel(name, device="cpu", compute_type="int8")
    return _models[name]


def _hear(path: Path, lang: str | None, model: str | None, prompt: str | None = None) -> tuple[list[dict], list[dict]]:
    segments, _ = _model(model or model_for(lang)).transcribe(
        str(path), language=lang, word_timestamps=True, vad_filter=True, initial_prompt=prompt, beam_size=5)
    words, lines = [], []
    for s in segments:
        ws = [{"text": w.word.strip(), "start": round(min(float(w.start) + LEAD, float(w.end)), 4), "end": round(float(w.end), 4)}
              for w in s.words or [] if w.word.strip()]
        if ws:
            words += ws
            lines.append({"text": " ".join(w["text"] for w in ws), "start": ws[0]["start"], "end": ws[-1]["end"]})
    return words, lines


def transcribe(path: Path, lang: str | None = None, model: str | None = None) -> dict:
    words, lines = _hear(path, lang, model)
    return {"words": words, "lines": lines, "model": model or model_for(lang), "engine": "whisper"}


def align(path: Path, text: str, lang: str | None = None, model: str | None = None) -> dict:
    script = text.split()
    # The script as a prompt nudges Whisper toward its spelling, so more words match exactly.
    heard, _ = _hear(path, lang, model, prompt=" ".join(script)[-800:])
    words, matched = lay(script, heard)
    return {"words": words, "matched": matched, "model": model or model_for(lang), "engine": "whisper"}


def lay(script: list[str], heard: list[dict]) -> tuple[list[dict], float]:
    """The script's words with times from what was heard. Matched words take the heard word's time. A run of
    unmatched script words takes the heard words between the same neighbours if there are as many, else that span
    shared out by length."""
    if not script:
        return [], 1.0
    if not heard:
        raise SystemExit("Whisper heard no words in the recording.")
    a, b = [clean(w) for w in script], [clean(w["text"]) for w in heard]
    out: list[dict | None] = [None] * len(script)
    owner = {}  # script word -> the heard word it matched, so a gap knows the heard words it spans
    for m in SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks():
        for k in range(m.size):
            h = heard[m.b + k]
            out[m.a + k] = {"text": script[m.a + k], "start": h["start"], "end": h["end"]}
            owner[m.a + k] = m.b + k
    hits = len(owner)
    i = 0
    while i < len(script):
        if out[i]:
            i += 1
            continue
        run_end = i
        while run_end < len(script) and not out[run_end]:
            run_end += 1
        left = owner.get(i - 1, -1)
        right = owner.get(run_end, len(heard))
        between = heard[left + 1:right]
        if len(between) == run_end - i:
            for k, h in enumerate(between):
                out[i + k] = {"text": script[i + k], "start": h["start"], "end": h["end"]}
        else:
            start = between[0]["start"] if between else (heard[left]["end"] if left >= 0 else 0.0)
            end = between[-1]["end"] if between else (heard[right]["start"] if right < len(heard) else heard[-1]["end"])
            end = max(end, start)
            weights = [len(a[k]) + 1 for k in range(i, run_end)]
            t, total = start, sum(weights)
            for k, wt in zip(range(i, run_end), weights):
                d = (end - start) * wt / total
                out[k] = {"text": script[k], "start": round(t, 4), "end": round(t + d, 4)}
                t += d
        i = run_end
    return out, round(hits / len(script), 3)
