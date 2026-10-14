"""Author two anatomically distinct storybook dinosaurs from CC0 Quaternius meshes.

Headless Blender only. This changes the continuous mesh and bind skeleton, then
authors fresh grounded gait/idle actions; no original species is merely renamed.
Source: https://quaternius.itch.io/animated-lowpoly-dinosaurs (CC0-1.0).
"""
import bpy, bmesh, math, json, pathlib, sys
from mathutils import Vector, Matrix
from mathutils.noise import noise

ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE=ROOT/'.tools/assets/quaternius/source/Dinosaur Animated Pack - Dec 2018/Blends'
DEST=ROOT/'dist/assets/dinosaurs'
QA=ROOT/'qa'
ARGS=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
SPECIES=ARGS[0] if ARGS else 'brachiosaurus'
if SPECIES not in ('brachiosaurus','spinosaurus'):
    raise ValueError('Expected the stable brachiosaurus (Brontosaurus) or spinosaurus asset key')
SOURCE_NAME='Apatosaurus' if SPECIES=='brachiosaurus' else 'Trex'

def clamp(v,a=0,b=1): return max(a,min(b,v))
def smooth(a,b,x):
    t=clamp((x-a)/(b-a)); return t*t*(3-2*t)
def mix(a,b,t): return a*(1-t)+b*t
def srgb(value):
    c=[int(value[i:i+2],16)/255 for i in (1,3,5)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c)+(1,)

def brachio_shape(p):
    """Brontosaurus anatomy; the old key is retained for existing saved games.

    The CC0 Apatosaurus is a much closer base than our former high-shouldered
    Brachiosaurus. Keep the lower front, robust neck and full long tail. The
    canopy ride raises the neck through the rig, not through tall forelegs.
    """
    x,y,z=p
    chest=smooth(3,-6,y)
    nz=z*(1-.02*chest)
    ny=y
    x*=1.18
    # A gently rising, substantial neck. Rotate its cross-section with the
    # centreline, keeping the small skull level instead of narrowing the neck.
    if y < -6.5:
        s=-y-6.5
        axis=7+.27*s
        thickness=mix(1.28,1.08,clamp(s/14))
        cross=(z-axis)*thickness
        ny=-6.5-s*1.04+cross*.35
        nz=7+s*.44+cross*.94
        head=smooth(11.5,13.5,s)
        ny=mix(ny,-6.5-s*1.04,head)
        nz=mix(nz,13.10+(z-10.65)*1.08,head)
        neck_mask=smooth(4.8,6.7,z)
        ny=mix(y,ny,neck_mask)
        nz=mix(z*(1-.02*chest),nz,neck_mask)
        x*=mix(1,mix(1.20,1.02,head),neck_mask)
    # A long, tapering tail carried clear of the soil, with no short-tail crop.
    if y>4: nz+=smooth(4,10,y)*3.0+smooth(10,22,y)*.7
    return Vector((x,ny,nz))

def spino_shape(p):
    x,y,z=p
    nx=x*.86; ny=y; nz=z*.68
    neck=smooth(-6.0,-9.7,y)
    nz=mix(nz,8.05+(z-13.0)*.47,neck)
    if y < -9.6:
        snout=clamp((-y-9.6)/4.7)
        ny=-9.6+(y+9.6)*1.72
        nx=x*mix(.70,.60,snout)
        # The terminal rosette is slightly wider than the constricted snout.
        nx*=1+.16*smooth(.70,1,snout)
    if y>3:
        t=clamp((y-3)/14)
        nx*=mix(1,.36,smooth(0,.70,t))
        axis=6.25+.25*math.sin(t*math.pi)
        nz=axis+(nz-axis)*mix(1,2.3,math.sin(t*math.pi))
        ny=3+(y-3)*1.15
    return Vector((nx,ny,nz))

