# Blender background script: turns the Tripo/AssetHub frog GLB into a low-poly, rigged, morph-animated
# game asset (near + far LODs sharing one 512px matte atlas, with `leap`, `crouch`, and `breathe` shape keys).
# Called by remake/tools/prep-frog.mjs:
#   "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup
#     --python remake/tools/blender-frog.py -- <in.glb> <out.glb> [--length 0.22] [--near 680] [--far 240] [--tex 512] [--preview dir]
import json
import math
import os
import sys
import tempfile

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]


def opt(name, fallback):
    flag = f'--{name}'
    return argv[argv.index(flag) + 1] if flag in argv else fallback


LENGTH = float(opt('length', '0.22'))
NEAR = int(opt('near', '680'))
FAR = int(opt('far', '240'))
TEX = int(opt('tex', '512'))
REPORT = opt('report', OUT + '.json')
PREVIEW = opt('preview', None)


def log(*a):
    print('[frog]', *a, flush=True)


def tris(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def select_only(*objs):
    for o in list(bpy.context.scene.objects):
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    if objs:
        bpy.context.view_layer.objects.active = objs[0]


# ---- 1. Import, orient (+X forward, +Z up in Blender -> +Y up in glTF), scale to LENGTH, stand on Z = 0 ----
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

raw_xs = [v.co.x for v in high.data.vertices]
raw_ys = [v.co.y for v in high.data.vertices]
raw_zs = [v.co.z for v in high.data.vertices]
raw_len = max(raw_xs) - min(raw_xs)
scale = LENGTH / raw_len
raw_floor = min(raw_zs)
raw_mid_x = (min(raw_xs) + max(raw_xs)) * 0.5
raw_mid_y = (min(raw_ys) + max(raw_ys)) * 0.5

# Transform raw coordinates so feet rest on Z = 0, centered on X/Y, nose toward +X
to_model = Matrix.Translation((-raw_mid_x * scale, -raw_mid_y * scale, -raw_floor * scale)) @ Matrix.Scale(scale, 4)
high.data.transform(to_model)

zs = [v.co.z for v in high.data.vertices]
xs = [v.co.x for v in high.data.vertices]
ys = [v.co.y for v in high.data.vertices]
height = max(zs) - min(zs)
width = max(ys) - min(ys)
log(f'high: {len(high.data.vertices)} verts, {tris(high)} tris -> scaled {scale:.4f}: {LENGTH:.3f} m long, {width:.3f} m wide, {height:.3f} m tall')


def M_pt(x, y, z):
    return to_model @ Vector((x, y, z))


# Anatomical landmarks in raw Blender import space (measured from froskur-tripo-v1.glb slices)
J = {
    'hips':   M_pt(-0.30, 0.0, -0.11),
    'spine':  M_pt(-0.08, 0.0, +0.01),
    'chest':  M_pt(+0.09, 0.0, +0.08),
    'head':   M_pt(+0.19, 0.0, +0.14),
    'nose':   M_pt(+0.42, 0.0, +0.13),
    'throat_base': M_pt(+0.16, 0.0, +0.01),
    'throat_tip':  M_pt(+0.33, 0.0, -0.01),
}
for s_name, s in (('L', 1.0), ('R', -1.0)):
    J[f'hip.{s_name}']      = M_pt(-0.30, 0.14 * s, -0.12)
    J[f'knee.{s_name}']     = M_pt(-0.07, 0.35 * s, -0.05)
    J[f'ankle.{s_name}']    = M_pt(-0.27, 0.27 * s, -0.285)
    J[f'toe.{s_name}']      = M_pt(-0.06, 0.41 * s, -0.312)
    J[f'shoulder.{s_name}'] = M_pt(+0.09, 0.15 * s, +0.03)
    J[f'elbow.{s_name}']    = M_pt(+0.07, 0.22 * s, -0.11)
    J[f'wrist.{s_name}']    = M_pt(+0.19, 0.16 * s, -0.285)
    J[f'hand.{s_name}']     = M_pt(+0.34, 0.19 * s, -0.312)


# ---- 2. Weld & Decimate to crisp low-poly (`near` and `far`), preserving head/eye/toe silhouette ----
HEAD_X = J['chest'].x
HEAD_Z = J['spine'].z


def is_eye_or_snout(co):
    # Extra triangle density around the expressive bulging eyes and smile
    return co.x > HEAD_X * 0.85 and co.z > HEAD_Z * 0.9


def welded_copy(name):
    obj = high.copy()
    obj.data = high.data.copy()
    obj.name = obj.data.name = name
    bpy.context.scene.collection.objects.link(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=2.5e-4 * LENGTH)
    boundary_verts = [v for v in bm.verts if any(e.is_boundary for e in v.link_edges)]
    if boundary_verts:
        bmesh.ops.remove_doubles(bm, verts=boundary_verts, dist=2.5e-3 * LENGTH)
    bm.to_mesh(obj.data)
    bm.free()
    if obj.data.has_custom_normals:
        with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj]):
            bpy.ops.mesh.customdata_custom_splitnormals_clear()
    return obj


