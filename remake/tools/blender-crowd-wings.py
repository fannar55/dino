# The flyer's half of remake/tools/blender-crowd.py. A rig file of kind "winged" (wings, not legs: the owner's flugdýr) is rigged,
# posed, frozen and exported here, in blender-crowd.py's own namespace: that script runs this file once its near and far meshes
# are made and painted (its steps 1 to 3), and the names used here without being made here (high, near, far, middle, J, J_TAIL,
# height, LENGTH, CLIPS, FRAMES, SECONDS, BLEND, OUT, REPORT, report, log, tris, select_only, scene) are that script's.
# Its steps 4 to 7 again, with wings for legs:
#   0. stands it on its toes: its tail's vane reaches the ground too, so the middle of its lowest points lies behind its feet;
#   4. the skeleton: hips, spine, chest, neck, head and the tail as there; each leg a thigh and a foot; each wing an upper arm,
#      a forearm and the long finger in two (wrist to knuckle, knuckle to tip). Bone-heat weights on the middle mesh, carried to
#      near and far; outside the body a wing's membrane follows its own wing's bones only (bone heat gives its lower edge to the
#      legs and the tail as well);
#   5. the clips below: every bone turned in its parent's frame (no IK: in `perch` the hips keep still, so the feet do);
#   6. each clip's frames frozen into shape keys `<clip>.<k>` of both meshes;
#   7. near and far exported with their morph targets, and the report.
# The owner's flyer stands upright like a puffin and holds its wings out, each membrane hanging down from its arm like a
# curtain: seen from above a wing is a thin rod. In flight (flap, glide) its body leans into the flight and each wing turns
# about the line from its shoulder to its tip, so the membrane swings back and lies flat behind the arm; perched, each wing
# folds at elbow and wrist like a folding screen and hangs along its side.
# Turns as in blender-crowd.py: about the animal's own axes, X forward, Y its left, Z up (pitch about Y, positive dips the nose;
# yaw about Z, positive turns to its left; roll about X). A wing bone's own turns are named for the wing (see wing_turn, bend).

# ---- 0. on its toes ---------------------------------------------------------------------------------------------------------
co = np.empty(len(high.data.vertices) * 3, np.float32)
high.data.vertices.foreach_get('co', co)
co = co.reshape(-1, 3)
low = co[co[:, 2] < 0.03 * height]
feet = []
for s in 'LR':
    toe = np.array(J[f'toe.{s}'][:2])
    feet.append(Vector(low[np.linalg.norm(low[:, :2] - toe, axis=1) < 0.08 * LENGTH].mean(axis=0)))
mid = (feet[0] + feet[1]) / 2
shift = Matrix.Translation((-mid.x, -mid.y, 0))
for obj in (high, near, far, middle):
    obj.data.transform(shift)
J = {name: shift @ p for name, p in J.items()}
J_TAIL = [shift @ p for p in J_TAIL]
del co, low
log(f'on its toes: the origin moved {mid.x:.3f} m forward and {mid.y:.3f} m to its left, between its toes')

# ---- 4. the rig ---------------------------------------------------------------------------------------------------------------
BONES = {  # name: (head, tail, parent)
    'hips': (J['hips'], J['spine'], None),
    'spine': (J['spine'], J['chest'], 'hips'),
    'chest': (J['chest'], J['neck'], 'spine'),
    'neck': (J['neck'], J['head'], 'chest'),
    'head': (J['head'], J['nose'], 'neck'),
}
for k in range(len(J_TAIL) - 1):
    BONES[f'tail.{k}'] = (J_TAIL[k], J_TAIL[k + 1], 'hips' if k == 0 else f'tail.{k - 1}')
WING = {}
for s in 'LR':
    BONES[f'thigh.{s}'] = (J[f'hip.{s}'], J[f'ankle.{s}'], 'hips')
    BONES[f'foot.{s}'] = (J[f'ankle.{s}'], J[f'toe.{s}'], f'thigh.{s}')
    joints = [f'shoulder.{s}', f'elbow.{s}', f'wrist.{s}', f'knuckle.{s}', f'tip.{s}']
    WING[s] = [f'upperarm.{s}', f'forearm.{s}', f'finger.{s}', f'fingertip.{s}']
    for k, bone in enumerate(WING[s]):
        BONES[bone] = (J[joints[k]], J[joints[k + 1]], 'chest' if k == 0 else WING[s][k - 1])
NAMES = list(BONES)
TAILS = [n for n in NAMES if n.startswith('tail.')]
report['joints'] = {n: [round(c, 4) for c in BONES[n][0]] for n in NAMES}

