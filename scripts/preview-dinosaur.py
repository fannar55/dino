import bpy, pathlib, math
from mathutils import Vector
PROJECT=pathlib.Path(__file__).resolve().parents[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(PROJECT/'dist/assets/dinosaurs/triceratops.glb'))
scene=bpy.context.scene
scene.render.engine='CYCLES'; scene.cycles.samples=16
scene.render.resolution_x=900; scene.render.resolution_y=650; scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('World'); scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.64,.73,.68,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.6
bpy.ops.object.light_add(type='AREA',location=(2,-4,7)); bpy.context.object.data.energy=900; bpy.context.object.data.shape='DISK'; bpy.context.object.data.size=5
bpy.ops.object.camera_add(location=(6,-8,4))
camera=bpy.context.object; camera.rotation_euler=(Vector((0,0,1.15))-camera.location).to_track_quat('-Z','Y').to_euler(); camera.data.type='ORTHO'; camera.data.ortho_scale=5.8; scene.camera=camera
scene.render.filepath=str(PROJECT/'qa/imported-mosi-base.png')
scene.frame_set(0)
bpy.ops.render.render(write_still=True)
