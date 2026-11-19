"""Audio analysis for animation: beats, downbeats, sections, onsets and per-video-frame energy.

Everything is returned in seconds (events) or as one value per video frame (energy),
normalised to 0..1 so the same curve drives the page and Blender identically.
"""
import numpy as np
import librosa

SR = 22050
HOP = 512
BANDS = {"low": (20, 150), "mid": (150, 2000), "high": (2000, SR / 2)}
# onset_strength pads one hop more than its centred frames need, so every onset and beat it finds reads
# 23 ms late (+23 ms as it stands, -23 ms with center=False, on attacks at known times). Taken off here.
LAG = HOP / SR


def _per_frame(values: np.ndarray, fps: int, n_frames: int, release_s: float = 0.12) -> list[float]:
    """Resample an STFT-rate curve onto the video frame grid, then normalise and smooth.

    Normalising to the 98th percentile keeps one loud hit from flattening the rest.
    The release smoothing gives instant attacks and soft decays, which reads as motion
    instead of flicker.
    """
    t_src = librosa.frames_to_time(np.arange(len(values)), sr=SR, hop_length=HOP)
    t_dst = np.arange(n_frames) / fps
    v = np.interp(t_dst, t_src, values, left=0.0, right=0.0)
    ref = np.percentile(v, 98) or 1.0
    v = np.clip(v / ref, 0.0, 1.0)
    k = np.exp(-1.0 / max(release_s * fps, 1e-6))
    out = np.empty_like(v)
    acc = 0.0
    for i, x in enumerate(v):
        acc = x if x > acc else acc * k + x * (1 - k)
        out[i] = acc
    return [round(float(x), 4) for x in out]


def _band(S: np.ndarray, freqs: np.ndarray, lo: float, hi: float) -> np.ndarray:
    m = (freqs >= lo) & (freqs < hi)
    return S[m].sum(axis=0) if m.any() else np.zeros(S.shape[1])


def _times(xs) -> list[float]:
    return [round(float(x), 4) for x in xs]


def _onset_times(xs) -> list[float]:
    return _times(np.maximum(np.asarray(xs) - LAG, 0.0))


def load(path) -> tuple[np.ndarray, float]:
    y, _ = librosa.load(str(path), sr=SR, mono=True)
    return y, len(y) / SR


def envelope(path, fps: int, n_frames: int, offset_s: float = 0.0) -> tuple[list[float], list[float]]:
    """(per-frame energy, onsets) for a clip placed at `offset_s` on the global timeline."""
    y, _ = load(path)
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=HOP)[0]
    pad = int(round(offset_s * SR / HOP))
    rms = np.concatenate([np.zeros(max(pad, 0)), rms])
    onsets = librosa.onset.onset_detect(y=y, sr=SR, hop_length=HOP, units="time")
    return _per_frame(rms, fps, n_frames), _times(np.asarray(_onset_times(onsets)) + offset_s)


def sections(y: np.ndarray, duration: float, bars: list[float], span: int = 2, min_gap: int = 2) -> list[dict]:
    """Where the music changes, for a track with no composition plan: compare the `span` bars
    before each bar line with the `span` bars after it and keep the clear peaks. Boundaries sit on
    bar lines. The names are just Part 1, Part 2, ...; list `music.sections` to name them."""
    edges = np.array([b for b in bars if 0 < b < duration])
    if len(edges) < 2 * span:
        return [{"name": "Part 1", "start": 0.0, "end": round(duration, 4)}]
    mfcc = librosa.feature.mfcc(y=y, sr=SR, n_mfcc=13, hop_length=HOP)[1:]
    level = librosa.amplitude_to_db(librosa.feature.rms(y=y, hop_length=HOP), ref=np.max)
    n = min(mfcc.shape[1], level.shape[1])
    feats = np.vstack([mfcc[:, :n], level[:, :n]])
    feats = (feats - feats.mean(axis=1, keepdims=True)) / (feats.std(axis=1, keepdims=True) + 1e-6)
    grid = librosa.time_to_frames(np.concatenate([[0.0], edges, [duration]]), sr=SR, hop_length=HOP)
    bar_means = np.stack([feats[:, a:max(b, a + 1)].mean(axis=1) for a, b in zip(grid[:-1], grid[1:])], axis=1)
    novelty = np.zeros(len(edges))
    for i in range(len(edges)):
        k = i + 1  # bar k starts at edge i
        before, after = bar_means[:, max(k - span, 0):k], bar_means[:, k:k + span]
        novelty[i] = np.linalg.norm(before.mean(axis=1) - after.mean(axis=1))
    bar = float(np.median(np.diff(edges)))
    floor = max(0.4 * novelty.max(), 1.5)  # the 1.5 keeps a steady loop in one piece
    room = bar * min_gap * 0.9  # no section shorter than min_gap bars at either end
    near = lambda i: novelty[max(i - 1, 0):i + 2]
    cuts = []
    for i in np.argsort(-novelty):  # strongest first, so a weak neighbour can't take the spot
        if novelty[i] >= floor and novelty[i] == near(i).max() and room <= edges[i] <= duration - room                 and all(abs(i - c) >= min_gap for c in cuts):
            cuts.append(int(i))
    bounds = [0.0] + [float(edges[i]) for i in sorted(cuts)] + [duration]
    return [{"name": f"Part {k + 1}", "start": round(a, 4), "end": round(b, 4)}
            for k, (a, b) in enumerate(zip(bounds[:-1], bounds[1:]))]


