"""Catapulte Mania v7: the steam ogre and the wyvern, rigged, and their projectile counters.

The ogre is the humanoid body at ogre size (×1.75, bulk 1.45): its hunch is now a pose of the
spine and neck, not a distortion of the mesh. It counters a stone by swatting it back with its
club: wind-up, swing, follow-through.

The wyvern is a creature rig: body, two-bone neck, head with a hinged jaw, four-bone tail ending
in a spade, wings of three bones (arm, forearm, finger) and legs. Each wing membrane is one
connected sheet whose corners belong to bones, so it stretches when the wing folds instead of
tearing. It counters a stone with a tail swipe (or catches it in its jaws).
"""
import math

import bpy
from mathutils import Matrix, Quaternion, Vector

import cast
import kit
import rig
import steam
from kit import C, Part, lin, seed, vary

# ---------- generic armature and posing ----------


def make_armature(col, name, at, bones):
    """bones: {name: (head, tail, parent or None)} in creature space (faces -Y)."""
    data = bpy.data.armatures.new(name)
    arm = bpy.data.objects.new(name, data)
    arm.location = at
    col.objects.link(arm)
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for bname, (head, tail, _) in bones.items():
        eb = data.edit_bones.new(bname)
        eb.head, eb.tail = Vector(head), Vector(tail)
    for bname, (_, _, parent) in bones.items():
        if parent:
            eb = data.edit_bones[bname]
            eb.parent = data.edit_bones[parent]
            eb.use_connect = (eb.head - eb.parent.tail).length < 1e-4
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def pose(arm, spec, order, root):
    """Pose from rest: the root placed (spec['root_at']), then each bone aimed, parents first."""
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='POSE')
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = Quaternion()
        pb.location = (0, 0, 0)
    if 'root_at' in spec:
        bpy.context.view_layer.update()
        pb = arm.pose.bones[root]
        M = pb.matrix.copy()
        M.translation = Vector(spec['root_at'])
        pb.matrix = M
    bpy.ops.object.mode_set(mode='OBJECT')
    for name in order:
        if name in spec:
            rig.aim(arm, name, spec[name])


def key_all(arm, frame, trail=(), lag=2):
    for pb in arm.pose.bones:
        f = frame + (lag if pb.name in trail else 0)
        pb.keyframe_insert('rotation_quaternion', frame=f)
        pb.keyframe_insert('location', frame=f)


# ---------- the steam ogre ----------

OGRE_SC = 1.75
OGRE_B = 1.45


def ogre_bones(sc=OGRE_SC, b=OGRE_B):
    marks = rig.landmarks(b)
    out = {}
    for name in rig.ORDER:
        if name == 'spear':
            continue
        h, t = marks[name]
        out[name] = (Vector(h) * sc, Vector(t) * sc, rig.PARENTS.get(name))
    return out


OGRE_ORDER = [n for n in rig.ORDER if n != 'spear']


def ogre(col, at, rng):
    body = cast.Rig(f'ogre_{len(bpy.data.armatures)}')
    m = Matrix.Translation(at) @ Matrix.Scale(OGRE_SC, 4)
    skin = lin('#7b8758')
    a = cast.body(body, m, rng, {'tunic': lin('#5d4a33'), 'chest': skin, 'sleeve': skin, 'legs': skin, 'skin': skin,
                                 'boots': lin('#4a3a2a'), 'bulk': OGRE_B, 'belly': 1.45, 'head': 0.8, 'skirt': True})
    cast.bone(body, 'neck')
    cast.shape(body.metal, kit.torus(0.21, 0.05, n=14, m=4), m @ Matrix.Translation((0, 0.005, 1.5)), steam.IRON, rng)
    for k in range(8):
        ang = math.tau * k / 8
        steam.rivet(body.metal, m @ Vector((math.cos(ang) * 0.255, math.sin(ang) * 0.255 + 0.005, 1.5)), m.to_3x3() @ Vector((math.cos(ang), math.sin(ang), 0)), r=0.035)
    cast.bone(body, 'spine')
    cast.shape(body.metal, kit.frustum(0.2, 0.18, 0.5, 12), m @ Matrix.Translation((0, 0.34, 1.0)), steam.COPPER, rng)
    for z in (1.08, 1.36):
        cast.shape(body.metal, kit.torus(0.2, 0.018, n=12, m=4), m @ Matrix.Translation((0, 0.34, z)), steam.IRON, rng)
    steam.chimney(body.metal, m @ Vector((0.2, 0.42, 1.12)), rng, height=0.3 * OGRE_SC, r0=0.04 * OGRE_SC, r1=0.035 * OGRE_SC)
    cast.bone(body, 'hand.L')
    cast.club(body, a, rng)
    objs = body.finish(col)
    arm = make_armature(col, f'CTL_ogre_{len(bpy.data.armatures)}', at, ogre_bones())
    rig.skin(objs, arm)
    return arm


