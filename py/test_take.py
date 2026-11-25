"""Tests for py/take.py's choices, on made-up transcripts: no Whisper, no audio.

    .venv/Scripts/python -m unittest py/test_take.py
"""
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path[:0] = [str(Path(__file__).resolve().parent), str(Path(__file__).resolve().parent / "blender")]
import take  # noqa: E402


def said(*utterances: tuple[float, str]) -> tuple[list[dict], list[dict]]:
    """Utterances from (start, text), a word every 0.3 s, and the words with their utterance index."""
    utts = []
    for start, text in utterances:
        ws = [{"text": t, "start": round(start + 0.3 * k, 2), "end": round(start + 0.3 * k + 0.25, 2), "p": 0.9} for k, t in enumerate(text.split())]
        utts.append({"start": start, "end": ws[-1]["end"], "words": ws})
    words = [{**w, "u": k} for k, u in enumerate(utts) for w in u["words"]]
    return utts, words


class Choose(unittest.TestCase):
    def test_last_complete_try_wins(self):
        _, words = said(
            (0.0, "you don't need to pay"),  # broken off
            (3.0, "you don't need to pay for leads tools"),  # complete
            (7.0, "you don't need to pay for leads tools."),  # complete, later: this one
            (11.0, "here's how to build one"),
        )
        lines = [{"id": "hook", "line": "You don't need to pay for leads tools."}, {"id": "how", "line": "Here's how to build one."}]
        picks = take.choose(lines, words)
        self.assertEqual(words[picks[0]["i"]]["start"], 7.0)
        self.assertEqual(words[picks[1]["i"]]["start"], 11.0)
        self.assertEqual(len(lines[0]["_tries"]), 3)
        self.assertFalse(lines[0]["_tries"][0]["complete"])

    def test_pick_overrides(self):
        _, words = said((0.0, "one two three four five"), (3.0, "one two three four five"))
        lines = [{"id": "a", "line": "one two three four five", "pick": 1}]
        self.assertEqual(take.choose(lines, words)[0]["i"], 0)

    def test_lines_keep_script_order(self):
        # The second line's only try comes before the first line's last try: the first line has to use its earlier one.
        _, words = said((0.0, "alpha beta gamma delta"), (2.0, "epsilon zeta eta theta"), (4.0, "alpha beta gamma delta"))
        lines = [{"id": "a", "line": "alpha beta gamma delta"}, {"id": "b", "line": "epsilon zeta eta theta"}]
        picks = take.choose(lines, words)
        self.assertLess(picks[0]["j"], picks[1]["i"])

    def test_misheard_last_word_still_ends_the_try(self):
        _, words = said((0.0, "אתם לא צריכים לשלם למערכות שימצאו לכם לידס."))
        lines = [{"id": "hook", "line": "אתם לא צריכים לשלם למערכות שימצאו לכם לידים."}]
        c = take.choose(lines, words)[0]
        self.assertEqual(c["j"], len(words) - 1)

    def test_unsaid_line_is_missing(self):
        _, words = said((0.0, "alpha beta gamma delta"))
        lines = [{"id": "a", "line": "alpha beta gamma delta"}, {"id": "b", "line": "nothing like this was said"}]
        self.assertIsNone(take.choose(lines, words)[1])


class Inside(unittest.TestCase):
    def test_restart_with_no_pause_loses_its_first_half(self):
        toks = [take.clean(t) for t in "ומחר בבוקר עשר ומחר בבוקר עשרה חדשים".split()]
        line = [take.clean(t) for t in "ומחר בבוקר עשרה חדשים".split()]
        self.assertEqual(take.restarts(toks, line), {0, 1, 2})

    def test_repeat_in_the_line_is_kept(self):
        toks = ["no", "no", "no", "not", "like", "that"]
        self.assertEqual(take.restarts(toks, ["no", "no", "no", "not", "like", "that"]), set())

    def test_pause_becomes_a_jump_cut(self):
        _, words = said((0.0, "one two"), (2.0, "three four"))
        e = np.full(400, -80.0)
        parts = take.parts_of(words, set(), words, 0, 0.5, e, -70)
        self.assertEqual(len(parts), 2)
        self.assertLessEqual(parts[0]["out"], words[2]["start"] - take.GUARD)


class Free(unittest.TestCase):
    def test_earlier_tries_and_count_in_go(self):
        utts, words = said(
            (0.0, "one two three"),
            (2.0, "I stopped making my slides in"),
            (5.0, "I stopped making my slides in Gamma or Canva."),
            (9.0, "Today I build them with code."),
        )
        lines, picks, left = take.free_cut(utts, words)
        self.assertEqual([ln["line"] for ln in lines], ["I stopped making my slides in Gamma or Canva.", "Today I build them with code."])
        self.assertIn("count-in", left[0])
        self.assertIn("earlier try", left[3])


class Screen(unittest.TestCase):
    def test_lined_up_by_its_sound_or_not_at_all(self):
        import json, tempfile, wave
        rng = np.random.default_rng(3)
        # Two minutes of "speech": bursts of noise with pauses between them.
        cam = np.concatenate([rng.normal(0, 0.3 if k % 3 else 0.002, int(take.SR * rng.uniform(0.2, 0.9))) for k in range(240)]).astype(np.float32)
        start = 37.5
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "meta.json").write_text(json.dumps({"name": "screen", "sound": "x"}))
            self.assertIsNone(take.sync_screen(cam, d)["at"])  # no audio.wav: no sound
            pcm = (cam[int(start * take.SR): int((start + 40) * take.SR)] * 20000).astype(np.int16)
            with wave.open(str(d / "audio.wav"), "wb") as w:
                w.setnchannels(1), w.setsampwidth(2), w.setframerate(take.SR), w.writeframes(pcm.tobytes())
            self.assertAlmostEqual(take.sync_screen(cam, d)["at"], start, delta=0.02)


class Spelling(unittest.TestCase):
    def test_lexicon_and_prefix(self):
        words = [{"text": "ב", "start": 0, "end": 0.1}, {"text": "-css,", "start": 0.1, "end": 0.4}, {"text": "קלוד,", "start": 0.5, "end": 0.8}]
        out = take.spell(words, {"css": "CSS", "קלוד": "Claude"})
        self.assertEqual([w["text"] for w in out], ["ב־CSS,", "Claude,"])


if __name__ == "__main__":
    unittest.main()
