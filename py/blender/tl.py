"""timeline.json helpers for Blender scenes, with the same names as src/parts/timeline.ts so a cue
reads the same in both renderers: said, marker, beatPhase, pulse, energy, section.

Blender frame f (1-based) is timeline index f - 1, at t = (f - 1) / fps. Times are seconds.
No bpy at import, so mv.py can share `clean`.
"""
import bisect
import json
import math
import unicodedata
from pathlib import Path


def clean(s: str) -> str:
    """A word as said() compares it: no case, punctuation or niqqud. Hebrew geresh counts as an apostrophe."""
    s = unicodedata.normalize("NFKD", s.lower().replace("׳", "'").replace("’", "'"))
    return "".join(c for c in s if c.isalnum() or c == "'")


class Timeline:
    def __init__(self, path):
        self.d = json.loads(Path(path).read_text(encoding="utf-8"))
        self.fps = self.d["fps"]
        self.frames = self.d["frames"]
        self.duration = self.d["duration"]
        self.beats = self.d["beats"]
        self.downbeats = self.d["downbeats"]
        self.sections = self.d["sections"] or [{"name": "All", "start": 0.0, "end": self.duration}]
        self.markers = {m["name"]: m["t"] for m in self.d["markers"]}

    def t(self, i: int) -> float:
        return i / self.fps

    def frame(self, t: float) -> int:
        """The timeline frame a time lands on. Rounds like JS Math.round, so a page cue gets the same frame."""
        return math.floor(t * self.fps + 0.5)

    def energy(self, name: str, i: int) -> float:
        e = self.d["energy"].get(name)
        return e[min(max(i, 0), len(e) - 1)] if e else 0.0

    def onsets(self, name: str) -> list[float]:
        return self.d["onsets"].get(name, [])

    def marker(self, name: str) -> float:
        if name not in self.markers:
            raise KeyError(f"No marker {name!r}. Have: {sorted(self.markers)}")
        return self.markers[name]

    @staticmethod
    def last(events: list[float], t: float) -> float | None:
        k = bisect.bisect_right(events, t)
        return events[k - 1] if k else None

    def pulse(self, events: list[float], t: float, decay: float = 0.2) -> float:
        """1 on each event, decaying exponentially (time constant `decay` seconds)."""
        e = self.last(events, t)
        return math.exp(-(t - e) / decay) if e is not None else 0.0

    def count(self, events: list[float], t: float) -> int:
        return bisect.bisect_right(events, t)

    def beatPhase(self, t: float) -> float:
        """0..1 position inside the current beat (0 on the beat). Runs on at the last tempo after the last beat."""
        k = bisect.bisect_right(self.beats, t)
        if k == 0 or len(self.beats) < 2:
            return 0.0
        a = self.beats[k - 1]
        step = (self.beats[k] if k < len(self.beats) else a + self.beats[-1] - self.beats[-2]) - a
        return ((t - a) / step) % 1.0

    def section(self, t: float) -> tuple[int, dict, float]:
        """(index, section, 0..1 progress through it)."""
        for i, s in enumerate(self.sections):
            if t < s["end"] or i == len(self.sections) - 1:
                span = max(s["end"] - s["start"], 1e-6)
                return i, s, min(max((t - s["start"]) / span, 0.0), 1.0)
        return 0, self.sections[0], 0.0

    def said(self, track: str, word: str, n: int = 1) -> float:
        """When voice `track` says `word` (n-th time), ignoring case, punctuation and niqqud."""
        hits = [w["start"] for w in self.d["words"] if w["track"] == track and clean(w["text"]) == clean(word)]
        if len(hits) < n:
            raise KeyError(f"{track!r} never says {word!r} ({n})")
        return hits[n - 1]

    def word(self, t: float, track: str | None = None) -> dict | None:
        for w in self.d["words"]:
            if (track is None or w["track"] == track) and w["start"] <= t < w["end"]:
                return w
        return None


def smoothstep(a: float, b: float, x: float) -> float:
    x = min(max((x - a) / (b - a), 0.0), 1.0)
    return x * x * (3 - 2 * x)


def lerp(a, b, k):
    if isinstance(a, (tuple, list)):
        return tuple(lerp(x, y, k) for x, y in zip(a, b))
    return a + (b - a) * k


def ema(values: list, k: float) -> list:
    """Exponential smoothing over a per-frame sequence (k = 0..1, lower = smoother)."""
    out, acc = [], values[0]
    for v in values:
        acc = lerp(acc, v, k)
        out.append(acc)
    return out


def bake(owner, prop: str, values: list, start_frame: int = 1) -> None:
    """Write one keyframe per frame for `owner.prop`, linear, in bulk.

    Per-frame keys from smooth functions are what make the motion read as smooth: no
    interpolation guesswork, and motion blur sees the true path. Blender 5.x keeps
    F-curves in a channelbag per action slot, so go through anim_utils.
    """
    from bpy_extras import anim_utils

    first = values[0]
    width = len(first) if hasattr(first, "__len__") else 1  # tuples, lists and mathutils vectors
    for j in range(width):
        owner.keyframe_insert(prop, index=j if width > 1 else -1, frame=start_frame)
    idb = owner.id_data
    ad = idb.animation_data
    cb = anim_utils.action_get_channelbag_for_slot(ad.action, ad.action_slot)
    path = owner.path_from_id(prop)
    for j in range(width):
        fc = cb.fcurves.find(path, index=j)
        fc.keyframe_points.clear()
        fc.keyframe_points.add(len(values))
        co = []
        for i, v in enumerate(values):
            co += [start_frame + i, v[j] if width > 1 else v]
        fc.keyframe_points.foreach_set("co", co)
        fc.keyframe_points.foreach_set("interpolation", [1] * len(values))  # LINEAR
        fc.update()