def S(v, sc=OGRE_SC):
    return tuple(x * sc for x in v)


OGRE_STATES = {
    'at_ease': {  # hunched, arms hanging forward, knees soft: the hunch is a pose now
        'root_at': S((0, 0.02, 0.88)),
        'spine': (0, -0.42, 0.91), 'neck': (0, -0.7, 0.72), 'head': (0, -0.45, 0.9),
        'thigh.L': (0.16, -0.18, -0.97), 'shin.L': (0.05, 0.16, -0.99), 'thigh.R': (-0.16, -0.18, -0.97), 'shin.R': (-0.05, 0.16, -0.99),
        'upper_arm.L': (0.3, -0.3, -0.9), 'forearm.L': (0.12, -0.4, -0.91), 'hand.L': (0.12, -0.4, -0.91),
        'upper_arm.R': (-0.3, -0.3, -0.9), 'forearm.R': (-0.12, -0.4, -0.91), 'hand.R': (-0.12, -0.4, -0.91),
    },
    'wind_up': {  # weight back, the club raised behind the left shoulder
        'root_at': S((0.04, 0.05, 0.85)),
        'spine': (0.25, -0.05, 0.97), 'neck': (0.05, -0.6, 0.8), 'head': (0, -0.5, 0.87),
        'thigh.L': (0.32, 0.12, -0.94), 'shin.L': (0.1, 0.12, -0.99), 'thigh.R': (-0.32, -0.3, -0.9), 'shin.R': (-0.1, 0.2, -0.97),
        'upper_arm.L': (0.55, 0.45, 0.7), 'forearm.L': (0.05, 0.7, 0.7), 'hand.L': (0.0, 0.75, 0.66),
        'upper_arm.R': (-0.45, -0.6, -0.66), 'forearm.R': (-0.2, -0.9, -0.38), 'hand.R': (-0.2, -0.9, -0.38),
    },
    'swing': {  # the impact: club flat across the front at stone height
        'root_at': S((-0.03, -0.06, 0.84)),
        'spine': (-0.18, -0.45, 0.87), 'neck': (0, -0.75, 0.66), 'head': (0, -0.55, 0.83),
        'thigh.L': (0.3, 0.2, -0.93), 'shin.L': (0.08, 0.15, -0.98), 'thigh.R': (-0.25, -0.35, -0.9), 'shin.R': (-0.05, 0.1, -0.99),
        'upper_arm.L': (0.25, -0.95, 0.15), 'forearm.L': (-0.45, -0.89, 0.05), 'hand.L': (-0.6, -0.8, 0.02),
        'upper_arm.R': (-0.55, 0.3, -0.78), 'forearm.R': (-0.3, -0.2, -0.93), 'hand.R': (-0.3, -0.2, -0.93),
    },
    'follow_through': {  # the club carried across to the right, the body twisted after it
        'root_at': S((-0.05, -0.05, 0.85)),
        'spine': (-0.32, -0.35, 0.88), 'neck': (-0.2, -0.7, 0.68), 'head': (-0.1, -0.55, 0.83),
        'thigh.L': (0.28, 0.25, -0.93), 'shin.L': (0.06, 0.2, -0.98), 'thigh.R': (-0.25, -0.3, -0.92), 'shin.R': (-0.05, 0.12, -0.99),
        'upper_arm.L': (-0.35, -0.75, -0.1), 'forearm.L': (-0.95, 0.05, -0.3), 'hand.L': (-0.9, 0.3, -0.3),
        'upper_arm.R': (-0.5, 0.45, -0.74), 'forearm.R': (-0.3, 0.1, -0.95), 'hand.R': (-0.3, 0.1, -0.95),
    },
    'react': {  # struck: staggers back, arms flung, head thrown up
        'root_at': S((0, 0.12, 0.86)),
        'spine': (0, 0.35, 0.94), 'neck': (0, 0.3, 0.95), 'head': (0.1, 0.45, 0.89),
        'thigh.L': (0.2, -0.3, -0.93), 'shin.L': (0.05, 0.1, -0.99), 'thigh.R': (-0.15, 0.2, -0.97), 'shin.R': (-0.05, 0.25, -0.97),
        'upper_arm.L': (0.85, 0.2, 0.3), 'forearm.L': (0.6, -0.3, 0.74), 'hand.L': (0.6, -0.3, 0.74),
        'upper_arm.R': (-0.85, 0.2, 0.3), 'forearm.R': (-0.6, -0.3, 0.74), 'hand.R': (-0.6, -0.3, 0.74),
    },
}

