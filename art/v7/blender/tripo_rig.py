"""Fit a Mixamo skeleton to a T-posed Tripo character and skin it, without paid rigging.

The 65 joints carry Mixamo's names (`mixamorig:Hips`…), like the ogre rigged by
Tripo, so Mixamo clips and the ogre's clips retarget by name. Joints are
measured on the mesh (arm line and legs slice by slice, feet, hand width), not
guessed from a template. Skinning: heat weights on a watertight voxel copy, then
transferred to the real mesh (Tripo meshes have open shells that break heat
weighting), four influences per vertex for three.js.

    blender -b --factory-startup -P tripo_rig.py -- SRC.glb OUT.glb HEIGHT [SHEET_DIR]

HEIGHT in metres (1.20 to 2.60). SHEET_DIR renders a pose test (rest, A-pose,
stride, reach) from the front and three-quarters, one PNG per view.
"""
import math
import os
import re
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tripo_prep import joined_mesh  # noqa: E402

P = 'mixamorig:'
FINGERS = ('Index', 'Middle', 'Ring', 'Pinky')
FINGER_LENGTH = {'Index': 0.93, 'Middle': 1.0, 'Ring': 0.95, 'Pinky': 0.78}
FINGER_JOINTS = (0.0, 0.47, 0.76, 1.0)


def read_args():
    args = sys.argv[sys.argv.index('--') + 1:]
    if len(args) not in (3, 4):
        raise SystemExit('usage: SRC.glb OUT.glb HEIGHT [SHEET_DIR]')
    if not re.fullmatch(r'[12]\.\d{1,3}', args[2]):
        raise SystemExit('HEIGHT is metres, like 1.80')
    height = float(args[2])
    if not 1.2 <= height <= 2.6:
        raise SystemExit('HEIGHT between 1.20 and 2.60')
    sheet = os.path.abspath(args[3]) if len(args) == 4 else None
    return os.path.abspath(args[0]), os.path.abspath(args[1]), height, sheet


def stand(obj, height):
    """Scale to height, feet on the ground, centred."""
    s = height / obj.dimensions.z
    obj.scale = (s, s, s)
    bpy.ops.object.transform_apply(scale=True)
    co = vertices(obj)
    lo, hi = co.min(0), co.max(0)
    obj.location = (-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2])
    bpy.ops.object.transform_apply(location=True)


def vertices(obj):
    co = np.empty(len(obj.data.vertices) * 3)
    obj.data.vertices.foreach_get('co', co)
    return co.reshape(-1, 3)


