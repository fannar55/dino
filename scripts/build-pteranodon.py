"""Author the game's original, rigged Pteranodon in headless Blender.

No downloaded geometry, texture, or animation is used. Anatomical references:
https://www.amnh.org/explore/ology/ology-cards/358-pteranodon-longiceps
https://www.amnh.org/exhibitions/permanent/vertebrate-origins/pterosaurs

Run Blender 5.2 --background --factory-startup --disable-autoexec --python thisfile.
Game coordinates are +X forward, +Y up; the exported GLB is self-contained.
"""
import bpy, math, json, pathlib, hashlib, sys
from mathutils import Vector, Quaternion, Matrix
from mathutils.noise import noise

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist/assets/pteranodon'
PRIVATE = ROOT / '.tools/assets/pteranodon'
QA = ROOT / 'qa'
for folder in (OUT, PRIVATE, QA): folder.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 24

def g(p): return Vector((p[0], -p[2], p[1]))
def game(p): return Vector((p.x, p.z, -p.y))
def srgb(code):
    rgb = [int(code[i:i+2], 16)/255 for i in (1,3,5)]
    return tuple(c/12.92 if c <= .04045 else ((c+.055)/1.055)**2.4 for c in rgb)+(1,)
def lerp(a,b,t): return a*(1-t)+b*t
def clamp(x,a=0,b=1): return max(a,min(b,x))
def smooth(x): x=clamp(x); return x*x*(3-2*x)

def mat(name, color, rough=.7, paint=False):
    m=bpy.data.materials.new(name); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=srgb(color)
    p.inputs['Roughness'].default_value=rough
    m.diffuse_color=srgb(color)
    if paint:
        a=m.node_tree.nodes.new('ShaderNodeVertexColor'); a.layer_name='SkinPaint'
        m.node_tree.links.new(a.outputs['Color'],p.inputs['Base Color'])
    return m
skin=mat('Warm russet skin with cream underside','#c07f57',paint=True)
membrane=mat('Flexible ochre wing membrane','#dca06d',paint=True)
beak=mat('Smooth toothless ivory beak','#e9c992',.65)
mouth=mat('Soft mouth seam','#784e3e',.82)
crestmat=mat('Warm terracotta crest','#c87555',paint=True)
eyelidmat=mat('Soft amber eye socket','#b97448',.75)
sclera=mat('Warm ivory eyes','#fff0cb',.4)
iris=mat('Moss green iris','#587561',.32)
pupil=mat('Round dark pupil','#283c38',.25)
shine=mat('Eye light','#fff9e4',.18)
claw=mat('Small blunt claws','#ead6b1',.78)

meshes=[]; rigid={}; wing_paths={}
def mesh(name,verts,faces,material,rigid_bone=None):
    data=bpy.data.meshes.new(name); data.from_pydata([g(p) for p in verts],[],faces); data.update()
    obj=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(obj)
    data.materials.append(material)
    for p in data.polygons: p.use_smooth=True
    meshes.append(obj)
    if rigid_bone: rigid[obj.name]=rigid_bone
    return obj

def ellipsoid(name,center,scale,material,segments=24,rings=12,bone=None):
    verts=[]; faces=[]
    for j in range(rings+1):
        theta=math.pi*j/rings
        for i in range(segments):
            phi=2*math.pi*i/segments
            verts.append((center[0]+scale[0]*math.cos(phi)*math.sin(theta),
                          center[1]+scale[1]*math.cos(theta),
                          center[2]+scale[2]*math.sin(phi)*math.sin(theta)))
    for j in range(rings):
        for i in range(segments):
            a=j*segments+i; b=j*segments+(i+1)%segments
            faces.append((a,b,b+segments,a+segments))
    return mesh(name,verts,faces,material,bone)