# ---------- the wyvern ----------

WYV_BONES_REST = {
    'body': ((0, 0.6, 0), (0, -0.5, 0.1), None),
    'neck1': ((0, -0.5, 0.1), (0, -0.95, 0.42), 'body'),
    'neck2': ((0, -0.95, 0.42), (0, -1.3, 0.66), 'neck1'),
    'head': ((0, -1.3, 0.66), (0, -1.82, 0.6), 'neck2'),
    'jaw': ((0, -1.34, 0.56), (0, -1.78, 0.48), 'head'),
    'tail1': ((0, 0.6, 0), (0, 1.15, -0.06), 'body'),
    'tail2': ((0, 1.15, -0.06), (0, 1.7, -0.16), 'tail1'),
    'tail3': ((0, 1.7, -0.16), (0, 2.25, -0.3), 'tail2'),
    'tail4': ((0, 2.25, -0.3), (0, 2.8, -0.44), 'tail3'),
}
for _sx, _sd in ((1, 'L'), (-1, 'R')):
    WYV_BONES_REST.update({
        f'wing_arm.{_sd}': ((_sx * 0.26, -0.25, 0.22), (_sx * 1.2, -0.12, 0.46), 'body'),
        f'wing_fore.{_sd}': ((_sx * 1.2, -0.12, 0.46), (_sx * 2.15, 0.12, 0.5), f'wing_arm.{_sd}'),
        f'wing_finger.{_sd}': ((_sx * 2.15, 0.12, 0.5), (_sx * 3.05, 0.6, 0.34), f'wing_fore.{_sd}'),
        f'thigh.{_sd}': ((_sx * 0.22, 0.38, -0.1), (_sx * 0.28, 0.22, -0.5), 'body'),
        f'shin.{_sd}': ((_sx * 0.28, 0.22, -0.5), (_sx * 0.3, 0.45, -0.86), f'thigh.{_sd}'),
        f'foot.{_sd}': ((_sx * 0.3, 0.45, -0.86), (_sx * 0.3, 0.18, -0.96), f'shin.{_sd}'),
    })
WYV_ORDER = list(WYV_BONES_REST)
HIDE, BELLY, WEB, HORN = lin('#3b5a48'), lin('#a39565'), lin('#7a2b2b'), lin('#d8cfb8')


