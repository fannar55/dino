# Blender background script: the owner's Tripo model of an animal -> a crowd model for world/critters/crowd.js. Step 1 of
# remake/tools/prep-crowd.mjs, which runs it as
#   "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python remake/tools/blender-crowd.py --
#     in.glb out.glb --rig remake/tools/crowd-rigs/smaedla.json --length 0.8 --clips run,idle,drink,look --frames 8
#     --near 800 --far 250 --tex 512 --report out.json
#
# It keeps the owner's shape and paint and only makes them lighter and moving:
#   1. turns the model to face +X, scales it to --length metres nose to tail and stands it with its feet on z = 0 (glTF y = 0),
#      the origin between its feet;
#   2. welds its UV seams (as blender-decimate.py does, so decimating opens no cracks) and decimates a near mesh to at most --near
#      triangles and a far one to at most --far, the head keeping relatively more detail (its eyes and smile);
#   3. unwraps both into one atlas (the far mesh smaller) and bakes the model's base colour onto it at --tex pixels: the only map
#      the game draws (the metal-roughness and normal maps are dropped);
#   4. rigs it: the skeleton from the rig file (joints placed by eye in the model's own coordinates), weights from Blender's
#      automatic (bone heat) weights on a middle mesh, carried to the near and far meshes over the surface;
#   5. poses each clip at --frames even steps (k / frames of the clip, which loops) and freezes each pose into a shape key
#      `<clip>.<k>` of both meshes; the legs are posed by two-bone IK from where the feet go, so planted feet stay put;
#   6. exports `near` and `far` (shape keys as morph targets, no skin, no animation) and writes a report of what it made.
# Bones have no rest rotation: every turn is about the animal's own axes, X forward, Y its left, Z up (in degrees below: pitch
# about Y, positive dips the nose, and lifts a tail that points back; yaw about Z, positive turns to its left; roll about X).
import json
import math
import os
import sys
import tempfile

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]


def opt(name, fallback):
    flag = f'--{name}'
    return argv[argv.index(flag) + 1] if flag in argv else fallback


RIG = json.load(open(opt('rig', ''), encoding='utf-8'))
LENGTH = float(opt('length', '0.8'))
CLIPS = opt('clips', 'run,idle,drink,look').split(',')
FRAMES = int(opt('frames', '8'))
NEAR = int(opt('near', '800'))
FAR = int(opt('far', '250'))
TEX = int(opt('tex', '512'))
REPORT = opt('report', OUT + '.json')
HEAD_DETAIL = float(opt('head-detail', '1.4'))  # how much denser the near head's triangles are than the rest's
FAR_HEAD_DETAIL = float(opt('far-head-detail', '0.6'))  # the far one's: its face is a speck, its legs are not
BLEND = opt('blend', None)  # also save the rigged scene here, to look at
SECONDS = {'run': 0.45, 'idle': 3.0, 'drink': 2.5, 'look': 1.5}
for pair in filter(None, opt('seconds', '').split(',')):
    name, value = pair.split('=')
    SECONDS[name] = float(value)
report = {'clips': {}, 'warnings': []}


def log(*a):
    print('[crowd]', *a, flush=True)


def tris(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def select_only(*objs):
    for o in list(bpy.context.scene.objects):
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


# ---- 1. import, face +X, scale, feet on the ground --------------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
select_only(*meshes)
if len(meshes) > 1:
    bpy.ops.object.join()
high = bpy.context.view_layer.objects.active
high.data.transform(high.matrix_world)
high.parent = None
high.matrix_world = Matrix.Identity(4)
for o in list(bpy.context.scene.objects):
    if o is not high:
        bpy.data.objects.remove(o)
high.name = 'high'

# glTF (x, y up, z) is Blender (x, -z, y) once imported; the rig file's joints are in the file's glTF space.
to_blender = lambda p: Vector((p[0], -p[2], p[1]))
turn = {'-x': Matrix.Rotation(math.pi, 4, 'Z'), '+x': Matrix.Identity(4),
        '+z': Matrix.Rotation(-math.pi / 2, 4, 'Z'), '-z': Matrix.Rotation(math.pi / 2, 4, 'Z')}[RIG.get('nose', '-x')]
high.data.transform(turn)
xs = [v.co.x for v in high.data.vertices]
scale = LENGTH / (max(xs) - min(xs))
high.data.transform(Matrix.Scale(scale, 4))
zs = [v.co.z for v in high.data.vertices]
floor, top = min(zs), max(zs)
sole = [v.co.copy() for v in high.data.vertices if v.co.z < floor + 0.03 * (top - floor)]
left = [p for p in sole if p.y > 0]
right = [p for p in sole if p.y <= 0]
mid = (sum(left, Vector()) / len(left) + sum(right, Vector()) / len(right)) / 2
place = Matrix.Translation((-mid.x, -mid.y, -floor))
high.data.transform(place)
to_model = place @ Matrix.Scale(scale, 4) @ turn
J = {name: to_model @ to_blender(p) for name, p in RIG['joints'].items() if name != 'tail'}
J_TAIL = [to_model @ to_blender(p) for p in RIG['joints']['tail']]
height = top - floor
log(f'{len(high.data.vertices)} vertices, {tris(high)} triangles, scaled {scale:.4f}, {LENGTH} m long, {height:.3f} m tall')

# The bake reads the owner's paint from this mesh as it came (its own UVs); the meshes made below are welded copies.
src_material = high.data.materials[0] if high.data.materials else None


def welded_copy(name):
    obj = high.copy()
    obj.data = high.data.copy()
    obj.name = obj.data.name = name
    bpy.context.scene.collection.objects.link(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5 * LENGTH)
    bm.to_mesh(obj.data)
    bm.free()
    if obj.data.has_custom_normals:
        with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj]):
            bpy.ops.mesh.customdata_custom_splitnormals_clear()
    return obj


