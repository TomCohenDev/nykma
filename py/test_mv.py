"""Tests for the paid paths, with no network: .venv/Scripts/python py/test_mv.py

The real ElevenLabs SDK runs against a fake server (httpx.MockTransport), so request bodies and response
parsing are real and only the far end is fake. This shows the code matches the SDK. It can't show how
ElevenLabs behaves, least of all how the Hebrew sounds.
"""
import contextlib
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

import httpx
import numpy as np
import soundfile
from elevenlabs import ElevenLabs

sys.path.insert(0, str(Path(__file__).resolve().parent))
import analyze  # noqa: E402
import eleven  # noqa: E402
import mv  # noqa: E402
import whisper  # noqa: E402
from tl import Timeline, clean  # noqa: E402

FAKE_KEY = "fake-key-do-not-print"
SHALOM = "שָׁלוֹם"  # shalom with niqqud
SHALOM_PLAIN = "שלום"
WORLD = "עולם"
RATE = 44100


def tone(seconds: float, freq: float, amp: float = 0.3) -> np.ndarray:
    return amp * np.sin(2 * np.pi * freq * np.arange(int(seconds * RATE)) / RATE)


def mp3(seconds: float, freq: float, amp: float = 0.3) -> bytes:
    with tempfile.TemporaryDirectory() as d:
        wav, out = Path(d) / "a.wav", Path(d) / "a.mp3"
        soundfile.write(wav, tone(seconds, freq, amp), RATE)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-c:a", "libmp3lame", str(out)], check=True)
        return out.read_bytes()


VOICE_AUDIO = mp3(1.5, 1200)
SFX_AUDIO = mp3(0.4, 3000)
MUSIC_AUDIO = mp3(6.0, 300)


