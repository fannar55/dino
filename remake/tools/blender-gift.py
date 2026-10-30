# Blender background script: a gift of "Hvar er vinur minn?" (remake/engine/memory/surprise-items.js GIFT_ITEMS) out of a
# model the owner downloaded from Sketchfab. Step 1 of preparing it:
#   "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup
#     --python remake/tools/blender-gift.py -- in.glb out.glb name=Shrew size=1.0 front=-90 tris=3900 tex=512
#     [drop=AOFLoor] [roughness=0.6] [normal=0|1] [anim=0|1] [credit=extras.json]
# It imports the GLB, drops the meshes whose material is named in drop= (a floor), joins the rest into ONE mesh with ONE
# material, welds and decimates the mesh to about `tris` triangles (a skin is left alone when it is already under the
# target), rebuilds the material as plain metal-rough (the colour map, the normal map when normal=1, a constant roughness,
# metallic 0: nothing else of the old material survives, so a spec-gloss file becomes metal-rough), shrinks the maps to `tex`
# pixels (WebP at quality 80), turns the animal to face +X (front= is the way it faces now, in degrees from +X toward +Y
# in Blender's frame), scales it so its longest side on the ground (X or Z in glTF) is `size` metres, centres it on the
# ground and sets its feet on y = 0, and writes a GLB (with its animations and skin when anim=1). A skin is never
# applied: the armature object carries the scale, the turn and the lift, so the clips play as they were made.
# Step 2 is node remake/tools/quantize-glb.mjs, for the static ones only (three ignores the node scale quantization needs
# on a skinned mesh). The welding and pinhole code is blender-decimate.py's.
import json
import math
import sys
import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.geometry import intersect_point_line

argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
options = dict(a.split('=', 1) for a in argv[2:] if '=' in a)
NAME = options.get('name', 'Gift')
SIZE = float(options.get('size', 1.0))
FRONT = float(options.get('front', 0))
TRIS = int(options.get('tris', 4000))
TEX = int(options.get('tex', 512))
DROP = [d for d in options.get('drop', '').split(',') if d]
ROUGHNESS = float(options.get('roughness', 0.6))
NORMAL = options.get('normal', '1') == '1'
ANIM = options.get('anim', '0') == '1'
CREDIT = json.load(open(options['credit'])) if 'credit' in options else {}

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
scene = bpy.context.scene
tris = lambda o: sum(len(p.vertices) - 2 for p in o.data.polygons)

# What the importer adds that is not the model: a bone shape, and every mesh with a dropped material (the floor).
for o in list(scene.objects):
    if o.name.startswith('Icosphere'):
        bpy.data.objects.remove(o, do_unlink=True)
for o in [o for o in scene.objects if o.type == 'MESH']:
    if any(m and m.name in DROP for m in o.data.materials):
        print(f'[gift] dropped {o.name} ({tris(o)} triangles, material {[m.name for m in o.data.materials]})')
        bpy.data.objects.remove(o, do_unlink=True)
meshes = [o for o in scene.objects if o.type == 'MESH']
armatures = [o for o in scene.objects if o.type == 'ARMATURE']
print(f'[gift] {len(meshes)} meshes, {sum(tris(o) for o in meshes)} triangles, {len(armatures)} armatures')
skinned = bool(armatures)

# Free every kept object from the importer's empties (they hold the source's scale), keeping where it stands.
for o in meshes + armatures:
    if o.parent and o.parent.type == 'EMPTY':
        world = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = world
for o in [o for o in scene.objects if o.type == 'EMPTY']:
    bpy.data.objects.remove(o, do_unlink=True)

def select_only(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]

# ONE mesh: the parts are joined. They already share their one material (a Tripo or Sketchfab export names it once);
# if they do not, every face takes the first part's.
if len(meshes) > 1:
    material = meshes[0].data.materials[0]
    for o in meshes:
        o.data.materials.clear()
        o.data.materials.append(material)
    select_only(meshes)
    bpy.ops.object.join()
mesh = next(o for o in scene.objects if o.type == 'MESH')
mesh.name = mesh.data.name = NAME
if not skinned:
    # A static mesh takes its transform into its vertices.
    select_only([mesh])
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
else:
    print(f'[gift] skinned: armature {armatures[0].name}, {len(armatures[0].data.bones)} bones, actions {[a.name for a in bpy.data.actions]}')