class Body:
    """Joint positions measured on a T-posed mesh facing -Y, its left on +X."""

    def __init__(self, co, height):
        self.co, self.h = co, height
        self.x, self.y, self.z = co.T

    def v(self, x, y, f):
        return Vector((x, y, f * self.h))

    # torso ---------------------------------------------------------------
    def torso_y(self, f):
        """Spine depth at a height: a little behind the middle of the body."""
        s = (np.abs(self.x) < 0.09 * self.h) & (np.abs(self.z - f * self.h) < 0.012 * self.h)
        ys = self.y[s]
        if ys.size == 0:
            return 0.0
        return float((ys.min() + ys.max()) / 2 + 0.12 * (ys.max() - ys.min()))

    def spine(self):
        heights = {'Hips': 0.53, 'Spine': 0.59, 'Spine1': 0.66, 'Spine2': 0.735, 'Neck': 0.83, 'Head': 0.885}
        joints = {k: self.v(0.0, self.torso_y(f), f) for k, f in heights.items()}
        joints['HeadTop_End'] = self.v(0.0, joints['Head'].y, 1.0)
        return joints

    # arms ----------------------------------------------------------------
    def arm(self, sgn):
        h = self.h
        ax = sgn * self.x
        sel = (ax > 0.2 * h) & (self.z > 0.5 * h)
        tip = float(ax[sel].max())
        xs, ys, zs = [], [], []
        for t in np.linspace(0.2 * h, tip - 0.13 * h, 8):
            s = sel & (np.abs(ax - t) < 0.01 * h)
            if s.sum() > 3:
                xs.append(t)
                ys.append(float(self.y[s].mean()))
                zs.append(float(self.z[s].mean()))
        fy, fz = np.polyfit(xs, ys, 1), np.polyfit(xs, zs, 1)

        def at(t):
            return Vector((sgn * t, float(np.polyval(fy, t)), float(np.polyval(fz, t))))

        shoulder_x, wrist_x = 0.092 * h, tip - 0.105 * h
        joints = {
            'Arm': at(shoulder_x),
            'ForeArm': at(shoulder_x + 0.54 * (wrist_x - shoulder_x)) + Vector((0, 0.006 * h, 0)),
            'Hand': at(wrist_x),
        }
        joints['Shoulder'] = Vector((sgn * 0.028 * h, joints['Arm'].y - 0.01 * h, joints['Arm'].z + 0.012 * h))
        joints.update(self.hand(sgn, at, wrist_x, tip))
        return joints

    def hand(self, sgn, at, wrist_x, tip):
        h = self.h
        along = (at(tip) - at(wrist_x)).normalized()
        palm_x = wrist_x + 0.042 * h
        ax = sgn * self.x
        s = (np.abs(ax - palm_x - 0.01 * h) < 0.006 * h) & (np.abs(self.z - at(palm_x).z) < 0.05 * h)
        y0, y1 = (float(self.y[s].min()), float(self.y[s].max())) if s.sum() > 3 else (-0.02 * h, 0.02 * h)
        width = y1 - y0
        length = tip - palm_x
        palm = at(palm_x)
        joints = {}
        for k, name in enumerate(FINGERS):
            base = Vector((palm.x, y0 + (0.2 + 0.2 * k) * width, palm.z))
            for j, f in enumerate(FINGER_JOINTS, start=1):
                joints[f'Hand{name}{j}'] = base + along * (length * FINGER_LENGTH[name] * f)
        forward, down = Vector((0, -1, 0)), Vector((0, 0, -1))
        point = at(wrist_x) + along * 0.015 * h + forward * 0.35 * width + down * 0.008 * h
        steps = ((0.0, None), (0.024, (0.55, 0.85)), (0.020, (0.75, 0.65)), (0.017, (0.9, 0.45)))
        for j, (step, mix) in enumerate(steps, start=1):
            if mix:
                point = point + (along * mix[0] + forward * mix[1]).normalized() * step * h
            joints[f'HandThumb{j}'] = point.copy()
        return joints

    # legs ----------------------------------------------------------------
    def leg_slice(self, sgn, f, band=0.012):
        s = (sgn * self.x > 0.01 * self.h) & (sgn * self.x < 0.25 * self.h) & (np.abs(self.z - f * self.h) < band * self.h)
        return s

    def robed(self):
        """A robe or long skirt fills the gap between the knees."""
        s = (np.abs(self.x) < 0.02 * self.h) & (np.abs(self.z - 0.28 * self.h) < 0.012 * self.h)
        return int(s.sum()) > 3

    def leg(self, sgn, hips):
        if self.robed():
            return self.leg_under_robe(sgn, hips)
        return self.leg_measured(sgn, hips)

    def leg_under_robe(self, sgn, hips):
        """Legs hidden by cloth: human proportions under the hips, feet straight ahead."""
        h = self.h
        x = sgn * 0.06 * h
        ankle = Vector((x * 1.1, hips.y + 0.012 * h, 0.055 * h))
        toe_end = Vector((ankle.x, ankle.y - 0.13 * h, 0.02 * h))
        toe = ankle.lerp(toe_end, 0.68)
        toe.z = 0.025 * h
        return {
            'UpLeg': Vector((x, hips.y, 0.49 * h)),
            'Leg': Vector((x * 1.05, hips.y - 0.008 * h, 0.28 * h)),
            'Foot': ankle,
            'ToeBase': toe,
            'Toe_End': toe_end,
        }

    def leg_measured(self, sgn, hips):
        h = self.h
        knee_s = self.leg_slice(sgn, 0.28)
        knee = Vector((float(self.x[knee_s].mean()), float(self.y[knee_s].mean()) - 0.008 * h, 0.28 * h))
        hip_x = sgn * min(max(abs(knee.x) * 0.75, 0.045 * h), 0.075 * h)
        ankle_s = self.leg_slice(sgn, 0.055, 0.01)
        ay = self.y[ankle_s]
        ankle = Vector((float(self.x[ankle_s].mean()), float((ay.min() + ay.max()) / 2 + 0.2 * (ay.max() - ay.min())), 0.055 * h))
        foot = (sgn * self.x > 0.01 * h) & (self.z < 0.03 * h)
        y_front = float(self.y[foot].min())
        toe_s = foot & (self.y < y_front + 0.02 * h)
        toe_end = Vector((float(self.x[toe_s].mean()), y_front, 0.02 * h))
        toe = ankle.lerp(toe_end, 0.68)
        toe.z = 0.025 * h
        return {
            'UpLeg': Vector((hip_x, hips.y, 0.49 * h)),
            'Leg': knee,
            'Foot': ankle,
            'ToeBase': toe,
            'Toe_End': toe_end,
        }

    def joints(self):
        joints = self.spine()
        for side, sgn in (('Left', 1), ('Right', -1)):
            for name, pos in self.arm(sgn).items():
                joints[side + name] = pos
            for name, pos in self.leg(sgn, joints['Hips']).items():
                joints[side + name] = pos
        return joints