arm_data = bpy.data.armatures.new('rig')
rig = bpy.data.objects.new('rig', arm_data)
scene.collection.objects.link(rig)
select_only(rig)
bpy.ops.object.mode_set(mode='EDIT')
for name in NAMES:
    bone = arm_data.edit_bones.new(name)
    bone.head, bone.tail = BONES[name][0], BONES[name][1]
for name in NAMES:
    if BONES[name][2]:
        arm_data.edit_bones[name].parent = arm_data.edit_bones[BONES[name][2]]
bpy.ops.object.mode_set(mode='OBJECT')
select_only(rig)
middle.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
mid_weights = np.zeros((len(middle.data.vertices), len(NAMES)))
index = {n: i for i, n in enumerate(NAMES)}
groups = {g.index: g.name for g in middle.vertex_groups}
for v in middle.data.vertices:
    for g in v.groups:
        if groups[g.group] in index:
            mid_weights[v.index, index[groups[g.group]]] = g.weight
unweighted = int((mid_weights.sum(axis=1) < 1e-6).sum())
if unweighted:
    report['warnings'].append(f'bone heat left {unweighted} of {len(mid_weights)} vertices without a bone')


def nearest_bone(co):
    best, which = 1e9, 0
    for i, name in enumerate(NAMES):
        a, b = BONES[name][0], BONES[name][1]
        ab = b - a
        t = max(0.0, min(1.0, (co - a).dot(ab) / ab.length_squared))
        d = (a + ab * t - co).length
        if d < best:
            best, which = d, i
    return which


for i in np.nonzero(mid_weights.sum(axis=1) < 1e-6)[0]:
    mid_weights[i, nearest_bone(middle.data.vertices[i].co)] = 1
mid_weights /= mid_weights.sum(axis=1, keepdims=True)


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


# A wing's membrane, out from the body's side and above its hips, follows that wing's bones only: in from the shoulder it blends
# into bone heat's own weights (the body's side, the legs where the membrane meets them).
SIDE = abs(J['shoulder.L'].y)
SPREAD = 0.06 * LENGTH
HIP_Z = J['hip.L'].z
taken = 0
for v in middle.data.vertices:
    s = 'L' if v.co.y > 0 else 'R'
    out = smooth((abs(v.co.y) - SIDE) / SPREAD) * smooth((v.co.z - HIP_Z) / SPREAD)
    if out <= 0:
        continue
    w = mid_weights[v.index]
    own = np.zeros(len(NAMES))
    cols = [index[b] for b in WING[s]]
    own[cols] = w[cols]
    if own.sum() < 1e-6:
        own[nearest_bone(v.co)] = 1
    own /= own.sum()
    if out >= 1 and 1 - w[cols].sum() > 0.1:
        taken += 1
    mid_weights[v.index] = (1 - out) * w + out * own
report['membrane'] = {'side': round(SIDE, 4), 'spread': round(SPREAD, 4), 'taken': taken}
log(f'membrane: {taken} vertices out on the wings had more than a tenth of their weight on other bones (given to the wing)')
log('weights: ' + ', '.join(f'{n} {mid_weights[:, i].sum():.0f}' for i, n in enumerate(NAMES)))
bare = [n for i, n in enumerate(NAMES) if mid_weights[:, i].max() < 0.5]
if bare:
    report['warnings'].append(f'no vertex is mostly {", ".join(bare)}')

mid_points = [v.co.copy() for v in middle.data.vertices]
mid_faces = [tuple(p.vertices) for p in middle.data.polygons]
tree = BVHTree.FromPolygons(mid_points, mid_faces)


def carried_weights(obj):
    out = np.zeros((len(obj.data.vertices), len(NAMES)))
    for v in obj.data.vertices:
        at, _, face, _ = tree.find_nearest(v.co)
        a, b, c = (mid_points[i] for i in mid_faces[face])
        bary = barycentric_transform(at, a, b, c, Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))
        w = np.array([max(0.0, x) for x in bary])
        w = w / w.sum() if w.sum() > 0 else np.array([1.0, 0, 0])
        out[v.index] = sum(w[k] * mid_weights[i] for k, i in enumerate(mid_faces[face]))
    out[out < 0.01] = 0  # drop specks of far bones
    return out / out.sum(axis=1, keepdims=True)


WEIGHTS = {near.name: carried_weights(near), far.name: carried_weights(far)}

