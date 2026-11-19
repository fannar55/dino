# Blender background script: converts raw AssetHub / Tripo3D critter GLBs (`snigill`, `bjalla`, `skjaldbaka`, `fugl`)
# into low-poly, UV-baked, morph/wing-ready game assets (`near` + `far` LODs sharing one 512px JPEG atlas).
# Called by `remake/tools/prep-critter.mjs`:
#   blender -b --factory-startup --python remake/tools/blender-critter.py -- --kind <kind> <in.glb> <out.glb> [options]
import json
import math
import os
import sys
import tempfile

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:]


def opt(name, fallback=None):
    flag = f'--{name}'
    return argv[argv.index(flag) + 1] if flag in argv else fallback


# Positional args (the two paths that aren't flags or flag values)
FLAGS = {'--kind', '--length', '--wingspan', '--near', '--far', '--tex', '--report', '--preview'}
pos = []
skip = False
for i, tok in enumerate(argv):
    if skip:
        skip = False
        continue
    if tok in FLAGS:
        skip = True
        continue
    pos.append(tok)

SRC, OUT = pos[0], pos[1]
KIND = opt('kind')
if KIND not in ('snigill', 'bjalla', 'skjaldbaka', 'fugl'):
    raise SystemExit(f'Unknown --kind {KIND!r}; expected snigill, bjalla, skjaldbaka, or fugl')

DEFAULTS = {
    'snigill':    {'length': 0.22, 'near': 620, 'far': 220, 'tex': 512},
    'bjalla':     {'wingspan': 0.150, 'near': 620, 'far': 220, 'tex': 512},
    'skjaldbaka': {'length': 0.36, 'near': 620, 'far': 220, 'tex': 512},
    'fugl':       {'wingspan': 0.30, 'near': 460, 'far': 170, 'tex': 512},
}[KIND]

NEAR = int(opt('near', DEFAULTS['near']))
FAR = int(opt('far', DEFAULTS['far']))
TEX = int(opt('tex', DEFAULTS['tex']))
REPORT = opt('report', OUT + '.json')
PREVIEW = opt('preview', None)


def log(*a):
    print(f'[{KIND}]', *a, flush=True)


