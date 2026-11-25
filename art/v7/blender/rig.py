"""Catapulte Mania v7: the first rigged character, the soldier, and the states it must hold.

Rigid skinning, as befits the engraved style: every part of the body was tagged with its bone
when it was built (cast.body), so a thigh moves with the thigh and a cuff with the forearm; cloth
that spans two bones (the torso, the tabard) is split by height between hips and spine. The spear
follows the left hand.

A pose is written as directions: for each bone, where it points in the character's space (the
character faces -Y, its right is -X), plus where the hips stand. `aim` turns each bone, parents
first, so a pose reads like a choreographer's note: "left thigh forward, shin straight down".
"""
import math

import bpy
from mathutils import Matrix, Vector

import cast
import kit
import steam
from kit import Part, lin, seed

OUT = math.radians(13)
REST_FOREARM = {s: Vector((s * math.sin(OUT * 0.4), -0.34, -math.cos(OUT * 0.4))).normalized() for s in (-1, 1)}


def landmarks(b=1.0):
    """The bones' heads and tails, from the same numbers cast.body uses (metres, unscaled)."""
    j = {'hips': ((0, 0, 0.92), (0, 0, 1.05)), 'spine': ((0, 0, 1.05), (0, 0.0, 1.47)),
         'neck': ((0, 0.008, 1.49), (0, 0.004, 1.63)), 'head': ((0, 0.004, 1.63), (0, 0.004, 1.88))}
    for sx in (-1, 1):
        sd = cast.side(sx)
        relaxed = sx < 0
        hip = Vector((sx * 0.1 * b, 0, 0.9))
        knee = Vector((sx * 0.095 * b - (0.012 if relaxed else 0), -0.045 if relaxed else -0.012, 0.49 if relaxed else 0.5))
        ankle = Vector((sx * 0.1 * b - (0.03 if relaxed else 0), 0.02 if relaxed else 0.01, 0.1))
        sh = Vector((sx * 0.215 * b, 0, 1.43))
        elbow = sh + Vector((sx * math.sin(OUT), 0.0, -math.cos(OUT))) * 0.29 * b
        wrist = elbow + REST_FOREARM[sx] * 0.26 * b
        j[f'thigh.{sd}'] = (hip, knee)
        j[f'shin.{sd}'] = (knee, ankle)
        j[f'foot.{sd}'] = (ankle, ankle + Vector((0, -0.16, -0.06)))
        j[f'upper_arm.{sd}'] = (sh, elbow)
        j[f'forearm.{sd}'] = (elbow, wrist)
        j[f'hand.{sd}'] = (wrist, wrist + REST_FOREARM[sx] * 0.1)
        if sx > 0:
            grip = wrist + REST_FOREARM[sx] * 0.06
            j['spear'] = (grip, grip + Vector((0, 0, 0.6)))
    return j


PARENTS = {'spine': 'hips', 'neck': 'spine', 'head': 'neck'}
for _s in ('L', 'R'):
    PARENTS.update({f'thigh.{_s}': 'hips', f'shin.{_s}': f'thigh.{_s}', f'foot.{_s}': f'shin.{_s}',
                    f'upper_arm.{_s}': 'spine', f'forearm.{_s}': f'upper_arm.{_s}', f'hand.{_s}': f'forearm.{_s}'})
PARENTS['spear'] = 'hand.L'   # a prop bone: it can stay upright, fall, or fly from the hand
ORDER = ['hips', 'spine', 'neck', 'head'] + [f'{p}.{s}' for s in ('R', 'L') for p in ('thigh', 'shin', 'foot', 'upper_arm', 'forearm', 'hand')] + ['spear']
CONNECTED = {'spine', 'shin.L', 'shin.R', 'forearm.L', 'forearm.R', 'hand.L', 'hand.R', 'head'}


def armature(col, name, at):
    data = bpy.data.armatures.new(name)
    arm = bpy.data.objects.new(name, data)
    arm.location = at
    col.objects.link(arm)
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    marks = landmarks()
    for bname in ORDER:
        eb = data.edit_bones.new(bname)
        eb.head, eb.tail = Vector(marks[bname][0]), Vector(marks[bname][1])
    for bname, parent in PARENTS.items():
        eb = data.edit_bones[bname]
        eb.parent = data.edit_bones[parent]
        eb.use_connect = bname in CONNECTED and (eb.head - eb.parent.tail).length < 1e-4
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def skin(objs, arm):
    for obj in objs:
        if not len(obj.data.vertices):
            continue
        obj.parent = arm
        obj.matrix_parent_inverse = arm.matrix_world.inverted()
        mod = obj.modifiers.new('Armature', 'ARMATURE')
        mod.object = arm


