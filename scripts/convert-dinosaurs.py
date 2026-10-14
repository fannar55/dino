"""Rebuild the locally vendored CC0 Quaternius dinosaurs with Blender CLI.

Run with --background --factory-startup --disable-autoexec; never opens the
interactive Blender session. Source ZIP: https://quaternius.itch.io/animated-lowpoly-dinosaurs
"""
import bpy, json, math, pathlib, shutil
from mathutils import Vector, Matrix
from mathutils.noise import noise

PROJECT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = PROJECT / '.tools/assets/quaternius/source/Dinosaur Animated Pack - Dec 2018'
DEST = PROJECT / 'dist/assets/dinosaurs'
DEST.mkdir(parents=True, exist_ok=True)
MODELS = {'Triceratops': ('triceratops', 4.4), 'Stegosaurus': ('stegosaurus', 4.1),
          'Trex': ('trex', 4.5), 'Parasaurolophus': ('parasaurolophus', 4.1)}

def srgb(hexcode):
    rgb = [int(hexcode[i:i+2],16)/255 for i in (1,3,5)]
    return tuple(c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in rgb)+(1,)

reports=[]
for source_name,(slug,length) in MODELS.items():
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE/'Blends'/f'{source_name}.blend'), load_ui=False, use_scripts=False)
    armature=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    for action in bpy.data.actions:
        action.name=action.name.rsplit('_',1)[-1].lower()
    armature.animation_data.action=next(a for a in bpy.data.actions if a.name=='idle')
    for track in list(armature.animation_data.nla_tracks):
        armature.animation_data.nla_tracks.remove(track)
    bpy.context.scene.frame_set(0)
    bpy.context.view_layer.update()
    # Source faces -Y. Parent conversion preserves all original bone animation.
    rotate=Matrix.Rotation(math.pi/2,4,'Z')
    points=[]
    for obj in meshes:
        evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        points.extend(rotate@obj.matrix_world@v.co for v in evaluated.data.vertices)
    minimum=Vector(tuple(min(v[i] for v in points) for i in range(3)))
    maximum=Vector(tuple(max(v[i] for v in points) for i in range(3)))
    scale=length/(maximum.x-minimum.x)
    asset_root=bpy.data.objects.new('AssetRoot',None)
    bpy.context.collection.objects.link(asset_root)
    for obj in list(bpy.context.scene.objects):
        if obj != asset_root and obj.parent is None:
            transform=obj.matrix_world.copy(); obj.parent=asset_root; obj.matrix_world=transform
    asset_root.rotation_euler.z=math.pi/2
    asset_root.scale=(scale,)*3
    asset_root.location.x=-(maximum.x+minimum.x)*.5*scale
    asset_root.location.z=-minimum.z*scale
    # Smooth the author's topology once; interpolated skin weights keep the
    # original articulated walk. Horns, beaks, plates and toes remain modelled.
    armature.data.pose_position='REST'
    for obj in meshes:
        bpy.context.view_layer.objects.active=obj
        bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True)
        sub=obj.modifiers.new('Storybook surface refinement','SUBSURF')
        sub.levels=1; sub.render_levels=1
        bpy.ops.object.modifier_apply(modifier=sub.name)
        for face in obj.data.polygons: face.use_smooth=True
    armature.data.pose_position='POSE'
    # Replace legacy Blender Internal materials with ordinary glTF PBR.
    story_colors={
      'triceratops': {'Purple':'#63a78b','Brown':'#dfbf89','LightBrown':'#c4d6a5'},
      'stegosaurus': {'DarkBrown':'#587c93','LightBrown':'#c3d4ba','Brown':'#d69561'},
      'trex': {'Green':'#ad865a','LightGreen':'#d9c59d','LightYellow':'#f0dec1','Red':'#c67973'},
      'parasaurolophus': {'Green':'#b4a166','LightGreen':'#dac694','LightYellow':'#efdab2','Red':'#d97759'},
    }
    for material in bpy.data.materials:
        base=story_colors[slug].get(material.name)
        color=srgb(base) if base else tuple(material.diffuse_color)
        material.use_nodes=True
        material.node_tree.nodes.clear()
        bsdf=material.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
        bsdf.inputs['Base Color'].default_value=color
        bsdf.inputs['Roughness'].default_value=.76
        bsdf.inputs['Metallic'].default_value=0
        output=material.node_tree.nodes.new('ShaderNodeOutputMaterial')
        material.node_tree.links.new(bsdf.outputs['BSDF'],output.inputs['Surface'])
        material.diffuse_color=color
    # Painted colour variation rides with the skinned vertices. This is baked
    # into COLOR_0, not a runtime noise shader or an external texture request.
    for obj in meshes:
        paint=obj.data.color_attributes.new(name='SkinPaint',type='FLOAT_COLOR',domain='POINT')
        obj.data.color_attributes.active_color=paint
        for vertex in obj.data.vertices:
            p=rotate@obj.matrix_world@vertex.co*scale
            shade=.93+noise(p*3.1)*.09+math.sin(p.x*5.4+p.y*2.6)*math.sin(p.z*4.3)*.035
            paint.data[vertex.index].color=(shade*.99,shade,shade*.97,1)
    bpy.context.scene.frame_set(0)
    bpy.context.view_layer.update()
    target=DEST/f'{slug}.glb'
    bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',export_animations=True,
        export_animation_mode='ACTIONS',export_anim_single_armature=True,export_anim_slide_to_zero=True,
        export_force_sampling=True,export_optimize_animation_size=True,export_yup=True,
        export_cameras=False,export_lights=False,export_extras=False,export_materials='EXPORT',
        export_morph=False,export_skins=True)
    triangles=sum(sum(len(p.vertices)-2 for p in obj.data.polygons) for obj in meshes)
    reports.append({'file':target.name,'bytes':target.stat().st_size,'triangles':triangles,
       'bones':len(armature.data.bones),'clips':sorted(a.name for a in bpy.data.actions),
       'source':f'Blends/{source_name}.blend','originalBounds':[list(minimum),list(maximum)],'scale':scale})
shutil.copyfile(SOURCE/'License.txt',DEST/'QUATERNIUS-LICENSE.txt')
(DEST/'source.json').write_text(json.dumps({'author':'Quaternius','license':'CC0-1.0',
    'source':'https://quaternius.itch.io/animated-lowpoly-dinosaurs',
    'changes':'Single subdivision, smooth normals, PBR conversion, storybook colour palette and baked vertex skin paint, local GLB conversion.',
    'models':reports},ensure_ascii=False,indent=2),encoding='utf8')
print('CONVERSION_REPORT',json.dumps(reports))