# ---- 2. decimate -----------------------------------------------------------------------------------------------------------
HEAD_FROM = J['head'].x - 0.02 * LENGTH  # in front of this the head keeps more detail
HEAD_ABOVE = J['neck'].z


def is_head(co):
    return co.x > HEAD_FROM and co.z > HEAD_ABOVE


def collapse(obj, ratio, free=None):
    for g in list(obj.vertex_groups):
        obj.vertex_groups.remove(g)
    mod = obj.modifiers.new('decimate', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = max(0.0, min(1.0, ratio))
    mod.use_collapse_triangulate = True
    if free is not None and len(free) < len(obj.data.vertices):
        obj.vertex_groups.new(name='free').add(sorted(free), 1.0, 'REPLACE')
        mod.vertex_group = 'free'
        mod.vertex_group_factor = 1000.0
    dg = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    old = obj.data
    obj.modifiers.remove(mod)
    obj.data = mesh
    bpy.data.meshes.remove(old)
    for g in list(obj.vertex_groups):
        obj.vertex_groups.remove(g)


def decimate(name, target, detail):
    obj = welded_copy(name)
    total = tris(obj)
    head_total = sum(len(p.vertices) - 2 for p in obj.data.polygons if is_head(p.center))
    base = target / (total - head_total + detail * head_total)
    body_target = base * (total - head_total)
    # the body first, the head kept out (its vertices have weight 0, which keeps their edges for last), then all of it
    free = {v.index for v in obj.data.vertices if not is_head(v.co)}
    collapse(obj, (body_target + head_total) / total, free)
    collapse(obj, target / tris(obj))
    while tris(obj) > target:
        collapse(obj, (target - 1) / tris(obj))
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.shade_smooth()
    head = sum(1 for p in obj.data.polygons if is_head(p.center))
    log(f'{name}: {tris(obj)} triangles ({head} in the head), {len(obj.data.vertices)} vertices')
    return obj


near = decimate('near', NEAR, HEAD_DETAIL)
far = decimate('far', FAR, FAR_HEAD_DETAIL)

# Only for the weights: a closed copy (voxel remeshed, so bone heat finds every bone), decimated to be quick.
middle = welded_copy('middle')
remesh = middle.modifiers.new('remesh', 'REMESH')
remesh.mode = 'VOXEL'
remesh.voxel_size = 0.004 * LENGTH
remeshed = bpy.data.meshes.new_from_object(middle.evaluated_get(bpy.context.evaluated_depsgraph_get()))
middle.modifiers.remove(remesh)
welded = middle.data
middle.data = remeshed
bpy.data.meshes.remove(welded)
collapse(middle, 12000 / tris(middle))
log(f'middle: {tris(middle)} triangles, {len(middle.data.vertices)} vertices (remeshed)')

# ---- 3. one atlas for both, the owner's paint baked onto it ----------------------------------------------------------------
FAR_SHARE = 0.4  # the far mesh's islands at this much the near one's scale (a sixth of the area)
HEAD_UV = 1.5  # the head's islands this much larger than the rest's: its eyes and smile are what a child looks at
PACK_MARGIN = 3 / TEX  # the gaps are filled from the islands' edges below, so a small margin does


def unwrap(obj, share):
    """Smart-projects the object into its own islands, the head's larger, all scaled by `share`."""
    select_only(obj)
    while obj.data.uv_layers:
        obj.data.uv_layers.remove(obj.data.uv_layers[0])
    obj.data.uv_layers.new(name='UVMap')
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(80), island_margin=0.0, area_weight=0.0, correct_aspect=True,
                             scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    uv = bm.loops.layers.uv.active
    bm.faces.ensure_lookup_table()
    parent = list(range(len(bm.faces)))

    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for edge in bm.edges:
        faces = edge.link_faces
        if len(faces) != 2:
            continue
        f, g = faces
        same = all((next(l for l in f.loops if l.vert is v)[uv].uv - next(l for l in g.loops if l.vert is v)[uv].uv).length < 1e-6
                   for v in edge.verts)
        if same:
            parent[root(f.index)] = root(g.index)
    islands = {}
    for f in bm.faces:
        islands.setdefault(root(f.index), []).append(f)
    for faces in islands.values():
        loops = [l for f in faces for l in f.loops]
        centre = sum((l[uv].uv for l in loops), Vector((0, 0))) / len(loops)
        grow = HEAD_UV if sum(is_head(f.calc_center_median()) for f in faces) > len(faces) / 2 else 1.0
        for l in loops:
            l[uv].uv = (centre + (l[uv].uv - centre) * grow) * share
    bm.to_mesh(obj.data)
    bm.free()
    return len(islands)


report['islands'] = {'near': unwrap(near, 1.0), 'far': unwrap(far, FAR_SHARE)}
select_only(near, far)
bpy.context.scene.tool_settings.use_uv_select_sync = True
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
pack = {'rotate': True, 'scale': True, 'margin': PACK_MARGIN, 'margin_method': 'FRACTION'}
known = bpy.ops.uv.pack_islands.get_rna_type().properties.keys()
bpy.ops.uv.pack_islands(**{k: v for k, v in pack.items() if k in known})
bpy.ops.object.mode_set(mode='OBJECT')


def uv_mask(obj, grow):
    """The atlas pixels the object's triangles cover, grown by `grow` pixels (a bool array, TEX x TEX, row 0 at v = 0)."""
    mask = np.zeros((TEX, TEX), bool)
    uv = obj.data.uv_layers[0].data
    for poly in obj.data.polygons:
        pts = [uv[i].uv * TEX for i in poly.loop_indices]
        for k in range(1, len(pts) - 1):
            a, b, c = pts[0], pts[k], pts[k + 1]
            x0, x1 = int(max(0, math.floor(min(a.x, b.x, c.x)))), int(min(TEX - 1, math.ceil(max(a.x, b.x, c.x))))
            y0, y1 = int(max(0, math.floor(min(a.y, b.y, c.y)))), int(min(TEX - 1, math.ceil(max(a.y, b.y, c.y))))
            if x1 < x0 or y1 < y0:
                continue
            gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            d = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y)
            if abs(d) < 1e-12:
                continue
            l1 = ((b.y - c.y) * (gx - c.x) + (c.x - b.x) * (gy - c.y)) / d
            l2 = ((c.y - a.y) * (gx - c.x) + (a.x - c.x) * (gy - c.y)) / d
            l3 = 1 - l1 - l2
            pad = 0.75 / max(1.0, abs(d) ** 0.5)  # take in pixels the edge passes through
            inside = (l1 >= -pad) & (l2 >= -pad) & (l3 >= -pad)
            mask[y0:y1 + 1, x0:x1 + 1] |= inside
    for _ in range(grow):
        grown = mask.copy()
        grown[1:, :] |= mask[:-1, :]
        grown[:-1, :] |= mask[1:, :]
        grown[:, 1:] |= mask[:, :-1]
        grown[:, :-1] |= mask[:, 1:]
        mask = grown
    return mask


scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 16
scene.cycles.seed = 1


MISSED = (1.0, 0.0, 1.0, 0.0)  # what a pixel the bake did not reach still holds


def bake(obj, extrusion, ray):
    image = bpy.data.images.new(f'bake-{obj.name}', TEX, TEX, alpha=True)
    image.colorspace_settings.name = 'sRGB'
    image.pixels.foreach_set(np.tile(np.array(MISSED, np.float32), TEX * TEX))
    material = bpy.data.materials.new(f'bake-{obj.name}')
    material.use_nodes = True
    node = material.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = image
    material.node_tree.nodes.active = node
    obj.data.materials.clear()
    obj.data.materials.append(material)
    select_only(obj, high)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, use_selected_to_active=True, cage_extrusion=extrusion,
                        max_ray_distance=ray, margin=6, margin_type='EXTEND')
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(TEX, TEX, 4)
    return pixels


def reached(pixels):
    return ~((np.abs(pixels[..., 0] - 1) < 1e-3) & (pixels[..., 1] < 1e-3) & (np.abs(pixels[..., 2] - 1) < 1e-3)
             & (pixels[..., 3] < 1e-3))


def fill(rgb, valid):
    """Fills every pixel not valid from its valid neighbours, ring by ring, so the gaps between islands (and what mipmaps blend
    in) carry the colour of the nearest island."""
    rgb, valid = rgb.copy(), valid.copy()
    shifts = [(dy, dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx]
    while not valid.all():
        total = np.zeros_like(rgb)
        count = np.zeros(valid.shape, np.float32)
        for dy, dx in shifts:
            v = np.roll(np.roll(valid, dy, 0), dx, 1)
            total += np.roll(np.roll(rgb, dy, 0), dx, 1) * v[..., None]
            count += v
        new = ~valid & (count > 0)
        if not new.any():
            break
        rgb[new] = total[new] / count[new][:, None]
        valid |= new
    return rgb


near_pixels = bake(near, 0.02 * LENGTH, 0.08 * LENGTH)
far_pixels = bake(far, 0.04 * LENGTH, 0.12 * LENGTH)
near_mask = uv_mask(near, 1)
far_mask = uv_mask(far, 1)
overlap = int((near_mask & far_mask).sum())
if overlap:
    report['warnings'].append(f'{overlap} atlas pixels are both meshes\'')
rgb = np.zeros((TEX, TEX, 3), np.float32)
rgb[far_mask] = far_pixels[far_mask][:, :3]
rgb[near_mask] = near_pixels[near_mask][:, :3]
valid = (near_mask & reached(near_pixels)) | (far_mask & reached(far_pixels))
missed = int(((near_mask | far_mask) & ~valid).sum())
report['bake'] = {'used': round(float((near_mask | far_mask).mean()), 3), 'missed': missed}
paint = np.ones((TEX, TEX, 4), np.float32)
paint[..., :3] = fill(rgb, valid)
covered = near_mask | far_mask
final = bpy.data.images.new('paint', TEX, TEX, alpha=False)
final.colorspace_settings.name = 'sRGB'
final.pixels.foreach_set(paint.ravel())
paint_file = os.path.join(tempfile.mkdtemp(prefix='crowd-'), 'paint.png')
final.filepath_raw = paint_file
final.file_format = 'PNG'
final.save()
log(f'baked {TEX} px: {covered.mean() * 100:.0f} % of the atlas used, {missed} pixels the rays missed (filled), '
    f'{report["islands"]} islands')

material = bpy.data.materials.new('paint')
material.use_nodes = True
nodes = material.node_tree.nodes
bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
tex = nodes.new('ShaderNodeTexImage')
tex.image = final
material.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Metallic'].default_value = 0.0
bsdf.inputs['Roughness'].default_value = 0.8
material.use_backface_culling = True  # a closed surface: one-sided is cheaper
for obj in (near, far):
    obj.data.materials.clear()
    obj.data.materials.append(material)

# ---- 4. the rig: bones from the joints, bone-heat weights on the middle mesh, carried to near and far -------------------------
BONES = {  # name: (head, tail, parent)
    'hips': (J['hips'], J['spine'], None),
    'spine': (J['spine'], J['chest'], 'hips'),
    'chest': (J['chest'], J['neck'], 'spine'),
    'neck': (J['neck'], J['head'], 'chest'),
    'head': (J['head'], J['nose'], 'neck'),
}
for k in range(len(J_TAIL) - 1):
    BONES[f'tail.{k}'] = (J_TAIL[k], J_TAIL[k + 1], 'hips' if k == 0 else f'tail.{k - 1}')
for s in 'LR':
    BONES[f'thigh.{s}'] = (J[f'hip.{s}'], J[f'knee.{s}'], 'hips')
    BONES[f'shin.{s}'] = (J[f'knee.{s}'], J[f'ankle.{s}'], f'thigh.{s}')
    BONES[f'foot.{s}'] = (J[f'ankle.{s}'], J[f'toe.{s}'], f'shin.{s}')
    BONES[f'arm.{s}'] = (J[f'shoulder.{s}'], J[f'hand.{s}'], 'chest')
NAMES = list(BONES)
TAILS = [n for n in NAMES if n.startswith('tail.')]
report['joints'] = {n: [round(c, 4) for c in BONES[n][0]] for n in NAMES}

arm_data = bpy.data.armatures.new('rig')
rig = bpy.data.objects.new('rig', arm_data)
scene.collection.objects.link(rig)
select_only(rig)
bpy.ops.object.mode_set(mode='EDIT')
for name in NAMES:
    head, tail, parent = BONES[name]
    bone = arm_data.edit_bones.new(name)
    bone.head, bone.tail = head, tail
for name in NAMES:
    if BONES[name][2]:
        arm_data.edit_bones[name].parent = arm_data.edit_bones[BONES[name][2]]
bpy.ops.object.mode_set(mode='OBJECT')
select_only(rig)
middle.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
mid_weights = np.zeros((len(middle.data.vertices), len(NAMES)))
index = {n: i for i, n in enumerate(NAMES)}
groups = {g.index: g.name for g in middle.vertex_groups}
for v in middle.data.vertices:
    for g in v.groups:
        if groups[g.group] in index:
            mid_weights[v.index, index[groups[g.group]]] = g.weight
unweighted = int((mid_weights.sum(axis=1) < 1e-6).sum())
if unweighted:
    report['warnings'].append(f'bone heat left {unweighted} of {len(mid_weights)} vertices without a bone')
bare = [n for i, n in enumerate(NAMES) if mid_weights[:, i].max() < 0.5]
if bare:
    report['warnings'].append(f'bone heat gave no vertex mostly to {", ".join(bare)}')
log('weights: ' + ', '.join(f'{n} {mid_weights[:, i].sum():.0f}' for i, n in enumerate(NAMES)))


def nearest_bone(co):
    best, which = 1e9, 0
    for i, name in enumerate(NAMES):
        a, b = BONES[name][0], BONES[name][1]
        ab = b - a
        t = max(0.0, min(1.0, (co - a).dot(ab) / ab.length_squared))
        d = (a + ab * t - co).length
        if d < best:
            best, which = d, i
    return which


for i in np.nonzero(mid_weights.sum(axis=1) < 1e-6)[0]:
    mid_weights[i, nearest_bone(middle.data.vertices[i].co)] = 1
mid_weights /= mid_weights.sum(axis=1, keepdims=True)
mid_points = [v.co.copy() for v in middle.data.vertices]
mid_faces = [tuple(p.vertices) for p in middle.data.polygons]
tree = BVHTree.FromPolygons(mid_points, mid_faces)


def carried_weights(obj):
    out = np.zeros((len(obj.data.vertices), len(NAMES)))
    for v in obj.data.vertices:
        at, _, face, _ = tree.find_nearest(v.co)
        a, b, c = (mid_points[i] for i in mid_faces[face])
        bary = barycentric_transform(at, a, b, c, Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))
        w = np.array([max(0.0, x) for x in bary])
        w = w / w.sum() if w.sum() > 0 else np.array([1.0, 0, 0])
        out[v.index] = sum(w[k] * mid_weights[i] for k, i in enumerate(mid_faces[face]))
    out[out < 0.01] = 0  # drop specks of far bones
    return out / out.sum(axis=1, keepdims=True)


