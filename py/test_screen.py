"""Tests for py/screen.py, on a made-up clip whose true corners are known.

    .venv/Scripts/python -m unittest py/test_screen.py
"""
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import screen  # noqa: E402

cv2 = screen.cv()
W, H, N = 640, 360, 24


def truth(i: int) -> np.ndarray:
    """A screen in perspective, drifting right and growing a little."""
    dx, s = i * 2.0, 1 + i * 0.004
    base = np.array([[200, 90], [450, 110], [440, 260], [210, 270]], float)
    c = base.mean(axis=0)
    return (base - c) * s + c + [dx, 0]


def frame(i: int, hand: bool) -> np.ndarray:
    rng = np.random.default_rng(i)
    img = rng.integers(40, 120, (H, W, 3), dtype=np.uint8)  # a busy room, never green
    img[..., 1] = img[..., 0] // 2 + 20
    cv2.fillConvexPoly(img, np.round(truth(i)).astype(np.int32), (60, 200, 70))  # BGR: green screen
    if hand:  # skin over the bottom-right corner
        cx, cy = truth(i)[2]
        cv2.ellipse(img, (int(cx - 10), int(cy - 5)), (45, 30), 20, 0, 360, (120, 150, 210), -1)
    return img


class Screen(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.root, True)
        self.keep = screen.ROOT
        screen.ROOT = self.root
        self.addCleanup(setattr, screen, "ROOT", self.keep)
        self.folder = self.root / "public" / "ads" / "t" / "gen" / "footage" / "pc"
        self.folder.mkdir(parents=True)
        (self.folder / "meta.json").write_text(json.dumps({"fps": 24}))

    def clip(self, hand_frames=range(8, 16), lost=()):
        for i in range(N):
            img = frame(i, i in hand_frames)
            if i in lost:
                img[:] = 80  # the screen is gone (a cut, a flash)
            cv2.imwrite(str(self.folder / f"{i + 1:05d}.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 95])

    def test_finds_the_corners_within_a_pixel_or_two_even_behind_a_hand(self):
        self.clip()
        r = screen.run("t", "pc", None)
        track = json.loads(r["track"].read_text())
        errors = [np.abs(np.array(track["corners"][i]) - truth(i)).max() for i in range(N)]
        self.assertLess(max(errors), 2.5, errors)
        self.assertEqual(track["frames"], N)
        self.assertEqual((track["width"], track["height"]), (W, H))

    def shows(self, i: int, track: dict) -> np.ndarray:
        """How much of the ad shows at each pixel of frame i: the front's hole, placed by its box."""
        x, y, w, h = track["box"]
        front = cv2.imread(str(self.folder / "front" / f"{i + 1:05d}.webp"), cv2.IMREAD_UNCHANGED)
        self.assertEqual(front.shape[:2], (h, w))
        out = np.zeros((H, W), int)
        out[y:y + h, x:x + w] = 255 - front[..., 3].astype(int)
        return out

    def test_the_hole_leaves_the_hand_in_front(self):
        self.clip()
        r = screen.run("t", "pc", None)
        alpha = self.shows(10, json.loads(r["track"].read_text()))
        c = truth(10)
        middle = np.round(c.mean(axis=0)).astype(int)
        hand = np.round(c[2] - [10, 5]).astype(int)
        self.assertGreater(alpha[middle[1], middle[0]], 200)  # screen: the ad shows
        self.assertLess(alpha[hand[1], hand[0]], 30)  # hand: it stays in front
        self.assertLess(alpha.max(axis=0)[:150].max(), 5)  # the room: untouched

    def test_the_front_is_only_the_box_the_screen_moves_in(self):
        self.clip()
        r = screen.run("t", "pc", None)
        x, y, w, h = json.loads(r["track"].read_text())["box"]
        every = np.array([truth(i) for i in range(N)]).reshape(-1, 2)
        self.assertLessEqual(x, every[:, 0].min() - 4)
        self.assertGreaterEqual(x + w, every[:, 0].max() + 4)
        self.assertLess(w * h, W * H * 0.5)

    def test_the_room_far_off_is_left_alone(self):
        self.clip()
        screen.run("t", "pc", None)
        plate = cv2.imread(str(self.folder / "plate" / "00001.jpg")).astype(int)
        source = cv2.imread(str(self.folder / "00001.jpg")).astype(int)
        shift = (plate[340:, :40] - source[340:, :40]).reshape(-1, 3).mean(axis=0)  # per channel; JPEG noise averages out
        self.assertLess(np.abs(shift).max(), 1, shift)

    def test_despill_reaches_a_face_lit_by_the_screen(self):
        for i in range(N):
            img = frame(i, False)
            x = int(truth(i)[:, 0].max()) + 70  # a cheek 70 px off the screen's edge, tinted by its light
            cv2.circle(img, (x, 180), 18, (110, 175, 160), -1)
            cv2.imwrite(str(self.folder / f"{i + 1:05d}.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 95])
        screen.run("t", "pc", None)
        plate = cv2.imread(str(self.folder / "plate" / "00001.jpg")).astype(int)
        b, g, r = plate[180, int(truth(0)[:, 0].max()) + 70]
        self.assertLessEqual(g, max(r, b) + 3)

    def test_lost_frames_are_filled_from_their_neighbours(self):
        self.clip(hand_frames=(), lost=(12,))
        r = screen.run("t", "pc", None)
        self.assertEqual(r["filled"], 1)
        track = json.loads(r["track"].read_text())
        self.assertLess(np.abs(np.array(track["corners"][12]) - truth(12)).max(), 3)

    def test_corners_given_are_followed_on_a_screen_that_isnt_green(self):
        for i in range(N):
            img = frame(i, False)
            cv2.fillConvexPoly(img, np.round(truth(i)).astype(np.int32), (230, 230, 230))  # a white screen
            for k, (x, y) in enumerate(truth(i)):  # corners with some texture, as a bezel has
                cv2.circle(img, (int(x), int(y)), 6, (0, 0, 0) if k % 2 else (40, 40, 200), -1)
            cv2.imwrite(str(self.folder / f"{i + 1:05d}.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 95])
        given = " ".join(f"{x},{y}" for x, y in truth(0))
        r = screen.run("t", "pc", given)
        track = json.loads(r["track"].read_text())
        self.assertEqual(track["method"], "corners")
        self.assertLess(np.abs(np.array(track["corners"][-1]) - truth(N - 1)).max(), 4)


if __name__ == "__main__":
    unittest.main()
