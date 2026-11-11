# Blender background script: Flugeðla's saddle (engine/flier-saddle.js, chapter 4 from scene 5) out of the owner's Tripo model.
# Step 1 of preparing it:
#   "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup
#     --python remake/tools/blender-saddle.py -- in.glb out.glb [length=0.8] [tris=5000] [tex=1024] [turn=0] [seat=auto|x,z]
#     [cut=<y> [front=<x>,<z>,<y>]] [preview=<folder>]
# The owner's v1 (geymsla/tripo/hnakkur-tripo-v1.glb): turn=180 cut=-0.31 front=0.24,0.17,-0.13 length=0.8 tris=8000 tex=1024.
# It joins Tripo's parts into one mesh with one material, welds it (Tripo's parts and seams, as blender-butterfly.py does),
# turns it `turn` degrees about the vertical so that its front (the handlebar) faces +X with +Y up (glTF's axes), scales it to
# `length` metres front to back, puts the origin on the seat (where Egill sits: the lowest point of the seat's top between the
# cantle and the handlebar, on the middle line; or `seat=x,z`, in metres along and across from the middle of the turned, scaled
# model), decimates it to about `tris` triangles, makes its maps `tex` pixels (WebP; the roughness and metal maps go, it is matte
# leather) and writes a GLB. `preview` renders it from the front, the side and above (Workbench) to check the turn and the seat.
# Step 2 is node remake/tools/saddle-fit.mjs, which fits it to her back and binds it to her bones.
import json
import math
import os
import sys
import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.geometry import intersect_point_line

argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
def option(name, fallback):
    for a in argv[2:]:
        if a.startswith(name + '='):
            return a[len(name) + 1:]
    return fallback
LENGTH = float(option('length', 0.8))
TRIS = int(option('tris', 5000))
TEX = int(option('tex', 1024))
TURN = float(option('turn', 0))
SEAT = option('seat', 'auto')
PREVIEW = option('preview', None)
# The girth off, where it would go through her (the owner's v1: it hangs from the pad's front into her chest): everything lower than
# `cut` metres under the seat, and ahead of `front`=x along, within z across the middle, everything lower than y (where the girth comes
# down from under the pad's front edge). The ends left are capped.
CUT = option('cut', None)
FRONT = option('front', None)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
scene = bpy.context.scene
parts = [o for o in scene.objects if o.type == 'MESH']
tris = lambda o: sum(len(p.vertices) - 2 for p in o.data.polygons)
materials = [m for o in parts for m in o.data.materials if m]
print(f'[saddle] {len(parts)} parts, {sum(tris(o) for o in parts)} triangles, {len({m.name for m in materials})} materials')
material = materials[0]

# One mesh: each part keeps a material slot of its own while it is welded and decimated (a seam is never blurred away), then
# they all take the one material.
for o in parts:
    tag = bpy.data.materials.new(f'part:{o.name}')
    keep = o.data.materials[0] if o.data.materials else None
    o.data.materials.clear()
    o.data.materials.append(tag)
    o['material'] = keep.name if keep else ''
bpy.ops.object.select_all(action='DESELECT')
for o in parts:
    o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
if len(parts) > 1:
    bpy.ops.object.join()
saddle = bpy.context.view_layer.objects.active
saddle.name = saddle.data.name = 'Hnakkur'
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