def hierarchy():
    """(bone, parent) in Mixamo order."""
    pairs = [('Hips', None), ('Spine', 'Hips'), ('Spine1', 'Spine'), ('Spine2', 'Spine1'),
             ('Neck', 'Spine2'), ('Head', 'Neck'), ('HeadTop_End', 'Head')]
    for s in ('Left', 'Right'):
        pairs += [(s + 'UpLeg', 'Hips'), (s + 'Leg', s + 'UpLeg'), (s + 'Foot', s + 'Leg'),
                  (s + 'ToeBase', s + 'Foot'), (s + 'Toe_End', s + 'ToeBase'),
                  (s + 'Shoulder', 'Spine2'), (s + 'Arm', s + 'Shoulder'),
                  (s + 'ForeArm', s + 'Arm'), (s + 'Hand', s + 'ForeArm')]
        for f in FINGERS + ('Thumb',):
            parent = s + 'Hand'
            for j in range(1, 5):
                pairs.append((f'{s}Hand{f}{j}', parent))
                parent = f'{s}Hand{f}{j}'
    return pairs


def is_end(name):
    return name.endswith('_End') or name.endswith('4')


def build_armature(joints, height):
    data = bpy.data.armatures.new('rig')
    arm = bpy.data.objects.new('rig', data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    pairs = hierarchy()
    children = {}
    for name, parent in pairs:
        children.setdefault(parent, []).append(name)
    for name, parent in pairs:
        bone = data.edit_bones.new(P + name)
        bone.head = joints[name]
        kids = [k for k in children.get(name, []) if not k.endswith('Shoulder') and not k.endswith('UpLeg')]
        if kids:
            tail = joints[kids[0]] if len(kids) == 1 else joints[[k for k in kids if 'Middle' in k or k == 'Neck'][0]]
        else:
            back = joints[name] - joints[parent]
            tail = joints[name] + back.normalized() * 0.025 * height
        if name == 'Hips':
            tail = joints['Spine']
        if (tail - bone.head).length < 1e-4:
            tail = bone.head + Vector((0, 0, 0.02 * height))
        bone.tail = tail
        if parent:
            bone.parent = data.edit_bones[P + parent]
        bone.use_connect = False
        bone.use_deform = not is_end(name)
        horizontal = abs((bone.tail - bone.head).normalized().z) < 0.7
        bone.align_roll(Vector((0, 0, 1)) if horizontal else Vector((0, -1, 0)))
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def skin(obj, arm, height):
    """Heat weights on a voxel copy, then carried over to the real mesh."""
    proxy = obj.copy()
    proxy.data = obj.data.copy()
    proxy.name = 'proxy'
    bpy.context.collection.objects.link(proxy)
    # Tripo clothing is open shells: thicken them so the voxel pass fuses one solid.
    thick = proxy.modifiers.new('thick', 'SOLIDIFY')
    thick.thickness = 0.012 * height
    thick.offset = 0.0
    remesh = proxy.modifiers.new('voxel', 'REMESH')
    remesh.mode = 'VOXEL'
    remesh.voxel_size = 0.0045 * height
    select(proxy)
    bpy.ops.object.modifier_apply(modifier=thick.name)
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    keep_largest_island(proxy)
    select(proxy, arm)
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    for bone in arm.data.bones:
        if bone.use_deform:
            obj.vertex_groups.new(name=bone.name)
    transfer = obj.modifiers.new('weights', 'DATA_TRANSFER')
    transfer.object = proxy
    transfer.use_vert_data = True
    transfer.data_types_verts = {'VGROUP_WEIGHTS'}
    transfer.vert_mapping = 'POLYINTERP_NEAREST'
    transfer.layers_vgroup_select_src = 'ALL'
    transfer.layers_vgroup_select_dst = 'NAME'
    select(obj)
    bpy.ops.object.modifier_apply(modifier=transfer.name)
    confine_arms(obj, arm, height)
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
    bpy.data.objects.remove(proxy)
    empty = sum(1 for v in obj.data.vertices if not any(g.weight > 0 for g in v.groups))
    mod = obj.modifiers.new('rig', 'ARMATURE')
    mod.object = arm
    obj.parent = arm
    return empty


def segment_distance(points, a, b):
    ab = b - a
    t = np.clip(((points - a) @ ab) / max(float(ab @ ab), 1e-12), 0.0, 1.0)
    return np.linalg.norm(points - (a + t[:, None] * ab), axis=1)


def confine_arms(obj, arm, height):
    """Arm bones move only what lies near the arm. In a T-pose, a robe or tunic
    hangs from the sleeve and the voxel copy fuses them: without this, raising an
    arm lifts half the robe. Weight lost here goes back to the body bones."""
    inner, outer = 0.08 * height, 0.12 * height
    points = vertices(obj)
    groups = {g.name: g for g in obj.vertex_groups}
    fallback = groups[P + 'Spine2']
    for side in ('Left', 'Right'):
        bones = arm.data.bones
        chain = [bones[P + side + n].head_local for n in ('Arm', 'ForeArm', 'Hand')]
        chain.append(bones[P + side + 'HandMiddle4'].head_local)
        dist = np.min([segment_distance(points, np.array(a), np.array(b)) for a, b in zip(chain, chain[1:])], axis=0)
        keep = np.clip((outer - dist) / (outer - inner), 0.0, 1.0)
        names = {g for g in groups if g.startswith(P + side) and not g.endswith('Shoulder')
                 and any(k in g for k in ('Arm', 'Hand'))}
        indices = {groups[n].index for n in names}
        for v in obj.data.vertices:
            if keep[v.index] >= 1.0:
                continue
            lost = 0.0
            for g in v.groups:
                if g.group in indices and g.weight > 0:
                    lost += g.weight * (1 - keep[v.index])
                    g.weight *= keep[v.index]
            if lost > 0 and sum(g.weight for g in v.groups) < 1e-4:
                fallback.add([v.index], lost, 'ADD')


def keep_largest_island(obj):
    """Heat weighting solves the whole mesh at once: one island that sees no bone
    (a cavity shell from the voxel pass) makes it fail for every vertex."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    seen, islands = set(), []
    for start in bm.verts:
        if start.index in seen:
            continue
        stack, island = [start], []
        seen.add(start.index)
        while stack:
            v = stack.pop()
            island.append(v)
            for e in v.link_edges:
                o = e.other_vert(v)
                if o.index not in seen:
                    seen.add(o.index)
                    stack.append(o)
        islands.append(island)
    islands.sort(key=len, reverse=True)
    bmesh.ops.delete(bm, geom=[v for island in islands[1:] for v in island], context='VERTS')
    bm.to_mesh(obj.data)
    bm.free()
    return len(islands)


def select(*objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[-1]


# pose test -------------------------------------------------------------------

def turn(arm, bone, axis, degrees):
    """Rotate a pose bone about a world axis, around its own head."""
    pb = arm.pose.bones[P + bone]
    m = pb.matrix.copy()
    head = m.translation.copy()
    r = Matrix.Rotation(math.radians(degrees), 4, axis)
    m = r @ m
    m.translation = head
    pb.matrix = m
    bpy.context.view_layer.update()


def a_pose(arm):
    for side, sgn in (('Left', 1), ('Right', -1)):
        turn(arm, side + 'Arm', 'Y', sgn * 62)
        turn(arm, side + 'ForeArm', 'X', -12)


def stride(arm):
    a_pose(arm)
    turn(arm, 'LeftUpLeg', 'X', -32)
    turn(arm, 'LeftLeg', 'X', 38)
    turn(arm, 'RightUpLeg', 'X', 22)
    turn(arm, 'RightLeg', 'X', 30)
    turn(arm, 'LeftArm', 'X', 25)
    turn(arm, 'RightArm', 'X', -25)
    turn(arm, 'Spine1', 'Z', 8)


def reach(arm):
    turn(arm, 'LeftArm', 'Y', -70)
    turn(arm, 'LeftForeArm', 'X', -85)
    turn(arm, 'RightArm', 'Y', -45)
    turn(arm, 'RightForeArm', 'Z', -80)
    turn(arm, 'Spine', 'Z', 12)
    turn(arm, 'Spine1', 'Z', 10)
    turn(arm, 'Head', 'Z', 35)
    turn(arm, 'LeftUpLeg', 'X', -60)
    turn(arm, 'LeftLeg', 'X', 75)
    for side in ('Left', 'Right'):
        for f in FINGERS:
            for j in (1, 2, 3):
                turn(arm, f'{side}Hand{f}{j}', 'Y' if side == 'Left' else 'Y', 35 if side == 'Left' else -35)


POSES = (('rest', lambda arm: None), ('a-pose', a_pose), ('stride', stride), ('reach', reach))


def stage(height):
    """Neutral review studio: EEVEE, grey world, one sun, an orthographic camera."""
    scene = bpy.context.scene
    for engine in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    scene.view_settings.view_transform = 'AgX'
    scene.render.resolution_x, scene.render.resolution_y = 640, 900
    scene.render.film_transparent = False
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.32, 0.31, 0.29, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
    scene.world = world
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 3.2
    sun.rotation_euler = (math.radians(50), 0, math.radians(-30))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 1.2 * height
    scene.collection.objects.link(cam)
    scene.camera = cam
    return cam


def aim(cam, height, degrees):
    a = math.radians(degrees)
    cam.location = (6 * math.sin(a), -6 * math.cos(a), 0.5 * height)
    cam.rotation_euler = (math.radians(90), 0, a)


def render_sheet(arm, height, folder):
    os.makedirs(folder, exist_ok=True)
    scene = bpy.context.scene
    cam = stage(height)
    views = (('front', 0), ('three-quarter', 50))
    for p, (pose, apply) in enumerate(POSES):
        for pb in arm.pose.bones:
            pb.matrix_basis = Matrix.Identity(4)
        bpy.context.view_layer.update()
        apply(arm)
        for v, (view, angle) in enumerate(views):
            aim(cam, height, angle)
            scene.render.filepath = os.path.join(folder, f'{v}{p}-{view}-{pose}.png')
            bpy.ops.render.render(write_still=True)


def main():
    src, out, height, sheet = read_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    obj = joined_mesh()
    stand(obj, height)
    joints = Body(vertices(obj), height).joints()
    arm = build_armature(joints, height)
    empty = skin(obj, arm, height)
    select(obj, arm)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_animations=False)
    print(f'RIG {out}: {len(arm.data.bones)} bones, {len(obj.data.vertices)} vertices, {empty} without weight')
    if sheet:
        render_sheet(arm, height, sheet)
        print(f'SHEET {sheet}')


if __name__ == '__main__':
    main()