def collapse(obj, ratio, free=None):
    for g in list(obj.vertex_groups):
        obj.vertex_groups.remove(g)
    mod = obj.modifiers.new('decimate', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = max(0.0, min(1.0, ratio))
    mod.use_collapse_triangulate = True
    if free is not None and 0 < len(free) < len(obj.data.vertices):
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


# Pre-weld and pre-decimate once to ~25k triangles so `near`, `far`, and `middle` run in seconds (while `high` stays untouched for baking!)
base_weld = welded_copy('base_weld')
if tris(base_weld) > 25000:
    collapse(base_weld, 25000 / tris(base_weld))
log(f'base_weld: {tris(base_weld)} triangles')


def copy_base(name):
    obj = base_weld.copy()
    obj.data = base_weld.data.copy()
    obj.name = obj.data.name = name
    bpy.context.scene.collection.objects.link(obj)
    return obj


def decimate(name, target, eye_preserve=True):
    obj = copy_base(name)
    if eye_preserve:
        # Soft vertex-group weighting: eyes/snout keep ~1.8x denser triangles without starving the body or locking seams!
        vg = obj.vertex_groups.new(name='collapse_w')
        vg.add([v.index for v in obj.data.vertices if is_eye_or_snout(v.co)], 0.45, 'REPLACE')
        vg.add([v.index for v in obj.data.vertices if not is_eye_or_snout(v.co)], 1.0, 'REPLACE')
        mod = obj.modifiers.new('decimate', 'DECIMATE')
        mod.decimate_type = 'COLLAPSE'
        mod.ratio = max(0.01, min(1.0, (target * 1.12) / max(1, tris(obj))))
        mod.use_collapse_triangulate = True
        mod.vertex_group = 'collapse_w'
        mod.vertex_group_factor = 1.4
        mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(bpy.context.evaluated_depsgraph_get()))
        old = obj.data
        obj.modifiers.remove(mod)
        obj.data = mesh
        bpy.data.meshes.remove(old)
        for g in list(obj.vertex_groups):
            obj.vertex_groups.remove(g)
    collapse(obj, target / max(1, tris(obj)))
    nudge = 1
    for _ in range(12):
        cur = tris(obj)
        if cur <= target:
            break
        collapse(obj, max(0.05, (target - nudge) / cur))
        if tris(obj) >= cur:
            nudge += max(2, int(cur * 0.03))
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.shade_smooth()
    log(f'{name}: {tris(obj)} triangles, {len(obj.data.vertices)} vertices')
    return obj


near = decimate('near', NEAR, True)
far = decimate('far', FAR, False)
for obj in (near, far):
    for v in obj.data.vertices:
        if v.co.z < 0.0:
            v.co.z = 0.0

