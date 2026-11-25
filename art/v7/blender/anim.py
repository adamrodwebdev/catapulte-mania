"""Catapulte Mania v7: the soldier's transitions, keyed as one scene.

At ease (breathing) -> startle (anticipation crouch, then alarm) -> run to cover (two strides, the
body carried by the stride) -> brake -> dive into cover (overshoot, settle) -> peek, duck -> peek
again -> hit (thrown back) -> collapse. In the game the collapse is a ragdoll taking over from the
impact; here a keyed fall stands in for it.

Each key is a pose set from rest (so a bone never accumulates twist between keys), keyed with
eased (Bezier) curves; the head, the hands and the spear key two frames after the body, so they
trail it (overlap). 24 frames a second.
"""
import math

import bpy
from mathutils import Matrix, Quaternion, Vector

import rig

FPS = 24
TRAIL = {'head', 'neck', 'hand.L', 'hand.R', 'spear'}
FORWARD = -1.0  # the soldier faces -Y; he runs toward the wall in front of him


def reset(arm):
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = Quaternion()
        pb.location = (0, 0, 0)


def key(arm, spec, frame, trail=2):
    """Pose from rest, then key every bone (the trailing ones a little later)."""
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='POSE')
    reset(arm)
    bpy.ops.object.mode_set(mode='OBJECT')
    rig.pose(arm, spec)
    for pb in arm.pose.bones:
        f = frame + (trail if pb.name in TRAIL else 0)
        pb.keyframe_insert('rotation_quaternion', frame=f)
        pb.keyframe_insert('location', frame=f)


def blend(a, b, t):
    """A pose between two poses: directions and hips lerped (enough for an anticipation or a peek)."""
    out = {}
    for k in set(a) | set(b):
        va, vb = a.get(k), b.get(k)
        if k == 'spear_drop':
            out[k] = vb if t > 0.5 and vb else va
            continue
        if va is None or vb is None:
            out[k] = va or vb
            continue
        out[k] = tuple(x + (y - x) * t for x, y in zip(va, vb))
    return {k: v for k, v in out.items() if v is not None}


def shifted(spec, dz=0.0, dy=0.0):
    s = dict(spec)
    if 'hips_at' in s:
        x, y, z = s['hips_at']
        s['hips_at'] = (x, y + dy, z + dz)
    return s


S = rig.STATES
STANCE_HIPS = {'hips_at': (0, 0, 0.92)}
BRAKE = {
    'hips_at': (0, 0.1, 0.8), 'spine': (0, 0.15, 1), 'head': (0, -0.2, 1),
    'thigh.L': (0.06, -0.55, -0.84), 'shin.L': (0, -0.2, -1), 'thigh.R': (-0.06, -0.1, -1), 'shin.R': (0, 0.45, -0.9),
    'upper_arm.R': (-0.4, -0.3, -0.85), 'forearm.R': (-0.3, -0.8, -0.1), 'upper_arm.L': (0.4, -0.2, -0.88),
    'forearm.L': (0.2, -0.85, 0.2), 'hand.L': (0, -0.4, 0.9), 'spear': (0.05, -0.2, 0.98),
}
LYING = {
    'hips_at': (0, 0.55, 0.16), 'spine': (0.08, 1, 0.05), 'neck': (0.1, 1, -0.05), 'head': (0.2, 1, -0.15),
    'thigh.L': (0.18, -1, 0.06), 'shin.L': (0.1, -1, -0.12), 'foot.L': (0.4, -0.1, 0.9),
    'thigh.R': (-0.1, -1, 0.12), 'shin.R': (-0.25, -0.95, -0.15), 'foot.R': (-0.4, -0.2, 0.9),
    'upper_arm.R': (-1, 0.35, 0.02), 'forearm.R': (-0.7, 0.7, -0.05), 'hand.R': (-0.5, 0.85, -0.05),
    'upper_arm.L': (1, 0.1, 0.02), 'forearm.L': (0.8, -0.55, -0.05), 'hand.L': (0.6, -0.8, -0.05),
    'spear_drop': ((1.3, -0.4, 0.03), (1, 0.35, 0)),
}


def peek(spec):
    s = shifted(spec, dz=0.16, dy=0.05)
    s.update({'spine': (0, -0.25, 0.97), 'head': (0, -0.15, 1)})
    return s


