# Blender background script: a badge for a task of "Hvar er vinur minn?" level 2 (remake/engine/memory/levels/steinagljufur.js `targets`): a RENDER of the level's own model,
# not a drawing. The model is imported, lit by the workbench's studio light with its own texture, and rendered on a transparent background.
#   "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python remake/tools/blender-badge.py -- in.glb out.png kind=tunnel|rocks|slab|tree|trunk|fossil [size=144]
#   kind=tunnel  the tunnel mouth from the front, a little above, whole.
#   kind=slab    the slab (assets/memory/bord2/gorge-slab.glb) leaned like a ramp, in the gorge's sandstone colour, thicker as the game stands it.
#   kind=tree    the tree (gorge-tree.glb), its two materials as the game tints them (the trunk brown, the crown olive).
#   kind=trunk   the owner's dead trunk (gorge-trunk.glb) with its own texture, leaned 38 degrees as it starts to fall, from the side (a tall thin trunk
#                standing upright is a sliver in a square badge).
#   kind=fossil  one of level 2's fossils (assets/memory/gifts/ammonite.glb, trilobite.glb: flat scans lying face up) with its own texture, seen from high
#                above and a little to the side, as the leaf shows it leant toward the camera (the HUD's ribbon, basket and ending card on level 2, Task 7).
#   kind=rocks   the rock file's loose rocks (it holds the pile's eleven rocks side by side) stacked in a heap as the game stacks them, each in the gorge's sandstone colour
#                (the tunnel keeps its own texture).
# Then: ffmpeg -i out.png -c:v libwebp -quality 88 -pix_fmt yuva420p out.webp
import math
import sys
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
options = dict(a.split('=', 1) for a in argv[2:] if '=' in a)
KIND, SIZE = options.get('kind', 'tunnel'), int(options.get('size', 144))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
scene = bpy.context.scene
meshes = [o for o in scene.objects if o.type == 'MESH']


def bounds(objs):
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in objs:
        for corner in o.bound_box:
            p = o.matrix_world @ Vector(corner)
            lo = Vector(min(lo[i], p[i]) for i in range(3))
            hi = Vector(max(hi[i], p[i]) for i in range(3))
    return lo, hi


def select(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


if KIND == 'rocks':
    select(meshes)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=0.0005)  # (a texture seam splits a vertex, not a rock: joined again, the loose parts are the eleven rocks)
    bpy.ops.mesh.separate(type='LOOSE')
    bpy.ops.object.mode_set(mode='OBJECT')
    rocks = sorted([o for o in scene.objects if o.type == 'MESH'], key=lambda o: (o.matrix_world @ Vector(o.bound_box[0])).x)
    for o in rocks:  # every rock to the origin of its own middle, standing on z = 0
        select([o])
        bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
    # The heap: [rock index, x, y, z of its middle above the floor, turn] (the same sort of stacking as the game's: wide ones low, small ones on top).
    HEAP = [(9, -.7, 0, 0, .4), (3, .7, 0, 0, 1.2), (5, 0, -.9, 0, .8), (2, -1.4, -.8, 0, 2.1), (8, -.4, .7, 0, 2.6), (0, .8, .8, 0, 4.0), (7, -.1, -.2, .85, 1.5), (4, .3, -.35, 1.05, 3.3), (6, -.5, .1, 1.45, .2)]
    for index, x, y, z, turn in HEAP:
        o = rocks[index]
        height = o.dimensions.z
        o.location = (x, y, z + height / 2)
        o.rotation_euler = (0, 0, turn)
    use = [rocks[i] for i, *_ in HEAP]
    for n, o in enumerate(use):  # the gorge's sandstone, a little different on each rock (the game's shader turns the texture's grey into it; here the rock has just the colour)
        shade = .9 + .05 * (n % 3)
        o.color = (.96 * shade, .66 * shade, .38 * shade, 1)
    for o in rocks:
        if o not in use:
            o.hide_render = True
    focus_objs = use
elif KIND == 'slab':
    # The slab as the game stands it (upper.js): its thickness 3.1 times, in the sandstone colour, leaned 24 degrees like the ramp it becomes.
    for o in meshes:
        o.scale = (1.3, 1.1, 3.1)
        o.rotation_euler = (0, math.radians(-24), math.radians(28))
        o.color = (.86, .56, .32, 1)
    focus_objs = meshes
elif KIND == 'trunk':
    for o in meshes:
        o.rotation_mode = 'XYZ'  # (the importer turns its objects by a quaternion)
        o.rotation_euler = (0, math.radians(38), 0)
    focus_objs = meshes
elif KIND == 'tree':
    for o in meshes:
        for slot, colour in zip(o.material_slots, [(.55, .38, .26, 1), (.56, .6, .3, 1)]):
            slot.material.diffuse_color = colour
    focus_objs = meshes
else:
    focus_objs = meshes

bpy.context.view_layer.update()
print('[badge] objects', [(o.name, tuple(round(v, 2) for v in o.dimensions), tuple(round(v, 2) for v in o.location)) for o in focus_objs])
lo, hi = bounds(focus_objs)
centre = (lo + hi) / 2
radius = max((hi - lo).length / 2, .1)

camera_data = bpy.data.cameras.new('badge')
camera_data.type = 'ORTHO'
camera = bpy.data.objects.new('badge', camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
# From the front (+x, where the tunnel's mouth faces), a little above and a little to the side.
elevation, azimuth = math.radians(22 if KIND == 'tunnel' else 24), math.radians(-22 if KIND == 'tunnel' else -32)
if KIND == 'tree':
    elevation, azimuth = math.radians(10), math.radians(-30)
if KIND == 'trunk':
    elevation, azimuth = math.radians(14), math.radians(-78)
if KIND == 'fossil':
    elevation, azimuth = math.radians(62), math.radians(-28)
direction = Vector((math.cos(elevation) * math.cos(azimuth), math.cos(elevation) * math.sin(azimuth), math.sin(elevation)))
camera.location = centre + direction * radius * 4
camera.rotation_euler = (centre - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera_data.ortho_scale = radius * (1.9 if KIND == 'tunnel' else 2.0 if KIND in ('slab', 'tree') else 1.75 if KIND == 'trunk' else 1.72 if KIND == 'fossil' else 2.2)
camera_data.shift_y = -.04

scene.render.engine = 'BLENDER_WORKBENCH'
scene.render.resolution_x = scene.render.resolution_y = SIZE
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.filepath = out
shading = scene.display.shading
shading.light = 'STUDIO'
shading.color_type = 'OBJECT' if KIND in ('rocks', 'slab') else 'MATERIAL' if KIND == 'tree' else 'TEXTURE'
shading.show_shadows = True
shading.shadow_intensity = .35
shading.show_cavity = False
shading.show_object_outline = True
shading.object_outline_color = (.18, .1, .05)
scene.render.use_high_quality_normals = True
scene.display.render_aa = '8'
bpy.ops.render.render(write_still=True)
print('[badge] wrote', out)
