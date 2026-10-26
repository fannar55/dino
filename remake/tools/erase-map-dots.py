"""Erases the dotted ink line painted along the trail on the book's map (Kortið), so the route the game draws itself
(engine/book/map-page.js, ROUTE) is the only one on the page, and it can draw itself in piece by piece.

The painted map as the owner sent it is kept as assets/book/map-source.webp; this reads it and writes assets/book/map.webp
(same size, WebP quality 88), so it can be rerun on the original whenever the corridor below changes:

    python -X utf8 -I remake/tools/erase-map-dots.py

Only dark ink-brown pixels inside a narrow corridor along the trail's centre are touched (the three pieces below mirror the
game's route, in picture pixels), and none within a few pixels of a footprint, whose dark rims are part of the picture. Each
touched pixel is then filled from the sandy path around it, a layer of neighbours at a time, with a faint noise of the
path's own strength so the patches do not read as smooth smudges. Everything outside the corridor keeps its pixels.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
BOOK = os.path.normpath(os.path.join(HERE, '..', 'assets', 'book'))
SOURCE = os.path.join(BOOK, 'map-source.webp')
TARGET = os.path.join(BOOK, 'map.webp')
QUALITY = 88

# The trail's centre, in picture pixels: the same points as the game's route (map-page.js ROUTE; there B keeps beside the prints), A
# the clearing to the glade, B the glade along the footprints, C across the wetland to Þórseðla's pool.
PIECES = {
    'a': [(249, 736), (277, 710), (307, 690), (343, 675), (375, 667), (405, 663), (421, 659), (436, 651), (446, 639), (453, 625),
          (457, 610), (464, 595), (473, 581), (484, 569), (497, 557), (511, 546), (531, 532)],
    'b': [(628, 497), (651, 494), (667, 492), (690, 495), (719, 505), (753, 518), (795, 541), (837, 566), (880, 594), (920, 623),
          (960, 653), (1002, 682), (1049, 703), (1098, 721), (1126, 730)],
    'c': [(1126, 730), (1147, 731), (1165, 728), (1181, 725), (1198, 720), (1214, 715), (1230, 709), (1245, 702), (1261, 693),
          (1276, 684), (1291, 673), (1304, 663), (1317, 652), (1331, 640), (1345, 629), (1359, 620), (1373, 611), (1387, 603),
          (1401, 595), (1415, 588), (1430, 580), (1444, 573), (1457, 567), (1471, 560), (1487, 553), (1504, 546), (1519, 538),
          (1534, 531), (1548, 523), (1562, 515), (1576, 506), (1588, 496), (1600, 487), (1611, 475), (1621, 463), (1627, 449),
          (1628, 434), (1626, 417), (1618, 403), (1608, 391), (1598, 384), (1586, 378), (1572, 373)],
}
CORRIDOR = 15  # pixels either side of the centre that may be touched (the trail is about 30 wide)
FOOTPRINT_KEEP = 9  # pixels round a footprint's blue that are never touched: its dark rim lives there
GROW = 3  # the ink's soft edge: the dark mask grows by this much before it is filled


def smooth(points, step=1.0):
    """The points as a dense polyline along a Catmull-Rom curve through them."""
    pts = [points[0]] + list(points) + [points[-1]]
    out = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = (np.array(p, float) for p in pts[i - 1:i + 3])
        n = max(2, int(np.linalg.norm(p2 - p1) / step))
        for k in range(n):
            t = k / n
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(np.array(points[-1], float))
    return out


def corridor_mask(size, radius, pieces=None):
    """A boolean image that is true within `radius` pixels of the centre line of the pieces (all of them by default)."""
    image = Image.new('L', size, 0)
    draw = ImageDraw.Draw(image)
    for name, points in PIECES.items():
        if pieces and name not in pieces:
            continue
        for x, y in smooth(points, 1.5):
            draw.ellipse([x - radius, y - radius, x + radius, y + radius], fill=255)
    return np.array(image) > 0


def grow(mask, pixels):
    """The mask grown by `pixels` in every direction."""
    if pixels <= 0:
        return mask
    image = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(2 * pixels + 1))
    return np.array(image) > 0


def fill(rgb, hole, keep):
    """The pixels in `hole` painted from the known ones around them (`keep` marks pixels that are never to be used as a source),
    a layer at a time, each the mean of the known neighbours within two pixels; then the path's grain is added back from
    the clean path beside each hole."""
    work = rgb.astype(float)
    known = ~hole & ~keep
    todo = hole.copy()
    height, width = hole.shape
    layers = 0
    while todo.any() and layers < 40:
        layers += 1
        sums = np.zeros_like(work)
        counts = np.zeros(hole.shape)
        for dy in (-2, -1, 0, 1, 2):
            for dx in (-2, -1, 0, 1, 2):
                if dx == 0 and dy == 0:
                    continue
                shifted_known = np.zeros_like(known)
                shifted = np.zeros_like(work)
                ys = slice(max(0, dy), height + min(0, dy))
                xs = slice(max(0, dx), width + min(0, dx))
                ys_src = slice(max(0, -dy), height + min(0, -dy))
                xs_src = slice(max(0, -dx), width + min(0, -dx))
                shifted_known[ys_src, xs_src] = known[ys, xs]
                shifted[ys_src, xs_src] = work[ys, xs]
                weight = 1.0 / (dx * dx + dy * dy)
                sums += shifted * (shifted_known * weight)[..., None]
                counts += shifted_known * weight
        ready = todo & (counts > 0)
        if not ready.any():
            break
        work[ready] = sums[ready] / counts[ready][..., None]
        known = known | ready
        todo = todo & ~ready
    # the path's grain: a faint noise of about the size the clean path beside the holes has, so a filled patch is not glassy
    blurred = np.array(Image.fromarray(rgb).filter(ImageFilter.GaussianBlur(1.5))).astype(float)
    detail = (rgb.astype(float) - blurred).mean(axis=2)
    ring = grow(hole, 6) & ~grow(hole, 2) & ~hole & ~keep
    sigma = float(detail[ring].std()) if ring.any() else 0.0
    sigma = min(sigma, 3.0)
    rng = np.random.default_rng(7)
    noise = np.array(Image.fromarray(np.uint8(np.clip(128 + rng.normal(0, 40, hole.shape), 0, 255))).filter(ImageFilter.GaussianBlur(0.7))).astype(float) - 128
    noise *= sigma / max(noise[hole].std(), 1e-6) if hole.any() else 0.0
    work[hole] += noise[hole][..., None]
    return np.clip(np.round(work), 0, 255).astype(np.uint8)


def main():
    source = Image.open(SOURCE).convert('RGB')
    rgb = np.array(source)
    r, g, b = (rgb[..., i].astype(int) for i in range(3))
    corridor = corridor_mask(source.size, CORRIDOR)
    # the footprints, which only the second piece has: their blue (darker where the spine's shadow lies), and the ring round it that
    # holds the dark rim; the water by the third piece must not count
    wide = corridor_mask(source.size, CORRIDOR + 12, 'b')
    blue = (b > r + 6) & (b > 70) & wide
    footprints = grow(blue, FOOTPRINT_KEEP)
    # the ink: dark, brown (red above green, no blue in it), as the painted dashes are, soft edge included
    ink = (r < 165) & (r - g >= 15) & (b < 90) & (g < 115)
    hole = grow(ink & corridor & ~footprints, GROW) & corridor & ~footprints
    print(f'{int(hole.sum())} pixels to fill of {int(corridor.sum())} in the corridor')
    result = fill(rgb, hole, footprints & ~hole)
    out = rgb.copy()
    out[hole] = result[hole]
    Image.fromarray(out).save(TARGET, 'WEBP', quality=QUALITY, method=6)
    print(f'wrote {TARGET}')


if __name__ == '__main__':
    sys.exit(main())