def soldier(col, at, rng):
    """The soldier, built at `at`, skinned to its own armature. Returns the armature."""
    body = cast.Rig(f'soldier_{len(bpy.data.armatures)}')
    m = Matrix.Translation(at)
    a = cast.body(body, m, rng, {'tunic': lin('#7a6a56'), 'chest': lin('#8a7a62'), 'quilt': True, 'coif': True})
    z_waist = at.z + 1.02
    cast.bone(body, lambda co: 'spine' if co.z > z_waist else 'hips')
    cast.tabard(body, a, rng, kit.C['crimson'], kit.C['gold'])
    cast.bone(body, 'head')
    cast.kettle_hat(body, a, rng)
    kit_part(body, a, rng, at)
    gear = cast.Rig(f'spear_{len(bpy.data.armatures)}')
    cast.bone(gear, 'spear')
    cast.spear(gear, a, rng)
    objs = body.finish(col) + gear.finish(col)
    arm = armature(col, f'CTL_soldier_{len(bpy.data.armatures)}', at)
    skin(objs, arm)
    return arm


def kit_part(rig, a, rng, at):
    """The soldier's kit: a cross-strap, a dagger at the right hip, a flask at the left."""
    cast.bone(rig, 'spine')
    strap_a, strap_b = at + Vector((0.16, -0.12, 1.44)), at + Vector((-0.17, -0.15, 1.06))
    kit.beam(rig.cloth, strap_a, strap_b, 0.035, rng, 'leather')
    cast.bone(rig, 'hips')
    cast.shape(rig.metal, kit.box(0.03, 0.03, 0.26, bevel=0.006), Matrix.Translation(at + Vector((-0.19, -0.03, 0.8))), kit.C['iron'], rng)
    cast.shape(rig.cloth, kit.box(0.05, 0.04, 0.2, bevel=0.01), Matrix.Translation(at + Vector((-0.19, -0.03, 0.83))), lin('#3e2a1c'), rng)
    cast.shape(rig.cloth, kit.ellipsoid(0.065, 0.045, 0.09, seg=10, rings=6), Matrix.Translation(at + Vector((0.18, 0.08, 0.9))), lin('#8a6a44'), rng)
    cast.shape(rig.metal, kit.frustum(0.018, 0.015, 0.04, 6), Matrix.Translation(at + Vector((0.18, 0.08, 0.98))), steam.BRASS, rng)
    cast.bone(rig, None)


def aim(arm, name, direction):
    """Turn one bone about its head so that it points along `direction` (armature space)."""
    bpy.context.view_layer.update()
    pb = arm.pose.bones[name]
    M = pb.matrix.copy()
    current = (M.to_3x3() @ Vector((0, 1, 0))).normalized()
    q = current.rotation_difference(Vector(direction).normalized())
    head = M.translation.copy()
    pb.matrix = Matrix.Translation(head) @ q.to_matrix().to_4x4() @ Matrix.Translation(-head) @ M


def pose(arm, spec):
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='POSE')
    if 'hips_at' in spec:
        bpy.context.view_layer.update()
        pb = arm.pose.bones['hips']
        M = pb.matrix.copy()
        M.translation = Vector(spec['hips_at'])
        pb.matrix = M
    for name in ORDER:
        if name in spec:
            aim(arm, name, spec[name])
    if 'spear_drop' in spec:
        # the spear leaves the hand: lay it where the pose says, pointing along its direction
        at, direction = spec['spear_drop']
        aim(arm, 'spear', direction)
        bpy.context.view_layer.update()
        pb = arm.pose.bones['spear']
        M = pb.matrix.copy()
        M.translation = Vector(at)
        pb.matrix = M
    bpy.ops.object.mode_set(mode='OBJECT')


