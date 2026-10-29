"""Cuts the two layers that make the book's map (Kortið) live out of the owner's painting, so map-page.js can ripple the water
and drift the mist over a map that otherwise stays still:

    python -X utf8 -I remake/tools/map-life-layers.py [map.webp [out-dir [--sheet check-dir]]]

By default it reads assets/book/map.webp and writes assets/book/map-water.webp and assets/book/map-mist.webp: RGBA WebP, exactly
the painting's size (1681 x 936), the colour of each pixel the painting's own, the alpha a mask with a soft edge about three
pixels wide. Nothing is painted or drawn; pixels are only chosen, by their colour and by where they lie.

  water  the river, the waterfall and the Fen's pools and channels: the painting's cool pixels, bright enough not to be foliage or
         shadow (blue, turquoise, the pale grey-green of a still channel, the white of foam; reed, sand, rock and paper are warm and
         stay out). They are cleaned: gaps closed, specks and thin lines dropped, the small pieces in the forest dropped (the forest
         has only the river), and a lily pad or a speck inside a pool closed over, so a pool is one surface; a stone or a mossy island
         stays a hole. Left out by place: the mountains and the mist over them (the waterfall alone is kept there), the hazy sky and
         hills along the Fen's top, the compass, and Þórseðla's blue footprints on the trail (they are prints, not water).
  mist   the pale cloud over the mountains in the top left, round Grameðla's circle: the painting's whitish, barely coloured
         pixels there (the paper's cream is more coloured, the mountains' faces darker and bluer, the trees darker and greener),
         joined into soft patches. The waterfall's white and the river below are not mist.

Both leave clear every slot circle (map-page.js MAP_PLACES, read from the file so the two cannot drift apart) and every name's spot
(NAMES: where its label stands, at about the size the page draws it), with a margin, so a sticker or a name is never covered, and
the layers' own drift or ripple does not creep over them. The tool prints each layer's share of the painting's pixels and checks
that nothing is left in those places. `--sheet` also writes a check sheet there: each layer over grey and tinted bright over the map.
"""
import math
import os
import re
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
REMAKE = os.path.normpath(os.path.join(HERE, '..'))
BOOK = os.path.join(REMAKE, 'assets', 'book')
MAP_PAGE = os.path.join(REMAKE, 'engine', 'book', 'map-page.js')
SOURCE = os.path.join(BOOK, 'map.webp')
QUALITY = 90
FEATHER = 1.4  # sigma of the alpha's blur, pixels: the soft edge is about three pixels wide

# ---- where things are (picture pixels, 1681 x 936) ----------------------------------------------------------------------------
WATERFALL = (424, 164, 480, 252)  # left, top, right, bottom: the one place in the mountain band where white is water, not mist
MOUNTAIN_BAND = (0, 0, 880, 215)  # no water here but the waterfall: mountains, cloud and the first of the forest
FEN_SKY = (840, 0, 1681, 128)  # the hazy hills and sky along the Fen's top: no water
COMPASS = (1580, 822, 80)  # centre and radius
FOOTPRINT_TRAIL = [(628, 497), (667, 492), (689, 500), (716, 514), (747, 532), (788, 554), (829, 579), (872, 606), (911, 635), (951, 665),
                   (995, 695), (1043, 717), (1096, 728), (1126, 730)]  # map-page.js ROUTE b: the prints lie 15 pixels above it
FOOTPRINT_REACH = 34
FEN_LEFT = 880  # the Fen begins here, left to right
WATER_SPECK_AREA, WATER_PAD_AREA = 250, 1500  # a hole in the water under the first (pixels) is closed; under the second, if green (a lily pad)
WATER_RIVER_AREA, WATER_FEN_AREA = 1500, 100  # the smallest piece of water kept in the forest, and in the Fen, in pixels
MIST_ZONE = (0, 0, 862, 258)  # the mist: the top left, up to the book's spine
MIST_WHITE, MIST_SAT = 185, 0.17  # a mist pixel's dimmest channel is at least this (of 255), and its saturation at most this

# a slot's painted circle is an ellipse a little wider than the sticker's round rim; both ways round are kept clear
SLOT_RX, SLOT_RY, SLOT_MARGIN = 0.76, 0.54, 5
# a name is written at about this size (book.css .map-name: 4.6 cqw of a 900-unit page, in picture pixels), in Nunito Black
NAME_EM, NAME_CHAR, NAME_MARGIN = 39.0, 0.60, 8
NAME_STROKE = 0.22  # em: the halo of paper round the letters