# Decimated manifold proxy for clean bone-heat weights (keeps air gap between hind thighs and flanks intact!)
middle = copy_base('middle')
bpy.data.objects.remove(base_weld)
collapse(middle, min(1.0, 8500 / max(1, tris(middle))))
log(f'middle: {tris(middle)} triangles (manifold proxy for bone heat)')

# ---- 3. UV unwrap near + far into one 512px atlas and bake diffuse color from `high` ----
FAR_SHARE = 0.42
HEAD_UV = 1.45
PACK_MARGIN = 3 / TEX


def unwrap(obj, share):
    select_only(obj)
    while obj.data.uv_layers:
        obj.data.uv_layers.remove(obj.data.uv_layers[0])
    obj.data.uv_layers.new(name='UVMap')
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(78), island_margin=0.0, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
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
        if len(edge.link_faces) == 2:
            f, g = edge.link_faces
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
        grow = HEAD_UV if sum(f.calc_center_median().x > HEAD_X and f.calc_center_median().z > HEAD_Z for f in faces) > len(faces) / 2 else 1.0
        for l in loops:
            l[uv].uv = (centre + (l[uv].uv - centre) * grow) * share
    bm.to_mesh(obj.data)
    bm.free()
    return len(islands)


islands_near = unwrap(near, 1.0)
islands_far = unwrap(far, FAR_SHARE)
select_only(near, far)
bpy.context.scene.tool_settings.use_uv_select_sync = True
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
pack = {'rotate': True, 'scale': True, 'margin': PACK_MARGIN, 'margin_method': 'FRACTION'}
known_pack = bpy.ops.uv.pack_islands.get_rna_type().properties.keys()
bpy.ops.uv.pack_islands(**{k: v for k, v in pack.items() if k in known_pack})
bpy.ops.object.mode_set(mode='OBJECT')


def uv_mask(obj, grow):
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
            pad = 0.75 / max(1.0, abs(d) ** 0.5)
            mask[y0:y1 + 1, x0:x1 + 1] |= (l1 >= -pad) & (l2 >= -pad) & (l3 >= -pad)
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
MISSED = (1.0, 0.0, 1.0, 0.0)


def bake(obj, extrusion, ray):
    image = bpy.data.images.new(f'bake-{obj.name}', TEX, TEX, alpha=True)
    image.colorspace_settings.name = 'sRGB'
    image.pixels.foreach_set(np.tile(np.array(MISSED, np.float32), TEX * TEX))
    mat = bpy.data.materials.new(f'bake-{obj.name}')
    node = mat.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = image
    mat.node_tree.nodes.active = node
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    select_only(obj, high)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, use_selected_to_active=True,
                        cage_extrusion=extrusion, max_ray_distance=ray, margin=6, margin_type='EXTEND')
    return np.array(image.pixels[:], dtype=np.float32).reshape(TEX, TEX, 4)


def reached(pixels):
    return ~((np.abs(pixels[..., 0] - 1) < 1e-3) & (pixels[..., 1] < 1e-3)
             & (np.abs(pixels[..., 2] - 1) < 1e-3) & (pixels[..., 3] < 1e-3))


def fill(rgb, valid):
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


near_pixels = bake(near, 0.025 * LENGTH, 0.10 * LENGTH)
far_pixels = bake(far, 0.045 * LENGTH, 0.14 * LENGTH)
near_mask = uv_mask(near, 1)
far_mask = uv_mask(far, 1)
rgb = np.zeros((TEX, TEX, 3), np.float32)
rgb[far_mask] = far_pixels[far_mask][:, :3]
rgb[near_mask] = near_pixels[near_mask][:, :3]
valid = (near_mask & reached(near_pixels)) | (far_mask & reached(far_pixels))
missed = int(((near_mask | far_mask) & ~valid).sum())
paint = np.ones((TEX, TEX, 4), np.float32)
paint[..., :3] = fill(rgb, valid)
final = bpy.data.images.new('froskur', TEX, TEX, alpha=False)
final.colorspace_settings.name = 'sRGB'
final.pixels.foreach_set(paint.ravel())
paint_file = os.path.join(tempfile.mkdtemp(prefix='frog-'), 'froskur.png')
final.filepath_raw = paint_file
final.file_format = 'PNG'
final.save()
log(f'baked {TEX}px atlas: {(near_mask | far_mask).mean() * 100:.0f}% used, {missed} missed pixels filled')