# The states. Character space: forward is -Y, its right is -X, up is +Z. Hand L holds the spear;
# when the spear must stay upright, the left hand keeps its rest direction.
SPEAR_UP = tuple(REST_FOREARM[1])
STATES = {
    'at_ease': {
        'spine': (0, 0.03, 1), 'head': (0, -0.05, 1),
        'thigh.R': (-0.07, 0, -1), 'shin.R': (-0.03, 0.02, -1), 'thigh.L': (0.06, 0, -1), 'shin.L': (0.03, 0.02, -1),
        'upper_arm.R': (-0.12, 0.05, -1), 'forearm.R': (-0.05, -0.2, -1), 'hand.R': (-0.05, -0.2, -1),
        'hand.L': SPEAR_UP, 'spear': (0, 0, 1),
    },
    'run': {
        'hips_at': (0, -0.06, 0.88),
        'spine': (0, -0.42, 1), 'head': (0, -0.15, 1),
        'thigh.L': (0.03, -0.78, -0.62), 'shin.L': (0, 0.12, -1), 'foot.L': (0, -1, -0.15),
        'thigh.R': (-0.03, 0.42, -0.9), 'shin.R': (0, 0.95, -0.4), 'foot.R': (0, 0.35, -0.95),
        'upper_arm.R': (-0.15, -0.6, -0.78), 'forearm.R': (-0.05, -0.8, 0.55), 'hand.R': (-0.05, -0.8, 0.55),
        'upper_arm.L': (0.2, 0.45, -0.87), 'forearm.L': (0.1, -0.35, -0.93), 'hand.L': (0.05, -0.75, 0.66),
        'spear': (0.05, -0.75, 0.66),
    },
    'kneel': {
        'hips_at': (0, 0.05, 0.53),
        'spine': (0, -0.05, 1), 'head': (0, -0.12, 1),
        'thigh.L': (0.06, -0.98, -0.18), 'shin.L': (0, 0.04, -1), 'foot.L': (0, -1, -0.1),
        'thigh.R': (-0.05, 0.22, -0.97), 'shin.R': (0, 1, -0.1), 'foot.R': (0, 0.15, -1),
        'upper_arm.R': (-0.12, -0.5, -0.86), 'forearm.R': (0.2, -0.75, -0.62), 'hand.R': (0.2, -0.6, -0.8),
        'upper_arm.L': (0.22, -0.3, -0.93), 'forearm.L': (0.05, -0.85, -0.2), 'hand.L': SPEAR_UP, 'spear': (0, 0.02, 1),
    },
    'take_cover': {
        'hips_at': (0, 0.12, 0.64),
        'thigh.L': (0.16, -0.8, -0.58), 'shin.L': (0, 0.33, -0.94), 'foot.L': (0.1, -1, -0.15),
        'thigh.R': (-0.16, -0.78, -0.6), 'shin.R': (0, 0.33, -0.94), 'foot.R': (-0.1, -1, -0.15),
        'spine': (0, -0.55, 0.84), 'head': (0, -0.3, 0.95),
        'upper_arm.R': (-0.1, -0.65, -0.75), 'forearm.R': (0.25, -0.9, 0.2), 'hand.R': (0.3, -0.9, 0.3),
        'upper_arm.L': (0.2, -0.2, -0.96), 'forearm.L': (-0.05, -0.75, 0.3), 'hand.L': (0, -0.3, 0.95),
        'spear': (0.05, 0.25, 0.97),
    },
    'hide': {
        'hips_at': (0, 0.16, 0.6),
        'thigh.L': (0.2, -0.6, -0.78), 'shin.L': (0, 0.55, -0.84), 'foot.L': (0.1, -1, -0.1),
        'thigh.R': (-0.2, -0.6, -0.78), 'shin.R': (0, 0.55, -0.84), 'foot.R': (-0.1, -1, -0.1),
        'spine': (0, -0.86, 0.5), 'neck': (0, -0.95, 0.2), 'head': (0, -0.95, -0.1),
        'upper_arm.R': (-0.35, -0.75, 0.55), 'forearm.R': (0.55, -0.35, 0.76), 'hand.R': (0.6, -0.2, 0.75),
        'upper_arm.L': (0.35, -0.75, 0.55), 'forearm.L': (-0.55, -0.35, 0.76), 'hand.L': (-0.6, -0.2, 0.75),
        'spear_drop': ((0.35, 0.55, 0.03), (0.25, -1, 0.0)),
    },
}
STATES['react'] = {
    # hit in the chest from the front: thrown back, arms flung, the spear dropping away
    'hips_at': (0, 0.08, 0.9),
    'spine': (0, 0.42, 0.9), 'neck': (0, 0.5, 0.86), 'head': (0.1, 0.55, 0.83),
    'thigh.L': (0.08, -0.25, -0.97), 'shin.L': (0.02, 0.1, -1),
    'thigh.R': (-0.08, 0.15, -0.99), 'shin.R': (-0.02, 0.2, -0.98),
    'upper_arm.R': (-0.75, 0.35, 0.2), 'forearm.R': (-0.6, -0.2, 0.75), 'hand.R': (-0.5, -0.1, 0.85),
    'upper_arm.L': (0.7, 0.4, 0.1), 'forearm.L': (0.5, -0.3, 0.8), 'hand.L': (0.75, -0.2, 0.62),
    'spear': (0.85, 0.3, 0.42),
}