def split_t_junctions(bm, dist):
    edges = [e for e in bm.edges if e.is_boundary]
    if not edges:
        return 0
    size = max(e.calc_length() for e in edges)
    grid = {}
    cell = lambda co: (int(co.x // size), int(co.y // size), int(co.z // size))
    def register(e):
        grid.setdefault(cell((e.verts[0].co + e.verts[1].co) / 2), []).append(e)
    for e in edges:
        register(e)
    count = 0
    for v in [v for v in bm.verts if v.is_boundary]:
        c = cell(v.co)
        found = None
        for key in ((c[0] + i, c[1] + j, c[2] + k) for i in (-1, 0, 1) for j in (-1, 0, 1) for k in (-1, 0, 1)):
            for e in grid.get(key, ()):
                if not e.is_valid or not e.is_boundary or v in e.verts:
                    continue
                point, t = intersect_point_line(v.co, e.verts[0].co, e.verts[1].co)
                if 1e-6 < t < 1 - 1e-6 and (point - v.co).length < dist:
                    found = (e, t)
                    break
            if found:
                break
        if found:
            e, t = found
            _, new = bmesh.utils.edge_split(e, e.verts[0], t)
            new.co = v.co.copy()
            for x in new.link_edges:
                if x.is_boundary:
                    register(x)
            count += 1
    return count

def fill_pinholes(bm, sides):
    uv = bm.loops.layers.uv.active
    faces = bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=sides)['faces']
    for f in faces:
        others = [g for e in f.edges for g in e.link_faces if g is not f and g not in faces]
        if not others:
            continue
        f.material_index = others[0].material_index
        if uv:
            colour = next(l for l in others[0].loops if l.vert in f.verts)[uv].uv.copy()
            for loop in f.loops:
                loop[uv].uv = colour
    return len(faces)

def weld(obj, dist):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    before = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    split = split_t_junctions(bm, dist * 10)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    filled = fill_pinholes(bm, 8)
    open_edges = sum(e.is_boundary for e in bm.edges)
    bm.to_mesh(obj.data)
    bm.free()
    if obj.data.has_custom_normals:
        with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj]):
            bpy.ops.mesh.customdata_custom_splitnormals_clear()
    obj.data.shade_smooth()
    print(f'[saddle] welded {before - len(obj.data.vertices)} vertices, split {split} T-junctions, filled {filled} pinholes, '
          f'{open_edges} open edges left')
    return open_edges