def tris(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def select_only(*objs):
    for o in list(bpy.context.scene.objects):
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    if objs:
        bpy.context.view_layer.objects.active = objs[0]


def smoothstep(edge0, edge1, x):
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def rot_mat(rx=0.0, ry=0.0, rz=0.0):
    return np.array(Euler((math.radians(rx), math.radians(ry), math.radians(rz)), 'XYZ').to_matrix(), dtype=np.float32)


def edge_smooth(obj, weights, passes=2, mix_self=0.6):
    adj = [[] for _ in range(len(obj.data.vertices))]
    for e in obj.data.edges:
        a, b = e.vertices[0], e.vertices[1]
        adj[a].append(b)
        adj[b].append(a)
    out = weights.copy()
    for _ in range(passes):
        prev = out.copy()
        for i, nbrs in enumerate(adj):
            if nbrs:
                out[i] = mix_self * prev[i] + (1.0 - mix_self) * prev[nbrs].mean(axis=0)
    return out


# ---- 1. Import raw Tripo GLB, orient (+X forward, +Z up -> +Y up in glTF), scale & ground on Z = 0 ----
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

raw_co = np.array([v.co[:] for v in high.data.vertices], dtype=np.float32)
raw_min = raw_co.min(axis=0)
raw_max = raw_co.max(axis=0)
raw_span = raw_max - raw_min

if opt('wingspan') is not None or ('wingspan' in DEFAULTS and opt('length') is None):
    target_y = float(opt('wingspan', DEFAULTS.get('wingspan', 0.30)))
    scale = target_y / float(raw_span[1])
else:
    target_x = float(opt('length', DEFAULTS.get('length', 0.22)))
    scale = target_x / float(raw_span[0])

raw_mid_x = float(raw_min[0] + raw_max[0]) * 0.5
raw_mid_y = float(raw_min[1] + raw_max[1]) * 0.5
raw_floor = float(raw_min[2])

to_model = Matrix.Translation((-raw_mid_x * scale, -raw_mid_y * scale, -raw_floor * scale)) @ Matrix.Scale(scale, 4)
high.data.transform(to_model)

LENGTH = float(raw_span[0]) * scale
WIDTH = float(raw_span[1]) * scale
HEIGHT = float(raw_span[2]) * scale
log(f'high: {len(high.data.vertices)} verts, {tris(high)} tris -> scale={scale:.4f}: L={LENGTH:.3f}m W={WIDTH:.3f}m H={HEIGHT:.3f}m')


def to_raw_np(coords):
    """Maps model-space coords back to raw Tripo coords where anatomy thresholds are normalized."""
    out = np.empty_like(coords)
    out[:, 0] = coords[:, 0] / scale + raw_mid_x
    out[:, 1] = coords[:, 1] / scale + raw_mid_y
    out[:, 2] = coords[:, 2] / scale + raw_floor
    return out


def M_pt(rx, ry, rz):
    return np.array([(rx - raw_mid_x) * scale, (ry - raw_mid_y) * scale, (rz - raw_floor) * scale], dtype=np.float32)


def is_detail(co):
    rx = co.x / scale + raw_mid_x
    ry = co.y / scale + raw_mid_y
    rz = co.z / scale + raw_floor
    if KIND == 'snigill':
        # Preserve head, smile, and eye stalks
        return rx > 0.16
    if KIND == 'bjalla':
        # Preserve head, big eyes, and antennae
        return rx > 0.16 and rz > -0.14
    if KIND == 'skjaldbaka':
        # Preserve head, eyes, smile, and toes
        return (rx > 0.24 and rz > -0.06) or rz < -0.19
    if KIND == 'fugl':
        # Preserve head, eyes, beak, and wing feather tips
        return (rx > 0.16 and abs(ry) < 0.15 and rz > 0.02) or abs(ry) > 0.36
    return False


# ---- 2. Weld & Decimate to crisp low-poly (`near` and `far`) ----
def welded_copy(name):
    obj = high.copy()
    obj.data = high.data.copy()
    obj.name = obj.data.name = name
    bpy.context.scene.collection.objects.link(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=2.5e-4 * max(LENGTH, WIDTH))
    boundary_verts = [v for v in bm.verts if any(e.is_boundary for e in v.link_edges)]
    if boundary_verts:
        bmesh.ops.remove_doubles(bm, verts=boundary_verts, dist=2.5e-3 * max(LENGTH, WIDTH))
    bm.to_mesh(obj.data)
    bm.free()
    if obj.data.has_custom_normals:
        with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj]):
            bpy.ops.mesh.customdata_custom_splitnormals_clear()
    return obj