def wyvern(col, at, rng):
    rigp = cast.Rig(f'wyvern_{len(bpy.data.armatures)}')
    cl, mt = rigp.cloth, rigp.metal
    T = lambda *v: Vector(at) + Vector(v)  # noqa: E731
    B = WYV_BONES_REST
    # body and belly
    cast.bone(rigp, lambda co: 'tail1' if co.y - at.y > 0.62 else 'body')
    cast.shape(cl, kit.ellipsoid(0.33, 0.78, 0.3, seg=14, rings=9), Matrix.Translation(T(0, 0.05, 0.05)), HIDE, rng, 0.02)
    cast.shape(cl, kit.ellipsoid(0.27, 0.62, 0.2, seg=12, rings=7), Matrix.Translation(T(0, 0.02, -0.07)), BELLY, rng, 0.02)
    for k in range(7):  # a ridge of dorsal plates, Fumivore's slabs on a beast
        y = -0.45 + k * 0.17
        cast.shape(cl, kit.box(0.03, 0.12, 0.12 - k * 0.008, bevel=0.01), Matrix.Translation(T(0, y, 0.3 - abs(y) * 0.05)), HORN, rng)
    # neck, head, jaw, horns, teeth
    for name, r0, r1 in (('neck1', 0.2, 0.15), ('neck2', 0.15, 0.12)):
        cast.bone(rigp, name)
        cast.limb_profile(cl, T(*B[name][0]), T(*B[name][1]), [(0, r0), (1, r1)], HIDE, rng)
    cast.bone(rigp, 'head')
    cast.shape(cl, kit.ellipsoid(0.15, 0.3, 0.12, seg=12, rings=8), Matrix.Translation(T(0, -1.52, 0.64)), HIDE, rng, 0.02)
    for sx in (-1, 1):
        horn = kit.frustum(0.045, 0.0, 0.32, 6)
        cast.shape(cl, horn, Matrix.Translation(T(sx * 0.08, -1.32, 0.72)) @ Matrix.Rotation(-1.1, 4, 'X') @ Matrix.Rotation(sx * 0.3, 4, 'Y'), HORN, rng)
    for k in range(5):
        cast.shape(cl, kit.frustum(0.018, 0.0, 0.05, 4), Matrix.Translation(T(0.07 * (1 if k % 2 else -1), -1.45 - k * 0.06, 0.53)) @ Matrix.Rotation(math.pi, 4, 'X'), HORN, rng)
    cast.bone(rigp, 'jaw')
    cast.shape(cl, kit.ellipsoid(0.11, 0.24, 0.055, seg=10, rings=6), Matrix.Translation(T(0, -1.55, 0.5)), BELLY, rng, 0.02)
    # tail, ending in a spade
    radii = [(0.2, 0.15), (0.15, 0.11), (0.11, 0.07), (0.07, 0.04)]
    for k, (r0, r1) in enumerate(radii, start=1):
        name = f'tail{k}'
        cast.bone(rigp, name)
        cast.limb_profile(cl, T(*B[name][0]), T(*B[name][1]), [(0, r0), (1, r1)], HIDE, rng)
    spade = kit.bmesh.new()
    pts = [(0, 0, 0), (0.18, 0.18, 0), (0, 0.42, 0), (-0.18, 0.18, 0)]
    vs = [spade.verts.new(p) for p in pts]
    spade.faces.new(vs)
    cast.shape(cl, spade, Matrix.Translation(T(0, 2.78, -0.44)), WEB, rng)
    # legs
    for sx, sd in ((1, 'L'), (-1, 'R')):
        for part, r0, r1 in (('thigh', 0.11, 0.08), ('shin', 0.07, 0.05), ('foot', 0.05, 0.03)):
            name = f'{part}.{sd}'
            cast.bone(rigp, name)
            cast.limb_profile(cl, T(*B[name][0]), T(*B[name][1]), [(0, r0), (1, r1)], HIDE, rng)
    # wings: bones, then one membrane sheet whose vertices belong to the nearest joint
    for sx, sd in ((1, 'L'), (-1, 'R')):
        arm_b, fore_b, fing_b = f'wing_arm.{sd}', f'wing_fore.{sd}', f'wing_finger.{sd}'
        for name, r0, r1 in ((arm_b, 0.08, 0.06), (fore_b, 0.055, 0.04), (fing_b, 0.035, 0.015)):
            cast.bone(rigp, name)
            cast.limb_profile(cl, T(*B[name][0]), T(*B[name][1]), [(0, r0), (1, r1)], HIDE, rng)
        root, elbow, wrist, tip = (T(*B[arm_b][0]), T(*B[fore_b][0]), T(*B[fing_b][0]), T(*B[fing_b][1]))
        rear = [T(sx * 0.3, 0.55, 0.0), T(sx * 1.05, 0.78, 0.12), T(sx * 1.8, 0.92, 0.2), T(sx * 2.5, 0.95, 0.25)]
        owner = {}
        for p, name in ((root, 'body'), (elbow, fore_b), (wrist, fing_b), (tip, fing_b),
                        (rear[0], 'body'), (rear[1], arm_b), (rear[2], fore_b), (rear[3], fing_b)):
            owner[tuple(round(c, 4) for c in p)] = name
        cast.bone(rigp, lambda co, owner=owner: owner.get(tuple(round(c, 4) for c in co), 'body'))
        tris = [(root, elbow, rear[1]), (root, rear[1], rear[0]), (elbow, wrist, rear[2]), (elbow, rear[2], rear[1]),
                (wrist, tip, rear[3]), (wrist, rear[3], rear[2])]
        for tri in tris:
            cl.face(list(tri) if sx > 0 else list(reversed(tri)), vary(WEB, rng, 0.04))
    cast.bone(rigp, None)
    objs = rigp.finish(col)
    arm = make_armature(col, f'CTL_wyvern_{len(bpy.data.armatures)}', at, WYV_BONES_REST)
    rig.skin(objs, arm)
    return arm