shape=brachio_shape if SPECIES=='brachiosaurus' else spino_shape
bpy.ops.wm.open_mainfile(filepath=str(SOURCE/f'{SOURCE_NAME}.blend'),load_ui=False,use_scripts=False)
if bpy.context.object and bpy.context.object.mode!='OBJECT': bpy.ops.object.mode_set(mode='OBJECT')
arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
body=next(o for o in bpy.context.scene.objects if o.type=='MESH')
arm.animation_data_clear()
for action in list(bpy.data.actions): bpy.data.actions.remove(action)
for pb in arm.pose.bones:
    pb.matrix_basis=Matrix.Identity(4)
arm.data.pose_position='REST'
bpy.context.view_layer.update()
for ob in (body,arm):
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active=ob
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)

def subdivide(obj,level):
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True); bpy.context.view_layer.objects.active=obj
    sub=obj.modifiers.new('Smooth continuous storybook surface','SUBSURF'); sub.levels=level; sub.render_levels=level
    bpy.ops.object.modifier_apply(modifier=sub.name)

# The first refinement supplies enough rows to form an integrated thin sail.
if SPECIES=='spinosaurus': subdivide(body,1)
old_points=[v.co.copy() for v in body.data.vertices]
old_bones={b.name:(b.head_local.copy(),b.tail_local.copy()) for b in arm.data.bones}

def arm_shape(p,side):
    pivot=Vector((side*1.96897,-4.86225,9.82981))
    relative=p-pivot
    return shape(pivot)+Vector((relative.x*1.12,relative.y*1.70,relative.z*1.23))

for v in body.data.vertices:
    p=v.co.copy(); q=shape(p)
    if SPECIES=='brachiosaurus':
        # Round, weight-bearing forelimbs rather than the source's slim wrists.
        weights=[(body.vertex_groups[w.group].name,w.weight) for w in v.groups]
        for side,name in [(-1,'.R'),(1,'.L')]:
            amount=sum(w for n,w in weights if n in ['FrontLeg'+name,'FrontUpLeg'+name,'FrontLowLeg'+name,'FrontFoot'+name])
            upper=smooth(2.5,5.65,p.z)
            cy=mix(-4.786,-4.257,clamp(p.z/2.6)) if p.z<2.6 else mix(-4.257,-5.160,clamp((p.z-2.6)/3.05))
            cx=side*mix(1.056,1.222,upper)
            centre=shape(Vector((cx,cy,p.z)))
            fuller=1.38+upper*.30
            q.x=mix(q.x,centre.x+(q.x-centre.x)*fuller,clamp(amount))
            q.y=mix(q.y,centre.y+(q.y-centre.y)*fuller,clamp(amount))
    if SPECIES=='spinosaurus':
        weights=[(body.vertex_groups[w.group].name,w.weight) for w in v.groups]
        for side,name in [(-1,'.R'),(1,'.L')]:
            amount=sum(w for n,w in weights if n in ['FrontUpLeg'+name,'FrontLowLeg'+name,'FrontFoot'+name])
            q=q.lerp(arm_shape(p,side),clamp(amount))
        # A real continuation of the dorsal skin: lift the centre row, not a
        # disconnected decorative triangle. Subdivision rounds the thin rim.
        longitudinal=smooth(-7,-4.5,p.y)*(1-smooth(4.5,7,p.y))
        ridge=(1-smooth(.10,.95,abs(p.x)))*smooth(9.9,11.6,p.z)
        height=(6.6+1.0*math.cos((p.y+.7)*.50))*longitudinal*ridge
        q.z+=height
        # Distinct tall, laterally flattened tail fin after the sail tapers.
        if p.y>5:
            t=clamp((p.y-5)/12.2)
            centre=9.2
            edge=clamp(abs(p.z-centre)/.60)
            q.z+=math.copysign(1.0*math.sin(t*math.pi)*edge,p.z-centre)
    v.co=q

