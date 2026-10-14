"""Package the selected, legally acquired Quaternius Standard nature models.

Run from the project root after extracting the free Standard archive into
.tools/assets/environment/standard. Keeps the original geometry, bounds and UVs;
shares resized PNG/JPEG textures and removes unused texture channels for mobile.
"""
from pathlib import Path
from PIL import Image
import json
import shutil
import struct
import hashlib

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / '.tools/assets/environment/standard'
DEST = ROOT / 'dist/assets/environment'
DEST.mkdir(parents=True, exist_ok=True)
SELECTED = [
    ('CommonTree_3', 'tree-common-3', 'tree'),
    ('CommonTree_5', 'tree-common-5', 'tree'),
    ('Pine_5', 'tree-pine-5', 'tree'),
    ('Fern_1', 'fern', 'plant'),
    ('Plant_1', 'leaf-plant', 'plant'),
    ('Plant_7', 'broad-leaf', 'plant'),
    ('Bush_Common', 'bush', 'bush'),
    ('Grass_Common_Short', 'grass', 'grass'),
    ('Rock_Medium_1', 'rock-1', 'rock'),
    ('Rock_Medium_2', 'rock-2', 'rock'),
    ('Mushroom_Common', 'mushroom', 'mushroom'),
]
texture_files = {}


def texture(source_name):
    if source_name in texture_files:
        return texture_files[source_name]
    image = Image.open(SOURCE / 'glTF' / source_name)
    transparent = image.mode == 'RGBA' and image.getextrema()[3][0] < 255
    # A single sharp leaf silhouette shared by all trees matters more than
    # distant bark detail. Source bark and rocks are 2048px, reduced to512px.
    maximum = 1024 if source_name in ('Leaves_NormalTree_C.png', 'Leaf_Pine_C.png', 'Leaves.png') else 512
    image.thumbnail((maximum, maximum), Image.Resampling.LANCZOS)
    if source_name in ('Leaves.png', 'Leaves_TwistedTree_C.png'):
        # The supplied atlas includes violet ground leaves and berry-pink bushes.
        # Shift only those hues to fern/sage greens for the prehistoric forest.
        alpha = image.getchannel('A') if image.mode == 'RGBA' else None
        hsv = image.convert('RGB').convert('HSV')
        pixels = list(hsv.getdata())
        pixels = [(72 + (h % 10), int(s * .76), int(v * .91))
                  if s > 55 and (h > 147 or h < 22) else (h, s, v)
                  for h, s, v in pixels]
        hsv.putdata(pixels)
        image = hsv.convert('RGB')
        if alpha is not None:
            image.putalpha(alpha)
    suffix = '.png' if transparent else '.jpg'
    name = source_name.removesuffix('.png').lower().replace('_', '-') + suffix
    if transparent:
        image.save(DEST / name, optimize=True)
    else:
        image.convert('RGB').save(DEST / name, quality=84, optimize=True)
    texture_files[source_name] = name
    return name


models = []
for source_name, model_id, kind in SELECTED:
    document = json.loads((SOURCE / 'glTF' / (source_name + '.gltf')).read_text())
    if len(document['buffers']) != 1:
        raise ValueError('Expected a single source buffer')
    buffer = (SOURCE / 'glTF' / document['buffers'][0]['uri']).read_bytes()
    document['buffers'][0] = {'byteLength': len(buffer)}
    for image in document.get('images', []):
        image['uri'] = texture(image['uri'])
        image['mimeType'] = 'image/png' if image['uri'].endswith('.png') else 'image/jpeg'
    for material in document.get('materials', []):
        material.setdefault('pbrMetallicRoughness', {})['roughnessFactor'] = .9
        material['pbrMetallicRoughness']['metallicFactor'] = 0
        # Tree bark was exported with MASK despite completely opaque textures.
        if material.get('name', '').startswith('Bark'):
            material.pop('alphaMode', None)
            material.pop('alphaCutoff', None)
            material['doubleSided'] = False
        elif material.get('alphaMode') == 'MASK':
            material['alphaCutoff'] = .43
            material['doubleSided'] = True
    document['asset']['generator'] = 'Quaternius; selected and texture-optimized for Mosi'
    encoded = json.dumps(document, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    buffer += b'\0' * (-len(buffer) % 4)
    total = 12 + 8 + len(encoded) + 8 + len(buffer)
    output = struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
    output += struct.pack('<II', len(buffer), 0x004E4942) + buffer
    filename = model_id + '.glb'
    (DEST / filename).write_bytes(output)
    triangle_count = sum(document['accessors'][p['indices']]['count'] // 3 for mesh in document['meshes'] for p in mesh['primitives'])
    models.append({'id': model_id, 'kind': kind, 'file': filename, 'sourceModel': source_name,
                   'triangles': triangle_count, 'bytes': len(output), 'sha256': hashlib.sha256(output).hexdigest()})

shutil.copyfile(SOURCE / 'License_Standard.txt', DEST / 'LICENSE-QUATERNIUS.txt')
manifest = {
    'creator': 'Quaternius',
    'pack': 'Stylized Nature MegaKit Standard (68-model free edition)',
    'source': 'https://quaternius.itch.io/stylized-nature-megakit',
    'license': 'CC0-1.0',
    'licenseEvidence': 'LICENSE-QUATERNIUS.txt supplied in the downloaded Standard archive',
    'currentCreatorLicense': 'https://quaternius.com/license.html',
    'downloaded': '2026-10-12',
    'changes': 'Selected models packed as GLB; shared textures resized to 512–1024px; purple/red foliage atlas hues changed to fern and sage green; materials tuned for mobile rendering.',
    'models': models,
    'textures': list(texture_files.values()),
    'ground': {
        'creator': 'Rob Tuytel / Poly Haven',
        'source': 'https://polyhaven.com/a/forrest_ground_01',
        'license': 'CC0-1.0',
        'files': ['forest-ground-color.webp', 'forest-ground-normal.webp'],
        'changes': '1K diffuse and OpenGL normal maps converted to WebP',
    },
}
(DEST / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'models': models, 'textures': texture_files, 'totalBytes': sum(p.stat().st_size for p in DEST.iterdir() if p.is_file())}, indent=2))