WEIGHTS = {near.name: carried_weights(near), far.name: carried_weights(far)}

# ---- 5. the clips -----------------------------------------------------------------------------------------------------------
D = math.radians
TAU = 2 * math.pi


def R(pitch=0.0, yaw=0.0, roll=0.0):
    return (Matrix.Rotation(D(yaw), 3, 'Z') @ Matrix.Rotation(D(pitch), 3, 'Y') @ Matrix.Rotation(D(roll), 3, 'X'))


def clamp01(t):
    return max(0.0, min(1.0, t))


def smooth(t):
    t = clamp01(t)
    return t * t * (3 - 2 * t)


def smoother(t):
    t = clamp01(t)
    return t * t * t * (t * (6 * t - 15) + 10)


def keyed(keys, u):
    """Eases between [(u, value)] keys, flat at each key."""
    for (a, va), (b, vb) in zip(keys, keys[1:]):
        if u <= b:
            return va + (vb - va) * smooth((u - a) / (b - a)) if b > a else vb
    return keys[-1][1]


def bump(u, a, b):
    """0 outside a..b, rising smoothly to 1 in the middle."""
    return math.sin(math.pi * clamp01((u - a) / (b - a))) ** 2


U = LENGTH  # distances in the clips are shares of the animal's length
ANKLE_X = (J['ankle.L'].x + J['ankle.R'].x) / 2  # a running foot passes under here at mid-stance