# Ragdoll: the data the game gives its physics (Rapier) when a defender falls. One capsule per
# bone (radius in metres, along the bone), a mass share (of a 75 kg body), and joint limits in
# degrees (swing cone, twist) to the parent: a fall then folds like a body, not like a puppet.
RAGDOLL = {
    'hips': {'radius': 0.15, 'mass': 0.16, 'swing': 0, 'twist': 0},
    'spine': {'radius': 0.16, 'mass': 0.28, 'swing': 35, 'twist': 30},
    'neck': {'radius': 0.05, 'mass': 0.02, 'swing': 40, 'twist': 45},
    'head': {'radius': 0.11, 'mass': 0.07, 'swing': 35, 'twist': 60},
    'thigh': {'radius': 0.085, 'mass': 0.1, 'swing': 75, 'twist': 30},
    'shin': {'radius': 0.06, 'mass': 0.045, 'swing': 140, 'twist': 5, 'hinge': True},
    'foot': {'radius': 0.045, 'mass': 0.014, 'swing': 35, 'twist': 10},
    'upper_arm': {'radius': 0.06, 'mass': 0.03, 'swing': 100, 'twist': 60},
    'forearm': {'radius': 0.045, 'mass': 0.018, 'swing': 145, 'twist': 80, 'hinge': True},
    'hand': {'radius': 0.04, 'mass': 0.007, 'swing': 60, 'twist': 20},
}


def ragdoll_table():
    """Every bone with its capsule (head, tail, radius), mass in kg and limits: export for the game."""
    marks, out = landmarks(), {}
    for name in ORDER:
        kind = name.split('.')[0]
        if kind not in RAGDOLL:  # prop bones (the spear) are not part of the body
            continue
        spec = RAGDOLL[kind]
        out[name] = {'head': list(marks[name][0]), 'tail': list(marks[name][1]), 'radius': spec['radius'],
                     'mass_kg': round(spec['mass'] * 75, 2), 'parent': PARENTS.get(name),
                     'swing_deg': spec['swing'], 'twist_deg': spec['twist'], 'hinge': spec.get('hinge', False)}
    return out


def _key(table, t):
    """Linear interpolation in a looping key table [(t, value)] with t in [0, 1]."""
    t %= 1.0
    for (t0, v0), (t1, v1) in zip(table, table[1:]):
        if t0 <= t <= t1:
            return v0 + (v1 - v0) * (t - t0) / (t1 - t0)
    return table[-1][1]


# Left leg, in degrees: thigh swing (forward +) and knee flex, over one stride.
# 0 passing (leg swinging under), 0.25 contact (heel strikes ahead), 0.375 down (weight taken,
# knee gives), 0.5 passing (stance under the hips), 0.75 toe-off (leg behind), 1 = 0.
THIGH = [(0, 15), (0.25, 40), (0.375, 28), (0.5, 4), (0.75, -26), (1, 15)]
KNEE = [(0, 100), (0.25, 18), (0.375, 38), (0.5, 28), (0.75, 14), (0.875, 70), (1, 100)]
FOOT = [(0, -10), (0.25, 15), (0.375, 0), (0.5, 0), (0.75, -55), (1, -10)]


def sag(angle_deg, x=0.0):
    """A direction in the sagittal plane, angle from straight down, forward (-Y) positive."""
    a = math.radians(angle_deg)
    return (x, -math.sin(a), -math.cos(a))