if SPECIES=='spinosaurus':
    # T. rex has two fingers. Author the third functional clawed digit on each
    # Spinosaurus hand and skin it to the enlarged hand bone. Its root enters
    # the palm; all segments deform together, with no floating primitives.
    bm=bmesh.new(); bm.from_mesh(body.data); deform=bm.verts.layers.deform.verify()
    for side,suffix in [(-1,'.R'),(1,'.L')]:
        centres=[(1.97,-6.70,6.99,.135),(2.09,-6.70,6.76,.125),
                 (2.19,-6.66,6.45,.105),(2.25,-6.57,6.16,.075),
                 (2.25,-6.45,6.01,.042),(2.21,-6.34,5.94,.009)]
        rings=[]
        for x,y,z,r in centres:
            ring=[]
            for i in range(8):
                a=i/8*math.tau
                v=bm.verts.new(arm_shape(Vector((side*x+math.cos(a)*r,y+math.sin(a)*r,z)),side))
                v[deform][body.vertex_groups['FrontFoot'+suffix].index]=1
                ring.append(v)
            rings.append(ring)
        bm.faces.new(list(reversed(rings[0])))
        for j in range(len(rings)-1):
            for i in range(8):
                face=bm.faces.new([rings[j][i],rings[j][(i+1)%8],rings[j+1][(i+1)%8],rings[j+1][i]])
                face.material_index=1 if j>=3 else 0
        bm.faces.new(rings[-1]).material_index=1
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces)); bm.to_mesh(body.data); bm.free(); body.data.update()

bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); bpy.context.view_layer.objects.active=arm
bpy.ops.object.mode_set(mode='EDIT')
for bone in arm.data.edit_bones:
    h,t=old_bones[bone.name]
    if SPECIES=='spinosaurus' and bone.name.startswith(('FrontUpLeg','FrontLowLeg','FrontFoot')):
        side=-1 if bone.name.endswith('.R') else 1
        bone.head=arm_shape(h,side); bone.tail=arm_shape(t,side)
    else:
        bone.head=shape(h); bone.tail=shape(t)
    bone.use_connect=False
bpy.ops.object.mode_set(mode='OBJECT')

# Save the provenance of the authored geometry, including a neutral rest pose.
subdivide(body,2 if SPECIES=='brachiosaurus' else 1)
body.data.validate(verbose=True,clean_customdata=True)
for face in body.data.polygons: face.use_smooth=True

palette=({'Brown':'#bf976a','LightBrown':'#eed7ab','Black':'#353c34','Material':'#f1e6cb'}
         if SPECIES=='brachiosaurus' else
         {'Green':'#4e9291','LightGreen':'#b8ceaa','LightYellow':'#ecdfb7','Red':'#b37969','Black':'#243d3b'})
for mat in bpy.data.materials:
    color=srgb(palette.get(mat.name,'#88967a'))
    mat.use_nodes=True; mat.node_tree.nodes.clear()
    bsdf=mat.node_tree.nodes.new('ShaderNodeBsdfPrincipled'); bsdf.inputs['Base Color'].default_value=color
    bsdf.inputs['Roughness'].default_value=.74
    out=mat.node_tree.nodes.new('ShaderNodeOutputMaterial'); mat.node_tree.links.new(bsdf.outputs['BSDF'],out.inputs['Surface'])
    mat.diffuse_color=color

# Vertex pigment adds a dorsal pattern and scale-sized variation without any
# texture requests or unstable runtime noise. Keep the face/underbelly warm.
paint=body.data.color_attributes.new(name='StorybookSkin',type='FLOAT_COLOR',domain='CORNER')
body.data.color_attributes.active_color=paint
for polygon in body.data.polygons:
    mat=body.data.materials[polygon.material_index]
    material_base=Vector(srgb(palette.get(mat.name,'#88967a'))[:3])
    for loop_index in polygon.loop_indices:
        p=body.data.vertices[body.data.loops[loop_index].vertex_index].co
        base=.96+noise(p*.82)*.075
        pigment=material_base.copy()*base
        if SPECIES=='brachiosaurus':
            stripe=(.5+.5*math.cos(p.y*1.25+math.sin(p.z*.6)))**8
            flank=smooth(1.0,2.5,abs(p.x))*smooth(4,7,p.z)
            pigment*=1-stripe*flank*.22
        elif mat.name=='Green':
            sail=smooth(9.0,11.8,p.z)*(1-smooth(4,7,p.y))*smooth(-8,-5,p.y)
            band=.78+.22*math.sin(p.y*2.4+p.z*.24)**2
            pigment=pigment.lerp(Vector(srgb('#d99664')[:3])*band,sail*.93)
            stripes=(.5+.5*math.sin(p.y*2.1+p.z*.65))**8
            pigment*=1-stripes*.12*(1-sail)
        paint.data[loop_index].color=(*pigment,1)
