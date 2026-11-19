"""Screen replacement (spec.md §6.7): find a screen in a clip, frame by frame, so an ad can play on it.

    .venv/Scripts/python py/screen.py <slug> <clip>                   a green screen, found in every frame
    .venv/Scripts/python py/screen.py <slug> <clip> --corners "x,y x,y x,y x,y"   a screen that isn't green: its corners
                                                                      in the first frame (top-left, top-right,
                                                                      bottom-right, bottom-left), followed by optical flow

<clip> is a clip already unpacked by `bun run footage` or `bun run gen`: public/ads/<slug>/gen/footage/<clip>/.

Writes:
- src/ads/<slug>/<clip>.screen.json: the screen's four corners in every frame of the clip, in the clip's pixels.
  It's small and committed, so <ScreenInsert> imports it (an import of gen/ would break every ad on a fresh clone).
- gen/footage/<clip>/plate/#####.jpg: the frames with the green the screen threw on what's around it taken out.
- gen/footage/<clip>/front/#####.webp: the box the screen moves in, cut from the plate, with a see-through hole where
  the screen shows, for <ScreenInsert> to lay over the ad. Anything in front of a green screen, a hand or a head, isn't
  in the hole, so it stays in front. Images, not a CSS mask: the preview keeps showing an image's last frame while the
  next loads, where a mask that hasn't loaded hides the layer, and the screen flashed.
- gen/footage/<clip>/screen-sheet.jpg: frames with the found screen outlined, to check by eye.

Green is found by hue and how much greener than red and blue a pixel is. Each edge of the screen is a straight line
fitted to the green region's outline, so a hand over part of an edge doesn't bend it. A frame where the screen can't be
found, or jumps, takes its corners from its neighbours, and the report says how many did.
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SHEET_TILES = 12
BOX_MARGIN = 8  # px around the screen's path in the front image: past the bleed and the soft edge
JUMP = 0.08  # a corner moving more than this share of the frame's diagonal in one frame is a miss


def cv():
    try:
        import cv2
    except ImportError:
        raise SystemExit("OpenCV isn't installed. Run: .venv/bin/python -m pip install -r py/requirements.txt") from None
    return cv2


def greenness(img: np.ndarray) -> np.ndarray:
    """0..1: how much greener than red and blue each pixel is. Lighting on a real screen varies, so it's relative."""
    f = img.astype(np.float32)
    b, g, r = f[..., 0], f[..., 1], f[..., 2]
    return np.clip((g - np.maximum(r, b) - 18) / 50, 0, 1)


def order(pts: np.ndarray) -> np.ndarray:
    """Top-left, top-right, bottom-right, bottom-left."""
    pts = np.asarray(pts, dtype=np.float64).reshape(4, 2)
    c = pts.mean(axis=0)
    angles = np.arctan2(pts[:, 1] - c[1], pts[:, 0] - c[0])
    pts = pts[np.argsort(angles)]  # from -pi: top-left first for a screen facing us
    start = int(np.argmin(pts.sum(axis=1)))
    return np.roll(pts, -start, axis=0)


def line_through(points: np.ndarray):
    cv2 = cv()
    vx, vy, x0, y0 = cv2.fitLine(points.astype(np.float32), cv2.DIST_HUBER, 0, 0.01, 0.01).ravel()
    return np.array([x0, y0]), np.array([vx, vy])


def intersect(a, b):
    (p, r), (q, s) = a, b
    cross = r[0] * s[1] - r[1] * s[0]
    if abs(cross) < 1e-9:
        return None
    t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / cross
    return p + t * r