def decimate(obj, target):
    if tris(obj) > target:
        mod = obj.modifiers.new('decimate', 'DECIMATE')
        mod.decimate_type = 'COLLAPSE'
        mod.ratio = target / tris(obj)
        mod.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bm = bmesh.new()  # vertices the collapse left without a face would be exported for nothing
    bm.from_mesh(obj.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    try:  # normals from the welded whole, so the seams between Tripo's parts shade alike
        obj.data.normals_split_custom_set_from_vertices([v.normal[:] for v in obj.data.vertices])
    except (AttributeError, RuntimeError) as error:
        print(f'[saddle] could not keep the normals across the seams: {error}')
    print(f'[saddle] {tris(obj)} triangles')

# Frame. Blender's axes after the import: +Z up, glTF's +X is Blender's +X and glTF's +Z is Blender's -Y. Turn about Z by TURN
# degrees, then scale to LENGTH along X, then the seat to the origin.
world_verts = lambda: [saddle.matrix_world @ v.co for v in saddle.data.vertices]
saddle.matrix_world = Matrix.Rotation(math.radians(TURN), 4, 'Z') @ saddle.matrix_world
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
vs = world_verts()
lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
scale = LENGTH / (hi.x - lo.x)
middle = (lo + hi) / 2
saddle.matrix_world = Matrix.Scale(scale, 4) @ Matrix.Translation(Vector((-middle.x, -middle.y, -lo.z)))
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
print(f'[saddle] turned {TURN} degrees, scaled {scale:.4f}: {LENGTH:.3f} x {(hi.y - lo.y) * scale:.3f} m, {(hi.z - lo.z) * scale:.3f} m high')

closed = weld(saddle, 1e-4 * LENGTH) == 0
decimate(saddle, TRIS)

# The seat: the top of the saddle along its middle line (across within 3 cm of it, glTF z is Blender -y: the highest vertex that
# faces up, every 2 cm along), and on it the lowest place between the highest behind the middle (the cantle) and the highest
# ahead of it (the pommel or the handlebar): the dip Egill sits in.
saddle.data.update()
if SEAT == 'auto':
    vs = [(saddle.matrix_world @ v.co, v.normal) for v in saddle.data.vertices]
    xs = [p.x for p, _ in vs]
    step = 0.02
    profile = []
    x = min(xs)
    while x < max(xs):
        top = [p for p, n in vs if x <= p.x < x + step and abs(p.y) < 0.03 and n.z > 0.5]
        if top:
            profile.append(max(top, key=lambda q: q.z).copy())
        x += step
    behind = [p for p in profile if p.x < 0]
    ahead = [p for p in profile if p.x >= 0]
    if not behind or not ahead:
        raise SystemExit('[saddle] found no seat on the middle line: give seat=x,z')
    cantle = max(behind, key=lambda p: p.z)
    pommel = max(ahead, key=lambda p: p.z)
    between = [p for p in profile if cantle.x < p.x < pommel.x] or [cantle]
    best = min(between, key=lambda p: p.z)
    print(f'[saddle] middle line: cantle {cantle.x:+.3f} at {cantle.z:.3f}, front {pommel.x:+.3f} at {pommel.z:.3f}, seat {best.x:+.3f} at {best.z:.3f}')
    seat = Vector((best.x, 0, best.z))
else:
    along, across = (float(n) for n in SEAT.split(','))
    vs = [saddle.matrix_world @ v.co for v in saddle.data.vertices]
    near = [p for p in vs if abs(p.x - along) < 0.03 and abs(-p.y - across) < 0.03]
    if not near:
        raise SystemExit(f'[saddle] nothing of the saddle at seat={SEAT}')
    seat = Vector((along, -across, max(p.z for p in near)))
saddle.matrix_world = Matrix.Translation(-seat)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

def cut_girth(obj, low, front):
    # (Blender's axes here: x ahead, y her left, z up; the origin on the seat)
    ahead, across, under = front if front else (math.inf, 0, -math.inf)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    # a clean cut all round at `low` (the pad is all above it), then in front what has any corner under `under` (its ragged edge is
    # under the pad's front, on her back)
    before = len(bm.faces)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, low), plane_no=(0, 0, 1), clear_inner=True)
    gone = lambda co: co.x > ahead and abs(co.y) < across and co.z < under
    faces = [f for f in bm.faces if any(gone(v.co) for v in f.verts)]
    bmesh.ops.delete(bm, geom=faces, context='FACES')
    faces = before - len(bm.faces)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    # pieces cut off from the saddle (a buckle without its strap): all but the largest
    seen, pieces = set(), []
    for f in bm.faces:
        if f.index in seen:
            continue
        piece, stack = [], [f]
        seen.add(f.index)
        while stack:
            g = stack.pop()
            piece.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen:
                        seen.add(h.index)
                        stack.append(h)
        pieces.append(piece)
    pieces.sort(key=len, reverse=True)
    stray = [f for piece in pieces[1:] for f in piece]
    bmesh.ops.delete(bm, geom=stray, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    # the cut ends capped: the open edges the cut made (by the faces gone round them), coloured as the strap next to them
    near = lambda co: co.z < low + 0.04 or (co.x > ahead - 0.04 and abs(co.y) < across + 0.04 and co.z < under + 0.04)
    edges = [e for e in bm.edges if e.is_boundary and all(near(v.co) for v in e.verts)]
    uv = bm.loops.layers.uv.active
    caps = bmesh.ops.holes_fill(bm, edges=edges, sides=0)['faces']
    for f in caps:
        others = [g for e in f.edges for g in e.link_faces if g is not f and g not in caps]
        if others and uv:
            colour = next(l for l in others[0].loops if l.vert in f.verts)[uv].uv.copy()
            for loop in f.loops:
                loop[uv].uv = colour
    bmesh.ops.triangulate(bm, faces=caps)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    print(f'[saddle] girth off: {faces} faces cut, {len(stray)} in {len(pieces) - 1} stray pieces, {len(caps)} ends capped; {tris(obj)} triangles')

if CUT:
    cut_girth(saddle, float(CUT), [float(n) for n in FRONT.split(',')] if FRONT else None)
vs = world_verts()
bounds = [[round(min(v[k] for v in vs), 3), round(max(v[k] for v in vs), 3)] for k in range(3)]
print(f'[saddle] seat at {seat.x:+.3f} along, {seat.z:.3f} up from its foot; bounds from the seat (Blender axes) {bounds}')

# One material: the colour and normal maps at TEX pixels, no roughness or metal map, matte.
saddle.data.materials.clear()
saddle.data.materials.append(material)
nodes = material.node_tree.nodes
links = material.node_tree.links
bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
for socket in ('Roughness', 'Metallic'):
    for link in list(bsdf.inputs[socket].links):
        links.remove(link)
bsdf.inputs['Roughness'].default_value = 0.8
bsdf.inputs['Metallic'].default_value = 0.0
normal_map = next((n for n in nodes if n.type == 'NORMAL_MAP'), None)
used = {n.image.name for n in nodes if n.type == 'TEX_IMAGE' and n.image and any(l.to_node == bsdf or l.to_node == normal_map for l in n.outputs[0].links)}
for n in [n for n in nodes if n.type == 'TEX_IMAGE' and (n.image is None or n.image.name not in used)]:
    nodes.remove(n)
for image in list(bpy.data.images):
    if image.name not in used:
        bpy.data.images.remove(image)
    elif max(image.size) > TEX:
        image.scale(TEX, TEX)
material.use_backface_culling = closed
material.name = 'hnakkur'
print(f'[saddle] maps: {[(i.name, i.size[0]) for i in bpy.data.images]}, single-sided: {closed}')

if PREVIEW:
    PREVIEW = os.path.abspath(PREVIEW)  # (Blender reads a relative render path against the .blend file's folder, and there is none)
    os.makedirs(PREVIEW, exist_ok=True)
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'TEXTURE'
    scene.render.resolution_x, scene.render.resolution_y = 800, 600
    camera = bpy.data.objects.new('camera', bpy.data.cameras.new('camera'))
    camera.data.type = 'ORTHO'  # the whole saddle in each view, at one scale
    camera.data.ortho_scale = 1.4 * max(bounds[k][1] - bounds[k][0] for k in range(3))
    scene.collection.objects.link(camera)
    scene.camera = camera
    centre = Vector(((bounds[0][0] + bounds[0][1]) / 2, (bounds[1][0] + bounds[1][1]) / 2, (bounds[2][0] + bounds[2][1]) / 2))
    marker = bpy.data.objects.new('seat', None)  # the seat, as a small cross
    marker.empty_display_type = 'PLAIN_AXES'
    marker.empty_display_size = 0.05
    scene.collection.objects.link(marker)
    # (from above with its front at the top of the picture and its right side on the right: the camera a hair behind)
    for name, at in (('front', Vector((1.6, 0, 0.35))), ('side', Vector((0, -1.6, 0.35))), ('above', Vector((-0.01, 0, 1.8))), ('three-quarter', Vector((1.1, -1.1, 0.8)))):
        camera.location = centre + at
        camera.rotation_euler = (centre - camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(PREVIEW, f'hnakkur-{name}.png')
        bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(camera)
    bpy.data.objects.remove(marker)
    print('[saddle] previews in', PREVIEW)

bpy.ops.object.select_all(action='DESELECT')
saddle.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                          export_animations=False, export_skins=False, export_extras=True, export_image_format='WEBP',
                          export_image_quality=85, export_tangents=False, export_unused_images=False, export_unused_textures=False)
print('[saddle] wrote', out)
print('STATS ' + json.dumps({'triangles': tris(saddle), 'vertices': len(saddle.data.vertices), 'length': LENGTH, 'scale': round(scale, 4),
                             'turn': TURN, 'seat': [round(seat.x, 4), round(seat.z, 4)], 'closed': closed, 'bounds': bounds}))
