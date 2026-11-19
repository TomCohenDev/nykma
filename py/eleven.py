"""ElevenLabs calls for the pipeline, through the official SDK (`elevenlabs` on PyPI).

Every call here costs credits, so mv.py caches on a hash of the request and only comes here
when the spec actually changed. Nothing runs (and no key is needed) until the first paid call.

The key comes from the desk's key store (~/.config/nykma/keys/elevenlabs, set on its Settings page),
then .env.local, then .env, then the environment. Only that one value is read, it stays in this
module, and it is never printed or logged.
"""
import base64
import io
import os
import re
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# George, one of ElevenLabs' default voices. Used when a voice entry has no voice_id.
DEFAULT_VOICE = "JBFqnCBsd6RMkjVDRZzb"
DEFAULT_TTS_MODEL = "eleven_v4"
DEFAULT_MUSIC_MODEL = "music_v2_5"

# elevenlabs.io/docs/overview/models, Oct 2026: only these list Hebrew (he). The API silently
# ignores language_code on any other model, which is how Hebrew came out unintelligible.
HEBREW_MODELS = ("eleven_v4", "eleven_v4_turbo", "eleven_v3", "eleven_v3_conversational")
MODEL_CHAR_LIMITS = {"eleven_v4": 10_000, "eleven_v3": 5_000}

# What --estimate multiplies by, checked Oct 2026. API accounts are billed in USD, not credits,
# and these rates aren't all on one page, so treat the total as a guide.
CREDITS_PER_CHAR = {  # models.md + pricing/api: the cheaper tier is half the price
    "eleven_v4_turbo": 0.5, "eleven_v3_conversational": 0.5,
    "eleven_flash_v2_5": 0.5, "eleven_flash_v2": 0.5, "eleven_turbo_v2_5": 0.5, "eleven_turbo_v2": 0.5,
}
CREDITS_PER_CHAR_DEFAULT = 1.0  # docs/overview/intro: one credit per character
MUSIC_CREDITS_PER_MIN = 900  # elevenlabs.io/pricing
SFX_CREDITS_PER_SECOND = 40  # docs/capabilities/sound-effects, when a duration is set
SFX_CREDITS_AUTO = 200  # elevenlabs.io/pricing, per generation: the rate with no duration set
STEMS_CREDITS_PER_MIN = MUSIC_CREDITS_PER_MIN  # blog: 1x generation cost for 4 stems
ALIGN_CREDITS_PER_MIN = None  # not published anywhere: --estimate lists it as unpriced


def stored_key() -> str | None:
    """The key saved on the desk's Settings page. NYKMA_HOME moves the store, as in scripts/lib/keys.ts."""
    home = Path(os.environ.get("NYKMA_HOME") or Path.home() / ".config" / "nykma")
    f = home / "keys" / "elevenlabs"
    return (f.read_text(encoding="utf-8").strip() or None) if f.exists() else None


def dotenv(key: str) -> str | None:
    """One value from .env.local or .env. The rest of those files is left alone."""
    for name in (".env.local", ".env"):
        f = ROOT / name
        if f.exists():
            for line in f.read_text(encoding="utf-8").splitlines():
                k, sep, v = line.partition("=")
                if sep and k.strip() == key and v.strip():
                    return v.strip().strip('"').strip("'")
    return None


_client = None  # tests inject a fake here


def client():
    global _client
    if _client is None:
        key = stored_key() or dotenv("ELEVENLABS_API_KEY") or os.environ.get("ELEVENLABS_API_KEY")
        if not key:
            raise SystemExit("No ElevenLabs key. Add it on the desk's Settings page, under Connections.")
        from elevenlabs import ElevenLabs
        _client = ElevenLabs(api_key=key)
    return _client


def _snake(obj):
    """The SDK's music metadata is camelCase (compositionPlan, durationMs); the rest of the
    pipeline reads snake_case."""
    if isinstance(obj, dict):
        return {re.sub(r"(?<!^)(?=[A-Z])", "_", k).lower(): _snake(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_snake(v) for v in obj]
    return obj


def voices() -> list:
    return client().voices.get_all().voices


def voice(voice_id: str):
    """One voice by id: the account's own, or one it can reach. Free, like the list."""
    return client().voices.get(voice_id)


def pcm_to_wav(audio: bytes, output_format: str) -> bytes:
    """pcm_44100 and friends arrive as bare samples: give them a header so ffmpeg and librosa can read them."""
    if not output_format.startswith("pcm_"):
        return audio
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(int(output_format.split("_")[1]))
        w.writeframes(audio)
    return out.getvalue()


# ── music ────────────────────────────────────────────────────────────────────

def music(prompt: str, model_id: str, output_format: str, length_ms: int | None = None,
          instrumental: bool = False) -> tuple[bytes, dict]:
    """Prompt-only composition: the model chooses structure, length, vocals and lyrics.
    Returns (audio, metadata) where metadata holds the plan the model chose and word timestamps."""
    kwargs = {"prompt": prompt, "model_id": model_id, "with_timestamps": True, "output_format": output_format}
    if length_ms:
        kwargs["music_length_ms"] = length_ms
    if instrumental:  # under a voice-over: guaranteed no vocals
        kwargs["force_instrumental"] = True
    r = client().music.compose_detailed(**kwargs)
    return pcm_to_wav(strip_boundary(r.audio), output_format), \
        {**_snake(r.json or {}), "song_id": r.song_id, "filename": r.filename}


def strip_boundary(audio: bytes) -> bytes:
    """The SDK's multipart parser leaves the closing CRLF "--boundary--" on the audio."""
    cut = audio.rfind(CRLF_DASHES, max(0, len(audio) - 512))
    return audio[:cut] if cut != -1 else audio


CRLF_DASHES = bytes([13, 10]) + b"--"


def stems(audio_path: Path, output_format: str) -> bytes:
    """Zip bytes, one file per stem."""
    with open(audio_path, "rb") as f:
        return b"".join(client().music.separate_stems(file=f, output_format=output_format))


# ── voice ────────────────────────────────────────────────────────────────────

def tts(text: str, voice_id: str, model_id: str, output_format: str, **extra) -> tuple[bytes, dict]:
    """Speech + per-character timing. `extra` carries language_code, voice_settings, seed, ..."""
    r = client().text_to_speech.convert_with_timestamps(
        voice_id=voice_id, text=text, model_id=model_id, output_format=output_format, **extra)
    al = r.alignment or r.normalized_alignment
    alignment = {
        "characters": list(al.characters),
        "character_start_times_seconds": list(al.character_start_times_seconds),
        "character_end_times_seconds": list(al.character_end_times_seconds),
    } if al else {}
    return pcm_to_wav(base64.b64decode(r.audio_base_64), output_format), alignment


def align(audio_path: Path, text: str) -> dict:
    """A real recorded reading + its transcript → word times."""
    with open(audio_path, "rb") as f:
        r = client().forced_alignment.create(file=f, text=text)
    return {
        "words": [{"text": w.text, "start": w.start, "end": w.end, "loss": getattr(w, "loss", None)} for w in r.words],
        "loss": getattr(r, "loss", None),
    }


# ── sound effects ────────────────────────────────────────────────────────────

def sfx(text: str, output_format: str, **extra) -> bytes:
    """`extra`: duration_seconds, prompt_influence, loop, model_id. Leave them out and the
    model decides."""
    return pcm_to_wav(b"".join(client().text_to_sound_effects.convert(text=text, output_format=output_format, **extra)),
                      output_format)
