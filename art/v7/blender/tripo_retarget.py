"""Move animation clips from one Mixamo-named rig to another, for free.

The source can be the ogre's paid Tripo clips or Mixamo clips; the target is a
rig from `tripo_rig.py`. Rest poses differ (the ogre stands in an A-pose, our
characters in a T-pose) and so do the facings, so each target bone is first
turned to match the source's rest direction; every frame then applies the
source bone's world rotation away from its rest. The hips' travel is scaled by
the ratio of hip heights.

    blender -b --factory-startup -P tripo_retarget.py -- CLIPS RIG.glb OUT.glb [PREVIEW_DIR]

CLIPS is a GLB holding several clips (Tripo), or a folder of Mixamo FBX files
downloaded "without skin" at 30 fps, one clip per file, named after the file.
PREVIEW_DIR renders eight frames of every clip, three-quarter view.
"""
import math
import os
import re
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tripo_rig import P, aim, stage  # noqa: E402

MIXAMO_FPS = 30

# Source frames to keep, by clip name. Mixamo's standing yells start and end seated
# (hips at 0.62 m, standing from frame 29 to 137 at 30 fps): keep the standing part.
TRIMS = {'react-shout': (27, 139)}


def read_args():
    args = sys.argv[sys.argv.index('--') + 1:]
    if len(args) not in (3, 4):
        raise SystemExit('usage: CLIPS RIG.glb OUT.glb [PREVIEW_DIR]')
    return [os.path.abspath(a) for a in args[:3]] + [os.path.abspath(args[3]) if len(args) == 4 else None]


def clip_sources(path):
    """One GLB, or every FBX of a folder (sorted, so the output order is stable)."""
    if os.path.isdir(path):
        files = sorted(f for f in os.listdir(path) if f.lower().endswith('.fbx'))
        if not files:
            raise SystemExit(f'no .fbx in {path}')
        return [os.path.join(path, f) for f in files]
    return [path]


def import_rig(path):
    before = set(bpy.data.objects)
    actions = set(bpy.data.actions)
    if path.lower().endswith('.fbx'):
        bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    else:
        bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == 'ARMATURE')
    clips = [a for a in bpy.data.actions if a not in actions]
    for bone in arm.data.bones:
        # Mixamo numbers the prefix when a scene holds several rigs (mixamorig1:Hips).
        bone.name = re.sub(r'^mixamorig\d*:', P, bone.name)
    if path.lower().endswith('.fbx') and len(clips) == 1:
        clips[0].name = os.path.splitext(os.path.basename(path))[0]
    return arm, new, clips


def ordered(arm):
    """Bones with every parent before its children."""
    out, seen = [], set()

    def visit(bone):
        if bone.name in seen:
            return
        if bone.parent:
            visit(bone.parent)
        seen.add(bone.name)
        out.append(bone)
    for bone in arm.data.bones:
        visit(bone)
    return out


def matches_rest(name):
    """Only the arms differ by convention (A-pose against T-pose): they take the
    source's rest direction. Spine, neck, head, legs and collarbones keep their own
    rest, or the target would inherit the source's build (the ogre's rest has its
    head 40 degrees forward and its knees bent)."""
    part = name[len(P):].removeprefix('Left').removeprefix('Right')
    return part in ('Arm', 'ForeArm', 'Hand') or part.startswith('Hand')


def rest_world(arm, name):
    return arm.matrix_world @ arm.data.bones[name].matrix_local


def facing(arm):
    """Horizontal direction from ankles to toes."""
    d = Vector()
    for side in ('Left', 'Right'):
        d += rest_world(arm, P + side + 'Toe_End').translation - rest_world(arm, P + side + 'Foot').translation
    d.z = 0
    return d.normalized()