def planted():
    return {f'foot.{s}': (Vector((0, 0, 0)), 0.0) for s in 'LR'}


def clip_idle(u):
    """3 s: standing, breathing twice, looking about (left, then right), the tail swaying; the feet stay put."""
    breath = math.sin(TAU * 2 * u)
    look = keyed([(0, 0), (0.1, 0), (0.25, 24), (0.42, 24), (0.55, -20), (0.72, -20), (0.86, 0), (1, 0)], u)
    sway = math.sin(TAU * u)
    pose = {
        'hips': (R(roll=1.5 * sway, pitch=0.5 * breath), Vector((0, 0.005 * U * sway, -0.002 * U * (1 + breath)))),
        'spine': R(pitch=-1.0 * breath),
        'chest': R(pitch=-1.5 * breath),
        'neck': R(yaw=0.4 * look, pitch=0.8 * breath),
        'head': R(yaw=0.6 * look, roll=0.2 * look, pitch=-4 * smooth(abs(look) / 24)),
        'arm.L': R(pitch=4 * breath), 'arm.R': R(pitch=4 * breath),
    }
    for k, name in enumerate(TAILS):
        wave = TAU * (u - 0.07 * k)
        pose[name] = R(yaw=3.5 * math.sin(wave), pitch=0.8 * math.sin(wave + 1))
    pose.update(planted())
    return pose