def wings(spec, arm_dir, fore_dir, finger_dir):
    for sx, sd in ((1, 'L'), (-1, 'R')):
        spec[f'wing_arm.{sd}'] = (sx * arm_dir[0], arm_dir[1], arm_dir[2])
        spec[f'wing_fore.{sd}'] = (sx * fore_dir[0], fore_dir[1], fore_dir[2])
        spec[f'wing_finger.{sd}'] = (sx * finger_dir[0], finger_dir[1], finger_dir[2])
    return spec


def legs_tucked(spec):
    for sx, sd in ((1, 'L'), (-1, 'R')):
        spec[f'thigh.{sd}'] = (sx * 0.15, 0.75, -0.65)
        spec[f'shin.{sd}'] = (sx * 0.05, 0.95, 0.3)
        spec[f'foot.{sd}'] = (0, 1, -0.1)
    return spec


WYV_STATES = {
    'glide': legs_tucked(wings({'neck1': (0, -0.8, 0.6), 'neck2': (0, -0.9, 0.45), 'head': (0, -1, -0.05),
                                'tail2': (0, 1, -0.12), 'tail3': (0, 1, -0.1), 'tail4': (0.1, 1, -0.05)},
                               (0.97, 0.12, 0.2), (0.95, 0.3, 0.05), (0.8, 0.6, -0.15))),
    'flap_down': legs_tucked(wings({'neck1': (0, -0.75, 0.66), 'head': (0, -1, 0.05)},
                                   (0.8, -0.05, -0.6), (0.6, 0.35, -0.72), (0.35, 0.65, -0.68))),
    'flap_up': legs_tucked(wings({'neck1': (0, -0.8, 0.55), 'head': (0, -1, -0.1)},
                                 (0.55, 0.05, 0.84), (0.3, 0.45, 0.84), (0.15, 0.75, 0.64))),
    'bite': legs_tucked(wings({'body': (0, -0.95, -0.3), 'neck1': (0, -0.9, -0.1), 'neck2': (0, -0.95, -0.2), 'head': (0, -0.95, -0.1),
                               'jaw': (0, -0.55, -0.83)}, (0.9, 0.3, 0.3), (0.8, 0.55, 0.2), (0.55, 0.8, -0.1))),
    'tail_swipe': wings({'body': (0.45, -0.89, 0.05), 'neck1': (0.1, -0.85, 0.5), 'neck2': (-0.25, -0.9, 0.3), 'head': (-0.4, -0.9, 0.0),
                         'tail1': (-0.85, 0.5, 0.0), 'tail2': (-1, -0.1, 0.05), 'tail3': (-0.6, -0.8, 0.1), 'tail4': (-0.1, -1, 0.12),
                         'thigh.L': (0.2, 0.5, -0.84), 'thigh.R': (-0.2, 0.5, -0.84)},
                        (0.75, 0.2, 0.62), (0.6, 0.45, 0.66), (0.4, 0.75, 0.52)),
    'react': wings({'body': (0, -0.7, 0.72), 'neck1': (0, 0.2, 0.98), 'neck2': (0, 0.4, 0.92), 'head': (0.15, 0.5, 0.85),
                    'tail1': (0, 0.6, -0.8), 'tail2': (0, 0.5, -0.87), 'thigh.L': (0.3, -0.5, -0.8), 'thigh.R': (-0.3, -0.5, -0.8)},
                   (0.6, 0.55, 0.58), (0.3, 0.85, 0.4), (0.1, 0.95, 0.1)),
}