def find_green(img: np.ndarray, min_area: float):
    """The screen's corners in one frame, or None.

    The green region's outline is simplified to a polygon. A screen is four long sides, plus short ones wherever
    something in front of it cuts a corner off, so the four longest sides are the screen's. Each is refitted as a line
    to the outline points along it, and neighbouring lines meet at the corners: a hidden corner is where its two
    edges would meet."""
    cv2 = cv()
    mask = (greenness(img) > 0.35).astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not contours:
        return None
    biggest = max(contours, key=cv2.contourArea)
    if cv2.contourArea(biggest) < min_area:
        return None
    hull = cv2.convexHull(biggest)
    peri = cv2.arcLength(hull, True)
    poly = cv2.approxPolyDP(hull, 0.01 * peri, True).reshape(-1, 2).astype(np.float64)
    if len(poly) < 4:
        return None
    n = len(poly)
    sides = [(i, np.linalg.norm(poly[(i + 1) % n] - poly[i])) for i in range(n)]
    longest = sorted(i for i, _ in sorted(sides, key=lambda side: -side[1])[:4])
    outline = biggest.reshape(-1, 2).astype(np.float64)
    lines = []
    for i in longest:
        a, b = poly[i], poly[(i + 1) % n]
        d = b - a
        length = np.linalg.norm(d)
        normal = np.array([-d[1], d[0]]) / max(length, 1e-9)
        t = (outline - a) @ d / max(length ** 2, 1e-9)
        near = outline[(np.abs((outline - a) @ normal) < max(3.0, 0.01 * length)) & (t > 0.05) & (t < 0.95)]
        lines.append(line_through(near) if len(near) >= 10 else (a, d / max(length, 1e-9)))
    corners = [intersect(lines[k - 1], lines[k]) for k in range(4)]
    if any(c is None for c in corners):
        return None
    quad = order(np.array(corners))
    h, w = img.shape[:2]
    inside = np.all((quad[:, 0] > -0.2 * w) & (quad[:, 0] < 1.2 * w) & (quad[:, 1] > -0.2 * h) & (quad[:, 1] < 1.2 * h))
    convex = cv2.isContourConvex(np.round(quad).astype(np.int32).reshape(-1, 1, 2))
    return quad if inside and convex else None


def fill_gaps(corners: list, diag: float):
    """Frames with no screen, or a jump, take their corners from their neighbours."""
    n = len(corners)
    good = [c is not None for c in corners]
    for i in range(1, n - 1):
        if good[i] and good[i - 1] and good[i + 1]:
            prev, nxt = corners[i - 1], corners[i + 1]
            if np.max(np.linalg.norm(corners[i] - prev, axis=1)) > JUMP * diag and np.max(np.linalg.norm(corners[i] - nxt, axis=1)) > JUMP * diag:
                good[i] = False
    known = [i for i in range(n) if good[i]]
    if not known:
        raise SystemExit("No screen found in any frame. Is it a green screen? Otherwise give --corners.")
    out = []
    for i in range(n):
        if good[i]:
            out.append(corners[i])
            continue
        before = max((k for k in known if k < i), default=None)
        after = min((k for k in known if k > i), default=None)
        if before is None or after is None:
            out.append(corners[after if before is None else before])
        else:
            t = (i - before) / (after - before)
            out.append(corners[before] * (1 - t) + corners[after] * t)
    return out, n - len(known)


def smooth(corners: list, radius: int = 1):
    """A light average over neighbouring frames, which takes out sub-pixel jitter without lagging real motion."""
    arr = np.array(corners)
    out = arr.copy()
    for i in range(len(arr)):
        lo, hi = max(0, i - radius), min(len(arr), i + radius + 1)
        out[i] = arr[lo:hi].mean(axis=0)
    return list(out)


def track_flow(frames: list, first: np.ndarray):
    """Corners given in the first frame, followed by Lucas-Kanade optical flow."""
    cv2 = cv()
    corners = [first]
    prev = cv2.cvtColor(cv2.imread(str(frames[0])), cv2.COLOR_BGR2GRAY)
    pts = first.astype(np.float32).reshape(-1, 1, 2)
    for path in frames[1:]:
        gray = cv2.cvtColor(cv2.imread(str(path)), cv2.COLOR_BGR2GRAY)
        nxt, status, _ = cv2.calcOpticalFlowPyrLK(prev, gray, pts, None, winSize=(31, 31), maxLevel=3)
        corners.append(nxt.reshape(4, 2).astype(np.float64) if status.all() else None)
        if status.all():
            pts = nxt
        prev = gray
    return corners