# ---- 5. the clips -----------------------------------------------------------------------------------------------------------
D = math.radians
TAU = 2 * math.pi
U = LENGTH


def R(pitch=0.0, yaw=0.0, roll=0.0):
    return Matrix.Rotation(D(yaw), 3, 'Z') @ Matrix.Rotation(D(pitch), 3, 'Y') @ Matrix.Rotation(D(roll), 3, 'X')


def keyed(keys, u):
    """Eases between [(u, value)] keys, flat at each key."""
    for (a, va), (b, vb) in zip(keys, keys[1:]):
        if u <= b:
            return va + (vb - va) * smooth((u - a) / (b - a)) if b > a else vb
    return keys[-1][1]


def bump(u, a, b):
    """0 outside a..b, rising smoothly to 1 in the middle."""
    return math.sin(math.pi * max(0.0, min(1.0, (u - a) / (b - a)))) ** 2


# The line each wing turns about to lie flat: from its shoulder out to its tip, pointing to the animal's left on both sides, so a
# positive turn swings either membrane's lower edge back.
SPAN = {s: ((J[f'tip.{s}'] - J[f'shoulder.{s}']) * (1 if s == 'L' else -1)).normalized() for s in 'LR'}
FLAT = 80.0  # degrees from hanging to flat: the membrane already slopes back about 10 degrees as he made it


def wing_turn(s, lift=0.0, back=0.0, flat=0.0, tilt=0.0):
    """The upper arm's turn in the chest's frame: the whole wing turned `flat` degrees about its span line (FLAT lays the
    membrane flat behind the arm), then swept `back` degrees (about Z) and raised `lift` degrees, as either side sees it. The
    wing rises about the chest's forward axis tipped `tilt` degrees nose-up: a body leaning forward LEAN degrees strokes about
    the level when tilt is LEAN, and a little more makes the downstroke reach forward as a flyer's does."""
    m = 1 if s == 'L' else -1
    stroke = Matrix.Rotation(D(-tilt), 3, 'Y') @ Vector((1, 0, 0))
    return Matrix.Rotation(D(m * lift), 3, stroke) @ Matrix.Rotation(D(m * back), 3, 'Z') @ Matrix.Rotation(D(flat), 3, SPAN[s])


def bend(s, back=0.0, fold=0.0):
    """A forearm's or finger's turn in its parent's frame, in the wing's own terms (the membrane hanging below the bone): `back`
    about the vertical through the joint (as he made it: swept back; laid flat: the outer wing bends up), and `fold`, taken
    before the `back` swing, within the membrane's plane as he made it: the bone's far end tips toward the membrane's trailing
    edge (as he made it: down; laid flat: back; folded along the side: down toward the tail)."""
    m = 1 if s == 'L' else -1
    return Matrix.Rotation(D(m * back), 3, 'Z') @ Matrix.Rotation(D(-m * fold), 3, 'X')


LEAN = 30.0  # in flight the body leans this far forward from upright; the wings turn the rest of the way to flat
STROKE = LEAN + 15.0  # the wingbeat's axis, tipped nose-up in the chest's frame (see wing_turn)


def flying(pose, dip=0.0):
    """The flying body: leaning forward, the head brought back level (dipped `dip` degrees), the tail straight back, the legs
    trailing."""
    pose.setdefault('neck', R(pitch=-0.45 * LEAN))
    pose.setdefault('head', R(pitch=-0.55 * LEAN + 4 + dip))
    for s in 'LR':
        pose[f'thigh.{s}'] = R(pitch=45)
        pose[f'foot.{s}'] = R(pitch=35)
    return pose


def clip_flap(u):
    """A wingbeat, looping: the wings at the top of the stroke at frame 1, down through frames 2 to 5 and up again; the outer
    wing lags the arm (bends up as it goes down, down as it goes up), the hand sweeps back on the upstroke; the body rises as the
    wings push down."""
    c, s_ = math.cos(TAU * u), math.sin(TAU * u)
    lag = math.cos(TAU * (u - 0.1))  # where the hand would be, a tenth of a beat late
    lag2 = math.cos(TAU * (u - 0.18))  # and the tip
    up = bump(u, 0.5, 1.0)  # the upstroke
    pose = {
        'hips': (R(pitch=LEAN + 2 * s_), Vector((0, 0, -0.012 * U * c))),
        'spine': R(pitch=-1.5 * s_),
        'neck': R(pitch=-0.45 * LEAN + 2 * s_),
        'head': R(pitch=-0.55 * LEAN + 4 - 1.5 * s_),
    }
    for s in 'LR':
        pose[f'upperarm.{s}'] = wing_turn(s, lift=10 + 38 * c, back=3 + 5 * up, flat=FLAT - LEAN - 6 * s_, tilt=STROKE)
        pose[f'forearm.{s}'] = bend(s, fold=4 * up)
        pose[f'finger.{s}'] = bend(s, back=12 * (lag - c), fold=12 * up)
        pose[f'fingertip.{s}'] = bend(s, back=10 * (lag2 - lag))
    for i, name in enumerate(TAILS):
        pose[name] = R(pitch=(-0.8 * LEAN if i == 0 else 0) + 2.5 * math.sin(TAU * (u - 0.1 * i)))
    return flying(pose)