def weld(obj, dist):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    before = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    # Pinholes of the welded seams are closed with a face that takes its neighbour's UV, as blender-decimate.py does.
    uv = bm.loops.layers.uv.active
    faces = bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=6)['faces']
    for f in faces:
        others = [g for e in f.edges for g in e.link_faces if g is not f and g not in faces]
        if not others:
            continue
        if uv:
            colour = next(l for l in others[0].loops if l.vert in f.verts)[uv].uv.copy()
            for loop in f.loops:
                loop[uv].uv = colour
    open_edges = sum(e.is_boundary for e in bm.edges)
    bm.to_mesh(obj.data)
    bm.free()
    if obj.data.has_custom_normals:
        with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj]):
            bpy.ops.mesh.customdata_custom_splitnormals_clear()
    obj.data.shade_smooth()
    print(f'[gift] welded {before - len(obj.data.vertices)} vertices, filled {len(faces)} pinholes, {open_edges} open edges left')

# Decimate when over the target. The model is scaled first, so the welding distance is the same fraction of every model.
extent = Vector(max(v.co[i] for v in mesh.data.vertices) - min(v.co[i] for v in mesh.data.vertices) for i in range(3))
if tris(mesh) > TRIS and not skinned:
    weld(mesh, max(extent) * 1e-5)
    mod = mesh.modifiers.new('decimate', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = min(1.0, TRIS / tris(mesh))
    mod.use_collapse_triangulate = True
    select_only([mesh])
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bm = bmesh.new()  # vertices the collapse left without a face would be exported for nothing
    bm.from_mesh(mesh.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(mesh.data)
    bm.free()
    try:  # normals from the welded whole, so the seams between the parts shade alike
        mesh.data.normals_split_custom_set_from_vertices([v.normal[:] for v in mesh.data.vertices])
    except (AttributeError, RuntimeError) as error:
        print(f'[gift] could not keep the normals across the seams: {error}')
elif tris(mesh) > TRIS:
    raise SystemExit(f'[gift] a skinned mesh of {tris(mesh)} triangles is over the target {TRIS}: decimating a skin is not done here')
print(f'[gift] {tris(mesh)} triangles, {len(mesh.data.vertices)} vertices')

# Material: the colour map and (if wanted) the normal map, plain metal-rough. The imported nodes are walked from the
# Principled BSDF: whatever image feeds Base Color is the colour map, the one behind its Normal Map node the normal map.
material = mesh.data.materials[0]
nodes, links = material.node_tree.nodes, material.node_tree.links
bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
def image_behind(socket):
    link = socket.links[0] if socket.links else None
    node = link.from_node if link else None
    while node and node.type != 'TEX_IMAGE':
        inputs = [i for i in node.inputs if i.links]
        node = inputs[0].links[0].from_node if inputs else None
    return node
colour_node = image_behind(bsdf.inputs['Base Color'])
normal_map = bsdf.inputs['Normal'].links[0].from_node if bsdf.inputs['Normal'].links and NORMAL else None
normal_node = image_behind(normal_map.inputs['Color']) if normal_map else None
print(f'[gift] colour map {colour_node.image.name if colour_node else None}, normal map {normal_node.image.name if normal_node else None}')
keep = {n for n in (bsdf, colour_node, normal_node, normal_map) if n} | {n for n in nodes if n.type == 'OUTPUT_MATERIAL'}
for socket in bsdf.inputs:
    if socket.name == 'Base Color' or socket.name == 'Normal' and normal_map:
        continue
    for link in list(socket.links):
        links.remove(link)
for n in [n for n in nodes if n not in keep]:
    nodes.remove(n)
if not bsdf.inputs['Base Color'].links and colour_node:
    links.new(colour_node.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = ROUGHNESS
bsdf.inputs['Metallic'].default_value = 0.0
# Blender's own defaults, so the file carries no KHR_materials_specular or _ior (a spec-gloss import leaves an IOR of 1000).
bsdf.inputs['Specular IOR Level'].default_value = 0.5
bsdf.inputs['IOR'].default_value = 1.5
if 'Specular Tint' in bsdf.inputs:
    bsdf.inputs['Specular Tint'].default_value = (1, 1, 1, 1)
if normal_map:
    normal_map.inputs['Strength'].default_value = 0.8
used = {n.image.name for n in (colour_node, normal_node) if n}
for image in list(bpy.data.images):
    if image.name not in used:
        bpy.data.images.remove(image)
    else:
        image.scale(TEX, TEX)
material.use_backface_culling = False  # double-sided: the claws and antennae are thin shells
material.name = NAME.lower()
print(f'[gift] maps: {[(i.name, i.size[0]) for i in bpy.data.images]}')

# Frame: turned to face +X, scaled so the longest side on the ground is `size` metres, centred on the ground, feet on y = 0.
# The rest pose is measured; a skin is measured over the whole clip (the feet of the dance, not only its first frame).
root = armatures[0] if skinned else mesh
turn = Matrix.Rotation(math.radians(-FRONT), 4, 'Z')
def posed_points(frame):
    scene.frame_set(frame)
    graph = bpy.context.evaluated_depsgraph_get()
    evaluated = mesh.evaluated_get(graph)
    data = evaluated.to_mesh()
    points = [turn @ (evaluated.matrix_world @ v.co) for v in data.vertices]
    evaluated.to_mesh_clear()
    return points
frames = [scene.frame_current]
if skinned and bpy.data.actions:
    action = bpy.data.actions[0]
    first, last = int(action.frame_range[0]), int(action.frame_range[1])
    frames = range(first, last + 1)
lo = Vector((1e9,) * 3)
hi = Vector((-1e9,) * 3)
for frame in frames:
    for p in posed_points(frame):
        lo = Vector(min(lo[i], p[i]) for i in range(3))
        hi = Vector(max(hi[i], p[i]) for i in range(3))
scene.frame_set(frames[0])
ground = max(hi.x - lo.x, hi.y - lo.y)
scale = SIZE / ground
centre = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
frame_matrix = Matrix.Scale(scale, 4) @ Matrix.Translation(-centre) @ turn
if skinned:
    root.matrix_world = frame_matrix @ root.matrix_world  # the child mesh follows its armature
else:
    mesh.data.transform(frame_matrix @ mesh.matrix_world)
    mesh.matrix_world = Matrix.Identity(4)
bpy.context.view_layer.update()
final_lo = Vector((1e9,) * 3)
final_hi = Vector((-1e9,) * 3)
for frame in frames:
    scene.frame_set(frame)
    graph = bpy.context.evaluated_depsgraph_get()
    evaluated = mesh.evaluated_get(graph)
    data = evaluated.to_mesh()
    for v in data.vertices:
        p = evaluated.matrix_world @ v.co
        final_lo = Vector(min(final_lo[i], p[i]) for i in range(3))
        final_hi = Vector(max(final_hi[i], p[i]) for i in range(3))
    evaluated.to_mesh_clear()
scene.frame_set(frames[0])
size_xyz = final_hi - final_lo
print(f'[gift] turned {-FRONT:+.1f} degrees, scale {scale:.5f}; bounds (Blender axes) x {final_lo.x:+.3f}..{final_hi.x:+.3f} y {final_lo.y:+.3f}..{final_hi.y:+.3f} z {final_lo.z:+.3f}..{final_hi.z:+.3f}')

# What the file says about itself (the exporter writes custom properties of the object as node extras).
for key, value in CREDIT.items():
    mesh[key] = value
    scene[key] = value
mesh['size'] = SIZE
mesh['height'] = round(size_xyz.z, 4)

select_only([mesh] + ([root] if skinned else []))
export = dict(filepath=out, export_format='GLB', export_yup=True, use_selection=True, export_apply=True, export_animations=ANIM,
              export_skins=skinned, export_extras=True, export_image_format='WEBP', export_image_quality=80, export_tangents=False,
              export_unused_images=False, export_unused_textures=False, export_cameras=False, export_lights=False)
bpy.ops.export_scene.gltf(**export)
print('[gift] wrote', out)
print('STATS ' + json.dumps({'name': NAME, 'triangles': tris(mesh), 'vertices': len(mesh.data.vertices), 'skinned': skinned, 'bones': len(armatures[0].data.bones) if skinned else 0,
                             'actions': [a.name for a in bpy.data.actions], 'scale': round(scale, 6), 'front': FRONT, 'size': SIZE,
                             'bounds': {'x': [round(final_lo.x, 4), round(final_hi.x, 4)], 'y': [round(final_lo.y, 4), round(final_hi.y, 4)], 'z': [round(final_lo.z, 4), round(final_hi.z, 4)]},
                             'maps': [(i.name, i.size[0]) for i in bpy.data.images]}))