DRINK = {'reach': 1.0}  # how far down it reaches; set below so its snout comes to the water at its feet


def clip_drink(u):
    """2.5 s: down to the water in front of its feet, two sips, and up again; the feet stay put."""
    k = DRINK['reach']
    reach = keyed([(0, 0), (0.3, 1), (0.72, 1), (1, 0)], u)
    sip = (1 - math.cos(TAU * 2 * (u - 0.3) / 0.42)) / 2 if 0.3 < u < 0.72 else 0.0
    down = k * reach
    pose = {  # it crouches on bent knees, tips its body forward and bends its neck down
        'hips': (R(pitch=24 * down), Vector((-0.02 * U * down, 0, -0.07 * U * down))),
        'spine': R(pitch=8 * down),
        'chest': R(pitch=8 * down),
        'neck': R(pitch=18 * down + 3 * sip),
        'head': R(pitch=16 * down + 7 * sip),
        'arm.L': R(pitch=10 * reach), 'arm.R': R(pitch=10 * reach),
    }
    for i, name in enumerate(TAILS):
        pose[name] = R(pitch=(-9 if i == 0 else -1.5) * reach, yaw=2 * math.sin(TAU * (u - 0.07 * i)))
    pose.update(planted())
    return pose


def clip_look(u):
    """1.5 s: the head up to the sky, held (frames 2 to 5) with a curious tilt, and down again; the feet stay put."""
    up = keyed([(0, 0), (0.25, 1), (0.72, 1), (1, 0)], u)
    hold = bump(u, 0.22, 0.78)
    pose = {
        'hips': (R(pitch=-6 * up), Vector((0.004 * U * up, 0, -0.006 * U * up))),
        'spine': R(pitch=-4 * up),
        'chest': R(pitch=-6 * up),
        'neck': R(pitch=-22 * up),
        'head': R(pitch=-30 * up, roll=8 * hold),
        'arm.L': R(pitch=-8 * up), 'arm.R': R(pitch=-8 * up),
    }
    for i, name in enumerate(TAILS):
        pose[name] = R(pitch=(4 if i == 0 else 0.5) * up)
    pose.update(planted())
    return pose


RUN = {'duty': 0.36, 'sweep': 0.15 * U, 'lift': 0.07 * U, 'heel': 26.0}


def run_foot(side, u):
    """Where a running foot is: its shift from where it stands at rest, and its pitch about the toe tip."""
    phase = 0.0 if side == 'L' else 0.5
    phi = (u - phase + 0.5) % 1 - 0.5
    duty, sweep = RUN['duty'], RUN['sweep']
    base = ANKLE_X - J[f'ankle.{side}'].x  # mid-stance under the hips
    if abs(phi) <= duty / 2:
        s = phi / duty  # -0.5 (lands, ahead) .. 0.5 (pushes off, behind)
        return Vector((base - s * sweep, 0, 0)), RUN['heel'] * smooth((s - 0.1) / 0.4)
    p = ((phi - duty / 2) % 1) / (1 - duty)  # 0 (toe off) .. 1 (lands)
    x = base - sweep / 2 + sweep * smoother(p)
    z = RUN['lift'] * math.sin(math.pi * p)
    pitch = RUN['heel'] * (1 - smooth(p / 0.6)) - 6 * bump(p, 0.5, 1.0)
    return Vector((x, 0, z)), pitch


