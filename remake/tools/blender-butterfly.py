# Blender background script: the hero butterfly (world/forest/butterflies.js, the one that lands on Mosi's
# horn in chapter 1) out of the Tripo moth the owner picked. Step 1 of preparing it:
#   "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup
#     --python remake/tools/blender-butterfly.py -- in.glb out.glb [span=0.36] [tris=3800] [tex=512]
# It lays the wings flat about the body axis (the game's wing beat starts from flat and lifts them,
# as it lifts the pale butterflies'), welds Tripo's fourteen parts into three meshes, Body, WingL and
# WingR, that share one material, turns the moth to face +X with +Y up, puts the origin on the body
# axis between the wing roots (the wings turn about X there), scales it to `span` metres from wing
# tip to wing tip, decimates it to about `tris` triangles (the wings keep half), shrinks the colour
# and normal maps to `tex` pixels (WebP; the roughness map goes and the material is matte) and
# writes a GLB. Step 2 is node remake/tools/quantize-glb.mjs, which packs its vertices small.
# The welding and pinhole code is blender-decimate.py's.
import json
import sys
import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.geometry import intersect_point_line

argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
option = lambda name, fallback: next((float(a[len(name) + 1:]) for a in argv[2:] if a.startswith(name + '=')), fallback)
SPAN = option('span', 0.36)
TRIS = int(option('tris', 3800))
TEX = int(option('tex', 512))
# Tripo's parts of this moth: the forewings and hindwings by side (it faces -Y after the import, so its right is -X);
# every other part is body, head, legs and antennae.
WINGS = {'tripo_part_0': 'R', 'tripo_part_2': 'R', 'tripo_part_1': 'L', 'tripo_part_4': 'L'}
FOREWINGS = {'tripo_part_0', 'tripo_part_1'}

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
scene = bpy.context.scene
parts = [o for o in scene.objects if o.type == 'MESH']
material = parts[0].data.materials[0]
tris = lambda o: sum(len(p.vertices) - 2 for p in o.data.polygons)
print(f'[butterfly] {len(parts)} parts, {sum(tris(o) for o in parts)} triangles')

# Blender's frame after the import: the moth faces -Y, +Z is up and the wings spread along X.
def world_verts(o):
    return [o.matrix_world @ v.co for v in o.data.vertices]

# The body axis runs along Y through the middle of the forewing roots (their vertices nearest the body).
roots = [v for o in parts if o.name in FOREWINGS for v in world_verts(o) if abs(v.x) < 0.09]
pivot = Vector((0, sum(v.y for v in roots) / len(roots), sum(v.z for v in roots) / len(roots)))
print(f'[butterfly] body axis through y {pivot.y:.4f} z {pivot.z:.4f} ({len(roots)} root vertices)')

# Lay each wing flat: turn it about the body axis until its tip is level with the axis.
for o in parts:
    if o.name not in WINGS:
        continue
    tip = max(world_verts(o), key=lambda v: abs(v.x))
    best = None
    for sign in (1, -1):
        angle = sign * Vector((abs(tip.x), tip.z - pivot.z)).angle_signed(Vector((1, 0)), 0)
        turned = Matrix.Translation(pivot) @ Matrix.Rotation(angle, 4, 'X') @ Matrix.Translation(-pivot) @ tip
        if best is None or abs(turned.z - pivot.z) < best[0]:
            best = (abs(turned.z - pivot.z), angle)
    o.matrix_world = Matrix.Translation(pivot) @ Matrix.Rotation(best[1], 4, 'X') @ Matrix.Translation(-pivot) @ o.matrix_world
    print(f'[butterfly] {o.name}: turned {best[1] * 57.2958:.1f} degrees to lie flat (tip was {tip.z - pivot.z:+.3f} above the axis)')

# Three meshes: the parts of each wing, and everything else. Each part keeps a material slot of its own
# while they are welded and decimated, as blender-decimate.py does, so a seam is never blurred away.
def join(names, into):
    objs = [scene.objects[n] for n in sorted(names)]  # by name: a join removes the objects it joins
    for o in objs:
        tag = bpy.data.materials.new(f'part:{o.name}')
        o.data.materials.clear()
        o.data.materials.append(tag)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = obj.data.name = into
    return obj

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