# ---------- sheets ----------


def label(col, text, at, size=0.3):
    obj = bpy.data.objects.new(f'REF_label_{text}', bpy.data.curves.new(f'label_{text}', 'FONT'))
    obj.data.body = text.replace('_', ' ').upper()
    obj.data.size = size
    obj.data.align_x = 'CENTER'
    obj.location = at
    obj.data.materials.append(kit.material('M_label', 1.0))
    col.objects.link(obj)


def floor(col, x0, x1, y0=-3.5, y1=3.5):
    part = Part('MDL_floor')
    part.face([Vector((x0, y0, 0)), Vector((x1, y0, 0)), Vector((x1, y1, 0)), Vector((x0, y1, 0))], lin('#a29b8f'))
    part.finish(kit.material('M_floor', 0.9), col)


def ogre_sheet(col):
    rng = seed(501)
    names = list(OGRE_STATES)
    for i, state in enumerate(names):
        x = (i - (len(names) - 1) / 2) * 3.6
        arm = ogre(col, Vector((x, 0, 0)), rng)
        spec = dict(OGRE_STATES[state])
        pose(arm, spec, OGRE_ORDER, 'hips')
        label(col, state, Vector((x, -2.4, 0.01)))
    floor(col, -11, 11)


def wyvern_sheet(col):
    rng = seed(502)
    names = list(WYV_STATES)
    for i, state in enumerate(names):
        x = (i % 3 - 1) * 7.5
        y = 0.0 if i < 3 else 9.0
        arm = wyvern(col, Vector((x, y, 2.4)), rng)
        pose(arm, dict(WYV_STATES[state]), WYV_ORDER, 'body')
        label(col, state, Vector((x, y - 3.2, 0.05)), size=0.45)
    floor(col, -13, 13, -5, 14)


# ---------- the counters, animated ----------

STONE = lin('#8d887e')


def stone_ball(col, rng):
    part = Part(f'MDL_stone_ball_{len(bpy.data.meshes)}')
    part.merge(kit.blob(0.34, 0.34, 0.32, rng, 0.1, subdiv=2), Matrix.Identity(4), lambda f: vary(STONE, rng, 0.05))
    return part.finish(kit.material('M_ball', 0.9), col)


def fly_stone(ball, a, b, f0, f1, arc=0.0):
    """Key the stone on every frame from a (frame f0) to b (frame f1), an optional upward arc."""
    for f in range(f0, f1 + 1):
        t = (f - f0) / max(1, f1 - f0)
        ball.location = a.lerp(b, t) + Vector((0, 0, arc * 4 * t * (1 - t)))
        ball.rotation_euler = (t * 9, t * 5, 0)
        ball.keyframe_insert('location', frame=f)
        ball.keyframe_insert('rotation_euler', frame=f)