def choreography(arm, stride_len=1.9, hip_dz=0.0):
    """Key the scene; returns (last frame, cover y, run start, run end, hit frame).

    The object's own Y carries the run forward, keyed on every frame at constant speed (an eased
    curve would make the planted foot slide); `stride_len` and `hip_dz` come from measure_run."""
    ease, cover = dict(S['at_ease']), S['take_cover']
    ease.update(STANCE_HIPS)
    f = 1
    key(arm, ease, f)
    breath = dict(ease)
    breath['spine'] = (0, 0.06, 1)
    key(arm, breath, f + 12)
    key(arm, ease, f + 22)
    # startle: anticipation (a quick crouch, head snapping up), then alarm
    crouch = shifted(blend(ease, S['kneel'], 0.25), dz=-0.04)
    crouch['head'] = (0, -0.35, 0.94)
    key(arm, crouch, f + 26, trail=1)
    alarm = blend(ease, S['run'], 0.35)
    alarm['head'] = (0, -0.3, 0.95)
    key(arm, alarm, f + 30, trail=1)
    # the run: two strides of 16 frames, keyed every 2 frames; the object moves with the stride
    start, stride_frames, strides = f + 32, 16, 2
    for k in range(stride_frames * strides // 2 + 1):
        t = (2 * k) / stride_frames
        key(arm, shifted(rig.run_phase(t % 1.0), dz=hip_dz), start + 2 * k, trail=1)
    end_run = start + stride_frames * strides
    for fr in range(start, end_run + 1):
        arm.location = (arm.location.x, FORWARD * stride_len * (fr - start) / stride_frames, 0)
        arm.keyframe_insert('location', frame=fr)
    # brake, then dive into cover with an overshoot and a settle
    key(arm, BRAKE, end_run + 4)
    arm.location = (arm.location.x, FORWARD * (stride_len * strides + 0.45), 0)
    arm.keyframe_insert('location', frame=end_run + 6)
    key(arm, shifted(cover, dz=-0.06), end_run + 10)
    key(arm, cover, end_run + 15)
    key(arm, cover, end_run + 30)
    # peek over the wall, duck back, peek again
    key(arm, peek(cover), end_run + 38)
    key(arm, peek(cover), end_run + 50)
    key(arm, cover, end_run + 56)
    key(arm, cover, end_run + 66)
    key(arm, peek(cover), end_run + 72)
    # hit: thrown back in 4 frames, then the collapse (the ragdoll's job in the game)
    hit = dict(S['react'])
    hit['hips_at'] = (0, 0.25, 0.85)
    key(arm, hit, end_run + 76, trail=1)
    fall = blend(hit, LYING, 0.55)
    fall['hips_at'] = (0, 0.45, 0.45)
    key(arm, fall, end_run + 82, trail=1)
    key(arm, LYING, end_run + 88, trail=1)
    bounce = shifted(LYING, dz=0.04)
    key(arm, bounce, end_run + 91, trail=1)
    key(arm, LYING, end_run + 95, trail=1)
    last = end_run + 110
    return last, FORWARD * (stride_len * strides + 0.45), start, end_run, end_run + 76


def ankles(arm, frames):
    """The ankles (feet bones' heads) per frame: armature space and world space."""
    out = []
    for fr in frames:
        bpy.context.scene.frame_set(fr)
        row = {}
        for sd in ('L', 'R'):
            local = arm.pose.bones[f'foot.{sd}'].head.copy()
            row[sd] = (local, arm.matrix_world @ local)
        out.append(row)
    return out


def measure_run(arm, start, end):
    """How fast the planted foot moves back under the body, and how low it goes.

    A foot is planted on the frames where its ankle is within 2.5 cm of its lowest point. The
    body must travel forward as fast as the planted foot moves back, or the foot slides; the
    lowest ankle must sit 10 cm up (the ankle's height standing)."""
    rows = ankles(arm, range(start, end + 1))
    speeds, lows = [], []
    for sd in ('L', 'R'):
        zs = [r[sd][0].z for r in rows]
        low = min(zs)
        lows.append(low)
        for i in range(len(rows) - 1):
            if zs[i] < low + 0.025 and zs[i + 1] < low + 0.025:
                speeds.append(rows[i + 1][sd][0].y - rows[i][sd][0].y)
    speed = sum(speeds) / max(1, len(speeds))
    return speed, min(lows)


def slide(arm, start, end):
    """Worst slide of a planted foot, in metres per frame, in world space."""
    rows = ankles(arm, range(start, end + 1))
    worst = 0.0
    for sd in ('L', 'R'):
        zs = [r[sd][1].z for r in rows]
        low = min(zs)
        for i in range(len(rows) - 1):
            if zs[i] < low + 0.02 and zs[i + 1] < low + 0.02:  # the driver's own contact window
                d = rows[i + 1][sd][1] - rows[i][sd][1]
                worst = max(worst, (d.x * d.x + d.y * d.y) ** 0.5)
    return worst, min(min(r[sd][1].z for r in rows) for sd in ('L', 'R'))


def drive_by_foot(arm, start, end, mean_speed):
    """Root motion from the planted foot: on each frame the body moves forward exactly as far as
    the planted foot moves back under it (so it cannot slide); in flight it keeps the mean speed."""
    rows = ankles(arm, range(start, end + 1))
    low = min(min(r[sd][0].z for r in rows) for sd in ('L', 'R'))
    bpy.context.scene.frame_set(start)
    y = arm.location.y
    for i in range(len(rows) - 1):
        planted = [sd for sd in ('L', 'R') if rows[i][sd][0].z < low + 0.02 and rows[i + 1][sd][0].z < low + 0.02]
        if planted:
            sd = min(planted, key=lambda s: rows[i][s][0].z)
            step = rows[i + 1][sd][0].y - rows[i][sd][0].y
        else:
            step = mean_speed
        y += FORWARD * step
        arm.location = (arm.location.x, y, arm.location.z)
        arm.keyframe_insert('location', frame=start + i + 1)


def bake_spear(arm, release, land, last, drop):
    """From the hand to the ground: once released, the spear is keyed on every frame in the
    armature's space (an arc and a spin), so the hand it no longer follows cannot drag it."""
    sc = bpy.context.scene
    sc.frame_set(release)
    pb = arm.pose.bones['spear']
    m0 = pb.matrix.copy()
    p0, q0 = m0.to_translation(), m0.to_quaternion()
    at, direction = drop
    y0 = (q0.to_matrix() @ Vector((0, 1, 0))).normalized()
    q1 = y0.rotation_difference(Vector(direction).normalized()) @ q0
    p1 = Vector(at)
    bpy.context.view_layer.objects.active = arm
    for fr in range(release, last + 1):
        sc.frame_set(fr)
        t = min(1.0, (fr - release) / (land - release))
        e = t * t * (3 - 2 * t)
        pos = p0.lerp(p1, e) + Vector((0, 0, 0.55 * 4 * t * (1 - t)))
        rot = q0.slerp(q1, e)
        bpy.ops.object.mode_set(mode='POSE')
        pb.matrix = Matrix.Translation(pos) @ rot.to_matrix().to_4x4()
        bpy.ops.object.mode_set(mode='OBJECT')
        pb.keyframe_insert('rotation_quaternion', frame=fr)
        pb.keyframe_insert('location', frame=fr)


def scene(col):
    rng = rig.seed(401)
    arm = rig.soldier(col, Vector((0, 0, 0)), rng)
    # first pass: measure the run as keyed with the defaults, then key it again with the numbers
    _, _, start, end, _ = choreography(arm)
    speed, low = measure_run(arm, start, end)
    stride_len, hip_dz = speed * 16, 0.1 - low
    print(f'RUN measured: foot moves back {speed * 1000:.1f} mm/frame, lowest ankle {low:.3f} m '
          f'-> stride {stride_len:.2f} m, hips {hip_dz * 100:+.1f} cm')
    arm.animation_data_clear()
    for pbone in arm.pose.bones:
        pbone.rotation_quaternion = Quaternion()
        pbone.location = (0, 0, 0)
    arm.location = (0, 0, 0)
    last, cover_y, start, end, hit = choreography(arm, stride_len=stride_len, hip_dz=hip_dz)
    drive_by_foot(arm, start, end, speed)
    worst, floor_z = slide(arm, start, end)
    print(f'RUN check: worst planted-foot slide {worst * 1000:.1f} mm/frame, lowest ankle {floor_z:.3f} m')
    bake_spear(arm, hit + 1, hit + 9, last, LYING['spear_drop'])
    rig.props(col, Vector((0, cover_y, 0)), 'wall', rng)
    floor = rig.Part('MDL_floor')
    floor.face([Vector((-4, -8, 0)), Vector((4, -8, 0)), Vector((4, 3, 0)), Vector((-4, 3, 0))], rig.lin('#a29b8f'))
    floor.finish(rig.kit.material('M_floor', 0.9), col)
    sc = bpy.context.scene
    sc.frame_start, sc.frame_end = 1, last
    sc.render.fps = FPS
    return arm, last


# key moments for the strip (frame offsets from the end of the run are computed in stage)
MOMENTS = [1, 27, 31, 40, 48, 70, 75, 100, 112, 120, 126, 136]