def clip_run(u):
    """0.45 s: a lively run in place (the game moves it on at clips.run.stride metres a cycle); left foot down at frame 0."""
    bob = math.cos(TAU * 2 * u)  # 1 at mid-stance (low), -1 in the air between steps
    side = math.cos(TAU * u)  # 1 over the left foot, -1 over the right
    swing = math.sin(TAU * u)
    pose = {
        'hips': (R(pitch=10, yaw=4 * swing, roll=-3 * side), Vector((0, 0.004 * U * side, -0.03 * U - 0.012 * U * bob))),
        'spine': R(pitch=-3, yaw=-2 * swing),
        'chest': R(pitch=-2, yaw=-2 * swing),
        'neck': R(pitch=12 + 2 * bob),
        'head': R(pitch=-14 - 3 * bob),
        'arm.L': R(pitch=-28 + 16 * swing), 'arm.R': R(pitch=-28 - 16 * swing),
    }
    for i, name in enumerate(TAILS):
        pose[name] = R(pitch=-8 if i == 0 else 0.8, yaw=5 * math.sin(TAU * (u - 0.08 * i)) - (4 * swing if i == 0 else 0))
    for s in 'LR':
        pose[f'foot.{s}'] = run_foot(s, u)
    return pose


CLIP_POSES = {'run': clip_run, 'idle': clip_idle, 'drink': clip_drink, 'look': clip_look}


# The skeleton posed: each bone's world matrix and its skin matrix (posed world @ rest world inverse).
def basis(v, n):
    v = v.normalized()
    n = (n - v * n.dot(v)).normalized()
    return Matrix((v, n, v.cross(n))).transposed()


LEGS = {}
for s in 'LR':
    hip, knee, ankle = J[f'hip.{s}'], J[f'knee.{s}'], J[f'ankle.{s}']
    normal = (knee - hip).cross(ankle - knee).normalized()
    d = (ankle - hip).normalized()
    a = ((knee - hip).length ** 2 - (ankle - knee).length ** 2 + (ankle - hip).length ** 2) / (2 * (ankle - hip).length)
    bend = 1 if (knee - hip - d * a).dot(normal.cross(d)) > 0 else -1
    LEGS[s] = {'l1': (knee - hip).length, 'l2': (ankle - knee).length, 'normal': normal, 'bend': bend}


def T(v):
    return Matrix.Translation(v)


def posed(pose, stretch):
    world = {}
    rot, shift = pose.get('hips', (Matrix.Identity(3), Vector()))
    world['hips'] = T(J['hips'] + shift) @ rot.to_4x4()
    for name in NAMES:
        head, _, parent = BONES[name]
        if name == 'hips' or name.split('.')[0] in ('thigh', 'shin', 'foot'):
            continue
        world[name] = world[parent] @ T(head - BONES[parent][0]) @ pose.get(name, Matrix.Identity(3)).to_4x4()
    for s in 'LR':
        leg = LEGS[s]
        hip = world['hips'] @ (J[f'hip.{s}'] - J['hips'])
        shift, pitch = pose[f'foot.{s}']
        toe0 = J[f'toe.{s}']
        foot = R(pitch=pitch)
        toe = toe0 + shift
        ankle = toe + foot @ (J[f'ankle.{s}'] - toe0)
        d = ankle - hip
        reach = d.length
        l1, l2 = leg['l1'], leg['l2']
        clamped = max(abs(l1 - l2) + 1e-5, min(l1 + l2 - 1e-5, reach))
        stretch.append(reach - clamped)
        dh = d.normalized()
        a = (l1 * l1 - l2 * l2 + clamped * clamped) / (2 * clamped)
        b = math.sqrt(max(0.0, l1 * l1 - a * a))
        normal = rot @ leg['normal']
        n = (normal - dh * normal.dot(dh)).normalized()
        knee = hip + dh * a + n.cross(dh) * b * leg['bend']
        end = hip + dh * clamped
        rest_hip, rest_knee, rest_ankle = J[f'hip.{s}'], J[f'knee.{s}'], J[f'ankle.{s}']
        world[f'thigh.{s}'] = T(hip) @ (basis(knee - hip, n) @ basis(rest_knee - rest_hip, leg['normal']).transposed()).to_4x4()
        world[f'shin.{s}'] = T(knee) @ (basis(end - knee, n) @ basis(rest_ankle - rest_knee, leg['normal']).transposed()).to_4x4()
        world[f'foot.{s}'] = T(ankle) @ foot.to_4x4()
    return {name: world[name] @ T(-BONES[name][0]) for name in NAMES}, world


def skin(obj, skins):
    rest = np.array([v.co[:] for v in obj.data.vertices])
    mats = np.array([np.array(skins[n]) for n in NAMES])  # bones x 4 x 4
    w = WEIGHTS[obj.name]
    moved = np.einsum('vb,bij,vj->vi', w, mats[:, :3, :3], rest) + w @ mats[:, :3, 3]
    return moved


