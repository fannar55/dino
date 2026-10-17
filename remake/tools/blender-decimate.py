# Blender background script: import a GLB, weld its UV seams and the seams between its parts,
# decimate it as one mesh (the head keeps relatively more detail) and export a GLB, joined into one
# mesh or split back into its parts. Step 1 of preparing a Tripo character:
#   "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup
#     --python remake/tools/blender-decimate.py -- in.glb out.glb 20000 tripo_part_0 [parts]
# The fourth argument names the head part, or several parts separated by commas
# (tripo_part_2,tripo_part_7). Pass `parts` to keep the parts separate (the bake tool reads them),
# keep=<parts> to keep the seams of those parts as Tripo made them (a lower jaw, whose seam
# with the face becomes the lips), and detail=<x> for how much more of its triangles the head keeps
# than the rest (1.6; a sauropod's small head, seen close up, keeps more).
# Step 2 is the bake tool for a rigged character (remake/tools/bake/bake-character.mjs), or
# remake/tools/prep-character.mjs for a static one (STYLE.md section 12).
import sys
import bmesh
import bpy
from mathutils.geometry import intersect_point_line

argv = sys.argv[sys.argv.index('--') + 1:]
src, out, target, head = argv[0], argv[1], int(argv[2]), argv[3]
heads = set(head.split(','))
keep_parts = 'parts' in argv[4:]
keep = {name for a in argv[4:] if a.startswith('keep=') for name in a[len('keep='):].split(',')}
# The head keeps this much more of its triangles than the rest.
HEAD_DETAIL = next((float(a[len('detail='):]) for a in argv[4:] if a.startswith('detail=')), 1.6)
PROTECT = 1000.0  # vertex group factor that keeps a region out of a decimation pass

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
material = meshes[0].data.materials[0] if meshes[0].data.materials else None

def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)

def is_head(o):
    return o.name in heads or (o.data.name or '') in heads

total = sum(tris(o) for o in meshes)
head_total = sum(tris(o) for o in meshes if is_head(o))
print(f'[decimate] {len(meshes)} parts, {total} triangles ({head_total} in the head), target {target}')

# Tripo cuts one surface into parts, so neighbouring parts share their seam vertices exactly.
# Decimating the parts one by one moves the two sides of a seam apart and opens cracks between the
# parts. So the parts are decimated as one mesh: each part's faces get a material slot of their own
# (named after the part), the parts are joined, and at the end they are split again by material.
head_tags, keep_tags = set(), set()
for o in meshes:
    tag = bpy.data.materials.new(f'part:{o.name}')
    if is_head(o):
        head_tags.add(tag.name)
    if o.name in keep or (o.data.name or '') in keep:
        keep_tags.add(tag.name)
    o.data.materials.clear()
    o.data.materials.append(tag)
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active

# Along some seams between parts a vertex of one part lies on an edge of the other instead of on a
# vertex (a T-junction), which leaves a hairline crack. Split such an edge at that vertex so the two
# sides can be welded.
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

# What is still open after welding is a few pinholes where three or four seams meet. Close each with
# a face that takes its part and its colour from a neighbouring face: all its corners get the UV of
# one corner of that face (the corners of a pinhole can sit on different islands of the atlas).
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

# A GLB splits every vertex on a UV seam, and Tripo's atlas has a hundred islands. Weld the seams
# first: decimating the split mesh moves the two sides of each seam apart and opens thin cracks along
# every seam (they show as dark lines and specks). The UVs stay per corner, so the seams survive.
bm = bmesh.new()
bm.from_mesh(obj.data)
before = len(bm.verts)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
split = split_t_junctions(bm, 1e-4)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
filled = fill_pinholes(bm, 8)
print(f'[decimate] split {split} edges at T-junctions, filled {filled} pinholes; '
      f'{sum(e.is_boundary for e in bm.edges)} open edges left')
bm.to_mesh(obj.data)
bm.free()
if obj.data.has_custom_normals:
    with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj]):
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
obj.data.shade_smooth()
print(f'[decimate] welded {before - len(obj.data.vertices)} seam vertices')

# The head keeps relatively more detail: the body is decimated first with the head kept out, then
# the head, each to its share of the target. The seams of the parts named in keep= stay as Tripo
# made them: their vertices are never collapsed.
head_slots = {i for i, m in enumerate(obj.data.materials) if m.name in head_tags}
keep_slots = {i for i, m in enumerate(obj.data.materials) if m.name in keep_tags}
base = target / (total - head_total + HEAD_DETAIL * head_total)
body_target = round(base * (total - head_total))

def kept_seam():
    if not keep_slots:
        return set()
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    out = set()
    for e in bm.edges:
        slots = {f.material_index for f in e.link_faces}
        if len(slots) > 1 and slots & keep_slots:
            out.update(v.index for v in e.verts)
    bm.free()
    return out

def decimate(ratio, free_slots, fixed_slots):
    # Collapse edges among the faces of free_slots; the vertices of fixed_slots' faces and of the
    # kept seams have weight 0 in the group, which keeps their edges for last.
    of = lambda slots: {v for p in obj.data.polygons if p.material_index in slots for v in p.vertices}
    free = of(free_slots) - of(fixed_slots) - kept_seam()
    for g in list(obj.vertex_groups):
        obj.vertex_groups.remove(g)
    mod = obj.modifiers.new('decimate', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = min(1.0, ratio)
    mod.use_collapse_triangulate = True
    if len(free) < len(obj.data.vertices):
        obj.vertex_groups.new(name='free').add(sorted(free), 1.0, 'REPLACE')
        mod.vertex_group = 'free'
        mod.vertex_group_factor = PROTECT
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)

def count_head():
    return sum(len(p.vertices) - 2 for p in obj.data.polygons if p.material_index in head_slots)

all_slots = set(range(len(obj.data.materials)))
if head_slots:
    decimate((body_target + head_total) / tris(obj), all_slots - head_slots, head_slots)
    print(f'[decimate] body: {tris(obj) - count_head()} triangles')
    decimate(target / tris(obj), head_slots, set())
else:
    decimate(target / tris(obj), all_slots, set())
print(f'[decimate] {tris(obj)} triangles, {count_head()} in the head')

# Normals from the whole mesh, kept as custom normals, so the two sides of a seam between parts
# shade alike once the parts are split.
try:
    obj.data.normals_split_custom_set_from_vertices([v.normal[:] for v in obj.data.vertices])
except (AttributeError, RuntimeError) as error:
    print(f'[decimate] could not keep the normals across the seams: {error}')

if keep_parts:
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.separate(type='MATERIAL')
    bpy.ops.object.mode_set(mode='OBJECT')
    parts = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for o in parts:
        o.name = o.data.name = o.data.materials[o.data.polygons[0].material_index].name[len('part:'):]
    print(f'[decimate] split into {len(parts)} parts:')
    for o in sorted(parts, key=lambda o: o.name):
        print(f'[decimate]   {o.name}: {tris(o)} triangles')
else:
    parts = [obj]
    obj.name = 'Character'
for o in parts:
    o.data.materials.clear()
    if material:
        o.data.materials.append(material)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=True,
                          export_animations=False, export_skins=False, export_image_format='AUTO')
print('[decimate] wrote', out)