def tube(name,points,radii,material,sides=10,bone=None):
    verts=[]; faces=[]
    for j,point in enumerate(points):
        p=Vector(point)
        tangent=(Vector(points[min(j+1,len(points)-1)])-Vector(points[max(0,j-1)])).normalized()
        axis=tangent.cross(Vector((0,1,0)))
        if axis.length<.01: axis=tangent.cross(Vector((0,0,1)))
        axis.normalize(); other=tangent.cross(axis).normalized()
        for i in range(sides):
            a=2*math.pi*i/sides
            verts.append(tuple(p+radii[j]*(axis*math.cos(a)+other*math.sin(a))))
    for j in range(len(points)-1):
        for i in range(sides):
            a=j*sides+i; b=j*sides+(i+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.extend([tuple(reversed(range(sides))),tuple((len(points)-1)*sides+i for i in range(sides))])
    return mesh(name,verts,faces,material,bone)

def loft(name,sections,material,sides=24,bone=None):
    verts=[]; faces=[]
    for x,y,ry,rz in sections:
        for i in range(sides):
            a=2*math.pi*i/sides
            verts.append((x,y+ry*math.cos(a),rz*math.sin(a)))
    for j in range(len(sections)-1):
        for i in range(sides):
            a=j*sides+i; b=j*sides+(i+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.extend([tuple(reversed(range(sides))),tuple((len(sections)-1)*sides+i for i in range(sides))])
    return mesh(name,verts,faces,material,bone)

# Body, curved neck, skull, limbs, and leading wing arms are fused into a single
# sculpted surface. The membrane has a separate material but overlaps this skin
# along its entire leading edge and at the hip; it shares the same bone weights.
body=loft('Continuous body neck and skull',[
    (-.87,.88,.025,.025),(-.73,.91,.105,.09),(-.52,.99,.23,.17),
    (-.24,1.06,.31,.235),(.07,1.10,.31,.25),(.28,1.20,.24,.21),
    (.40,1.41,.17,.15),(.54,1.64,.16,.15),(.73,1.74,.22,.185),
    (.93,1.72,.18,.15),(1.10,1.65,.075,.07)],skin)
core=[body]
for side,sgn in [('L',1),('R',-1)]:
    path=[(.01,1.18,.21*sgn),(-.22,1.16,.75*sgn),(.29,1.15,1.25*sgn),
          (.04,1.16,2.05*sgn),(-.59,1.12,2.81*sgn)]
    wing_paths[side]=path
    core.append(tube('Wing leading arm '+side,path,[.125,.085,.067,.032,.009],skin,12))
    core.append(ellipsoid('Wing wrist '+side,path[2],(.10,.07,.085),skin,16,8))
    leg=[(-.43,.93,.14*sgn),(-.37,.56,.29*sgn),(-.60,.12,.36*sgn),(-.39,.058,.41*sgn)]
    core.append(tube('Hind leg '+side,leg,[.105,.07,.04,.045],skin,12))
    for k in range(3):
        z=(.35+k*.06)*sgn
        core.append(tube('Foot toe '+side+str(k),[(-.57,.07,z),(-.38,.042,z),(-.28,.035,z+.02*sgn)], [.025,.022,.009],skin,8))
        tube('Foot claw '+side+str(k),[(-.32,.04,z+.012*sgn),(-.24,.035,z+.02*sgn)], [.021,.003],claw,8,'Foot'+side)
    for k in range(3):
        p=Vector(path[2]); p.x+=k*.04-.025; p.z+=sgn*(k*.01-.035)
        points=[tuple(p),tuple(p+Vector((.13,.005,-sgn*.015))),tuple(p+Vector((.18,-.035,-sgn*.005)))]
        core.append(tube('Free wing finger '+side+str(k),points,[.024,.018,.008],skin,8))
        tube('Blunt hand claw '+side+str(k),[points[-2],points[-1]], [.017,.003],claw,8,'Hand'+side)

bpy.ops.object.select_all(action='DESELECT')
for obj in core: obj.select_set(True)
bpy.context.view_layer.objects.active=body
bpy.ops.object.join()
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
rem=body.modifiers.new('Continuous sculpted skin','REMESH'); rem.mode='VOXEL'; rem.voxel_size=.027; rem.use_smooth_shade=True
bpy.ops.object.modifier_apply(modifier=rem.name)
sm=body.modifiers.new('Relax anatomical transitions','SMOOTH'); sm.factor=.55; sm.iterations=5
bpy.ops.object.modifier_apply(modifier=sm.name)
dec=body.modifiers.new('Mobile sculpt topology','DECIMATE'); dec.ratio=.45
bpy.ops.object.modifier_apply(modifier=dec.name)
body.data.validate(clean_customdata=True)
body.data.update()
for p in body.data.polygons: p.use_smooth=True

# A toothless, gently tapered beak, open only as a narrow smiling mouth seam.
loft('Upper toothless beak',[(.93,1.704,.11,.13),(1.10,1.657,.094,.122),
    (1.36,1.587,.059,.084),(1.69,1.517,.030,.039),(2.015,1.477,.003,.003)],beak,24,'Head')
loft('Lower toothless beak',[(.95,1.588,.033,.108),(1.13,1.563,.031,.103),
    (1.42,1.512,.022,.065),(1.74,1.478,.009,.028),(2.01,1.476,.001,.002)],beak,20,'Jaw')
for side,sgn in [('L',1),('R',-1)]:
    tube('Friendly mouth seam '+side,[(.90,1.615,.118*sgn),(1.12,1.588,.112*sgn),
        (1.38,1.539,.079*sgn),(1.72,1.490,.035*sgn),(1.985,1.477,.004*sgn)], [.007,.006,.004,.003,.001],mouth,6,'Head')
    ellipsoid('Nostril '+side,(1.16,1.693,.071*sgn),(.035,.013,.013),mouth,12,6,'Head')

# Pteranodon longiceps' backward cranial crest; a skin-covered, pointed skull
# extension, not a dragon horn. The base blends into the skull behind the eyes.
crest_sections=[(-.72,2.235,.005,.003),(-.49,2.206,.039,.017),(-.18,2.164,.066,.030),
    (.10,2.092,.10,.043),(.35,1.999,.145,.067),(.58,1.89,.17,.094),(.75,1.805,.11,.125)]
crest=loft('Long backward cranial crest',crest_sections,crestmat,20,'Head')

# Eyes are modelled into the skin, including eyelid rims, pupils and tiny glints.
# They remain visibly warm when the whole animal is framed against the sky.
for side,sgn in [('L',1),('R',-1)]:
    ellipsoid('Eye socket '+side,(.758,1.796,.163*sgn),(.137,.126,.05),eyelidmat,24,12,'Head')
    ellipsoid('Warm eye '+side,(.789,1.802,.191*sgn),(.099,.10,.038),sclera,24,12,'Head')
    ellipsoid('Iris '+side,(.821,1.799,.224*sgn),(.054,.067,.016),iris,20,10,'Head')
    ellipsoid('Pupil '+side,(.830,1.801,.236*sgn),(.032,.044,.010),pupil,16,8,'Head')
    ellipsoid('Eye glint '+side,(.844,1.829,.244*sgn),(.012,.016,.005),shine,12,6,'Head')
    tube('Soft brow '+side,[(.677,1.860,.176*sgn),(.722,1.905,.186*sgn),(.788,1.916,.187*sgn),(.854,1.878,.177*sgn)], [.022,.025,.024,.015],skin,8,'Head')

def interp(points,t):
    i=min(int(t),len(points)-2); f=t-i
    return Vector(points[i]).lerp(Vector(points[i+1]),f)

# The single stretched fourth finger supports each skin membrane. A subtly
# cambered sheet is continuous from the flank/ankle to the wingtip. There are
# no bat-like radiating fingers. Its ribs are painted folds rather than bones.
membranes=[]
for side,sgn in [('L',1),('R',-1)]:
    path=wing_paths[side]
    trailing=[(-.59,.20,.37*sgn),(-.86,.96,.75*sgn),(-.88,1.08,1.25*sgn),(-.76,1.12,2.05*sgn),(-.59,1.12,2.81*sgn)]
    verts=[]; faces=[]; weights=[]
    ns=48; nc=12
    for i in range(ns+1):
        t=i/ns*4; lead=interp(path,t); trail=interp(trailing,t)
        for j in range(nc+1):
            q=j/nc
            p=lead.lerp(trail,q)
            p.y+=.065*math.sin(math.pi*q)*math.sin(math.pi*i/ns)
            # Small trailing-edge scallops give a taut, living membrane outline.
            p.x-=.027*math.sin(math.pi*6*i/ns)**2*q*q*math.sin(math.pi*i/ns)
            verts.append(tuple(p)); weights.append((t,q))
    for i in range(ns):
        for j in range(nc):
            a=i*(nc+1)+j
            face=(a,a+nc+1,a+nc+2,a+1)
            faces.append(face if sgn==1 else tuple(reversed(face)))
    obj=mesh('Continuous wing membrane '+side,verts,faces,membrane)
    obj['wing_side']=side
    obj['weight_coordinates']=[v for pair in weights for v in pair]
    # Keep geometry thin and double-sided; glTF material doubleSided exports
    # automatically when backface culling is off. No co-planar duplicated sheet.
    membranes.append(obj)

# Paint color at vertices, avoiding all network/texture dependencies.
def paint_mesh(obj):
    if not any(m and m in [skin,membrane,crestmat] for m in obj.data.materials): return
    paint=obj.data.color_attributes.new(name='SkinPaint',type='FLOAT_COLOR',domain='POINT')
    obj.data.color_attributes.active_color=paint
    upper=Vector(srgb('#b87b56')[:3]); underside=Vector(srgb('#eed6ae')[:3])
    for v in obj.data.vertices:
        p=game(v.co)
        if obj in membranes:
            side=obj['wing_side']; t,q=[obj['weight_coordinates'][v.index*2+k] for k in range(2)]
            base=Vector(srgb('#d8a473')[:3]).lerp(Vector(srgb('#a96148')[:3]),smooth((q-.54)*2.4)*.42)
            band=(.5+.5*math.sin(p.z*8.3+p.x*4.8))**12
            base*=.97-.17*band*smooth((abs(p.z)-.50)/.6)
            edge=(smooth((q-.90)*10)+smooth((.09-q)*11))*.12
            base*=1-edge
        elif obj==crest:
            base=Vector(srgb('#c87b56')[:3]).lerp(Vector(srgb('#e4bd7c')[:3]),smooth((p.y-1.88)*2.5)*.45)
            base*=.98+.045*math.sin(p.x*21+p.y*7)
        else:
            belly=smooth((1.11-p.y)/.30)*smooth((.44-abs(p.z))/.2)
            base=upper.lerp(underside,belly*.9)
            if p.x>.45: base=base.lerp(Vector(srgb('#c99161')[:3]),.4)
            freckles=max(0,math.sin(p.x*34+p.y*13)*math.sin(p.z*41+p.x*8)-.70)*.11
            base*=.96+noise(p*9.4)*.05-freckles
        paint.data[v.index].color=tuple(clamp(c) for c in base)+(1,)
for obj in meshes: paint_mesh(obj)

# Skeleton. Bone names and standard glTF animation clips are the only runtime
# contract; all deformation and appearance live in the asset itself.
arm_data=bpy.data.armatures.new('Pteranodon skeleton')
arm=bpy.data.objects.new('Pteranodon',arm_data); bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active=arm; arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bone_specs={}
def bone(name,head,tail,parent=None):
    b=arm_data.edit_bones.new(name); b.head=g(head); b.tail=g(tail)
    if parent: b.parent=arm_data.edit_bones[parent]
    bone_specs[name]=(Vector(head),Vector(tail),parent)
bone('Root',(0,0,0),(0,.25,0))
bone('Body',(-.48,1.02,0),(.26,1.19,0),'Root')
bone('Neck',(.26,1.19,0),(.57,1.64,0),'Body')
bone('Head',(.57,1.64,0),(1.09,1.66,0),'Neck')
bone('Jaw',(.94,1.60,0),(1.60,1.49,0),'Head')
for side,sgn in [('L',1),('R',-1)]:
    p=wing_paths[side]
    bone('Wing'+side,p[0],p[1],'Body')
    bone('ForeWing'+side,p[1],p[2],'Wing'+side)
    bone('Hand'+side,p[2],p[3],'ForeWing'+side)
    bone('WingTip'+side,p[3],p[4],'Hand'+side)
    bone('Thigh'+side,(-.43,.93,.14*sgn),(-.37,.56,.29*sgn),'Body')
    bone('Shin'+side,(-.37,.56,.29*sgn),(-.60,.12,.36*sgn),'Thigh'+side)
    bone('Foot'+side,(-.60,.12,.36*sgn),(-.30,.04,.41*sgn),'Shin'+side)
bpy.ops.object.mode_set(mode='OBJECT')

def distance_segment(p,a,b):
    d=b-a; t=clamp((p-a).dot(d)/d.length_squared)
    return (p-(a+d*t)).length
def closest_weights(p,names):
    scored=sorted((distance_segment(p,*bone_specs[n][:2]),n) for n in names)[:2]
    # Blend through each joint, but keep remote bones out of thin fingertips.
    weights=[1/max(.025,d)**3 for d,n in scored]
    total=sum(weights)
    return {scored[i][1]:weights[i]/total for i in range(len(scored))}
def wing_weights(t,q,side):
    centers=[.4,1.5,2.5,3.6]
    names=['Wing'+side,'ForeWing'+side,'Hand'+side,'WingTip'+side]
    if t<=centers[0]: w={names[0]:1.0}
    elif t>=centers[-1]: w={names[-1]:1.0}
    else:
        i=next(i for i in range(3) if centers[i]<=t<centers[i+1])
        a=smooth((t-centers[i])/(centers[i+1]-centers[i]))
        w={names[i]:1-a,names[i+1]:a}
    # Hip attachment stays anchored to its hind leg when the wing moves.
    anchor=(1-smooth(t/.75))*smooth(q)
    if anchor>0:
        w={n:v*(1-anchor) for n,v in w.items()}
        w['Shin'+side]=anchor
    return w

for obj in meshes:
    obj.parent=arm
    groups={n:obj.vertex_groups.new(name=n) for n in bone_specs}
    for v in obj.data.vertices:
        p=game(v.co); side='L' if p.z>=0 else 'R'
        if obj.name in rigid: w={rigid[obj.name]:1.0}
        elif obj in membranes:
            t,q=obj['weight_coordinates'][v.index*2:v.index*2+2]
            w=wing_weights(t,q,obj['wing_side'])
        elif abs(p.z)>.39 and p.y>.83:
            path=wing_paths[side]
            # Use the same span interpolation as the adjacent membrane edge.
            a=abs(p.z); spans=[abs(v[2]) for v in path]
            k=next((i for i in range(4) if spans[i]<=a<=spans[i+1]),3)
            t=k+clamp((a-spans[k])/(spans[k+1]-spans[k]))
            w=wing_weights(t,0,side)
        elif p.y<.76 and p.x<-.19:
            w=closest_weights(p,['Thigh'+side,'Shin'+side,'Foot'+side])
        elif p.y>1.44 or p.x>.43:
            w=closest_weights(p,['Neck','Head'])
        elif abs(p.z)>.18 and p.y>1.06:
            w=closest_weights(p,['Body','Wing'+side])
        else: w={'Body':1.0}
        total=sum(w.values())
        for name,weight in w.items():
            if weight>1e-5: groups[name].add([v.index],weight/total,'REPLACE')
    mod=obj.modifiers.new('Armature deformation','ARMATURE'); mod.object=arm
    for key in list(obj.keys()): del obj[key]

for p in arm.pose.bones: p.rotation_mode='QUATERNION'

def set_rotation(name,axis,degrees):
    b=arm.pose.bones[name]
    # Rotate around a game-space axis expressed in the rest bone's local frame.
    local_axis=b.bone.matrix_local.to_3x3().inverted()@g(axis)
    b.rotation_quaternion=Quaternion(local_axis,math.radians(degrees))

def animate(name,seconds,kind):
    action=bpy.data.actions.new(name); action.use_fake_user=True
    arm.animation_data_create(); arm.animation_data.action=action
    frames=round(seconds*24)
    for frame in range(frames+1):
        t=frame/frames; phase=t*2*math.pi
        for b in arm.pose.bones:
            b.location=(0,0,0); b.rotation_quaternion=(1,0,0,0); b.scale=(1,1,1)
        fold=0; flap=0; flutter=0; bob=0
        if kind=='fly':
            flap=25*math.sin(phase); flutter=11*math.sin(phase-.52)
            bob=.045*math.cos(phase)
        elif kind=='glide':
            flap=-8+2*math.sin(phase); flutter=1.8*math.sin(phase+.6)
            bob=.018*math.sin(phase)
        elif kind=='idle': fold=1
        elif kind=='landing':
            fold=smooth((t-.3)/.7)
            flap=(1-fold)*(13*math.sin(phase*1.5)-12)
            flutter=(1-fold)*7*math.sin(phase*1.5-.5)
        set_rotation('Neck',(0,0,1),1.6*math.sin(phase)*(1-fold))
        set_rotation('Head',(0,1,0),2.4*math.sin(phase)*(1 if kind=='idle' else .5))
        set_rotation('Jaw',(0,0,1),-.5-.35*math.sin(phase))
        arm.pose.bones['Body'].location=g((0,bob,0))
        arm.pose.bones['Body'].scale=(1,1,1+.007*math.sin(phase))
        for side,sgn in [('L',1),('R',-1)]:
            # Downstroke and its delayed outer-wing twist are smooth and
            # bilateral; the wings fold backwards, never into bat fingers.
            set_rotation('Wing'+side,(1,0,0),sgn*(-flap+fold*46))
            set_rotation('ForeWing'+side,(0,1,0),-sgn*fold*52)
            set_rotation('Hand'+side,(0,1,0),-sgn*fold*83)
            set_rotation('WingTip'+side,(1,0,0),sgn*(-flutter+fold*8))
            if kind!='idle':
                set_rotation('Thigh'+side,(0,0,1),-24*(1-fold))
                set_rotation('Shin'+side,(0,0,1),-24*(1-fold))
                set_rotation('Foot'+side,(0,0,1),20*(1-fold))
            for name in ('Wing','ForeWing','Hand','WingTip'):
                b=arm.pose.bones[name+side]
                if name=='Hand' and kind!='idle':
                    twist=b.bone.matrix_local.to_3x3().inverted()@g((0,0,sgn))
                    b.rotation_quaternion=b.rotation_quaternion@Quaternion(twist,math.radians(flutter*.22))
        for b in arm.pose.bones:
            b.keyframe_insert('rotation_quaternion',frame=frame,group=b.name)
            if b.name=='Body':
                b.keyframe_insert('location',frame=frame,group=b.name)
                b.keyframe_insert('scale',frame=frame,group=b.name)
    return action

actions={name:animate(name,sec,kind) for name,sec,kind in [
    ('fly',1.75,'fly'),('glide',4.0,'glide'),('idle',4.0,'idle'),('landing',2.5,'landing')]}
arm.animation_data.action=actions['glide']; scene.frame_set(0); bpy.context.view_layer.update()

# One skin and one primitive per material keep mobile draw calls bounded. Give
# unpainted detail meshes white vertex colors before joining so COLOR_0 never
# darkens their ordinary PBR material values in glTF.
for obj in meshes:
    if not obj.data.color_attributes.get('SkinPaint'):
        paint=obj.data.color_attributes.new(name='SkinPaint',type='FLOAT_COLOR',domain='POINT')
        obj.data.color_attributes.active_color=paint
        for value in paint.data: value.color=(1,1,1,1)
bpy.ops.object.select_all(action='DESELECT')
for obj in meshes: obj.select_set(True)
bpy.context.view_layer.objects.active=body
bpy.ops.object.join()
body.name='Pteranodon sculpted skin and membranes'
body.data.validate(clean_customdata=True); body.data.update()
meshes=[body]

target=OUT/'pteranodon.glb'
bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',export_animations=True,
    export_animation_mode='ACTIONS',export_anim_single_armature=True,export_anim_slide_to_zero=True,
    export_force_sampling=True,export_optimize_animation_size=True,export_yup=True,
    export_cameras=False,export_lights=False,export_extras=False,export_materials='EXPORT',
    export_morph=False,export_skins=True)
bpy.ops.wm.save_as_mainfile(filepath=str(PRIVATE/'pteranodon.blend'))

# Neutral studio previews sample real armature poses, not static mesh bounds.
scene.render.engine='CYCLES'; scene.cycles.samples=20
scene.render.threads_mode='FIXED'; scene.render.threads=4
scene.render.resolution_x=1100; scene.render.resolution_y=800; scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Preview World'); scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.72,.82,.84,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.65
for position,energy,size in [((2,-4,7),950,5),((-4,3,5),700,4),((1,4,3),350,3)]:
    bpy.ops.object.light_add(type='AREA',location=position); light=bpy.context.object
    light.data.energy=energy; light.data.shape='DISK'; light.data.size=size
bpy.ops.object.camera_add(); camera=bpy.context.object; scene.camera=camera
camera.data.type='ORTHO'
scene.view_settings.view_transform='Standard'
scene.view_settings.look='Medium High Contrast' if 'Medium High Contrast' in [i.name for i in scene.view_settings.bl_rna.properties['look'].enum_items] else 'None'

renders=[('glide',0,'three-quarter',(4.4,-6.5,4.6),6.7),
         ('fly',10,'upstroke',(4.4,-6.5,4.6),6.7),
         ('fly',31,'downstroke',(4.4,-6.5,4.6),6.7),
         ('landing',34,'landing',(4.4,-6.5,3.2),5.7),
         ('idle',20,'perch',(4.4,-6.5,3.2),5.1),
         ('glide',0,'side',(3,-8,2.2),5.7)]
for clip,frame,label,position,scale in renders:
    if '--perch-only' in sys.argv and label!='perch': continue
    arm.animation_data.action=actions[clip]; scene.frame_set(frame)
    camera.location=position; camera.rotation_euler=(g((.1,1.05,0))-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.ortho_scale=scale
    scene.render.filepath=str(QA/f'pteranodon-{label}.png')
    bpy.ops.render.render(write_still=True)

triangles=sum(sum(len(p.vertices)-2 for p in obj.data.polygons) for obj in meshes)
stats={'file':target.name,'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),
    'triangles':triangles,'bones':len(arm_data.bones),'clips':{n:round(a.frame_range[1]/24,3) for n,a in actions.items()},
    'axes':'+X forward, +Y up, feet on ground in authored rest pose',
    'geometry':'Original continuous sculpted skin with independently skinned membrane surfaces, fourth-finger wings, toothless beak and long rear crest.',
    'appearance':'Original vertex colors; no image textures or external resources.',
    'generator':'scripts/build-pteranodon.py',
    'anatomyReferences':['https://www.amnh.org/explore/ology/ology-cards/358-pteranodon-longiceps','https://www.amnh.org/exhibitions/permanent/vertebrate-origins/pterosaurs']}
(OUT/'source.json').write_text(json.dumps(stats,ensure_ascii=False,indent=2),encoding='utf8')
(OUT/'PROVENANCE.txt').write_text('Original Pteranodon geometry, vertex paint, skeleton and animation authored for Stjörnufar.\nNo downloaded model, texture, animation or other third-party artwork is incorporated.\nAnatomy references (facts only, no copied artwork):\nhttps://www.amnh.org/explore/ology/ology-cards/358-pteranodon-longiceps\nhttps://www.amnh.org/exhibitions/permanent/vertebrate-origins/pterosaurs\nReproducible generator: scripts/build-pteranodon.py (headless Blender 5.2).\n',encoding='utf8')
print('PTERANODON_REPORT',json.dumps(stats))