def weld(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    before = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    split = split_t_junctions(bm, 1e-4)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    filled = fill_pinholes(bm, 8)
    open_edges = sum(e.is_boundary for e in bm.edges)
    bm.to_mesh(obj.data)
    bm.free()
    if obj.data.has_custom_normals:
        with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj]):
            bpy.ops.mesh.customdata_custom_splitnormals_clear()
    obj.data.shade_smooth()
    print(f'[butterfly] {obj.name}: welded {before - len(obj.data.vertices)} vertices, split {split} T-junctions, '
          f'filled {filled} pinholes, {open_edges} open edges left')
    return open_edges

def decimate(obj, target):
    mod = obj.modifiers.new('decimate', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = min(1.0, target / tris(obj))
    mod.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bm = bmesh.new()  # vertices the collapse left without a face would be exported for nothing
    bm.from_mesh(obj.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(obj.data)
    bm.free()
    try:  # normals from the welded whole, so the seams between Tripo's parts shade alike
        obj.data.normals_split_custom_set_from_vertices([v.normal[:] for v in obj.data.vertices])
    except (AttributeError, RuntimeError) as error:
        print(f'[butterfly] could not keep the normals across the seams: {error}')
    print(f'[butterfly] {obj.name}: {tris(obj)} triangles')

body_names = {o.name for o in parts if o.name not in WINGS}
wing_l = join({n for n, s in WINGS.items() if s == 'L'}, 'WingL')
wing_r = join({n for n, s in WINGS.items() if s == 'R'}, 'WingR')
body = join(body_names, 'Body')
meshes = [body, wing_l, wing_r]
closed = all(open_edges == 0 for open_edges in [weld(o) for o in meshes])
decimate(wing_l, TRIS / 4)
decimate(wing_r, TRIS / 4)
decimate(body, TRIS / 2)
for o in meshes:
    o.data.materials.clear()
    o.data.materials.append(material)

# Frame: the body axis to the origin, the moth turned to face +X (Blender's +X is glTF's), and the span scaled to SPAN metres.
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
xs = [v.x for o in (wing_l, wing_r) for v in world_verts(o)]
scale = SPAN / (max(xs) - min(xs))
frame = Matrix.Scale(scale, 4) @ Matrix.Rotation(1.5707963267948966, 4, 'Z') @ Matrix.Translation(-pivot)
for o in meshes:
    o.matrix_world = frame @ o.matrix_world
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
verts = [v for o in meshes for v in world_verts(o)]
feet = -min(v.z for v in verts)  # the legs' tips below the body axis (glTF -Y), so a landed butterfly stands on its point
body['feet'] = feet
body['span'] = SPAN
print(f'[butterfly] scale {scale:.4f}, feet {feet:.4f} m below the body axis, '
      f'bounds x {min(v.x for v in verts):+.3f}..{max(v.x for v in verts):+.3f} y {min(v.y for v in verts):+.3f}..{max(v.y for v in verts):+.3f} z {min(v.z for v in verts):+.3f}..{max(v.z for v in verts):+.3f} (Blender axes)')

# Material: colour and normal maps at TEX pixels, no roughness map, matte, single-sided where the shells are closed.
nodes = material.node_tree.nodes
links = material.node_tree.links
bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
for socket in ('Roughness', 'Metallic'):
    for link in list(bsdf.inputs[socket].links):
        links.remove(link)
bsdf.inputs['Roughness'].default_value = 0.7
bsdf.inputs['Metallic'].default_value = 0.0
normal_map = next((n for n in nodes if n.type == 'NORMAL_MAP'), None)
if normal_map:
    normal_map.inputs['Strength'].default_value = 0.8
used = {n.image.name for n in nodes if n.type == 'TEX_IMAGE' and n.image and any(l.to_node == bsdf or l.to_node == normal_map for l in n.outputs[0].links)}
for n in [n for n in nodes if n.type == 'TEX_IMAGE' and (n.image is None or n.image.name not in used)]:
    nodes.remove(n)
for image in list(bpy.data.images):
    if image.name not in used:
        bpy.data.images.remove(image)
    else:
        image.scale(TEX, TEX)
material.use_backface_culling = closed
material.name = 'butterfly'
print(f'[butterfly] maps: {[(i.name, i.size[0]) for i in bpy.data.images]}, single-sided: {closed}')

bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=True, export_animations=False,
                          export_skins=False, export_extras=True, export_image_format='WEBP', export_image_quality=80,
                          export_tangents=False, export_unused_images=False, export_unused_textures=False)
print('[butterfly] wrote', out)
print('STATS ' + json.dumps({'triangles': {o.name: tris(o) for o in meshes}, 'vertices': {o.name: len(o.data.vertices) for o in meshes},
                             'span': SPAN, 'feet': round(feet, 4), 'scale': round(scale, 4), 'closed': closed}))