def read_places():
    """MAP_PLACES from map-page.js: (id, x, y, size) in picture pixels, the size across the pale circle."""
    source = open(MAP_PAGE, encoding='utf8').read()
    places = [(m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4)))
              for m in re.finditer(r"slot\('(\w+)', \[(\d+), (\d+)\], (\d+)\)", source)]
    if len(places) != 6:
        raise SystemExit(f'expected 6 slots in {MAP_PAGE} (the friends; the Fen has none), found {len(places)}')
    return places


def read_names():
    """NAMES from map-page.js: (text, x, y, tilt in degrees) in picture pixels."""
    source = open(MAP_PAGE, encoding='utf8').read()
    block = source[source.index('const NAMES = ['):]
    block = block[:block.index('].map(')]
    names = [(m.group(1), int(m.group(2)), int(m.group(3)), float(m.group(4) or -2))
             for m in re.finditer(r"text: '([^']+)', at: \[(\d+), (\d+)\](?:, tilt: (-?\d+))?", block)]
    if len(names) != 4:
        raise SystemExit(f'expected 4 names in {MAP_PAGE} (the Fen has none), found {len(names)}')
    return names


def keep_clear(size, grow=0):
    """A boolean image that is true where a slot or a name stands (`grow` pixels beyond the margin)."""
    image = Image.new('L', size, 0)
    draw = ImageDraw.Draw(image)
    for _, x, y, width in read_places():
        rx, ry = width * SLOT_RX + SLOT_MARGIN + grow, width * SLOT_RY + SLOT_MARGIN + grow
        draw.ellipse([x - rx, y - ry, x + rx, y + ry], fill=255)
    for text, x, y, tilt in read_names():
        half_w = (len(text) * NAME_CHAR + NAME_STROKE) * NAME_EM / 2 + NAME_MARGIN + grow
        half_h = (1.0 + NAME_STROKE) * NAME_EM / 2 + NAME_MARGIN + grow
        angle = math.radians(tilt)
        corners = [(x + dx * math.cos(angle) - dy * math.sin(angle), y + dx * math.sin(angle) + dy * math.cos(angle))
                   for dx, dy in ((-half_w, -half_h), (half_w, -half_h), (half_w, half_h), (-half_w, half_h))]
        draw.polygon(corners, fill=255)
    return np.array(image) > 0


def rectangle(size, box):
    """A boolean image true inside box = (left, top, right, bottom)."""
    mask = np.zeros(size[::-1], bool)
    left, top, right, bottom = box
    mask[top:bottom, left:right] = True
    return mask


def disc(size, centre, radius):
    image = Image.new('L', size, 0)
    ImageDraw.Draw(image).ellipse([centre[0] - radius, centre[1] - radius, centre[0] + radius, centre[1] + radius], fill=255)
    return np.array(image) > 0


def along(size, points, reach):
    """True within `reach` pixels of the polyline through points."""
    image = Image.new('L', size, 0)
    draw = ImageDraw.Draw(image)
    draw.line(points, fill=255, width=2 * reach, joint='curve')
    for x, y in points:
        draw.ellipse([x - reach, y - reach, x + reach, y + reach], fill=255)
    return np.array(image) > 0


# ---- mask tools (numpy and PIL only) ---------------------------------------------------------------------------------------
def image_of(mask):
    return Image.fromarray(mask.astype(np.uint8) * 255)


def erode(mask, radius):
    return mask if radius <= 0 else np.array(image_of(mask).filter(ImageFilter.MinFilter(2 * radius + 1))) > 0


def dilate(mask, radius):
    return mask if radius <= 0 else np.array(image_of(mask).filter(ImageFilter.MaxFilter(2 * radius + 1))) > 0


def opened(mask, radius):
    return dilate(erode(mask, radius), radius)


def closed(mask, radius):
    return erode(dilate(mask, radius), radius)


def smoothed(mask, sigma, level=0.5):
    """The mask rounded off: blurred, then cut at `level`."""
    return np.array(image_of(mask).filter(ImageFilter.GaussianBlur(sigma))) > 255 * level