material = bpy.data.materials.new('froskur')
nodes = material.node_tree.nodes
bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
tex_node = nodes.new('ShaderNodeTexImage')
tex_node.image = final
material.node_tree.links.new(tex_node.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Metallic'].default_value = 0.0
bsdf.inputs['Roughness'].default_value = 0.82
material.use_backface_culling = True
for obj in (near, far):
    obj.data.materials.clear()
    obj.data.materials.append(material)

# ---- 4. Armature Rigging & Bone-Heat Weight Transfer ----
BONES = {
    'hips':   (J['hips'], J['spine'], None),
    'spine':  (J['spine'], J['chest'], 'hips'),
    'chest':  (J['chest'], J['head'], 'spine'),
    'head':   (J['head'], J['nose'], 'chest'),
    'throat': (J['throat_base'], J['throat_tip'], 'head'),
}
for s in ('L', 'R'):
    BONES[f'thigh.{s}']    = (J[f'hip.{s}'], J[f'knee.{s}'], 'hips')
    BONES[f'shin.{s}']     = (J[f'knee.{s}'], J[f'ankle.{s}'], f'thigh.{s}')
    BONES[f'foot.{s}']     = (J[f'ankle.{s}'], J[f'toe.{s}'], f'shin.{s}')
    BONES[f'upperarm.{s}'] = (J[f'shoulder.{s}'], J[f'elbow.{s}'], 'chest')
    BONES[f'forearm.{s}']  = (J[f'elbow.{s}'], J[f'wrist.{s}'], f'upperarm.{s}')
    BONES[f'hand.{s}']     = (J[f'wrist.{s}'], J[f'hand.{s}'], f'forearm.{s}')

NAMES = list(BONES.keys())
index = {n: i for i, n in enumerate(NAMES)}

arm_data = bpy.data.armatures.new('frog_rig')
rig = bpy.data.objects.new('frog_rig', arm_data)
scene.collection.objects.link(rig)
select_only(rig)
bpy.ops.object.mode_set(mode='EDIT')
for name in NAMES:
    eb = arm_data.edit_bones.new(name)
    eb.head, eb.tail = BONES[name][0], BONES[name][1]
    eb.use_connect = False
for name in NAMES:
    parent = BONES[name][2]
    if parent:
        arm_data.edit_bones[name].parent = arm_data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')

select_only(rig)
middle.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')

mid_weights = np.zeros((len(middle.data.vertices), len(NAMES)))
groups = {g.index: g.name for g in middle.vertex_groups}
for v in middle.data.vertices:
    for g in v.groups:
        if groups[g.group] in index:
            mid_weights[v.index, index[groups[g.group]]] = g.weight


def nearest_bone(co):
    best, which = 1e9, 0
    for i, name in enumerate(NAMES):
        a, b = BONES[name][0], BONES[name][1]
        ab = b - a
        t = max(0.0, min(1.0, (co - a).dot(ab) / max(1e-12, ab.length_squared)))
        d = (a + ab * t - co).length
        if d < best:
            best, which = d, i
    return which


for i in np.nonzero(mid_weights.sum(axis=1) < 1e-6)[0]:
    mid_weights[i, nearest_bone(middle.data.vertices[i].co)] = 1.0
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
        w = w / w.sum() if w.sum() > 0 else np.array([1.0, 0.0, 0.0])
        out[v.index] = sum(w[k] * mid_weights[i] for k, i in enumerate(mid_faces[face]))
    out[out < 0.01] = 0.0
    out /= out.sum(axis=1, keepdims=True)
    # Gentle 2-pass Laplacian weight smoothing along mesh edges so hip/thigh/shoulder folds bend smoothly without creases
    adj = [[] for _ in range(len(obj.data.vertices))]
    for e in obj.data.edges:
        a_i, b_i = e.vertices[0], e.vertices[1]
        adj[a_i].append(b_i)
        adj[b_i].append(a_i)
    for _ in range(2):
        prev = out.copy()
        for idx_v, nbrs in enumerate(adj):
            if nbrs:
                out[idx_v] = 0.65 * prev[idx_v] + 0.35 * prev[nbrs].mean(axis=0)
        out /= out.sum(axis=1, keepdims=True)
    # Keep planted soles crisp on their foot/hand bones right near the floor so crouch never shears toes
    ankle_z = J['ankle.L'].z
    feet_bones = [
        (J['ankle.L'], J['toe.L'], index['foot.L']),
        (J['ankle.R'], J['toe.R'], index['foot.R']),
        (J['wrist.L'], J['hand.L'], index['hand.L']),
        (J['wrist.R'], J['hand.R'], index['hand.R']),
    ]
    for v in obj.data.vertices:
        if v.co.z < ankle_z * 0.95 and abs(v.co.y) > 0.04 * LENGTH:
            _, _, b_idx = min(feet_bones, key=lambda f: min((v.co.xy - f[0].xy).length, (v.co.xy - f[1].xy).length, (v.co.xy - ((f[0].xy + f[1].xy) * 0.5)).length))
            t = max(0.0, min(1.0, (v.co.z - 0.45 * ankle_z) / max(1e-6, 0.50 * ankle_z)))
            t = t * t * (3 - 2 * t)
            one = np.zeros(len(NAMES))
            one[b_idx] = 1.0
            out[v.index] = one * (1 - t) + out[v.index] * t
    return out


WEIGHTS = {near.name: carried_weights(near), far.name: carried_weights(far)}

# ---- 5. Pose solver (Two-Bone IK for limbs + FK for leap / throat breathing) ----
T = Matrix.Translation


def basis(along, hint):
    x = along.normalized()
    z = (hint - x * hint.dot(x)).normalized()
    return Matrix((x, z.cross(x), z)).transposed()


CHAINS = {}
for s_name, s in (('L', 1.0), ('R', -1.0)):
    for kind_leg, parent, j0, j1, j2, b0, b1, b2, hint in (
        ('hind', 'hips', f'hip.{s_name}', f'knee.{s_name}', f'ankle.{s_name}', f'thigh.{s_name}', f'shin.{s_name}', f'foot.{s_name}', Vector((0.6, 0.8 * s, 0.5)).normalized()),
        ('fore', 'chest', f'shoulder.{s_name}', f'elbow.{s_name}', f'wrist.{s_name}', f'upperarm.{s_name}', f'forearm.{s_name}', f'hand.{s_name}', Vector((-0.5, 0.8 * s, 0.2)).normalized()),
    ):
        u = J[j1] - J[j0]
        lo = J[j2] - J[j1]
        d = J[j2] - J[j0]
        dh = d.normalized()
        n = (hint - dh * hint.dot(dh)).normalized()
        bend = 1.0 if (u - dh * u.dot(dh)).dot(n.cross(dh)) >= 0 else -1.0
        CHAINS[f'{kind_leg}.{s_name}'] = {
            'parent': parent, 'j0': j0, 'j1': j1, 'j2': j2,
            'bones': (b0, b1, b2), 'l1': u.length, 'l2': lo.length,
            'normal': n, 'bend': bend,
        }


def rot_mat(rx=0.0, ry=0.0, rz=0.0):
    # rx: roll around +X, ry: pitch around +Y (positive = nose down, negative = nose up), rz: yaw around +Z
    return Euler((math.radians(rx), math.radians(ry), math.radians(rz)), 'XYZ').to_matrix()


def solve_ik_pose(hips_shift=Vector((0, 0, 0)), body_rots=None, ankle_targets=None, foot_rots=None, limb_normals=None):
    body_rots = body_rots or {}
    ankle_targets = ankle_targets or {}
    foot_rots = foot_rots or {}
    limb_normals = limb_normals or {}

    world = {}
    for name in ('hips', 'spine', 'chest', 'head', 'throat'):
        parent = BONES[name][2]
        local = rot_mat(*body_rots.get(name, (0, 0, 0)))
        if parent is None:
            world[name] = T(J[name] + hips_shift) @ local.to_4x4()
        else:
            p_head = BONES[parent][0]
            offset = BONES[name][0] - p_head
            world[name] = world[parent] @ T(offset) @ local.to_4x4()

    for key, ch in CHAINS.items():
        parent = ch['parent']
        b0, b1, b2 = ch['bones']
        p_head = BONES[parent][0]
        hip = world[parent] @ (J[ch['j0']] - p_head)
        target_ankle = ankle_targets.get(key, J[ch['j2']])
        d = target_ankle - hip
        l1, l2 = ch['l1'], ch['l2']
        clamped = max(abs(l1 - l2) + 1e-4, min(0.998 * (l1 + l2), d.length))
        dh = d.normalized()
        a = (l1 * l1 - l2 * l2 + clamped * clamped) / (2 * clamped)
        b = math.sqrt(max(0.0, l1 * l1 - a * a))
        hint = limb_normals.get(key, world[parent].to_3x3() @ ch['normal'])
        n = (hint - dh * hint.dot(dh))
        if n.length < 1e-6:
            n = Vector((0, 0, 1)).cross(dh).normalized()
        else:
            n.normalize()
        knee = hip + dh * a + n.cross(dh) * b * ch['bend']
        end = hip + dh * clamped

        rest_hip, rest_knee, rest_ankle = J[ch['j0']], J[ch['j1']], J[ch['j2']]
        world[b0] = T(hip) @ (basis(knee - hip, n) @ basis(rest_knee - rest_hip, ch['normal']).transposed()).to_4x4()
        world[b1] = T(knee) @ (basis(end - knee, n) @ basis(rest_ankle - rest_knee, ch['normal']).transposed()).to_4x4()
        f_rot = rot_mat(*foot_rots.get(key, (0, 0, 0)))
        world[b2] = T(end) @ f_rot.to_4x4()

    return {name: world[name] @ T(-BONES[name][0]) for name in NAMES}


def apply_skins(obj, skins):
    rest = np.array([v.co[:] for v in obj.data.vertices])
    mats = np.array([np.array(skins[n]) for n in NAMES])
    w = WEIGHTS[obj.name]
    return np.einsum('vb,bij,vj->vi', w, mats[:, :3, :3], rest) + w @ mats[:, :3, 3]


# Build our 3 expressive poses:
# 1) `crouch`: pelvis & chest dip down toward the ground while all 4 feet remain planted flat on Z = 0!
crouch_skins = solve_ik_pose(
    hips_shift=Vector((-0.012 * LENGTH, 0.0, -0.17 * height)),
    body_rots={
        'hips': (0, +8, 0),    # pelvis dips, spine coils
        'spine': (0, -6, 0),
        'chest': (0, -10, 0),  # chest aims slightly up, coiled to spring!
        'head': (0, -8, 0),
    },
)

# 2) `leap`: full airborne frog jump! Hind legs kick straight back behind the hips, forelegs reach forward & up!
leap_ankles = {}
leap_foot_rots = {}
leap_normals = {}
for s_name, s in (('L', 1.0), ('R', -1.0)):
    hip_pos = J[f'hip.{s_name}']
    hind_len = CHAINS[f'hind.{s_name}']['l1'] + CHAINS[f'hind.{s_name}']['l2']
    # Kick hind ankle straight backward (-X) and slightly down/outward to 92% of full leg extension!
    leap_ankles[f'hind.{s_name}'] = hip_pos + Vector((-0.88 * hind_len, 0.04 * LENGTH * s, -0.14 * hind_len))
    leap_normals[f'hind.{s_name}'] = Vector((0.0, 0.85 * s, 0.52)).normalized()
    # Point the webbed hind toes backward (-X) in a streamlined kick! (rest foot points +X/+Y, so yaw ~145 deg back + pitch)
    leap_foot_rots[f'hind.{s_name}'] = (15 * s, -22, 145 * s)

    sh_pos = J[f'shoulder.{s_name}']
    fore_len = CHAINS[f'fore.{s_name}']['l1'] + CHAINS[f'fore.{s_name}']['l2']
    # Reach front hands forward (+X) and up (+Z) ahead of the chest!
    leap_ankles[f'fore.{s_name}'] = sh_pos + Vector((+0.74 * fore_len, 0.02 * LENGTH * s, -0.18 * fore_len))
    leap_normals[f'fore.{s_name}'] = Vector((-0.2, 0.9 * s, -0.3)).normalized()
    leap_foot_rots[f'fore.{s_name}'] = (0, +18, -10 * s)

leap_skins = solve_ik_pose(
    hips_shift=Vector((+0.02 * LENGTH, 0.0, +0.06 * height)),
    body_rots={
        'hips': (0, -6, 0),
        'spine': (0, +4, 0),
        'chest': (0, +4, 0),
        'head': (0, -6, 0),
    },
    ankle_targets=leap_ankles,
    foot_rots=leap_foot_rots,
    limb_normals=leap_normals,
)


def make_breathe(obj):
    # Organic frog vocal-sac / throat pouch expansion + gentle rib breath, keeping feet 100% still
    rest = np.array([v.co[:] for v in obj.data.vertices])
    out = rest.copy()
    throat_c = M_pt(+0.22, 0.0, -0.04)
    r_throat = 0.30 * LENGTH
    for i, co in enumerate(rest):
        if co[2] < 0.06 * height:
            continue
        v = Vector(co)
        d = (v - throat_c).length
        if d < r_throat and v.x > J['chest'].x * 0.4 and v.z < J['head'].z * 0.92:
            k = (1.0 - d / r_throat) ** 1.6
            # Puff cream vocal sac outward (+X and -Z, and rounder in Y)
            out[i, 0] += 0.045 * LENGTH * k
            out[i, 2] -= 0.055 * LENGTH * k
            out[i, 1] += 0.026 * LENGTH * k * (v.y / max(0.03 * LENGTH, abs(v.y)))
        # Subtle flank breath
        flank_d = abs(v.x - J['spine'].x) / (0.35 * LENGTH)
        if flank_d < 1.0 and v.z > 0.15 * height:
            fk = (1.0 - flank_d ** 2) * 0.014 * LENGTH
            out[i, 1] += fk * (1.0 if v.y >= 0 else -1.0)
            out[i, 2] += fk * 0.6
    return out


# ---- 6. Freeze shape keys (`leap`, `crouch`, `breathe`) and enforce Z >= 0 on grounded poses ----
POSES = {}
for obj in (near, far):
    obj.shape_key_add(name='Basis', from_mix=False)
    crouch_co = apply_skins(obj, crouch_skins)
    crouch_co[:, 2] = np.maximum(0.0, crouch_co[:, 2])  # never sink below floor Z = 0
    leap_co = apply_skins(obj, leap_skins)
    breathe_co = make_breathe(obj)
    breathe_co[:, 2] = np.maximum(0.0, breathe_co[:, 2])
    POSES[obj.name] = {'leap': leap_co, 'crouch': crouch_co, 'breathe': breathe_co}
    for key_name, coords in POSES[obj.name].items():
        sk = obj.shape_key_add(name=key_name, from_mix=False)
        sk.data.foreach_set('co', coords.astype(np.float32).ravel())
        sk.value = 0.0

# Optional preview render of rest, crouch, leap, and breathe on the actual low-poly `near` mesh!
preview_objs = []
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    high.hide_render = True
    middle.hide_render = True
    far.hide_render = True
    rig.hide_render = True
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 640
    scene.render.resolution_y = 520
    world_bg = bpy.data.worlds.new('PreviewWorld')
    scene.world = world_bg
    bg = world_bg.node_tree.nodes.get('Background')
    if bg:
        bg.inputs[0].default_value = (0.93, 0.94, 0.91, 1.0)
        bg.inputs[1].default_value = 1.15
    for lname, rot, energy in [('Key', (0.85, 0.2, 0.6), 2.6), ('Fill', (0.9, -0.4, -2.1), 1.1)]:
        ld = bpy.data.lights.new(lname, type='SUN')
        ld.energy = energy
        lo = bpy.data.objects.new(lname, ld)
        lo.rotation_euler = rot
        scene.collection.objects.link(lo)
        preview_objs.append(lo)
    cam_d = bpy.data.cameras.new('PreviewCam')
    cam_d.type = 'ORTHO'
    cam_d.ortho_scale = LENGTH * 1.85
    cam_o = bpy.data.objects.new('PreviewCam', cam_d)
    scene.collection.objects.link(cam_o)
    preview_objs.append(cam_o)
    scene.camera = cam_o
    target_pt = Vector((-0.03 * LENGTH, 0, 0.42 * height))
    cam_pos = target_pt + Vector((1.5 * LENGTH, -2.1 * LENGTH, 0.95 * LENGTH))
    cam_o.location = cam_pos
    cam_o.rotation_euler = (target_pt - cam_pos).normalized().to_track_quat('-Z', 'Y').to_euler()

    for tag, weights in [('rest', {}), ('crouch', {'crouch': 1.0}), ('leap', {'leap': 1.0}), ('breathe', {'breathe': 1.0})]:
        for kb in near.data.shape_keys.key_blocks:
            if kb.name != 'Basis':
                kb.value = weights.get(kb.name, 0.0)
        scene.render.filepath = os.path.join(PREVIEW, f'frog-lowpoly-{tag}.png')
        bpy.ops.render.render(write_still=True)
    for kb in near.data.shape_keys.key_blocks:
        kb.value = 0.0

# ---- 7. Clean up helper objects and export GLB ----
for helper in (middle, rig, high, *preview_objs):
    bpy.data.objects.remove(helper)
for obj in (near, far):
    obj.data.name = obj.name
    obj.hide_render = False

select_only(near, far)
options = dict(
    filepath=OUT, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
    export_animations=False, export_skins=False, export_morph=True, export_morph_normal=True,
    export_morph_tangent=False, export_image_format='JPEG', export_jpeg_quality=92,
    export_extras=False, export_try_sparse_sk=False, export_tangents=False, export_materials='EXPORT',
)
known_exp = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
bpy.ops.export_scene.gltf(**{k: v for k, v in options.items() if k in known_exp})

near_zs = [v.co.z for v in near.data.vertices]
near_xs = [v.co.x for v in near.data.vertices]
near_ys = [v.co.y for v in near.data.vertices]
report_data = {
    'length': round(max(near_xs) - min(near_xs), 4),
    'width': round(max(near_ys) - min(near_ys), 4),
    'height': round(max(near_zs) - min(near_zs), 4),
    'pivot': 0,
    'morphs': ['leap', 'crouch', 'breathe'],
    'near': {'triangles': tris(near), 'vertices': len(near.data.vertices)},
    'far': {'triangles': tris(far), 'vertices': len(far.data.vertices)},
}
with open(REPORT, 'w', encoding='utf-8') as f:
    json.dump(report_data, f, indent=2)
log('wrote', OUT, report_data)