# Full pigment is encoded per face corner so cream toes and underbelly retain
# their original distinct colours while the sail blends smoothly into the skin.
for mat in body.data.materials:
    mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(1,1,1,1)
    mat.diffuse_color=(1,1,1,1)

arm.data.pose_position='POSE'
for pb in arm.pose.bones:
    pb.rotation_mode='XYZ'; pb.matrix_basis=Matrix.Identity(4)

def move_world(bone,delta):
    bone.location=bone.bone.matrix_local.to_3x3().inverted()@Vector(delta)
def key(bone,frame):
    bone.keyframe_insert('location',frame=frame)
    bone.keyframe_insert('rotation_euler',frame=frame)

fps=24
bpy.context.scene.render.fps=fps
arm.animation_data_create()
for name,seconds in [('idle',5),('walk',3.6 if SPECIES=='brachiosaurus' else 2.7)]:
    action=bpy.data.actions.new(name); arm.animation_data.action=action; action.use_fake_user=True
    last=round(seconds*fps)
    for frame in range(last+1):
        phase=frame/last*math.tau
        for pb in arm.pose.bones: pb.location=(0,0,0); pb.rotation_euler=(0,0,0)
        if name=='idle':
            move_world(arm.pose.bones['Body'],(0,0,math.sin(phase)*.065))
        else:
            move_world(arm.pose.bones['Body'],(math.sin(phase)*.065,0,.09*(1-math.cos(phase*2))))
        arm.pose.bones['Head'].rotation_euler.x=math.sin(phase)*(.017 if SPECIES=='brachiosaurus' else .026)
        arm.pose.bones['Head'].rotation_euler.z=math.sin(phase)*.025
        arm.pose.bones['Neck'].rotation_euler.x=math.sin(phase-.4)*.012
        for i in range(1,6):
            arm.pose.bones[f'Tail{i}'].rotation_euler.z=math.sin(phase-i*.45)*(.025 if name=='idle' else .045)
        if name=='walk':
            feet=['BackFoot.R','BackFoot.L']+(['FrontFoot.R','FrontFoot.L'] if SPECIES=='brachiosaurus' else [])
            offsets=[0,.5,.28,.78]
            stride=2.8 if SPECIES=='brachiosaurus' else 3.5
            lift=.65 if SPECIES=='brachiosaurus' else .83
            for foot,offset in zip(feet,offsets):
                t=(frame/last+offset)%1
                if t<.62: y=mix(-stride*.5,stride*.5,t/.62); z=0
                else:
                    u=(t-.62)/.38
                    y=mix(stride*.5,-stride*.5,smooth(0,1,u)); z=math.sin(u*math.pi)*lift
                move_world(arm.pose.bones[foot],(0,y,z))
            if SPECIES=='spinosaurus':
                for side,offset in [('R',0),('L',math.pi)]:
                    arm.pose.bones['FrontUpLeg.'+side].rotation_euler.x=math.sin(phase+offset)*.13
                    arm.pose.bones['FrontLowLeg.'+side].rotation_euler.x=-.04+math.sin(phase+offset+.4)*.06
        for pb in arm.pose.bones: key(pb,frame)
    action['description']='Original gentle grounded gait authored for modified anatomy' if name=='walk' else 'Original breathing, head attention and tail sway'