def clip_glide(u):
    """Gliding, looping: the wings held out flat with a little lift at the tips, the body banking gently one way and back, the head
    looking where it banks, the tail steering."""
    sway = math.sin(TAU * u)
    sway2 = math.sin(TAU * 2 * u + 0.6)
    pose = {
        'hips': (R(pitch=LEAN + 1.0 * sway2, roll=5 * sway), Vector((0, 0, 0.004 * U * sway2))),
        'neck': R(pitch=-0.45 * LEAN, yaw=4 * sway),
        'head': R(pitch=-0.55 * LEAN + 6, yaw=5 * sway, roll=-3 * sway),
    }
    for s in 'LR':
        m = 1 if s == 'L' else -1
        pose[f'upperarm.{s}'] = wing_turn(s, lift=6 - 2 * m * sway, back=2, flat=FLAT - LEAN, tilt=STROKE)
        pose[f'forearm.{s}'] = bend(s)
        pose[f'finger.{s}'] = bend(s, back=-3 - 2 * sway2)
        pose[f'fingertip.{s}'] = bend(s, back=-4 - 2 * sway2)
    for i, name in enumerate(TAILS):
        pose[name] = R(pitch=(-0.8 * LEAN if i == 0 else 0) + 1.5 * sway2, yaw=-2.5 * sway * (1 if i else 0.5))
    return flying(pose)


# Folded like a folding screen along its side: the upper arm straight back, the forearm forward again, the finger back over
# them sloping a little down toward the tail; each membrane hangs as he made it, flat against its side.
FOLD = {'lift': 0.0, 'back': 84.0, 'forearm': -165.0, 'finger': 168.0, 'slope': 14.0, 'fingertip': 6.0}


def clip_perch(u):
    """Sitting on a ledge, looping: the wings folded along its sides, breathing, looking about (to its left, then right), the
    wings settling once and the tail, lifted a little off the ledge, swaying; the hips keep still, so the feet do too."""
    breath = math.sin(TAU * 3 * u)
    look = keyed([(0, 0), (0.08, 0), (0.2, 26), (0.38, 26), (0.6, -22), (0.78, -22), (0.92, 0), (1, 0)], u)
    settle = bump(u, 0.42, 0.62)
    pose = {
        'spine': R(pitch=-1.0 * breath),
        'chest': R(pitch=-1.2 * breath),
        'neck': R(yaw=0.4 * look, pitch=0.8 * breath),
        'head': R(yaw=0.6 * look, roll=0.25 * look, pitch=-3 * smooth(abs(look) / 28)),
    }
    for s in 'LR':
        pose[f'upperarm.{s}'] = wing_turn(s, lift=FOLD['lift'] + 6 * settle, back=FOLD['back'] - 4 * settle)
        pose[f'forearm.{s}'] = bend(s, back=FOLD['forearm'] + 5 * settle)
        pose[f'finger.{s}'] = bend(s, back=FOLD['finger'] - 4 * settle, fold=FOLD['slope'])
        pose[f'fingertip.{s}'] = bend(s, back=FOLD['fingertip'])
    for k, name in enumerate(TAILS):
        wave = TAU * (u - 0.08 * k)
        pose[name] = R(yaw=2.5 * math.sin(wave), pitch=(3.0 if k == 0 else 0.0) + 0.6 * math.sin(wave + 1))
    return pose


CLIP_POSES = {'flap': clip_flap, 'glide': clip_glide, 'perch': clip_perch}
WING_SECONDS = {'flap': 0.5, 'glide': 3.0, 'perch': 4.0}


def T(v):
    return Matrix.Translation(v)