def components(mask):
    """(labels, sizes): the 4-connected pieces of the mask, numbered from 1; sizes[i] is piece i's area (sizes[0] is 0). Found
    by runs of pixels along the rows, joined where a run overlaps one in the row above (a union-find over the runs)."""
    height, width = mask.shape
    padded = np.zeros((height, width + 2), np.int8)
    padded[:, 1:-1] = mask
    change = np.diff(padded, axis=1)
    begins, ends = np.argwhere(change == 1), np.argwhere(change == -1)  # a run is [begin, end) of its row, in row-major order
    rows, left, right = begins[:, 0], begins[:, 1], ends[:, 1]
    parent = list(range(len(rows)))

    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    first = np.searchsorted(rows, np.arange(height + 1))  # the runs of row y are first[y]:first[y + 1]
    for y in range(1, height):
        above, here = range(first[y - 1], first[y]), range(first[y], first[y + 1])
        i = 0
        for j in here:
            while i < len(above) and right[above[i]] <= left[j]:
                i += 1
            k = i
            while k < len(above) and left[above[k]] < right[j]:
                a, b = root(above[k]), root(j)
                if a != b:
                    parent[b] = a
                k += 1
    numbers, sizes = {}, [0]
    labels = np.zeros(mask.shape, np.int32)
    for j in range(len(rows)):
        top = root(j)
        if top not in numbers:
            numbers[top] = len(sizes)
            sizes.append(0)
        labels[rows[j], left[j]:right[j]] = numbers[top]
        sizes[numbers[top]] += int(right[j] - left[j])
    return labels, np.array(sizes)


def without_small(mask, area):
    """The mask without the pieces smaller than `area` pixels."""
    labels, sizes = components(mask)
    return (sizes[labels] >= area) & mask


def with_holes_filled(mask, wanted):
    """The mask with the holes `wanted` says filled. A hole is a piece of the background that does not touch the image's edge;
    wanted(labels, sizes) gives, for each piece number, whether to fill it."""
    labels, sizes = components(~mask)
    outside = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    fill = wanted(labels, sizes)
    fill[outside] = False
    fill[0] = False
    return mask | (fill[labels] & ~mask)


def with_small_holes_filled(mask, area):
    """The mask with every hole of fewer than `area` pixels filled."""
    return with_holes_filled(mask, lambda labels, sizes: sizes < area)


def alpha_of(mask, clear):
    """The mask as an alpha channel: its edge softened over about three pixels, and zero wherever `clear` is true."""
    soft = np.array(image_of(mask & ~clear).filter(ImageFilter.GaussianBlur(FEATHER)))
    soft[clear] = 0
    return soft


# ---- the colours ----------------------------------------------------------------------------------------------------------------
def planes(rgb):
    """Saturation and value of each pixel (0 to 1), and the signed differences b - r and g - r (0 to 255 steps)."""
    r, g, b = (rgb[..., i].astype(float) for i in range(3))
    top, bottom = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
    return (top - bottom) / np.maximum(top, 1), top / 255, b - r, g - r


def water_layer(rgb, size):
    sat, val, b_r, g_r = planes(rgb)
    # cool: not warm (reed, sand, rock, paper and fire-lit foliage all have more red than blue), not dark (shadow and foliage)
    # (the forest's river is paler than the Fen's pools; its cliffs' blue-grey rock is darker)
    left = (np.arange(size[0]) < FEN_LEFT)[None, :]
    cool = (b_r >= -6) & (g_r >= -2) & (val >= np.where(left, 0.68, 0.58))
    # in the Fen the water's shaded rim, under reed and lily pads, is a deeper blue-green
    deep = (b_r >= 25) & (rgb[..., 2].astype(float) >= rgb[..., 1] - 12) & (val >= 0.42)
    cool |= deep & ~left
    cool |= (sat <= 0.14) & (g_r >= 2) & (b_r >= -14) & (val >= 0.66)  # a still channel's pale grey-green
    waterfall = rectangle(size, WATERFALL) & (val >= 0.72)  # the cliff's shaded rock beside the fall is not water
    elsewhere = ~rectangle(size, MOUNTAIN_BAND) & ~rectangle(size, FEN_SKY) & ~disc(size, COMPASS[:2], COMPASS[2]) & ~along(size, FOOTPRINT_TRAIL, FOOTPRINT_REACH)
    mask = opened(closed(cool & (waterfall | elsewhere), 4), 1)  # reflections, foam and stones break the water up
    # The forest has only the river, a long piece; a teal frond or a pale stone is a small one. The Fen is all pools and channels,
    # so a small piece is kept there.
    labels, sizes = components(mask)
    centre_x = np.bincount(labels.ravel(), weights=np.tile(np.arange(mask.shape[1]), mask.shape[0]).astype(float), minlength=len(sizes)) / np.maximum(sizes, 1)
    keep = (sizes >= WATER_RIVER_AREA) | ((centre_x >= FEN_LEFT) & (sizes >= WATER_FEN_AREA))
    mask = keep[labels] & mask
    # a hole in the water that is a speck, or a lily pad (green: a stone or a mossy island is warm), closes: the pool is one surface
    def pads(labels, sizes):
        greener = np.bincount(labels.ravel(), weights=(rgb[..., 1].astype(float) - rgb[..., 0]).ravel(), minlength=len(sizes)) / np.maximum(sizes, 1)
        return (sizes < WATER_SPECK_AREA) | ((sizes < WATER_PAD_AREA) & (greener >= 3))
    mask = with_holes_filled(closed(mask, 3), pads)
    mask = smoothed(mask, 1.5, 0.5)
    return without_small(mask, 120)


