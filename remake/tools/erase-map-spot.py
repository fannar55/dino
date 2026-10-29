"""Erases the pale round clearing painted in the middle of the Fen on the book's map (Kortið), so the Fen is a place with its
name and no slot (the owner, 2026-10-29: "bara ekki með hring, og nafn Fenið"): the other friends' clearings stay.

It runs after erase-map-dots.py, on what that wrote: it reads assets/book/map.webp (or the path given) and writes the same file
(or the second path given), same size, WebP quality 88:

    python -X utf8 -I remake/tools/erase-map-spot.py [in.webp [out.webp]]

The clearing is a soft cream ellipse in the golden reed, with stones and water a little above it and below it, so only two thin
bands of clean reed lie next to it: one above (picture rows 345 to 386) and one below (505 to 560). Its pixels are filled from
those bands, each row from a row of reed straight above or below it, so the reed's upright strokes run on unbroken: the top part
of the ellipse from the band above, the bottom part from the band below, and the middle from a little further down the band
below. The parts blend into each other over a few rows, and the whole fill fades in over a narrow rim, wide enough that the
cream halo round the clearing goes too. Nothing outside the rim changes.
"""
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
MAP = os.path.join(HERE, '..', 'assets', 'book', 'map.webp')
SOURCE = sys.argv[1] if len(sys.argv) > 1 else MAP
TARGET = sys.argv[2] if len(sys.argv) > 2 else SOURCE
QUALITY = 88

CENTRE = (1213.0, 447.0)  # the clearing's middle, in picture pixels
AXES = (84.0, 60.0)  # half its width and height with its cream halo
RIM = 7.0  # how far in from the edge the fill reaches full strength
# Each part of the ellipse, by rows: (last row of the part, how far down its source row is; negative is up). Rows above 427 take
# the reed 42 rows up (345 to 385), rows 428 to 448 take it 78 rows down (506 to 526), rows from 449 take it 56 rows down
# (505 to 563); the joins blend over FEATHER rows either side.
PARTS = [(427, -42), (448, 78), (10_000, 56)]
FEATHER = 6.0


def main():
    img = np.asarray(Image.open(SOURCE).convert('RGB')).astype(np.float32)
    h, w, _ = img.shape
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = CENTRE
    ax, ay = AXES
    # distance inside the ellipse's edge, in pixels along the smaller axis (positive inside)
    r = np.sqrt(((xs - cx) / ax) ** 2 + ((ys - cy) / ay) ** 2)
    inside = (1.0 - r) * min(ax, ay)
    alpha = np.clip(inside / RIM, 0.0, 1.0)
    alpha = alpha * alpha * (3 - 2 * alpha)  # smoothstep: a soft rim

    # Each part's weight by row: a smooth step up at the row after the part before ends, and down after its own last row.
    def step(edge):
        s = np.clip((ys - edge) / (2 * FEATHER) + 0.5, 0.0, 1.0)
        return s * s * (3 - 2 * s)

    fill = np.zeros_like(img)
    total = np.zeros(ys.shape + (1,), np.float32)
    start = -10_000.0
    for last, shift in PARTS:
        weight = (step(start + 0.5) * (1 - step(last + 0.5)))[..., None]
        fill += weight * np.roll(img, -shift, axis=0)  # pixel (x, y) takes (x, y + shift)
        total += weight
        start = last
    fill /= np.maximum(total, 1e-6)

    out = img * (1 - alpha[..., None]) + fill * alpha[..., None]
    touched = int((alpha > 0).sum())
    Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8)).save(TARGET, 'WEBP', quality=QUALITY, method=6)
    print(f'erase-map-spot: {touched} pixels filled round {CENTRE} -> {TARGET}')


if __name__ == '__main__':
    main()