class FakeEleven:
    """Answers like the API, and records what it was asked."""

    def __init__(self):
        self.calls: list[tuple[str, object]] = []
        self.fail: int | None = None

    def __call__(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        assert request.url.host == "api.elevenlabs.io"
        if self.fail:
            return httpx.Response(self.fail, json={"detail": {"status": "quota_exceeded"}})
        if "/with-timestamps" in path:
            body = json.loads(request.content)
            self.calls.append((path, {**body, "query": dict(request.url.params)}))
            chars = list(body["text"])
            times = [i * 0.03 for i in range(len(chars) + 1)]
            al = {"characters": chars, "character_start_times_seconds": times[:-1], "character_end_times_seconds": times[1:]}
            import base64
            return httpx.Response(200, json={"audio_base64": base64.b64encode(VOICE_AUDIO).decode(), "alignment": al, "normalized_alignment": al})
        if path == "/v1/sound-generation":
            self.calls.append((path, json.loads(request.content)))
            return httpx.Response(200, content=SFX_AUDIO)
        if path == "/v1/music/detailed":
            self.calls.append((path, json.loads(request.content)))
            plan = {"compositionPlan": {"chunks": [{"text": "[Verse]\nhello", "durationMs": 3000}, {"text": "[Hook]\nworld", "durationMs": 3000}]},
                    "words": [{"word": "hello", "startMs": 100, "endMs": 400}, {"word": "world", "startMs": 3100, "endMs": 3400}]}
            head = b'--B\r\nContent-Type: application/json\r\n\r\n' + json.dumps(plan).encode() + b'\r\n--B\r\n' \
                b'Content-Disposition: attachment; filename="song.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n'
            return httpx.Response(200, content=head + MUSIC_AUDIO + b"\r\n--B--\r\n", headers={"song-id": "s1"})
        if path == "/v1/music/stem-separation":
            self.calls.append((path, None))
            out = io.BytesIO()
            with zipfile.ZipFile(out, "w") as z:
                z.writestr("Drums.mp3", MUSIC_AUDIO)
                z.writestr("Bass.mp3", MUSIC_AUDIO)
            return httpx.Response(200, content=out.getvalue())
        if path == "/v1/forced-alignment":
            self.calls.append((path, request.content))
            return httpx.Response(200, json={
                "characters": [{"text": "h", "start": 0.0, "end": 0.1}],
                "words": [{"text": "hello", "start": 0.1, "end": 0.5, "loss": 0.1}, {"text": " ", "start": 0.5, "end": 0.6, "loss": 0.0},
                          {"text": "there", "start": 0.6, "end": 1.0, "loss": 0.1}],
                "loss": 0.1})
        raise AssertionError(f"Unexpected call: {request.method} {path}")


class FakeWhisper:
    """Stands in for faster-whisper: hands back `heard` and `lines`, and records each call."""
    def __init__(self):
        self.calls, self.heard, self.lines = [], [], []

    def __call__(self, path, lang, model, prompt=None):
        self.calls.append({"file": Path(path).name, "lang": lang, "model": model, "prompt": prompt})
        return [dict(w) for w in self.heard], [dict(ln) for ln in self.lines]


class Base(unittest.TestCase):
    def setUp(self):
        self.hear = FakeWhisper()
        keep_hear = whisper._hear
        whisper._hear = self.hear
        self.addCleanup(setattr, whisper, "_hear", keep_hear)
        self.root = Path(tempfile.mkdtemp())
        self.keep = (mv.ROOT, eleven.ROOT, eleven._client, os.environ.pop("ELEVENLABS_API_KEY", None))
        mv.ROOT = eleven.ROOT = self.root
        # The desk's key store, here so a real one on this machine never answers for a test.
        keep_home = os.environ.get("NYKMA_HOME")
        os.environ["NYKMA_HOME"] = str(self.root / "home")
        self.addCleanup(lambda: os.environ.__setitem__("NYKMA_HOME", keep_home) if keep_home else os.environ.pop("NYKMA_HOME", None))
        self.api = FakeEleven()
        eleven._client = ElevenLabs(api_key=FAKE_KEY, httpx_client=httpx.Client(transport=httpx.MockTransport(self.api)))
        self.addCleanup(shutil.rmtree, self.root, True)

    def tearDown(self):
        mv.ROOT, eleven.ROOT, eleven._client, key = self.keep
        if key:
            os.environ["ELEVENLABS_API_KEY"] = key

    def project(self, spec: dict, slug: str = "t") -> mv.Project:
        d = self.root / "public" / "ads" / slug
        d.mkdir(parents=True, exist_ok=True)
        (d / "spec.json").write_text(json.dumps(spec, ensure_ascii=False), encoding="utf-8")
        return mv.Project(slug)

    def track(self, p: mv.Project, seconds: float = 6.0) -> None:
        (p.dir / "assets").mkdir(exist_ok=True)
        soundfile.write(p.dir / "assets" / "m.wav", tone(seconds, 300, 0.1), RATE)

    def build(self, p: mv.Project, force: set[str] | None = None) -> str:
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            mv.gen(p, force or set())
            mv.timeline(p)
            mv.mix(p)
        return out.getvalue()

    def timeline(self, p: mv.Project) -> dict:
        return json.loads((p.gen / "timeline.json").read_text(encoding="utf-8"))

    def tts_calls(self) -> list[dict]:
        return [b for path, b in self.api.calls if "/with-timestamps" in path]


class Hebrew(Base):
    def test_language_code_and_model_reach_the_api(self):
        p = self.project({"lang": "he", "voices": [{"id": "n", "text": f"[whispers] {SHALOM} {WORLD}"}]})
        self.build(p)
        body = self.tts_calls()[0]
        self.assertEqual(body["language_code"], "he")
        self.assertEqual(body["model_id"], "eleven_v4")
        self.assertEqual(body["text"], f"[whispers] {SHALOM} {WORLD}")
        self.assertEqual(body["query"].get("output_format"), "mp3_44100_128")

    def test_old_model_is_refused_before_any_call(self):
        p = self.project({"lang": "he", "voices": [{"id": "n", "text": SHALOM, "model_id": "eleven_multilingual_v2"}]})
        with self.assertRaises(SystemExit) as e:
            self.build(p)
        self.assertIn("doesn't support", str(e.exception))
        self.assertEqual(self.api.calls, [])

    def test_estimate_refuses_it_too(self):
        p = self.project({"lang": "he", "voices": [{"id": "n", "text": SHALOM, "model_id": "eleven_flash_v2_5"}]})
        with self.assertRaises(SystemExit), contextlib.redirect_stdout(io.StringIO()):
            mv.estimate(p, set())

    def test_hebrew_text_counts_as_hebrew_without_a_lang(self):
        p = self.project({"voices": [{"id": "n", "text": SHALOM}]})
        self.build(p)
        self.assertEqual(self.tts_calls()[0]["language_code"], "he")

    def test_a_voice_can_step_out_of_the_ad_language(self):
        p = self.project({"lang": "he", "voices": [{"id": "n", "text": "hello", "language_code": "en"}]})
        self.build(p)
        self.assertEqual(self.tts_calls()[0]["language_code"], "en")

    def test_niqqud_is_ignored_when_placing_on_a_word(self):
        p = self.project({"lang": "he", "voices": [{"id": "n", "text": f"{SHALOM} {WORLD}"}],
                          "markers": [{"name": "hi", "at": f"word:n:{SHALOM_PLAIN}+0.1"}]})
        self.build(p)
        tl = self.timeline(p)
        self.assertAlmostEqual(tl["markers"][0]["t"], tl["words"][0]["start"] + 0.1, places=3)
        self.assertEqual(clean(SHALOM), SHALOM_PLAIN)
        self.assertEqual(clean("ג׳ירף"), "ג'ירף")  # geresh

    def test_sung_hebrew_warns_and_instrumental_does_not(self):
        sung = self.project({"lang": "he", "music": {"prompt": "pop", "length_s": 6}})
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            mv.estimate(sung, set())
        self.assertIn("sung Hebrew", out.getvalue())
        quiet = self.project({"lang": "he", "music": {"prompt": "pop", "length_s": 6, "instrumental": True}})
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            mv.estimate(quiet, set())
        self.assertNotIn("sung Hebrew", out.getvalue())


class Caching(Base):
    SPEC = {"voices": [{"id": "a", "text": "one two"}, {"id": "b", "text": "three", "at": 2}],
            "sfx": [{"id": "s", "text": "boom", "duration": 1, "at": 1}]}

    def test_only_changed_items_are_paid_for(self):
        p = self.project(self.SPEC)
        self.build(p)
        self.assertEqual(len(self.api.calls), 3)
        self.build(p)
        self.assertEqual(len(self.api.calls), 3, "an unchanged build must cost nothing")
        changed = json.loads(json.dumps(self.SPEC))
        changed["voices"][1]["text"] = "four"
        self.build(self.project(changed))
        self.assertEqual(len(self.api.calls), 4)
        self.assertEqual(self.tts_calls()[-1]["text"], "four")

    def test_force_and_a_new_format_pay_again(self):
        p = self.project(self.SPEC)
        self.build(p)
        self.build(p, {"a"})
        self.assertEqual(len(self.api.calls), 4)
        self.build(self.project({**self.SPEC, "output_format": "mp3_44100_192"}))
        self.assertEqual(len(self.api.calls), 7)

    def test_a_new_model_voice_or_language_is_a_new_request(self):
        p = self.project({})
        base = {"id": "a", "text": "hi"}
        request = lambda change: mv._hash(mv.voice_item(p, {**base, **change}).req)
        for change in ({"model_id": "eleven_v3"}, {"voice_id": "other"}, {"language_code": "fr"}, {"seed": 1}):
            self.assertNotEqual(request({}), request(change), change)

    def test_a_deleted_output_is_made_again(self):
        p = self.project(self.SPEC)
        self.build(p)
        (p.gen / "voice.a.align.json").unlink()
        self.build(p)
        self.assertEqual(len(self.api.calls), 4)


class Estimate(Base):
    def test_calls_nothing_writes_nothing_and_needs_no_key(self):
        eleven._client = None  # any paid call would now stop with "No ElevenLabs key"
        p = self.project({"music": {"prompt": "x", "length_s": 30, "stems": True},
                          "voices": [{"id": "a", "text": "x" * 100}, {"id": "t", "text": "y" * 100, "model_id": "eleven_v4_turbo"}],
                          "sfx": [{"id": "d", "text": "b", "duration": 2}, {"id": "auto", "text": "c"}]})
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            total = mv.estimate(p, set())
        self.assertEqual(total, 450 + 450 + 100 + 50 + 80 + 200)
        self.assertEqual(self.api.calls, [])
        self.assertFalse(p.gen.exists())
        self.assertIn("nothing was called", out.getvalue())

    def test_matches_what_a_build_then_pays_for(self):
        spec = {"voices": [{"id": "a", "text": "hello"}, {"id": "b", "text": "world", "at": 2}]}
        p = self.project(spec)
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(mv.estimate(p, set()), 10)
        self.build(p)
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(mv.estimate(p, set()), 0, "everything is cached now")
            spec["voices"][0]["text"] = "hello!"
            self.assertEqual(mv.estimate(self.project(spec), set()), 6, "only the changed line")
            self.assertEqual(mv.estimate(self.project(spec), {"b"}), 11, "--force counts too")

    def test_forced_alignment_is_flagged_not_guessed(self):
        p = self.project({"voices": [{"id": "me", "text": "hi", "file": "me.wav", "align": "eleven"}]})
        soundfile.write(p.dir / "me.wav", tone(1, 200), RATE)
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(mv.estimate(p, set()), 0)
        self.assertIn("not in the total: me", out.getvalue())

    def test_whisper_alignment_is_free(self):
        p = self.project({"voices": [{"id": "me", "text": "hi", "file": "me.wav"}]})
        soundfile.write(p.dir / "me.wav", tone(1, 200), RATE)
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(mv.estimate(p, set()), 0)
        self.assertNotIn("not in the total", out.getvalue())
        self.assertEqual(self.hear.calls, [], "an estimate runs nothing")


class TestLine(Base):
    def test_one_line_voice_is_the_real_item_so_the_build_reuses_it(self):
        p = self.project({"lang": "he", "voices": [{"id": "a", "text": SHALOM}, {"id": "b", "text": WORLD}]})
        with contextlib.redirect_stdout(io.StringIO()):
            mv.gen(p, set(), [mv.test_line_item(p, "")])
        self.assertEqual([b["text"] for b in self.tts_calls()], [SHALOM])
        self.build(p)
        self.assertEqual([b["text"] for b in self.tts_calls()], [SHALOM, WORLD])

    def test_a_long_voice_is_tested_on_its_first_line_with_the_same_settings(self):
        p = self.project({"lang": "he", "voices": [{"id": "a", "text": f"{SHALOM}\n{WORLD}", "seed": 7}]})
        item = mv.test_line_item(p, "a")
        with contextlib.redirect_stdout(io.StringIO()):
            mv.gen(p, set(), [item])
        body = self.tts_calls()[0]
        self.assertEqual((body["text"], body["language_code"], body["seed"]), (SHALOM, "he", 7))
        self.assertTrue((p.gen / "voice.test.a.mp3").exists())
        self.assertFalse((p.gen / "voice.a.mp3").exists())

    def test_tag_only_lines_are_skipped(self):
        p = self.project({"voices": [{"id": "a", "text": "[sighs]\nhello there"}]})
        self.assertEqual(mv.test_line_item(p, "").req[0], "hello there")

    def test_unknown_voice_stops(self):
        with self.assertRaises(SystemExit):
            mv.test_line_item(self.project({"voices": [{"id": "a", "text": "x"}]}), "nope")


class Timelines(Base):
    def test_tags_are_not_words_even_with_spaces_or_stuck_to_a_word(self):
        p = self.project({"voices": [{"id": "n", "text": "[very excited] hello [laughs]there\n[sad] friend", "at": 1}]})
        self.build(p)
        tl = self.timeline(p)
        self.assertEqual([w["text"] for w in tl["words"]], ["hello", "there", "friend"])
        self.assertEqual([ln["text"] for ln in tl["lines"]], ["hello there", "friend"])
        self.assertGreaterEqual(tl["words"][0]["start"], 1)

    def test_fps_and_frames_are_there_and_length_is_exact(self):
        p = self.project({"fps": 24, "duration": 2.37, "voices": [{"id": "n", "text": "hi"}]})
        self.build(p)
        tl = self.timeline(p)
        self.assertEqual((tl["fps"], tl["frames"], tl["duration"]), (24, 57, 2.375))
        self.assertEqual(soundfile.info(p.gen / "mix.wav").frames, int(57 / 24 * 48000))
        self.assertTrue(all(len(v) == 57 for v in tl["energy"].values()))

    def test_recording_goes_through_forced_alignment(self):
        p = self.project({"voices": [{"id": "me", "text": "[calm] hello there", "file": "me.wav", "at": 1, "align": "eleven"}]})
        soundfile.write(p.dir / "me.wav", tone(1.2, 200), RATE)
        self.build(p)
        self.assertEqual(len(self.api.calls), 1)
        self.assertIn(b"hello there", self.api.calls[0][1])
        self.assertNotIn(b"[calm]", self.api.calls[0][1], "the aligner should get what was said")
        tl = self.timeline(p)
        self.assertEqual([(w["text"], w["start"]) for w in tl["words"]], [("hello", 1.1), ("there", 1.6)])
        self.build(p)
        self.assertEqual(len(self.api.calls), 1)

    def test_recording_goes_through_whisper_by_default(self):
        p = self.project({"lang": "he", "voices": [{"id": "me", "text": f"[calm] {SHALOM} {WORLD}, friend", "file": "me.wav", "at": 1}]})
        soundfile.write(p.dir / "me.wav", tone(1.2, 200), RATE)
        # It hears the first word without niqqud and mishears the last one.
        self.hear.heard = [{"text": SHALOM_PLAIN, "start": 0.1, "end": 0.4}, {"text": WORLD, "start": 0.5, "end": 0.8},
                           {"text": "fiend", "start": 0.85, "end": 1.1}]
        out = self.build(p)
        self.assertEqual(self.api.calls, [], "nothing goes to ElevenLabs")
        self.assertEqual(len(self.hear.calls), 1)
        self.assertEqual((self.hear.calls[0]["lang"], self.hear.calls[0]["model"]), ("he", whisper.MODELS["he"]))
        self.assertNotIn("[calm]", self.hear.calls[0]["prompt"])
        tl = self.timeline(p)
        self.assertEqual([(w["text"], w["start"]) for w in tl["words"]],
                         [(SHALOM, 1.1), (WORLD + ",", 1.5), ("friend", 1.85)], "the script's words, at what was heard")
        self.assertEqual(tl["lines"][0]["start"], 1.1)
        self.assertIn("warning: Whisper heard 67%", out)
        self.build(p)
        self.assertEqual(len(self.hear.calls), 1, "cached")
        self.build(self.project({"lang": "he", "voices": [{"id": "me", "text": SHALOM, "file": "me.wav", "at": 1}]}))
        self.assertEqual(len(self.hear.calls), 2, "a new script aligns again")

    def test_recording_with_no_text_is_transcribed(self):
        p = self.project({"voices": [{"id": "clip", "file": "clip.wav", "at": 2}]})
        soundfile.write(p.dir / "clip.wav", tone(2, 200), RATE)
        self.hear.heard = [{"text": "so", "start": 0.1, "end": 0.3}, {"text": "fast", "start": 0.4, "end": 0.8},
                           {"text": "really", "start": 1.2, "end": 1.6}]
        self.hear.lines = [{"text": "so fast", "start": 0.1, "end": 0.8}, {"text": "really", "start": 1.2, "end": 1.6}]
        self.build(p)
        self.assertIsNone(self.hear.calls[0]["prompt"])
        tl = self.timeline(p)
        self.assertEqual([w["text"] for w in tl["words"]], ["so", "fast", "really"])
        self.assertEqual([(ln["text"], ln["start"], ln["track"]) for ln in tl["lines"]], [("so fast", 2.1, "clip"), ("really", 3.2, "clip")])
        self.assertEqual(mv.resolve_at("word:clip:really", tl), 3.2)

    def test_align_choices(self):
        for voice, says in (({"align": "eleven"}, "needs the words"), ({"text": "hi", "align": "openai"}, '"whisper" or "eleven"')):
            p = self.project({"voices": [{"id": "me", "file": "me.wav", **voice}]})
            soundfile.write(p.dir / "me.wav", tone(1, 200), RATE)
            with self.assertRaises(SystemExit) as e:
                list(mv.plan(p, set()))
            self.assertIn(says, str(e.exception))

    def test_music_prompt_gives_sections_words_and_stems(self):
        p = self.project({"music": {"prompt": "indie", "length_s": 6, "stems": True}})
        self.build(p)
        paths = [c[0] for c in self.api.calls]
        self.assertEqual(paths, ["/v1/music/detailed", "/v1/music/stem-separation"])
        body = self.api.calls[0][1]
        self.assertEqual((body["model_id"], body["music_length_ms"], body["with_timestamps"]), ("music_v2_5", 6000, True))
        self.assertTrue(p.gen.joinpath("music.mp3").read_bytes().startswith(MUSIC_AUDIO[:16]))
        self.assertFalse(p.gen.joinpath("music.mp3").read_bytes().endswith(b"--"), "the multipart tail must be gone")
        tl = self.timeline(p)
        self.assertEqual([s["name"] for s in tl["sections"]], ["Verse", "Hook"])
        self.assertEqual([w["text"] for w in tl["words"]], ["hello", "world"])
        self.assertIn("drums", tl["energy"])

    def test_a_new_song_pays_for_its_stems_too(self):
        p = self.project({"music": {"prompt": "indie", "length_s": 6, "stems": True}})
        self.build(p)
        self.build(self.project({"music": {"prompt": "folk", "length_s": 6, "stems": True}}))
        self.assertEqual([c[0].rsplit("/", 1)[1] for c in self.api.calls], ["detailed", "stem-separation"] * 2)

    def test_sfx_sends_only_what_the_spec_asks_for(self):
        p = self.project({"sfx": [{"id": "a", "text": "boom"}, {"id": "b", "text": "tick", "duration": 0.5, "loop": True}]})
        self.build(p)
        self.assertNotIn("duration_seconds", self.api.calls[0][1])
        self.assertEqual((self.api.calls[1][1]["duration_seconds"], self.api.calls[1][1]["loop"]), (0.5, True))

    def test_pcm_comes_back_as_a_real_wav(self):
        wav = eleven.pcm_to_wav(np.zeros(4410, np.int16).tobytes(), "pcm_44100")
        self.assertEqual(soundfile.info(io.BytesIO(wav)).samplerate, 44100)
        self.assertEqual(eleven.pcm_to_wav(b"mp3", "mp3_44100_128"), b"mp3")

    def test_reserved_and_repeated_ids_stop(self):
        for voices in ([{"id": "low", "text": "x"}], [{"id": "a", "text": "x"}, {"id": "a", "text": "y"}]):
            with self.assertRaises(SystemExit):
                self.project({"voices": voices})

    def test_at_before_the_start_stops(self):
        p = self.project({"voices": [{"id": "a", "text": "hi"}], "markers": [{"name": "m", "at": "word:a:hi-1"}]})
        with self.assertRaises(SystemExit), contextlib.redirect_stdout(io.StringIO()):
            self.build(p)


class Mix(Base):
    def band_rms(self, y: np.ndarray, sr: int, a: float, b: float, hz: float) -> float:
        cut = y[int(a * sr):int(b * sr)]
        spec = np.abs(np.fft.rfft(cut * np.hanning(len(cut))))
        freqs = np.fft.rfftfreq(len(cut), 1 / sr)
        return float(np.sqrt((spec[np.abs(freqs - hz) < 25] ** 2).sum()))

    def test_music_ducks_under_voice_then_recovers_and_runs_to_the_end(self):
        p = self.project({"music": {"file": "assets/m.wav"}, "voices": [{"id": "v", "text": "hello", "at": 1}]})
        self.track(p)
        self.build(p)
        y, sr = soundfile.read(p.gen / "mix.wav")
        y = y.mean(axis=1)
        under, after, end = [self.band_rms(y, sr, a, b, 300) for a, b in ((1.5, 2.3), (4.0, 4.8), (5.0, 5.8))]
        dip = 20 * np.log10(after / under)
        self.assertGreater(dip, 4, "the music should drop under the voice")
        self.assertAlmostEqual(end, after, delta=after * 0.1, msg="the music must run on after the last voice")

    def test_hits_the_loudness_target_with_peaks_under_the_ceiling(self):
        p = self.project({"music": {"file": "assets/m.wav"}, "mix": {"lufs": -14}})
        (p.dir / "assets").mkdir()
        beats = np.zeros(RATE * 6)
        for k in range(12):
            i = int(k * 0.5 * RATE)
            beats[i:i + 4000] += np.exp(-np.arange(4000) / 700) * tone(4000 / RATE, 90, 0.95)
        soundfile.write(p.dir / "assets" / "m.wav", beats + tone(6, 2000, 0.03), RATE)
        self.build(p)
        i, tp = mv.loudness(p.gen / "mix.wav")
        self.assertAlmostEqual(i, -14, delta=0.2)
        self.assertLess(tp, -1.0)

    def test_the_mix_moves_nothing_in_time(self):
        p = self.project({"music": {"file": "assets/m.wav"}, "sfx": [{"id": "s", "file": "s.wav", "at": 2.5}]})
        self.track(p)
        soundfile.write(p.dir / "s.wav", tone(0.1, 3000, 0.9), RATE)
        self.build(p)
        y, sr = soundfile.read(p.gen / "mix.wav")
        high = np.abs(np.diff(y.mean(axis=1), n=2))
        self.assertAlmostEqual(np.argmax(high > high.max() * 0.2) / sr, 2.5, delta=0.003)

    def test_fade_out_reaches_silence_and_still_hits_the_target(self):
        p = self.project({"music": {"file": "assets/m.wav"}, "mix": {"fade_out": 1}})
        self.track(p)
        self.build(p)
        y, sr = soundfile.read(p.gen / "mix.wav")
        self.assertLess(np.abs(y[-int(0.02 * sr):]).max(), 0.01)
        self.assertAlmostEqual(mv.loudness(p.gen / "mix.wav")[0], -14, delta=0.3)


class Key(Base):
    def test_no_key_stops_cleanly_only_when_something_must_be_paid_for(self):
        eleven._client = None
        p = self.project({"voices": [{"id": "a", "text": "hi"}]})
        with self.assertRaises(SystemExit) as e, contextlib.redirect_stdout(io.StringIO()):
            mv.gen(p, set())
        self.assertIn("No ElevenLabs key", str(e.exception))

    def test_the_desks_key_store_comes_before_env_local(self):
        (self.root / ".env.local").write_text("ELEVENLABS_API_KEY=from-env-local-0000\n", encoding="utf-8")
        self.assertIsNone(eleven.stored_key())
        (self.root / "home" / "keys").mkdir(parents=True)
        (self.root / "home" / "keys" / "elevenlabs").write_text(f"{FAKE_KEY}\n", encoding="utf-8")
        self.assertEqual(eleven.stored_key(), FAKE_KEY)

    def test_reads_env_local_first_and_only_that_line(self):
        (self.root / ".env.local").write_text(f'OTHER=1\nELEVENLABS_API_KEY="{FAKE_KEY}"\n', encoding="utf-8")
        self.assertEqual(eleven.dotenv("ELEVENLABS_API_KEY"), FAKE_KEY)
        self.assertNotIn("OTHER", os.environ)
        self.assertIsNone(eleven.dotenv("MISSING"))

    def test_the_key_never_shows_in_output_or_errors(self):
        p = self.project({"voices": [{"id": "a", "text": "hi"}]})
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            self.build(p)
        self.api.fail = 401
        with self.assertRaises(SystemExit) as e, contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            self.build(self.project({"voices": [{"id": "a", "text": "changed"}]}))
        message = str(e.exception)
        self.assertIn("401", message)
        self.assertIn("quota_exceeded", message)
        self.assertNotIn("headers", message)
        everything = out.getvalue() + err.getvalue() + message + "".join(f.read_text(encoding="utf-8", errors="ignore") for f in p.gen.glob("*.json"))
        self.assertNotIn(FAKE_KEY, everything)


class Analysis(unittest.TestCase):
    def test_onsets_and_beats_land_on_the_attack(self):
        """librosa reads 23 ms late as shipped; analyze.LAG takes that off."""
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "beats.wav"
            step, y = 0.4, np.zeros(RATE * 12)
            for k in range(30):
                i = int(k * step * RATE)
                n = int(0.12 * RATE)
                e = np.arange(n) / RATE
                y[i:i + n] += np.sin(2 * np.pi * (50 + 110 * np.exp(-e / 0.03)) * e) * np.exp(-e / 0.05)
            soundfile.write(path, y * 0.8, RATE)
            a = analyze.full(path, 30)
        self.assertAlmostEqual(a["bpm"], 150, delta=0.3)
        self.assertEqual(len(a["beats"]), 30, "the grid should reach the first and last beat")
        worst = max(abs(b - k * step) for k, b in enumerate(a["beats"]))
        self.assertLess(worst, 0.02)
        onset_err = [min(abs(o - k * step) for o in a["onsets"]["all"]) for k in range(30)]
        self.assertLess(np.median(onset_err), 0.02)

    def test_a_loose_tempo_keeps_the_trackers_beats(self):
        env = np.ones(600)
        beats = np.cumsum(np.tile([0.3, 0.55, 0.4, 0.7], 4))
        self.assertIsNone(analyze.steady_grid(beats, env, 12.0))

    def test_timeline_helpers(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "t.json"
            path.write_text(json.dumps({"fps": 30, "frames": 60, "duration": 2.0, "beats": [0.5, 1.0, 1.5], "downbeats": [0.5],
                                        "sections": [], "markers": [{"name": "m", "t": 1.25}], "energy": {"rms": [0.5] * 60},
                                        "onsets": {}, "words": [{"text": SHALOM, "start": 0.2, "end": 0.4, "track": "n"}]}), encoding="utf-8")
            T = Timeline(path)
        self.assertEqual(T.marker("m"), 1.25)
        self.assertAlmostEqual(T.beatPhase(0.75), 0.5)
        self.assertAlmostEqual(T.beatPhase(1.75), 0.5, msg="runs on after the last beat")
        self.assertEqual(T.said("n", SHALOM_PLAIN), 0.2)
        self.assertEqual(T.section(1.0)[1]["name"], "All")
        self.assertEqual(T.frame(0.5 / 30 * 3), 2, "rounds half up, like Math.round")
        self.assertAlmostEqual(T.pulse(T.beats, 0.5), 1.0)


class Lay(unittest.TestCase):
    def test_a_run_it_misheard_takes_as_many_heard_words(self):
        heard = [{"text": "a", "start": 0, "end": 1}, {"text": "x", "start": 1, "end": 2}, {"text": "y", "start": 2, "end": 3},
                 {"text": "d", "start": 3, "end": 4}]
        words, matched = whisper.lay(["a", "b", "c", "d"], heard)
        self.assertEqual([(w["text"], w["start"]) for w in words], [("a", 0), ("b", 1), ("c", 2), ("d", 3)])
        self.assertEqual(matched, 0.5)

    def test_otherwise_the_span_is_shared_by_length(self):
        heard = [{"text": "a", "start": 0, "end": 1}, {"text": "zz", "start": 1, "end": 4}, {"text": "d", "start": 4, "end": 5}]
        words, _ = whisper.lay(["a", "b", "ccc", "d"], heard)
        self.assertEqual([(w["text"], w["start"], w["end"]) for w in words],
                         [("a", 0, 1), ("b", 1, 2), ("ccc", 2, 4), ("d", 4, 5)])

    def test_words_it_never_heard_at_the_end(self):
        words, matched = whisper.lay(["a", "b"], [{"text": "a", "start": 0.5, "end": 1}])
        self.assertEqual([(w["text"], w["start"]) for w in words], [("a", 0.5), ("b", 1)])
        self.assertEqual(matched, 0.5)


if __name__ == "__main__":
    unittest.main(verbosity=1)