def collapse(obj, ratio):
    for g in list(obj.vertex_groups):
        obj.vertex_groups.remove(g)
    mod = obj.modifiers.new('decimate', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = max(0.0, min(1.0, ratio))
    mod.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    old = obj.data
    obj.modifiers.remove(mod)
    obj.data = mesh
    bpy.data.meshes.remove(old)


base_weld = welded_copy('base_weld')
if tris(base_weld) > 25000:
    collapse(base_weld, 25000 / tris(base_weld))
log(f'base_weld: {tris(base_weld)} triangles')


def decimate(name, target, detail_preserve=True):
    obj = base_weld.copy()
    obj.data = base_weld.data.copy()
    obj.name = obj.data.name = name
    bpy.context.scene.collection.objects.link(obj)
    if detail_preserve:
        det = [v.index for v in obj.data.vertices if is_detail(v.co)]
        other = [v.index for v in obj.data.vertices if not is_detail(v.co)]
        if 0 < len(det) < len(obj.data.vertices):
            vg = obj.vertex_groups.new(name='collapse_w')
            vg.add(det, 0.45, 'REPLACE')
            vg.add(other, 1.0, 'REPLACE')
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
    for v in obj.data.vertices:
        if v.co.z < 0.0:
            v.co.z = 0.0
    log(f'{name}: {tris(obj)} triangles, {len(obj.data.vertices)} vertices')
    return obj


near = decimate('near', NEAR, True)
far = decimate('far', FAR, False)
bpy.data.objects.remove(base_weld)

# ---- 3. UV unwrap `near` + `far` into one shared 512px atlas and bake diffuse color from `high` ----
FAR_SHARE = 0.42
DETAIL_UV = 1.4
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
        grow = DETAIL_UV if sum(is_detail(f.calc_center_median()) for f in faces) > len(faces) / 2 else 1.0
        for l in loops:
            l[uv].uv = (centre + (l[uv].uv - centre) * grow) * share
    bm.to_mesh(obj.data)
    bm.free()


unwrap(near, 1.0)
unwrap(far, FAR_SHARE)
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


ref_size = max(LENGTH, WIDTH)
near_pixels = bake(near, 0.025 * ref_size, 0.10 * ref_size)
far_pixels = bake(far, 0.045 * ref_size, 0.14 * ref_size)
near_mask = uv_mask(near, 1)
far_mask = uv_mask(far, 1)
rgb = np.zeros((TEX, TEX, 3), np.float32)
rgb[far_mask] = far_pixels[far_mask][:, :3]
rgb[near_mask] = near_pixels[near_mask][:, :3]
valid = (near_mask & reached(near_pixels)) | (far_mask & reached(far_pixels))
missed = int(((near_mask | far_mask) & ~valid).sum())
paint = np.ones((TEX, TEX, 4), np.float32)
paint[..., :3] = fill(rgb, valid)
final = bpy.data.images.new(KIND, TEX, TEX, alpha=False)
final.colorspace_settings.name = 'sRGB'
final.pixels.foreach_set(paint.ravel())
paint_file = os.path.join(tempfile.mkdtemp(prefix=f'{KIND}-'), f'{KIND}.png')
final.filepath_raw = paint_file
final.file_format = 'PNG'
final.save()
log(f'baked {TEX}px atlas: {(near_mask | far_mask).mean() * 100:.0f}% used, {missed} missed pixels filled')

material = bpy.data.materials.new(KIND)
nodes = material.node_tree.nodes
bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
tex_node = nodes.new('ShaderNodeTexImage')
tex_node.image = final
material.node_tree.links.new(tex_node.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Metallic'].default_value = 0.0
bsdf.inputs['Roughness'].default_value = 0.82
material.use_backface_culling = KIND != 'fugl'
for obj in (near, far):
    obj.data.materials.clear()
    obj.data.materials.append(material)

# ---- 4. Species-specific Rigging / Morph Poses / Wing Tagging ----
MORPH_NAMES = []
PIVOT = 0.0
WING_SPEC = None


def build_snigill_poses(obj):
    rest = np.array([v.co[:] for v in obj.data.vertices], dtype=np.float32)
    raw = to_raw_np(rest)
    rx, ry, rz = raw[:, 0], raw[:, 1], raw[:, 2]

    # Core shell mask (100% rigid orange-and-cream shell over the back, right down to its front & side aperture lip)
    is_shell = (rx > -0.395) & (rx < 0.176) & (rz > -0.215) & (np.abs(ry) < 0.30)
    w_soft = (~is_shell).astype(np.float32)
    w_soft_sm = edge_smooth(obj, w_soft, passes=2, mix_self=0.6)
    w_soft_sm[is_shell] = 0.0

    # `hide`: eye stalks retract into head, head draws smoothly into the front shell opening, tail tucks under rear shell
    hide_co = rest.copy()
    stalk_w = smoothstep(0.18, 0.24, rx) * smoothstep(0.04, 0.14, rz)
    stalk_base = M_pt(0.26, 0.0, -0.05)
    for i in range(len(rest)):
        if stalk_w[i] > 1e-4:
            target_s = np.array([stalk_base[0], rest[i, 1] * 0.55, stalk_base[2]], dtype=np.float32)
            hide_co[i] = hide_co[i] * (1.0 - 0.82 * stalk_w[i]) + target_s * (0.82 * stalk_w[i])

    front_pocket = M_pt(0.075, 0.0, -0.205)
    rear_pocket = M_pt(-0.14, 0.0, -0.275)
    shell_drop = 0.014  # m: shell settles snugly toward the ground over its tucked foot
    for i in range(len(rest)):
        ws = float(w_soft_sm[i])
        if ws > 1e-4:
            if rx[i] >= 0.0:
                target = np.array([
                    front_pocket[0] + (hide_co[i, 0] - front_pocket[0]) * 0.22,
                    hide_co[i, 1] * 0.45,
                    max(0.004, front_pocket[2] + (hide_co[i, 2] - front_pocket[2]) * 0.25),
                ], dtype=np.float32)
            else:
                target = np.array([
                    rear_pocket[0] + (hide_co[i, 0] - rear_pocket[0]) * 0.35,
                    hide_co[i, 1] * 0.50,
                    max(0.0, rear_pocket[2] + (hide_co[i, 2] - rear_pocket[2]) * 0.25),
                ], dtype=np.float32)
            hide_co[i] = hide_co[i] * (1.0 - 0.88 * ws) + target * (0.88 * ws)

    # Gently smooth only the tucked soft tissue so the aperture fold has zero sharp creases, keeping shell 100% untouched
    hide_sm = edge_smooth(obj, hide_co, passes=2, mix_self=0.65)
    for i in range(len(rest)):
        ws = float(w_soft_sm[i])
        hide_co[i] = hide_co[i] * (1.0 - ws) + hide_sm[i] * ws
        hide_co[i, 2] = max(0.0, hide_co[i, 2] - shell_drop)

    # `sway`: gentle curious eye-stalk bob + head breath at idle
    sway_co = rest.copy()
    head_w = smoothstep(0.15, 0.25, rx)
    pivot_neck = M_pt(0.16, 0.0, -0.10)
    r_head = rot_mat(rx=4.0, ry=-5.0, rz=7.0)
    for i in range(len(rest)):
        wh = float(head_w[i])
        if wh > 1e-4:
            rel = rest[i] - pivot_neck
            turned = pivot_neck + r_head @ rel
            sway_co[i] = rest[i] * (1.0 - wh) + turned * wh
        ws_st = float(stalk_w[i])
        if ws_st > 1e-4:
            sway_co[i, 0] += 0.025 * LENGTH * ws_st
            sway_co[i, 1] += 0.018 * LENGTH * ws_st * (1.0 if ry[i] >= 0 else -1.0)
        sway_co[i, 2] = max(0.0, sway_co[i, 2])

    return {'hide': hide_co, 'sway': sway_co}


def build_bjalla_poses(obj):
    rest = np.array([v.co[:] for v in obj.data.vertices], dtype=np.float32)
    raw = to_raw_np(rest)
    rx, ry, rz = raw[:, 0], raw[:, 1], raw[:, 2]

    # Identify leg vertices vs central body/shell/head
    out_y = smoothstep(0.205, 0.255, np.abs(ry))
    low_z = 1.0 - smoothstep(-0.155, -0.095, rz)
    deep_z = 1.0 - smoothstep(-0.205, -0.165, rz)
    w_leg_all = np.clip(np.maximum(out_y * low_z, deep_z * smoothstep(0.14, 0.20, np.abs(ry))), 0.0, 1.0)
    w_leg_all = edge_smooth(obj, w_leg_all, passes=2, mix_self=0.65)
    # Keep upper shell & head 100% rigid
    w_leg_all[rz > -0.075] = 0.0

    # Partition leg weight across the 6 legs: front (rx > 0.15), mid (-0.15..0.15), hind (rx < -0.15), L (ry > 0), R (ry < 0)
    hip_x = [0.27, 0.00, -0.26]
    kick_a = rest.copy()
    kick_b = rest.copy()

    for i in range(len(rest)):
        wl = float(w_leg_all[i])
        if wl < 1e-4:
            continue
        leg_idx = 0 if rx[i] > 0.15 else (2 if rx[i] < -0.15 else 1)
        side = 1.0 if ry[i] >= 0.0 else -1.0  # +1 = +Y (left), -1 = -Y (right)
        hip = M_pt(hip_x[leg_idx], 0.215 * side, -0.125)
        # Alternating insect tripod gait: (0,L), (1,R), (2,L) vs (0,R), (1,L), (2,R)
        in_tripod_a = (leg_idx % 2 == 0 and side < 0) or (leg_idx % 2 == 1 and side > 0)

        # Swing leg toward -Z_blender (up into the air when beetle is on its back!) and sweep forward/back along X
        # Around +X axis: for side > 0 (+Y), positive rx_deg moves +Y -> +Z, negative rx_deg moves +Y -> -Z (toward feet/air!)
        up_roll = -30.0 * side
        down_roll = +10.0 * side
        sweep_fwd = +20.0 * side
        sweep_back = -14.0 * side

        mat_up = rot_mat(rx=up_roll, ry=0.0, rz=sweep_fwd)
        mat_dn = rot_mat(rx=down_roll, ry=0.0, rz=sweep_back)

        rel = rest[i] - hip
        pos_up = hip + mat_up @ rel
        pos_dn = hip + mat_dn @ rel
        if in_tripod_a:
            kick_a[i] = rest[i] * (1.0 - wl) + pos_up * wl
            kick_b[i] = rest[i] * (1.0 - wl) + pos_dn * wl
        else:
            kick_a[i] = rest[i] * (1.0 - wl) + pos_dn * wl
            kick_b[i] = rest[i] * (1.0 - wl) + pos_up * wl

    return {'kickA': kick_a, 'kickB': kick_b}


def build_skjaldbaka_poses(obj):
    rest = np.array([v.co[:] for v in obj.data.vertices], dtype=np.float32)
    raw = to_raw_np(rest)
    rx, ry, rz = raw[:, 0], raw[:, 1], raw[:, 2]

    # 1) Head & neck weight: 1.0 on entire head (rx >= 0.295) so eyes/smile never deform, smooth ramp across neck (0.20..0.295)
    w_neck = smoothstep(0.195, 0.295, rx) * (1.0 - smoothstep(0.115, 0.155, np.abs(ry))) * smoothstep(-0.085, -0.025, rz)
    w_neck_sm = edge_smooth(obj, w_neck, passes=2, mix_self=0.7)
    w_neck_sm[rx > 0.305] = 1.0  # keep facial features 100% rigid
    # Protect carapace lip (rz > 0.085 & rx < 0.275)
    carapace_lip = (rx < 0.275) & (rz > 0.075)
    w_neck_sm[carapace_lip] = 0.0

    # 2) Four legs weight: below shell rim (rz < -0.055) and outside plastron belly (|ry| > 0.105)
    w_legs = (1.0 - smoothstep(-0.10, -0.045, rz)) * smoothstep(0.095, 0.145, np.abs(ry)) * (1.0 - smoothstep(0.28, 0.32, np.abs(rx)))
    w_legs = edge_smooth(obj, w_legs, passes=2, mix_self=0.65)
    w_legs[rz > -0.03] = 0.0

    # 3) Tail weight: rear tip (rx < -0.285)
    w_tail = (1.0 - smoothstep(-0.34, -0.275, rx)) * (1.0 - smoothstep(0.075, 0.115, np.abs(ry))) * (1.0 - smoothstep(0.02, 0.06, rz))
    w_tail = edge_smooth(obj, w_tail, passes=1, mix_self=0.7)

    neck_pivot = M_pt(0.215, 0.0, 0.015)

    # `look`: turns head curiously to its left (+Y in Blender = -Z left in glTF) and lifts chin slightly
    look_co = rest.copy()
    r_look = rot_mat(rx=4.0, ry=-8.0, rz=24.0)
    for i in range(len(rest)):
        wn = float(w_neck_sm[i])
        if wn > 1e-4:
            turned = neck_pivot + r_look @ (rest[i] - neck_pivot)
            look_co[i] = rest[i] * (1.0 - wn) + turned * wn
        look_co[i, 2] = max(0.0, look_co[i, 2])

    # `stretch`: stretches neck forward & high up to answer Flugeðla in Kafli 4 while all 4 feet stay planted on Z = 0!
    stretch_co = rest.copy()
    r_stretch = rot_mat(rx=0.0, ry=-24.0, rz=0.0)
    stretch_shift = np.array([0.055 * LENGTH, 0.0, 0.045 * LENGTH], dtype=np.float32)
    for i in range(len(rest)):
        wn = float(w_neck_sm[i])
        if wn > 1e-4:
            lifted = neck_pivot + r_stretch @ (rest[i] - neck_pivot) + stretch_shift * wn
            stretch_co[i] = rest[i] * (1.0 - wn) + lifted * wn
        stretch_co[i, 2] = max(0.0, stretch_co[i, 2])

    # `hide`: retracts head/neck into front shell opening, tucks 4 legs & tail up under carapace, and settles plastron onto Z = 0!
    hide_co = rest.copy()
    head_pocket = M_pt(0.115, 0.0, -0.005)
    tail_pocket = M_pt(-0.22, 0.0, -0.03)
    plastron_drop = (0.2382 - 0.151) * scale * 0.90  # drops shell cleanly onto its belly as legs tuck in
    for i in range(len(rest)):
        wn = float(w_neck_sm[i])
        wl = float(w_legs[i])
        wt = float(w_tail[i])
        p = rest[i].copy()
        if wn > 1e-4:
            tucked_h = head_pocket + (p - head_pocket) * np.array([0.32, 0.62, 0.58], dtype=np.float32)
            p = p * (1.0 - 0.92 * wn) + tucked_h * (0.92 * wn)
        if wl > 1e-4:
            leg_x = 0.15 if rx[i] >= 0 else -0.14
            leg_s = 1.0 if ry[i] >= 0 else -1.0
            leg_pocket = M_pt(leg_x, 0.125 * leg_s, -0.075)
            tucked_l = leg_pocket + (p - leg_pocket) * np.array([0.50, 0.48, 0.30], dtype=np.float32)
            p = p * (1.0 - 0.92 * wl) + tucked_l * (0.92 * wl)
        if wt > 1e-4:
            tucked_t = tail_pocket + (p - tail_pocket) * 0.35
            p = p * (1.0 - 0.90 * wt) + tucked_t * (0.90 * wt)
        p[2] = max(0.0, p[2] - plastron_drop)
        hide_co[i] = p

    return {'hide': hide_co, 'look': look_co, 'stretch': stretch_co}


if KIND == 'snigill':
    MORPH_NAMES = ['hide', 'sway']
    for obj in (near, far):
        obj.shape_key_add(name='Basis', from_mix=False)
        poses = build_snigill_poses(obj)
        for kname in MORPH_NAMES:
            sk = obj.shape_key_add(name=kname, from_mix=False)
            sk.data.foreach_set('co', poses[kname].astype(np.float32).ravel())
            sk.value = 0.0

elif KIND == 'bjalla':
    MORPH_NAMES = ['kickA', 'kickB']
    PIVOT = 0.052  # matches BEETLE_SIZE.feet[0] in models.js!
    for obj in (near, far):
        obj.shape_key_add(name='Basis', from_mix=False)
        poses = build_bjalla_poses(obj)
        for kname in MORPH_NAMES:
            sk = obj.shape_key_add(name=kname, from_mix=False)
            sk.data.foreach_set('co', poses[kname].astype(np.float32).ravel())
            sk.value = 0.0

elif KIND == 'skjaldbaka':
    MORPH_NAMES = ['hide', 'look', 'stretch']
    for obj in (near, far):
        obj.shape_key_add(name='Basis', from_mix=False)
        poses = build_skjaldbaka_poses(obj)
        for kname in MORPH_NAMES:
            sk = obj.shape_key_add(name=kname, from_mix=False)
            sk.data.foreach_set('co', poses[kname].astype(np.float32).ravel())
            sk.value = 0.0

elif KIND == 'fugl':
    MORPH_NAMES = []
    # Exact glTF-space wing hinge & fold parameters (Blender +X -> glTF +X, Blender +Z -> glTF +Y, Blender -Y -> glTF +Z)
    sx = round((0.115 - raw_mid_x) * scale, 4)
    sy = round((0.045 - raw_floor) * scale, 4)
    sz = round(0.146 * scale, 4)
    cut_x = round((-0.025 - raw_mid_x) * scale, 4)
    cut_y = round((-0.095 - raw_floor) * scale, 4)
    WING_SPEC = {
        'shoulder': [sx, sy, sz],
        'fold': {
            'rotation': [round(math.pi / 2, 6), 0.0, -1.08],
            'offset': [-0.004, -0.008, 0.002],
        },
        'cutX': cut_x,
        'cutY': cut_y,
        'cutZ': sz,
    }
    log('wing spec:', WING_SPEC)

# ---- 5. Preview Renders (on actual low-poly `near` mesh before shifting pivot) ----
preview_objs = []
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    high.hide_render = True
    far.hide_render = True
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
    span_max = max(LENGTH, WIDTH)
    cam_d.ortho_scale = span_max * 1.55
    cam_o = bpy.data.objects.new('PreviewCam', cam_d)
    scene.collection.objects.link(cam_o)
    preview_objs.append(cam_o)
    scene.camera = cam_o
    target_pt = Vector((0.0, 0.0, 0.45 * HEIGHT))
    cam_pos = target_pt + Vector((1.55 * span_max, -1.95 * span_max, 0.95 * span_max))
    cam_o.location = cam_pos
    cam_o.rotation_euler = (target_pt - cam_pos).normalized().to_track_quat('-Z', 'Y').to_euler()

    if KIND == 'fugl':
        # Simulate exact `birdMaterial` GLSL vertex shader in Blender to visually verify both folded & flapping poses!
        rest_bl = np.array([v.co[:] for v in near.data.vertices], dtype=np.float32)
        sx, sy, sz = WING_SPEC['shoulder']
        rx0, _, rz2 = WING_SPEC['fold']['rotation']
        ox, oy, oz = WING_SPEC['fold']['offset']
        # Three.js makeRotationZ(rz2) * makeRotationX(rx0)
        c0, s0 = math.cos(rx0), math.sin(rx0)
        c2, s2 = math.cos(rz2), math.sin(rz2)
        mx = np.array([[1, 0, 0], [0, c0, -s0], [0, s0, c0]], dtype=np.float32)
        mz = np.array([[c2, -s2, 0], [s2, c2, 0], [0, 0, 1]], dtype=np.float32)
        bird_fold = mz @ mx

        def apply_bird_shader(angle, flight_open):
            out = rest_bl.copy()
            bcos, bsin = math.cos(angle), math.sin(angle)
            for i, (bx, by, bz) in enumerate(rest_bl):
                gx, gy, gz = bx, bz, -by
                if abs(gz) > WING_SPEC['cutZ'] and gx > WING_SPEC['cutX'] and gy > WING_SPEC['cutY']:
                    side = 1.0 if gz > 0 else -1.0
                    piv = np.array([sx, sy, sz * side], dtype=np.float32)
                    rel = np.array([gx - piv[0], gy - piv[1], (gz - piv[2]) * side], dtype=np.float32)
                    flown = np.array([rel[0], rel[1] * bcos - rel[2] * bsin, rel[1] * bsin + rel[2] * bcos], dtype=np.float32)
                    folded = bird_fold @ rel + np.array([ox, oy, oz], dtype=np.float32)
                    w = folded * (1.0 - flight_open) + flown * flight_open
                    w[2] *= side
                    tg = piv + w
                    out[i] = [tg[0], -tg[2], tg[1]]
            return out

        for tag, coords in [
            ('spread', rest_bl),
            ('folded', apply_bird_shader(0.0, 0.0)),
            ('flap', apply_bird_shader(-0.62, 1.0)),
        ]:
            near.data.vertices.foreach_set('co', coords.astype(np.float32).ravel())
            near.data.update()
            scene.render.filepath = os.path.join(PREVIEW, f'fugl-lowpoly-{tag}.png')
            bpy.ops.render.render(write_still=True)
        near.data.vertices.foreach_set('co', rest_bl.astype(np.float32).ravel())
        near.data.update()
    else:
        shots = [('rest', {})] + [(m, {m: 1.0}) for m in MORPH_NAMES]
        for tag, weights in shots:
            for kb in near.data.shape_keys.key_blocks:
                if kb.name != 'Basis':
                    kb.value = weights.get(kb.name, 0.0)
            scene.render.filepath = os.path.join(PREVIEW, f'{KIND}-lowpoly-{tag}.png')
            bpy.ops.render.render(write_still=True)
        for kb in near.data.shape_keys.key_blocks:
            kb.value = 0.0

# ---- 6. Apply local origin pivot shift (for `bjalla`, origin is at Z = +0.052 so rest soles sit at Z = -0.052) ----
if PIVOT != 0.0:
    for obj in (near, far):
        if obj.data.shape_keys:
            for kb in obj.data.shape_keys.key_blocks:
                co = np.empty(len(kb.data) * 3, dtype=np.float32)
                kb.data.foreach_get('co', co)
                co[2::3] -= PIVOT
                kb.data.foreach_set('co', co)
        co_v = np.empty(len(obj.data.vertices) * 3, dtype=np.float32)
        obj.data.vertices.foreach_get('co', co_v)
        co_v[2::3] -= PIVOT
        obj.data.vertices.foreach_set('co', co_v)
        obj.data.update()

    # Verify 360-degree roll clearance against critters.js BEETLE_SIZE formula!
    v_bl = np.array([v.co[:] for v in near.data.vertices], dtype=np.float32)
    y_gl = v_bl[:, 2]
    z_gl = -v_bl[:, 1]
    worst_low = 1e9
    for deg in range(360):
        roll = math.radians(deg)
        clear = max(math.hypot(0.043 * math.cos(roll), 0.052 * math.sin(roll)),
                    0.052 * math.cos(roll) + 0.076 * abs(math.sin(roll)))
        py = max(PIVOT, clear)
        yw = py + y_gl * math.cos(roll) - z_gl * math.sin(roll)
        worst_low = min(worst_low, float(yw.min()))
    log(f'beetle 360-deg roll min world Y = {worst_low:.4f} m (must be > -0.004 m)')
    if worst_low <= -0.0035:
        raise RuntimeError(f'Beetle roll clearance failed: {worst_low:.4f} m <= -0.0035 m')

# ---- 7. Clean up helper objects and export GLB ----
for helper in (high, *preview_objs):
    bpy.data.objects.remove(helper)
for obj in (near, far):
    obj.data.name = obj.name
    obj.hide_render = False

select_only(near, far)
options = dict(
    filepath=OUT, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
    export_animations=False, export_skins=False, export_morph=bool(MORPH_NAMES), export_morph_normal=bool(MORPH_NAMES),
    export_morph_tangent=False, export_image_format='JPEG', export_jpeg_quality=92,
    export_extras=False, export_try_sparse_sk=False, export_tangents=False, export_materials='EXPORT',
)
known_exp = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
bpy.ops.export_scene.gltf(**{k: v for k, v in options.items() if k in known_exp})

near_zs = [v.co.z for v in near.data.vertices]
near_xs = [v.co.x for v in near.data.vertices]
near_ys = [v.co.y for v in near.data.vertices]
report_data = {
    'kind': KIND,
    'length': round(max(near_xs) - min(near_xs), 4),
    'width': round(max(near_ys) - min(near_ys), 4),
    'height': round(max(near_zs) - min(near_zs), 4),
    'minY': round(min(near_zs), 4),
    'pivot': PIVOT,
    'morphs': MORPH_NAMES,
    'wing': WING_SPEC,
    'near': {'triangles': tris(near), 'vertices': len(near.data.vertices)},
    'far': {'triangles': tris(far), 'vertices': len(far.data.vertices)},
}
with open(REPORT, 'w', encoding='utf-8') as f:
    json.dump(report_data, f, indent=2)
log('wrote', OUT, report_data)