def run_phase(t):
    """The run at phase t: legs from the key tables (the right leg half a stride later), hips
    bouncing twice per stride (lowest at each down), the torso leaning 14 degrees into the run,
    arms swinging against the legs with elbows bent near 90 degrees."""
    spec = {'hips_at': (0, 0, 0.87 - 0.03 * math.cos(4 * math.pi * (t - 0.375)))}
    for sd, ph, sx in (('L', t, 1), ('R', t + 0.5, -1)):
        thigh = _key(THIGH, ph)
        knee = _key(KNEE, ph)
        spec[f'thigh.{sd}'] = sag(thigh, sx * 0.05)
        spec[f'shin.{sd}'] = sag(thigh - knee, sx * 0.02)
        spec[f'foot.{sd}'] = sag(thigh - knee + 90 + _key(FOOT, ph))
        arm = -thigh * 0.8
        spec[f'upper_arm.{"R" if sd == "L" else "L"}'] = sag(arm, -sx * 0.18)
        spec[f'forearm.{"R" if sd == "L" else "L"}'] = sag(arm + 95, -sx * 0.05)
    spec['spine'] = (0, -math.sin(math.radians(14)), math.cos(math.radians(14)))
    spec['head'] = (0, -0.1, 1)
    spec['spear'] = (0.04, -0.55, 0.83)
    return spec


def run_strip(col, phases=8):
    """One stride in `phases` frames, side by side and seen in profile: a filmstrip to judge."""
    rng = seed(302)
    for k in range(phases):
        x = k * 1.45
        arm = soldier(col, Vector((0, 0, 0)), rng)
        pose(arm, run_phase(k / phases))
        arm.rotation_euler.z = math.pi / 2
        arm.location = (x, 0, 0)
        label = bpy.data.objects.new(f'REF_label_run_{k}', bpy.data.curves.new(f'label_run_{k}', 'FONT'))
        label.data.body = f'{k}/{phases}'
        label.data.size = 0.2
        label.data.align_x = 'CENTER'
        label.location = (x, -0.9, 0.01)
        label.data.materials.append(kit.material('M_label', 1.0))
        col.objects.link(label)
    floor = Part('MDL_floor')
    floor.face([Vector((-1.5, -1.5, 0)), Vector((phases * 1.45 + 0.5, -1.5, 0)), Vector((phases * 1.45 + 0.5, 1.5, 0)), Vector((-1.5, 1.5, 0))], lin('#a29b8f'))
    floor.finish(kit.material('M_floor', 0.9), col)


PROPS = {
    'take_cover': 'wall',
    'hide': 'barrel',
}


def props(col, at, kind, rng):
    part = Part(f'MDL_prop_{kind}_{len(bpy.data.meshes)}')
    if kind == 'wall':
        for k in range(4):
            kit.stone(part, at + Vector((-0.6 + k * 0.4, -0.82, 0)), 0.38, 0.4, 0.42, rng)
            kit.stone(part, at + Vector((-0.4 + k * 0.4, -0.82, 0.42)), 0.38, 0.4, 0.4, rng)
        mat = kit.material('M_prop_stone', 0.9)
    else:
        kit.barrel(part, at + Vector((0.25, -0.75, 0)), rng, r=0.36, h=0.95)
        kit.barrel(part, at + Vector((-0.45, -0.7, 0)), rng, r=0.36, h=0.95)
        mat = kit.material('M_prop_wood', 0.9)
    part.finish(mat, col)


def sheet(col):
    """The five states side by side, their props, on a plain floor."""
    rng = seed(301)
    names = list(STATES)
    for i, state in enumerate(names):
        at = Vector(((i - (len(names) - 1) / 2) * 2.3, 0, 0))
        arm = soldier(col, at, rng)
        spec = {k: (v if k != 'hips_at' else tuple(at + Vector(v))) for k, v in STATES[state].items()}
        if 'hips_at' in spec:
            spec['hips_at'] = tuple(Vector(STATES[state]['hips_at']))
        pose(arm, spec)
        if state in PROPS:
            props(col, at, PROPS[state], rng)
        label = bpy.data.objects.new(f'REF_label_{state}', bpy.data.curves.new(f'label_{state}', 'FONT'))
        label.data.body = state.replace('_', ' ').upper()
        label.data.size = 0.22
        label.data.align_x = 'CENTER'
        label.location = at + Vector((0, -1.25, 0.01))
        col.objects.link(label)
        label.data.materials.append(kit.material('M_label', 1.0))
    floor = Part('MDL_floor')
    floor.face(kit.ring(48, 7.5, 3.2, 0), lin('#a29b8f'))
    floor.finish(kit.material('M_floor', 0.9), col)
