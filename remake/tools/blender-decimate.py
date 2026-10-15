# Blender background script: import a GLB, weld its UV seams, decimate each part (the head keeps
# relatively more detail), join the parts into one mesh, and export a GLB. Step 1 of preparing a
# Tripo character:
#   "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup
#     --python remake/tools/blender-decimate.py -- in.glb out.glb 20000 tripo_part_0 [parts]
# Pass `parts` as a fifth argument to keep the parts separate (the bake tool reads them).
# Step 2 is the bake tool for a rigged character (remake/tools/bake/bake-character.mjs), or
# remake/tools/prep-character.mjs for a static one (STYLE.md section 12).
import sys
import bmesh
import bpy

argv = sys.argv[sys.argv.index('--') + 1:]
src, out, target, head = argv[0], argv[1], int(argv[2]), argv[3]
keep_parts = len(argv) > 4 and argv[4] == 'parts'

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']

# A GLB splits every vertex on a UV seam, and Tripo's atlas has a hundred islands. Weld the seams
# first: decimating the split mesh moves the two sides of each seam apart and opens thin cracks along
# every seam (they show as dark lines and specks). The UVs stay per corner, so the seams survive.
for o in meshes:
    bm = bmesh.new()
    bm.from_mesh(o.data)
    before = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(o.data)
    bm.free()
    if o.data.has_custom_normals:
        with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o]):
            bpy.ops.mesh.customdata_custom_splitnormals_clear()
    o.data.shade_smooth()
    print(f'[decimate] {o.name}: welded {before - len(o.data.vertices)} seam vertices')

def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)

total = sum(tris(o) for o in meshes)
# The head (face, hat) keeps relatively more detail than the rest of the body.
weights = {o.name: (1.6 if head in o.name or head in (o.data.name or '') else 1.0) for o in meshes}
base = target / sum(tris(o) * weights[o.name] for o in meshes)
print(f'[decimate] {len(meshes)} parts, {total} triangles, target {target}')
for o in meshes:
    ratio = min(1.0, base * weights[o.name])
    mod = o.modifiers.new('decimate', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = ratio
    mod.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=mod.name)
    print(f'[decimate] {o.name}: ratio {ratio:.3f} -> {tris(o)} triangles')

if keep_parts:
    print(f'[decimate] kept {len(meshes)} parts: {sum(tris(o) for o in meshes)} triangles')
else:
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = 'Character'
    print(f'[decimate] joined: {tris(joined)} triangles')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=True,
                          export_animations=False, export_skins=False, export_image_format='AUTO')
print('[decimate] wrote', out)