def posed(pose):
    """Each bone's skin matrix (posed world @ rest world inverse) and its posed world matrix."""
    world = {}
    rot, shift = pose.get('hips', (Matrix.Identity(3), Vector()))
    world['hips'] = T(J['hips'] + shift) @ rot.to_4x4()
    for name in NAMES[1:]:
        head, _, parent = BONES[name]
        world[name] = world[parent] @ T(head - BONES[parent][0]) @ pose.get(name, Matrix.Identity(3)).to_4x4()
    return {name: world[name] @ T(-BONES[name][0]) for name in NAMES}, world


def skin(obj, skins):
    rest = np.array([v.co[:] for v in obj.data.vertices])
    mats = np.array([np.array(skins[n]) for n in NAMES])  # bones x 4 x 4
    w = WEIGHTS[obj.name]
    return np.einsum('vb,bij,vj->vi', w, mats[:, :3, :3], rest) + w @ mats[:, :3, 3]


# ---- 6. freeze the frames into shape keys -----------------------------------------------------------------------------------
for obj in (near, far):
    obj.shape_key_add(name='Basis', from_mix=False)
rest = {obj.name: np.array([v.co[:] for v in obj.data.vertices]) for obj in (near, far)}
toes = [np.array(J[f'toe.{s}'][:2]) for s in 'LR']
soles = (rest['near'][:, 2] < 0.015 * U) & (np.min([np.linalg.norm(rest['near'][:, :2] - t, axis=1) for t in toes], axis=0) < 0.08 * U)


def extent(points):
    lo, hi = points.min(axis=0), points.max(axis=0)
    return [round(float(c), 4) for c in hi - lo]


report['rest'] = {'size': extent(rest['near'])}
for clip in CLIPS:
    frames, steps = [], []
    for k in range(FRAMES):
        skins, world = posed(CLIP_POSES[clip](k / FRAMES))
        for obj in (near, far):
            moved = skin(obj, skins)
            key = obj.shape_key_add(name=f'{clip}.{k}', from_mix=False)
            key.data.foreach_set('co', moved.astype(np.float32).ravel())
            if obj is near:
                frames.append(moved)
    for k in range(FRAMES):
        steps.append(float(np.linalg.norm(frames[k] - frames[(k + 1) % FRAMES], axis=1).max()))
    info = {'frames': FRAMES, 'seconds': SECONDS.get(clip, WING_SECONDS.get(clip, 1.0)), 'step': [round(s, 4) for s in steps],
            'size': [extent(f) for f in frames]}
    if clip == 'perch':
        info['soles'] = round(float(max(np.linalg.norm(f[soles] - rest['near'][soles], axis=1).max() for f in frames)), 4)
    report['clips'][clip] = info
    log(f'{clip}: ' + str({k: v for k, v in info.items() if k != 'size'}) + f', size at frame 1 {info["size"][0]}')

# ---- 7. export ---------------------------------------------------------------------------------------------------------------
for obj in (near, far):
    obj.data.name = obj.name
    for key in obj.data.shape_keys.key_blocks:
        key.value = 0.0  # the game sets each critter's own weights
if BLEND:
    for obj in (near, far, middle):
        for i, name in enumerate(NAMES):
            group = obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name)
            w = WEIGHTS[obj.name][:, i] if obj is not middle else mid_weights[:, i]
            for v in np.nonzero(w)[0]:
                group.add([int(v)], float(w[v]), 'REPLACE')
    bpy.ops.wm.save_as_mainfile(filepath=BLEND, copy=True)
bpy.data.objects.remove(middle)
bpy.data.objects.remove(rig)
bpy.data.objects.remove(high)
select_only(near, far)
options = dict(filepath=OUT, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
               export_animations=False, export_skins=False, export_morph=True, export_morph_normal=True,
               export_morph_tangent=False, export_image_format='JPEG', export_jpeg_quality=92, export_extras=False,
               export_try_sparse_sk=False, export_tangents=False, export_materials='EXPORT')
known = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
bpy.ops.export_scene.gltf(**{k: v for k, v in options.items() if k in known})

zs = [v.co.z for v in near.data.vertices]
xs = [v.co.x for v in near.data.vertices]
ys = [v.co.y for v in near.data.vertices]
report.update({
    'length': round(max(xs) - min(xs), 4), 'height': round(max(zs) - min(zs), 4), 'span': round(max(ys) - min(ys), 4), 'pivot': 0,
    'near': {'triangles': tris(near), 'vertices': len(near.data.vertices)},
    'far': {'triangles': tris(far), 'vertices': len(far.data.vertices)},
    'scale': scale,
})
json.dump(report, open(REPORT, 'w', encoding='utf-8'), indent=1)
log('wrote', OUT, 'and', REPORT)