arm.animation_data.action=bpy.data.actions['idle']; bpy.context.scene.frame_set(0)
bpy.context.view_layer.update()
rotate=Matrix.Rotation(math.pi/2,4,'Z')
points=[rotate@body.matrix_world@v.co for v in body.data.vertices]
minimum=Vector([min(p[i] for p in points) for i in range(3)])
maximum=Vector([max(p[i] for p in points) for i in range(3)])
length=8.8 if SPECIES=='brachiosaurus' else 5.6
scale=length/(maximum.x-minimum.x)
asset=bpy.data.objects.new('AssetRoot',None); bpy.context.collection.objects.link(asset)
for obj in list(bpy.context.scene.objects):
    if obj!=asset and obj.parent is None:
        mat=obj.matrix_world.copy(); obj.parent=asset; obj.matrix_world=mat
asset.rotation_euler.z=math.pi/2; asset.scale=(scale,)*3
asset.location.x=-(maximum.x+minimum.x)*.5*scale; asset.location.z=-minimum.z*scale
bpy.context.view_layer.update()
DEST.mkdir(parents=True,exist_ok=True); QA.mkdir(exist_ok=True)
output=DEST/f'{SPECIES}.glb'
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',export_animations=True,
    export_animation_mode='ACTIONS',export_anim_single_armature=True,export_anim_slide_to_zero=True,
    export_force_sampling=True,export_optimize_animation_size=True,export_yup=True,
    export_cameras=False,export_lights=False,export_extras=False,export_materials='EXPORT',export_vertex_color='ACTIVE',export_morph=False,export_skins=True)
report={'file':output.name,'bytes':output.stat().st_size,'triangles':sum(len(p.vertices)-2 for p in body.data.polygons),
    'bones':len(arm.data.bones),'clips':['idle','walk'],'source':f'Blends/{SOURCE_NAME}.blend',
    'bounds':[[round(v,5) for v in ((minimum+Vector((-(maximum.x+minimum.x)*.5,0,-minimum.z)))*scale)],
              [round(v,5) for v in ((maximum+Vector((-(maximum.x+minimum.x)*.5,0,-minimum.z)))*scale)]],
    'scale':scale,'author':'Quaternius (base mesh); Stjörnufar (anatomy, skin, new animation)',
    'sourceLicense':'CC0-1.0','sourceUrl':'https://quaternius.itch.io/animated-lowpoly-dinosaurs',
    'rightsNote':'The Quaternius base is CC0. Newly authored anatomy, animation and pigment are project-original modifications; this record does not assign a new public license to them.',
    'modifications': ('Reshaped continuous Apatosaurus mesh as a storybook Brontosaurus: broad torso, lower front shoulders and forelegs, substantial gently rising neck, small level skull and full-length lifted tapering tail; matching bind skeleton; two subdivisions; original idle/walk actions. The brachiosaurus filename is a save-compatible internal key, not the displayed species.' if SPECIES=='brachiosaurus' else 'Reshaped continuous T. rex mesh with long narrow crocodilian snout, shorter hindlegs, enlarged forearms, integrated dorsal sail and broad flattened tail; modified bind skeleton; two subdivisions; new idle/walk actions.')}
if SPECIES=='brachiosaurus':
    report['displaySpecies']='Brontosaurus'
    report['internalKey']='brachiosaurus'
report['boundsZUp']=report.pop('bounds')
report['bounds']=[[report['boundsZUp'][0][0],0,-report['boundsZUp'][1][1]],
                  [report['boundsZUp'][1][0],report['boundsZUp'][1][2],-report['boundsZUp'][0][1]]]
report['coordinateSystem']='+X forward, +Y up, feet at Y=0'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'.tools/assets/quaternius'/f'{SPECIES}-authored.blend'))
(DEST/f'{SPECIES}-source.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print('DERIVED_REPORT',json.dumps(report))