class Retarget:
    def __init__(self, src, tgt):
        self.src, self.tgt = src, tgt
        a, b = facing(src), facing(tgt)
        angle = math.atan2(a.x * b.y - a.y * b.x, a.dot(b))
        self.turn = Matrix.Rotation(angle, 3, 'Z')
        self.bones = [b for b in ordered(tgt) if b.name in src.data.bones]
        self.scale = rest_world(tgt, P + 'Hips').translation.z / rest_world(src, P + 'Hips').translation.z
        self.src_rest = {b.name: rest_world(src, b.name).to_3x3().normalized() for b in self.bones}
        self.src_hips = rest_world(src, P + 'Hips').translation.copy()
        self.tgt_hips = rest_world(tgt, P + 'Hips').translation.copy()
        self.matched = {}
        for bone in self.bones:
            own = rest_world(tgt, bone.name).to_3x3().normalized()
            if matches_rest(bone.name):
                wanted = self.turn @ self.src_rest[bone.name].col[1]
                own = own.col[1].rotation_difference(wanted).to_matrix() @ own
            self.matched[bone.name] = own

    def frame(self):
        """Target pose rotations (world) for the source's current frame."""
        world = {}
        inv_turn = self.turn.inverted()
        for bone in self.bones:
            pose = (self.src.matrix_world @ self.src.pose.bones[bone.name].matrix).to_3x3().normalized()
            delta = self.turn @ pose @ self.src_rest[bone.name].inverted() @ inv_turn
            world[bone.name] = (delta @ self.matched[bone.name]).to_quaternion()
        hips = self.src_head(P + 'Hips')
        hips = self.tgt_hips + self.turn @ (hips - self.src_hips) * self.scale
        for side in ('Left', 'Right'):
            self.plant(world, hips, side)
        return world, hips

    def src_head(self, name):
        return self.src.matrix_world @ self.src.pose.bones[name].head

    def plant(self, world, hips, side):
        """Two-bone IK: the foot goes where the source's foot goes (from its own rest,
        scaled), the knee bends the way the source's knee points."""
        up, low, foot = P + side + 'UpLeg', P + side + 'Leg', P + side + 'Foot'
        tgt = self.tgt.data.bones
        hips_rest = tgt[P + 'Hips'].matrix_local
        pose_hips = Matrix.Translation(hips) @ world[P + 'Hips'].to_matrix().to_4x4()
        hip = (pose_hips @ (hips_rest.inverted() @ tgt[up].matrix_local)).translation
        src_rest_ankle = rest_world(self.src, foot).translation
        goal = rest_world(self.tgt, foot).translation + self.turn @ (self.src_head(foot) - src_rest_ankle) * self.scale
        l1, l2 = tgt[up].length, tgt[low].length
        reach = goal - hip
        d = min(max(reach.length, 1e-4), (l1 + l2) * 0.999)
        axis = reach.normalized()
        s_hip, s_knee, s_ankle = self.src_head(up), self.src_head(low), self.src_head(foot)
        s_axis = (s_ankle - s_hip).normalized()
        pole = self.turn @ ((s_knee - s_hip) - s_axis * (s_knee - s_hip).dot(s_axis))
        pole = pole - axis * pole.dot(axis)
        if pole.length < 1e-5:
            pole = facing(self.tgt)
            pole = pole - axis * pole.dot(axis)
        pole.normalize()
        cos_a = max(-1.0, min(1.0, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)))
        knee = hip + axis * (l1 * cos_a) + pole * (l1 * math.sqrt(1 - cos_a * cos_a))
        ankle = hip + axis * d
        for name, start, end in ((up, hip, knee), (low, knee, ankle)):
            rot = world[name].to_matrix()
            fix = rot.col[1].rotation_difference((end - start).normalized()).to_matrix()
            world[name] = (fix @ rot).to_quaternion()

    def bases(self, world, hips):
        """Local pose bases from world rotations, parents first."""
        tgt = self.tgt
        inv_w = tgt.matrix_world.inverted()
        pose_arm, out = {}, {}
        for bone in self.bones:
            rest = bone.matrix_local
            if bone.parent and bone.parent.name in pose_arm:
                parent = pose_arm[bone.parent.name]
                local_rest = bone.parent.matrix_local.inverted() @ rest
                head = (parent @ local_rest).translation
            else:
                parent, local_rest = None, rest
                head = inv_w @ hips
            rot = (inv_w.to_3x3() @ world[bone.name].to_matrix()).to_4x4()
            m = Matrix.Translation(head) @ rot
            pose_arm[bone.name] = m
            out[bone.name] = (local_rest.inverted() @ (parent.inverted() if parent else Matrix()) @ m) if parent else rest.inverted() @ m
        return out