def matte_and_plate(img: np.ndarray, quad: np.ndarray, green: bool):
    """The screen's visible area (alpha), and the frame with green spill limited near the screen."""
    cv2 = cv()
    h, w = img.shape[:2]
    poly = np.zeros((h, w), np.uint8)
    cv2.fillConvexPoly(poly, np.round(quad).astype(np.int32), 255)
    if not green:
        alpha = cv2.GaussianBlur(poly, (3, 3), 0)
        return alpha, img
    g = greenness(img)
    # Small dark or bright specks on the screen are noise, not something in front of it: close them.
    visible = cv2.morphologyEx((g * 255).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    # A pixel past the fitted edge, so the screen's soft edge is covered. What isn't green there (the bezel) stays out.
    inside = cv2.dilate(poly, np.ones((5, 5), np.uint8))
    alpha = cv2.GaussianBlur(np.minimum(visible, inside), (3, 3), 0)
    # Despill: green can't exceed the larger of red and blue. The screen lights what's near it (a face beside it, 200-300
    # px off in a 1080p shot), so that holds in full to half the screen's diagonal and fades out by one and a half,
    # leaving green things across the room alone.
    diagonal = max(np.hypot(*(quad[2] - quad[0])), np.hypot(*(quad[3] - quad[1])))
    away = cv2.distanceTransform(255 - poly, cv2.DIST_L2, 5)
    weight = np.clip(1.5 - away / diagonal, 0, 1)
    plate = img.copy()
    b, gr, r = (plate[..., k].astype(np.float32) for k in range(3))
    most = np.maximum(r, b)
    # Lit skin capped at red is still lime (a real cheek: R153 G174 B100 -> G153). Where the light visibly landed, green
    # is held to red and blue's average instead (G126, skin). Only there, feathered, so a yellow note on the desk keeps
    # its yellow.
    lit = (((gr - most) > 4) & (poly == 0)).astype(np.uint8) * 255
    lit = cv2.dilate(lit, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
    lit = np.clip(cv2.GaussianBlur(lit, (0, 0), max(2.0, diagonal / 60)).astype(np.float32) / 255 * 2, 0, 1)
    limit = most - lit * (most - (r + b) / 2)
    plate[..., 1] = np.round(gr - np.maximum(gr - limit, 0) * weight).astype(np.uint8)
    return alpha, plate


def sheet(frames: list, corners: list, out: Path):
    cv2 = cv()
    step = max(1, len(frames) // SHEET_TILES)
    tiles = []
    for i in range(0, len(frames), step):
        img = cv2.imread(str(frames[i]))
        cv2.polylines(img, [np.round(corners[i]).astype(np.int32)], True, (255, 0, 255), max(2, img.shape[1] // 400))
        for k, c in enumerate(corners[i]):
            cv2.circle(img, tuple(int(v) for v in np.round(c)), max(4, img.shape[1] // 200), (0, 255, 255) if k == 0 else (255, 0, 255), -1)
        cv2.putText(img, str(i + 1), (12, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (255, 255, 255), 3)
        tiles.append(cv2.resize(img, (480, int(480 * img.shape[0] / img.shape[1]))))
    while len(tiles) % 4:
        tiles.append(np.zeros_like(tiles[0]))
    rows = [np.hstack(tiles[i:i + 4]) for i in range(0, len(tiles), 4)]
    cv2.imwrite(str(out), np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 85])


def run(slug: str, clip: str, corners_arg: str | None) -> dict:
    cv2 = cv()
    folder = ROOT / "public" / "ads" / slug / "gen" / "footage" / clip
    meta_path = folder / "meta.json"
    if not meta_path.exists():
        raise SystemExit(f"No unpacked clip at {folder.relative_to(ROOT)}. Run bun run footage {slug} <file> first.")
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    frames = sorted(folder.glob("[0-9][0-9][0-9][0-9][0-9].jpg"))
    if not frames:
        raise SystemExit(f"{clip} has no frames. Run bun run footage {slug} again.")
    first = cv2.imread(str(frames[0]))
    h, w = first.shape[:2]
    diag = float(np.hypot(w, h))

    green = corners_arg is None
    if green:
        found = [find_green(cv2.imread(str(p)), 0.01 * w * h) for p in frames]
    else:
        try:
            given = np.array([[float(v) for v in pair.split(",")] for pair in corners_arg.split()])
            assert given.shape == (4, 2)
        except Exception:
            raise SystemExit('--corners takes four "x,y" pairs: top-left, top-right, bottom-right, bottom-left.') from None
        found = track_flow(frames, given)
    corners, filled = fill_gaps(found, diag)
    corners = smooth(corners)

    for sub in ("matte", "plate", "front"):  # matte/ is what an older run wrote
        for old in (folder / sub).glob("*"):
            old.unlink()
    if (folder / "matte").exists():
        (folder / "matte").rmdir()
    (folder / "plate").mkdir(exist_ok=True)
    (folder / "front").mkdir(exist_ok=True)
    # The front only needs the box the screen moves in, with a margin for the bleed and the soft edge. A 1080p WebP with
    # alpha takes ~43 ms to decode, too slow for 30 fps in the preview; the plate is a JPEG, several times faster.
    every = np.array(corners).reshape(-1, 2)
    x0, y0 = np.floor(every.min(axis=0)).astype(int) - BOX_MARGIN
    x1, y1 = np.ceil(every.max(axis=0)).astype(int) + BOX_MARGIN
    x0, y0, x1, y1 = max(int(x0), 0), max(int(y0), 0), min(int(x1), w), min(int(y1), h)
    for i, path in enumerate(frames):
        alpha, plate = matte_and_plate(cv2.imread(str(path)), corners[i], green)
        cv2.imwrite(str(folder / "plate" / path.name), plate, [cv2.IMWRITE_JPEG_QUALITY, 92])
        front = np.dstack([plate, 255 - alpha])[y0:y1, x0:x1].copy()
        front[front[..., 3] == 0, :3] = 0  # unseen, and it packs smaller
        cv2.imwrite(str(folder / "front" / path.name.replace(".jpg", ".webp")), front, [cv2.IMWRITE_WEBP_QUALITY, 90])
    sheet(frames, corners, folder / "screen-sheet.jpg")

    rel = lambda p: p.relative_to(ROOT / "public").as_posix()  # noqa: E731
    track = {
        "clip": clip,
        "method": "green" if green else "corners",
        "width": w,
        "height": h,
        "fps": meta["fps"],
        "frames": len(frames),
        "plate": rel(folder / "plate") + "/#####.jpg",
        "front": rel(folder / "front") + "/#####.webp",
        "box": [x0, y0, x1 - x0, y1 - y0],
        "filled": filled,
        "corners": [[[round(float(x), 2), round(float(y), 2)] for x, y in c] for c in corners],
    }
    out = ROOT / "src" / "ads" / slug / f"{clip}.screen.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(track, separators=(",", ":")) + "\n", encoding="utf-8")
    return {"track": out, "sheet": folder / "screen-sheet.jpg", "frames": len(frames), "filled": filled, "size": (w, h)}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("slug")
    ap.add_argument("clip", help="the unpacked clip's name: public/ads/<slug>/gen/footage/<clip>/")
    ap.add_argument("--corners", help='a screen that isn\'t green: "x,y x,y x,y x,y" in the first frame')
    a = ap.parse_args()
    r = run(a.slug, a.clip, a.corners)
    share = r["filled"] / r["frames"]
    print(f"{r['frames']} frames of {r['size'][0]}x{r['size'][1]}, screen found in {r['frames'] - r['filled']}"
          + (f", {r['filled']} filled in from their neighbours" if r["filled"] else ""))
    if share > 0.2:
        print("warning: the screen was missing in over a fifth of the frames. Check the sheet, and if it's lost, "
              "regenerate with a flatter, evenly lit green screen or give --corners.", file=sys.stderr)
    print(f"track: {r['track'].relative_to(ROOT).as_posix()}")
    print(f"sheet: {r['sheet'].relative_to(ROOT).as_posix()}  (Read it: the magenta outline should sit on the screen's edges)")


if __name__ == "__main__":
    main()