def hide_before(ball, frame):
    ball.hide_render = True
    ball.keyframe_insert('hide_render', frame=1)
    ball.hide_render = False
    ball.keyframe_insert('hide_render', frame=frame)


def strike_point(arm, bone, frame, reach):
    """World point `reach` metres beyond a bone's head along it, at `frame` (the club's sweet spot)."""
    bpy.context.scene.frame_set(frame)
    pb = arm.pose.bones[bone]
    head = arm.matrix_world @ pb.head
    tail = arm.matrix_world @ pb.tail
    return head + (tail - head).normalized() * reach


def ogre_counter(col):
    """The ogre sees the stone, winds up, swats it back where it came from."""
    rng = seed(511)
    arm = ogre(col, Vector((0, 0, 0)), rng)
    st = OGRE_STATES
    look = dict(st['at_ease'])
    look['head'] = (0, -0.75, 0.66)
    keys = [(1, st['at_ease']), (10, look), (20, st['wind_up']), (26, st['wind_up']), (30, st['swing']),
            (36, st['follow_through']), (44, st['follow_through']), (58, st['at_ease'])]
    for f, spec in keys:
        pose(arm, dict(spec), OGRE_ORDER, 'hips')
        key_all(arm, f, trail={'head', 'neck', 'hand.R'}, lag=2)
    impact = strike_point(arm, 'hand.L', 30, 1.25)
    ball = stone_ball(col, rng)
    fly_stone(ball, Vector((1.5, -16.0, 4.0)), impact, 12, 30, arc=1.2)
    fly_stone(ball, impact, Vector((-6.0, -18.0, 7.5)), 30, 52, arc=2.5)
    hide_before(ball, 12)
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = 1, 64
    floor(col, -6, 6, -10, 4)


def wyvern_counter(col):
    """The wyvern hovers, beating its wings, then whips its tail round and bats the stone away."""
    rng = seed(512)
    arm = wyvern(col, Vector((0, 0, 3.0)), rng)
    ws = WYV_STATES
    f = 1
    for k in range(5):
        pose(arm, dict(ws['flap_up' if k % 2 == 0 else 'flap_down']), WYV_ORDER, 'body')
        key_all(arm, f, trail={'wing_finger.L', 'wing_finger.R', 'tail3', 'tail4', 'head'}, lag=2)
        f += 6
    # anticipation: the body turns away and the tail is cocked to the other side, then it whips
    cock = dict(ws['flap_up'])
    cock.update({'body': (-0.35, -0.93, 0.05), 'tail1': (0.75, 0.66, 0.0), 'tail2': (0.95, 0.3, 0.0),
                 'tail3': (0.9, -0.3, 0.05), 'tail4': (0.6, -0.8, 0.1), 'head': (0.2, -0.95, -0.1)})
    pose(arm, cock, WYV_ORDER, 'body')
    key_all(arm, 32, trail={'tail3', 'tail4'}, lag=2)
    pose(arm, dict(ws['tail_swipe']), WYV_ORDER, 'body')
    key_all(arm, 38, trail={'tail4'}, lag=1)
    pose(arm, dict(ws['tail_swipe']), WYV_ORDER, 'body')
    key_all(arm, 42)
    pose(arm, dict(ws['glide']), WYV_ORDER, 'body')
    key_all(arm, 56, trail={'tail3', 'tail4', 'head'}, lag=3)
    impact = strike_point(arm, 'tail4', 39, 0.5)
    ball = stone_ball(col, rng)
    fly_stone(ball, Vector((7.0, -16.0, 2.5)), impact, 20, 39, arc=1.0)
    fly_stone(ball, impact, Vector((12.0, -10.0, 6.0)), 39, 56, arc=2.0)
    hide_before(ball, 20)
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = 1, 62
    floor(col, -8, 8, -10, 6)