def bake(rt, clip):
    src, tgt = rt.src, rt.tgt
    src.animation_data.action = clip
    if hasattr(src.animation_data, 'action_slot') and clip.slots:
        src.animation_data.action_slot = clip.slots[0]
    start, end = (int(math.ceil(clip.frame_range[0])), int(math.floor(clip.frame_range[1])))
    if clip.name in TRIMS:
        start, end = max(start, TRIMS[clip.name][0]), min(end, TRIMS[clip.name][1])
    tgt.animation_data_create()
    action = bpy.data.actions.new(clip.name)
    tgt.animation_data.action = action
    for pb in tgt.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    previous = {}
    scene = bpy.context.scene
    for f in range(start, end + 1):
        scene.frame_set(f)
        world, hips = rt.frame()
        for name, basis in rt.bases(world, hips).items():
            pb = tgt.pose.bones[name]
            q = basis.to_quaternion()
            if name in previous and previous[name].dot(q) < 0:
                q.negate()
            previous[name] = q
            pb.rotation_quaternion = q
            pb.keyframe_insert('rotation_quaternion', frame=f - start)
            if name == P + 'Hips':
                pb.location = basis.translation
                pb.keyframe_insert('location', frame=f - start)
    track = tgt.animation_data.nla_tracks.new()
    track.name = clip.name
    track.strips.new(clip.name, 0, action)
    tgt.animation_data.action = None
    return action, end - start


def preview(tgt, actions, folder, height):
    os.makedirs(folder, exist_ok=True)
    scene = bpy.context.scene
    cam = stage(height)
    aim(cam, height, 40)
    scene.render.resolution_x, scene.render.resolution_y = 480, 640
    for track in tgt.animation_data.nla_tracks:
        track.mute = True
    for action, length in actions:
        tgt.animation_data.action = action
        # Eight frames spread over the clip: enough to judge it, light on the GPU.
        for f in sorted({round(length * k / 7) for k in range(8)}):
            scene.frame_set(f)
            scene.render.filepath = os.path.join(folder, f'{action.name}-{f:04d}.png')
            bpy.ops.render.render(write_still=True)
        tgt.animation_data.action = None


def main():
    clips_path, rig_path, out, folder = read_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sources = clip_sources(clips_path)
    if sources[0].lower().endswith('.fbx'):
        bpy.context.scene.render.fps = MIXAMO_FPS
    tgt, tgt_objects, _ = import_rig(rig_path)
    skins = [o for o in tgt_objects if o.type == 'MESH' and o.parent == tgt]
    for pb in tgt.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    baked = []
    for path in sources:
        src, src_objects, clips = import_rig(path)
        rt = Retarget(src, tgt)
        done = [(bake(rt, clip), clip.name) for clip in clips]
        for o in src_objects:
            bpy.data.objects.remove(o)
        for clip in clips:
            bpy.data.actions.remove(clip)
        for (action, length), name in done:
            action.name = name
            baked.append((action, length))
    height = max(o.dimensions.z for o in skins)
    bpy.ops.object.select_all(action='DESELECT')
    for o in [tgt] + skins:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True,
                              export_animation_mode='NLA_TRACKS')
    print('RETARGET', out, [(a.name, n) for a, n in baked])
    if folder:
        preview(tgt, baked, folder, height)
        print('PREVIEW', folder)


if __name__ == '__main__':
    main()