def mist_layer(rgb, size):
    sat, val, b_r, g_r = planes(rgb)
    # pale and barely coloured, in every channel: the paper's cream is more saturated and its blue is lower, the mountains' faces
    # are darker and bluer, the trees darker and greener
    whiteness = rgb.min(axis=2)
    fog = (whiteness >= MIST_WHITE) & (sat <= MIST_SAT)
    zone = rectangle(size, MIST_ZONE) & ~dilate(rectangle(size, WATERFALL), 8)
    mask = closed(fog & zone, 3)  # the cloud's own grain breaks it into specks; they join into patches
    mask = without_small(mask, 300)
    mask = with_small_holes_filled(mask, 600)
    mask = smoothed(mask, 2.0, 0.5)
    # the rounding must not take in what is not cloud: a pine's tip, the cliff's dark rock, a mountain's blue face
    mask = opened(mask & zone & (whiteness >= MIST_WHITE - 28) & (sat <= MIST_SAT + 0.10), 1)
    return without_small(mask, 300)


def write(rgb, alpha, path):
    out = np.dstack([rgb, alpha]).astype(np.uint8)  # the painting's colour under every pixel, so a soft edge has none but its own
    Image.fromarray(out, 'RGBA').save(path, 'WEBP', quality=QUALITY, alpha_quality=100, method=4)


def sheet(rgb, layers, folder):
    """The check sheet: each layer over mid-grey, and tinted bright magenta over the map; each as a full-size picture, and all four
    at half size on check-sheet.png (the layers side by side, over grey above, tinted below)."""
    shown = []
    for name, alpha in layers.items():
        a = (alpha / 255.0)[..., None]
        grey = Image.fromarray((rgb * a + 128 * (1 - a)).astype(np.uint8))
        tint = Image.fromarray((rgb * (1 - 0.8 * a) + np.array([255, 0, 255]) * 0.8 * a).astype(np.uint8))
        grey.save(os.path.join(folder, f'{name}-on-grey.png'))
        tint.save(os.path.join(folder, f'{name}-tint-on-map.png'))
        shown.append((grey, tint))
    width, height = shown[0][0].size
    half = (width // 2, height // 2)
    overview = Image.new('RGB', (half[0] * len(shown), half[1] * 2))
    for column, pair in enumerate(shown):
        for row, picture in enumerate(pair):
            overview.paste(picture.resize(half, Image.LANCZOS), (column * half[0], row * half[1]))
    overview.save(os.path.join(folder, 'check-sheet.png'))


def main(argv):
    args = [a for a in argv if not a.startswith('--')]
    folder = argv[argv.index('--sheet') + 1] if '--sheet' in argv else None
    if folder:
        args.remove(folder)
    source = args[0] if args else SOURCE
    target = args[1] if len(args) > 1 else BOOK
    image = Image.open(source).convert('RGB')
    rgb = np.array(image)
    size = image.size
    clear = keep_clear(size)
    solid = keep_clear(size, grow=FEATHER * 3)  # kept out of the mask before it is softened, so the soft edge cannot reach in
    layers = {}
    for name, make in (('map-water', water_layer), ('map-mist', mist_layer)):
        alpha = alpha_of(make(rgb, size) & ~solid, clear)
        layers[name] = alpha
        path = os.path.join(target, f'{name}.webp')
        write(rgb, alpha, path)
        written = Image.open(path)
        stray = int((np.array(written)[..., 3][clear] > 0).sum())  # what the file holds, not what was meant
        print(f'{name}.webp: {written.size[0]} x {written.size[1]} {written.mode}, {(alpha > 127).mean() * 100:.2f}% of the painting '
              f'({int((alpha > 127).sum())} px; mean alpha {alpha.mean() / 2.55:.2f}%), {os.path.getsize(path)} bytes, '
              f'{stray} px showing in the slots and names')
        if stray or written.size != size:
            raise SystemExit("a layer is not the painting's size, or a slot or a name is covered")
    if folder:
        os.makedirs(folder, exist_ok=True)
        sheet(rgb, layers, folder)
        print(f'check sheet in {folder}')


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