def nose_tip(world):
    return world['head'] @ (J['nose'] - J['head'])


# The drink reaches its snout down to the water in front of its feet (2 % of its length above the ground): the least reach that
# does, scanning up from a small bend (past the right reach the head would curl back under its chest).
def snout(k):
    DRINK['reach'] = k
    return nose_tip(posed(clip_drink(0.5), [])[1])


TOES = max(J['toe.L'].x, J['toe.R'].x)
steps = [0.2 + 0.05 * i for i in range(37)]
found = next((k for k in steps if snout(k).z <= 0.02 * U), None)
if found is None:
    report['warnings'].append(f'the drink does not reach the water: the snout is {min(snout(k).z for k in steps):.3f} m up at best')
    found = min(steps, key=lambda k: snout(k).z)
else:
    lo, hi = found - 0.05, found
    for _ in range(20):
        mid_k = (lo + hi) / 2
        lo, hi = (mid_k, hi) if snout(mid_k).z > 0.02 * U else (lo, mid_k)
    found = hi
tip = snout(found)
if tip.x < TOES:
    report['warnings'].append(f'the drinking snout is behind the toes ({tip.x:.3f} < {TOES:.3f} m)')
report['drink'] = {'reach': round(found, 3), 'snout': [round(c, 4) for c in tip]}
log(f'drink: reach {found:.3f}, the snout at {tip.z:.3f} m up, {tip.x:.3f} m ahead (toes {TOES:.3f})')

# ---- 6. freeze the frames into shape keys -----------------------------------------------------------------------------------
for obj in (near, far):
    obj.shape_key_add(name='Basis', from_mix=False)
rest = {obj.name: np.array([v.co[:] for v in obj.data.vertices]) for obj in (near, far)}
soles = rest['near'][:, 2] < 0.015 * U
for clip in CLIPS:
    frames, stretch, steps = [], [], []
    for k in range(FRAMES):
        skins, world = posed(CLIP_POSES[clip](k / FRAMES), stretch)
        for obj in (near, far):
            moved = skin(obj, skins)
            key = obj.shape_key_add(name=f'{clip}.{k}', from_mix=False)
            key.data.foreach_set('co', moved.astype(np.float32).ravel())
            if obj is near:
                frames.append(moved)
    for k in range(FRAMES):
        steps.append(float(np.linalg.norm(frames[k] - frames[(k + 1) % FRAMES], axis=1).max()))
    info = {'frames': FRAMES, 'seconds': SECONDS[clip], 'step': [round(s, 4) for s in steps],
            'stretch': round(max(stretch), 4)}
    if clip != 'run':
        info['soles'] = round(float(max(np.linalg.norm(f[soles] - rest['near'][soles], axis=1).max() for f in frames)), 4)
    else:
        info['stride'] = round(RUN['sweep'] / RUN['duty'], 4)
    report['clips'][clip] = info
    log(f'{clip}: {info}')

# ---- 7. export ---------------------------------------------------------------------------------------------------------------
for obj in (near, far):
    obj.data.name = obj.name
    for key in obj.data.shape_keys.key_blocks:
        key.value = 0.0  # the game sets each critter's own weights
if BLEND:
    for obj in (near, far, middle):
        for i, name in enumerate(NAMES):
            group = obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name)
            if obj is not middle:
                w = WEIGHTS[obj.name][:, i]
                for v in np.nonzero(w)[0]:
                    group.add([int(v)], float(w[v]), 'REPLACE')
    bpy.ops.wm.save_as_mainfile(filepath=BLEND, copy=True)
bpy.data.objects.remove(middle)
bpy.data.objects.remove(rig)
bpy.data.objects.remove(high)
select_only(near, far)
options = dict(filepath=OUT, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
               export_animations=False, export_skins=False, export_morph=True, export_morph_normal=True,
               export_morph_tangent=False, export_image_format='JPEG', export_jpeg_quality=92, export_extras=False,
               export_try_sparse_sk=False, export_tangents=False, export_materials='EXPORT')
known = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
bpy.ops.export_scene.gltf(**{k: v for k, v in options.items() if k in known})

zs = [v.co.z for v in near.data.vertices]
xs = [v.co.x for v in near.data.vertices]
report.update({
    'length': round(max(xs) - min(xs), 4), 'height': round(max(zs) - min(zs), 4), 'pivot': 0,
    'near': {'triangles': tris(near), 'vertices': len(near.data.vertices)},
    'far': {'triangles': tris(far), 'vertices': len(far.data.vertices)},
    'scale': scale,
})
json.dump(report, open(REPORT, 'w', encoding='utf-8'), indent=1)
log('wrote', OUT, 'and', REPORT)
