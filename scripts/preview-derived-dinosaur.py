"""Neutral studio render of the exported GLB, including its actual skin rig."""
import bpy, math, pathlib, sys
from mathutils import Vector
ROOT=pathlib.Path(__file__).resolve().parents[1]
ARGS=sys.argv[sys.argv.index('--')+1:]
slug=ARGS[0]; view=ARGS[1] if len(ARGS)>1 else 'three-quarter'
frame=int(ARGS[2]) if len(ARGS)>2 else 0
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/f'dist/assets/dinosaurs/{slug}.glb'))
arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
if arm.animation_data:
    for track in arm.animation_data.nla_tracks: track.mute=True
    action=next((a for a in bpy.data.actions if a.name=='idle'),None)
    arm.animation_data.action=action
bpy.context.scene.frame_set(frame); bpy.context.view_layer.update()
points=[]
for o in bpy.context.scene.objects:
    if o.type=='MESH':
        e=o.evaluated_get(bpy.context.evaluated_depsgraph_get())
        points.extend(o.matrix_world@v.co for v in e.data.vertices)
low=Vector([min(p[i] for p in points) for i in range(3)])
high=Vector([max(p[i] for p in points) for i in range(3)])
target=(low+high)*.5
if view=='hands': target=Vector((1.17,0,.48))
print('RENDER_BOUNDS',list(low),list(high))
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.03))
floor=bpy.context.object; floor.name='Neutral ground'
mat=bpy.data.materials.new('Warm paper'); mat.diffuse_color=(.62,.65,.59,1); floor.data.materials.append(mat)
bpy.ops.object.camera_add()
camera=bpy.context.object
offset=Vector((0,-12,2.2)) if view=='side' else Vector((8,-13,5))
camera.location=target+offset; camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO'; camera.data.ortho_scale=max(high.x-low.x,(high.z-low.z)*1.35)*1.3
if view=='hands': camera.data.ortho_scale=1.5
bpy.context.scene.camera=camera
for location,power,size in [((0,-6,10),1350,7),((-6,4,8),1000,6),((8,5,4),700,5)]:
    bpy.ops.object.light_add(type='AREA',location=location); lamp=bpy.context.object; lamp.data.energy=power; lamp.data.shape='DISK'; lamp.data.size=size
    lamp.rotation_euler=(target-lamp.location).to_track_quat('-Z','Y').to_euler()
scene=bpy.context.scene; scene.render.engine='CYCLES'; scene.cycles.samples=16
scene.render.threads_mode='FIXED'; scene.render.threads=4
scene.world=bpy.data.worlds.new('Soft daylight'); scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.72,.79,.84,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5
scene.render.resolution_x=1100; scene.render.resolution_y=850; scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'; scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(ROOT/f'qa/{slug}-{view}-{frame}.png')
bpy.ops.render.render(write_still=True)