def steady_grid(beats: np.ndarray, env: np.ndarray, duration: float, window: float = 0.07, slack: float = 0.03) -> np.ndarray | None:
    """Most ad music holds one tempo, and librosa's tracker then misses the first beat, gives up in sparse
    bars and reads a little off (which puts `bar:3` a bar late). So snap each beat to its onset, fit one
    tempo through them and run that grid over the whole track. None if the beats don't fit: the tempo
    really moves, so the tracker's beats stand."""
    if len(beats) < 8:
        return None
    t_env = librosa.times_like(env, sr=SR, hop_length=HOP) - LAG
    snapped = np.array([t_env[np.argmax(np.where(np.abs(t_env - b) <= window, env, -1.0))] for b in beats])
    step, t0 = float(np.median(np.diff(snapped))), float(snapped[0])
    for _ in range(4):  # Each pass counts the beats with a better step, so a small tempo error can't add up.
        index = np.round((snapped - t0) / step)
        step, t0 = np.polyfit(index, snapped, 1)
    if np.percentile(np.abs(snapped - (t0 + index * step)), 90) > slack:
        return None
    first = t0 - np.ceil(t0 / step - 0.1) * step  # up to a tenth of a beat before 0 still counts as the start
    grid = first + np.arange(int((duration - first) / step) + 1) * step
    return np.maximum(grid, 0.0)


def full(path, fps: int, n_frames: int | None = None, beat_source=None) -> dict:
    """Full analysis of a music track. `beat_source` (e.g. the drum stem) gives cleaner beats."""
    y, dur = load(path)
    n_frames = n_frames or int(np.ceil(dur * fps))

    S = np.abs(librosa.stft(y, n_fft=2048, hop_length=HOP)) ** 2
    freqs = librosa.fft_frequencies(sr=SR, n_fft=2048)
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=HOP)[0]

    yb = load(beat_source)[0] if beat_source else y
    tempo, beat_frames = librosa.beat.beat_track(y=yb, sr=SR, hop_length=HOP)
    beats = np.maximum(librosa.frames_to_time(beat_frames, sr=SR, hop_length=HOP) - LAG, 0.0)
    grid = steady_grid(beats, librosa.onset.onset_strength(y=yb, sr=SR, hop_length=HOP), dur)
    if grid is not None:
        beats = grid
        beat_frames = librosa.time_to_frames(beats, sr=SR, hop_length=HOP)
        tempo = 60.0 / float(np.median(np.diff(beats)))

    low_S = _band(S, freqs, *BANDS["low"])
    high_S = _band(S, freqs, *BANDS["high"])
    low_env = librosa.onset.onset_strength(S=librosa.power_to_db(low_S[None, :]), sr=SR, hop_length=HOP)
    high_env = librosa.onset.onset_strength(S=librosa.power_to_db(high_S[None, :]), sr=SR, hop_length=HOP)

    # Downbeats: librosa has no bar tracker, so pick the 4/4 phase whose beats carry
    # the most low-end onset strength (the kick usually lands on beat one).
    downbeats = []
    if len(beat_frames) >= 4:
        idx = np.clip(beat_frames, 0, len(low_env) - 1)
        phase = int(np.argmax([low_env[idx[p::4]].mean() for p in range(4)]))
        downbeats = beats[phase::4]

    onset = lambda env: librosa.onset.onset_detect(onset_envelope=env, sr=SR, hop_length=HOP, units="time")
    return {
        "duration": round(dur, 4),
        "bpm": round(float(np.atleast_1d(tempo)[0]), 2),
        "beats": _times(beats),
        "downbeats": _times(downbeats),
        "samples": y,
        "onsets": {
            "all": _onset_times(librosa.onset.onset_detect(y=y, sr=SR, hop_length=HOP, units="time")),
            "low": _onset_times(onset(low_env)),
            "high": _onset_times(onset(high_env)),
        },
        "energy": {
            "rms": _per_frame(rms, fps, n_frames),
            **{name: _per_frame(np.sqrt(_band(S, freqs, lo, hi)), fps, n_frames) for name, (lo, hi) in BANDS.items()},
        },
    }
