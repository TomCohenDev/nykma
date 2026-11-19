"""Contact sheet for `bun run stock` (spec.md §6.8): one numbered tile per search result, so the agent can pick one.

    .venv/Scripts/python py/stock_sheet.py <tiles.json> <sheet.jpg>

tiles.json is {"tiles": [{"n": 1, "label": "pexels:123 video 14s 1920x1080", "images": ["01-1.jpg", ...]}]}, paths
from its own folder. A photo has one image and fills its tile. A clip has four frames from its preview, at 1/8, 3/8,
5/8 and 7/8 of its length, in a 2x2 square read left to right, top to bottom, since the agent can't watch video.
Labels are ASCII (OpenCV's own font): the number, the id, the length and the size. The authors are in the printed list.
"""
import json
import sys
from pathlib import Path

import numpy as np

TILE_W, TILE_H = 480, 270
LABEL_H = 30
GAP = 8
COLUMNS = 4
BG = (24, 24, 24)


def cv():
    try:
        import cv2
    except ImportError:
        raise SystemExit("OpenCV isn't installed. Run: .venv/bin/python -m pip install -r py/requirements.txt") from None
    return cv2


def read(cv2, path: Path):
    # np.fromfile, so a path outside ASCII still opens on Windows.
    data = np.fromfile(str(path), dtype=np.uint8) if path.exists() else np.zeros(0, np.uint8)
    return cv2.imdecode(data, cv2.IMREAD_COLOR) if data.size else None


def fit(cv2, img, w: int, h: int):
    """The whole image inside w x h, centred on the background."""
    out = np.full((h, w, 3), BG, np.uint8)
    if img is None:
        cv2.putText(out, "no preview", (10, h // 2), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (120, 120, 120), 1, cv2.LINE_AA)
        return out
    k = min(w / img.shape[1], h / img.shape[0])
    iw, ih = max(1, round(img.shape[1] * k)), max(1, round(img.shape[0] * k))
    small = cv2.resize(img, (iw, ih), interpolation=cv2.INTER_AREA)
    x, y = (w - iw) // 2, (h - ih) // 2
    out[y : y + ih, x : x + iw] = small
    return out


def tile(cv2, folder: Path, spec: dict):
    images = [read(cv2, folder / name) for name in spec.get("images", [])]
    if len(images) > 1:
        half_w, half_h = TILE_W // 2, TILE_H // 2
        cells = [fit(cv2, images[i] if i < len(images) else None, half_w - 1, half_h - 1) for i in range(4)]
        body = np.full((TILE_H, TILE_W, 3), (60, 60, 60), np.uint8)
        for i, cell in enumerate(cells):
            x, y = (i % 2) * half_w, (i // 2) * half_h
            body[y : y + half_h - 1, x : x + half_w - 1] = cell
    else:
        body = fit(cv2, images[0] if images else None, TILE_W, TILE_H)
    label = np.full((LABEL_H, TILE_W, 3), (40, 40, 40), np.uint8)
    text = str(spec.get("label", "")).encode("ascii", "replace").decode()
    cv2.putText(label, text, (8, 21), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (230, 230, 230), 1, cv2.LINE_AA)
    out = np.vstack([body, label])
    # The number, big, in the corner.
    number = str(spec["n"])
    (tw, th), _ = cv2.getTextSize(number, cv2.FONT_HERSHEY_SIMPLEX, 1.2, 3)
    cv2.rectangle(out, (0, 0), (tw + 16, th + 18), (0, 0, 0), -1)
    cv2.putText(out, number, (8, th + 9), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (255, 255, 255), 3, cv2.LINE_AA)
    return out


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: py/stock_sheet.py <tiles.json> <sheet.jpg>")
    cv2 = cv()
    spec_path, out_path = Path(sys.argv[1]), Path(sys.argv[2])
    tiles = json.loads(spec_path.read_text(encoding="utf8"))["tiles"]
    if not tiles:
        raise SystemExit("No results to put on a sheet.")
    columns = min(COLUMNS, len(tiles))
    rows = -(-len(tiles) // columns)
    cell_h = TILE_H + LABEL_H
    sheet = np.full((GAP + rows * (cell_h + GAP), GAP + columns * (TILE_W + GAP), 3), (12, 12, 12), np.uint8)
    for i, spec in enumerate(tiles):
        x, y = GAP + (i % columns) * (TILE_W + GAP), GAP + (i // columns) * (cell_h + GAP)
        sheet[y : y + cell_h, x : x + TILE_W] = tile(cv2, spec_path.parent, spec)
    ok, data = cv2.imencode(".jpg", sheet, [cv2.IMWRITE_JPEG_QUALITY, 85])
    if not ok:
        raise SystemExit("The sheet didn't encode.")
    data.tofile(str(out_path))
    print(out_path)


if __name__ == "__main__":
    main()
