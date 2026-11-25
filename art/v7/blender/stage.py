"""Catapulte Mania v7, visual bible: build a scene headless and render its shots.

    blender -b --factory-startup -P stage.py -- --scene fort --out <folder> [--shots a,b] [--save file.blend]

Late afternoon light for chapter 1: a warm sun 32° up from behind the player's left, a blue sky
fill, AgX. EEVEE on the GPU for look development.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(name, default=None):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default


SHOTS = {
    # name: (camera location, look-at point, focal length mm)
    'establishing': ((-17.0, -24.0, 7.5), (0.5, 9.0, 3.2), 30),
    'gate': ((-7.6, -4.6, 3.0), (-2.4, 2.6, 4.2), 32),
    'player': ((3.4, -50.5, 5.0), (0.0, 8.0, 3.0), 38),
    'engine': ((-6.6, -45.6, 2.5), (0.0, -40.0, 2.0), 32),
    'yard': ((9.5, 4.5, 5.6), (-1.0, 14.0, 2.0), 26),
    'cast': ((0.0, -17.5, 2.2), (0.0, 0.0, 1.35), 35),
    'cast_side': ((-6.5, -6.0, 1.9), (-2.6, 0.0, 1.2), 40),
    'materials': ((0.0, -9.0, 3.2), (0.0, 0.0, 0.5), 45),
    'heroes': ((0.5, -10.5, 1.6), (0.5, 0.0, 1.25), 35),
    'poses': ((-2.0, -11.5, 2.3), (0.0, 0.3, 0.8), 30),
    'poses_side': ((9.0, -4.0, 1.7), (0.0, 0.3, 0.8), 35),
    'poses_back': ((3.5, 10.8, 2.8), (0.3, 0.0, 0.7), 30),
    'run_strip': ((5.1, -13.5, 1.15), (5.1, 0.0, 0.95), 35),
    'anim': ((-4.8, -5.6, 1.7), (0.0, -2.7, 0.8), 30),
    'ogres': ((-3.0, -19.0, 3.4), (0.0, 0.0, 1.6), 30),
    'ogres_34': ((-12.0, -11.0, 3.2), (-1.5, 0.0, 1.5), 32),
    'wyverns': ((-13.0, -19.0, 11.0), (0.0, 4.0, 2.0), 30),
    'ogre_anim': ((-8.5, -9.0, 3.2), (0.0, -2.0, 2.0), 30),
    'wyvern_anim': ((-3.5, -13.5, 3.6), (0.3, -1.0, 3.0), 30),
    'wyverns_top': ((0.0, -12.0, 15.0), (0.0, 0.0, 1.5), 30),
    'heroes_34': ((-4.6, -6.4, 1.7), (-0.6, 0.0, 1.15), 35),
}


def ink_world(scene):
    """Paper for a sky, with the horizontal ruling of an engraved sky toward the top."""
    world = bpy.data.worlds.new('W_paper')
    scene.world = world
    N, L = world.node_tree.nodes, world.node_tree.links
    bg = N['Background']
    bg.inputs['Strength'].default_value = 1.0
    # ruled sky: horizontal ink lines, closer and stronger toward the top of the frame
    tc = N.new('ShaderNodeTexCoord')
    sep = N.new('ShaderNodeSeparateXYZ')
    L.new(tc.outputs['Window'], sep.inputs[0])

    def node_math(op, a, b):
        n = N.new('ShaderNodeMath')
        n.operation = op
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                L.new(v, n.inputs[i])
        return n.outputs[0]

    y = sep.outputs['Y']
    lines = node_math('LESS_THAN', node_math('FRACT', node_math('MULTIPLY', y, 150.0), None), node_math('MULTIPLY', node_math('SUBTRACT', y, 0.55), 0.5))
    mix = N.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    sock = {s.identifier: s for s in mix.inputs}
    sock['A_Color'].default_value = kit.lin(kit.PAPER)
    sock['B_Color'].default_value = kit.lin('#b9b0a0')
    L.new(lines, sock['Factor_Float'])
    L.new(next(o for o in mix.outputs if o.identifier == 'Result_Color'), bg.inputs['Color'])
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.render.use_freestyle = True
    scene.render.line_thickness_mode = 'ABSOLUTE'
    scene.render.line_thickness = 1.25
    fs = bpy.context.view_layer.freestyle_settings
    fs.crease_angle = math.radians(115)
    lineset = fs.linesets[0] if len(fs.linesets) else fs.linesets.new('ink')
    lineset.select_by_visibility = True
    lineset.select_silhouette = True
    lineset.select_border = True
    lineset.select_crease = True
    if lineset.linestyle is None:
        lineset.linestyle = bpy.data.linestyles.new('LS_ink')
    lineset.linestyle.color = kit.lin(kit.INK)[:3]
    lineset.linestyle.thickness = 1.4 if kit.LOOK == 'engrave' else 2.2


def setup_world(sun_elevation=32.0, sun_azimuth=-128.0):
    scene = bpy.context.scene
    for engine in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    ee = scene.eevee
    for attr, value in (('taa_render_samples', 64), ('use_raytracing', True), ('use_shadows', True)):
        if hasattr(ee, attr):
            setattr(ee, attr, value)
    scene.view_settings.view_transform = 'AgX'
    for look in ('AgX - Medium High Contrast', 'Medium High Contrast'):
        try:
            scene.view_settings.look = look
            break
        except TypeError:
            continue
    scene.render.resolution_x, scene.render.resolution_y = 1600, 900
    scene.render.film_transparent = False
    world = bpy.data.worlds.new('W_ch1')
    scene.world = world
    nodes, links = world.node_tree.nodes, world.node_tree.links
    bg = nodes['Background']
    coord = nodes.new('ShaderNodeTexCoord')
    sep = nodes.new('ShaderNodeSeparateXYZ')
    ramp = nodes.new('ShaderNodeValToRGB')
    links.new(coord.outputs['Generated'], sep.inputs[0])
    # sky: warm haze at the horizon, blue above (in a world, Generated is the view direction)
    links.new(sep.outputs['Z'], ramp.inputs[0])
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = kit.lin('#e6cfa6')
    ramp.color_ramp.elements[1].position = 0.5
    ramp.color_ramp.elements[1].color = kit.lin('#3f72c2')
    mid = ramp.color_ramp.elements.new(0.12)
    mid.color = kit.lin('#9dbbe0')
    links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 0.75
    # no world volume: in EEVEE it swallows the sky and the sun (checked 2026-11-25); haze lives in the colours
    if kit.LOOK != 'lowpoly':
        ink_world(scene)
    sun = bpy.data.objects.new('LGT_sun', bpy.data.lights.new('LGT_sun', 'SUN'))
    sun.data.energy = 6.5
    sun.data.color = (1.0, 0.86, 0.68)
    sun.data.angle = math.radians(2.5)
    sun.rotation_euler = (math.radians(90 - sun_elevation), 0, math.radians(sun_azimuth))
    scene.collection.objects.link(sun)
    # distance haze
    scene.render.use_compositing = False
    return sun


def camera(name):
    loc, look, focal = SHOTS[name]
    cam = bpy.data.objects.get('CAM_shot') or bpy.data.objects.new('CAM_shot', bpy.data.cameras.new('CAM_shot'))
    if cam.name not in bpy.context.scene.collection.objects:
        bpy.context.scene.collection.objects.link(cam)
    cam.location = loc
    cam.rotation_euler = (Vector(look) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = focal
    cam.data.clip_end = 600
    bpy.context.scene.camera = cam
    return cam


def render(shots, out):
    out = os.path.abspath(out)
    os.makedirs(out, exist_ok=True)
    for name in shots:
        camera(name)
        bpy.context.scene.render.filepath = os.path.join(out, f'{name}-{kit.LOOK}.png')
        bpy.ops.render.render(write_still=True)
        print('RENDERED', bpy.context.scene.render.filepath)


def render_frames(shot, frames, out):
    """Render frames 'a-b' (every one) or 'a,b,c' (those) of the animation from one camera."""
    out = os.path.abspath(out)
    os.makedirs(out, exist_ok=True)
    camera(shot)
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = 1280, 720
    if hasattr(sc.eevee, 'taa_render_samples'):
        sc.eevee.taa_render_samples = 16
    if '-' in frames:
        a, b = (int(x) for x in frames.split('-'))
        wanted = range(a, b + 1)
    else:
        wanted = [int(x) for x in frames.split(',')]
    for f in wanted:
        sc.frame_set(f)
        sc.render.filepath = os.path.join(out, f'f{f:04d}.png')
        bpy.ops.render.render(write_still=True)
    print('RENDERED FRAMES', len(list(wanted)), out)


def stats():
    total = 0
    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
            total += tris
            print(f'TRIS {obj.name:24s} {tris:8d}')
    print(f'TRIS TOTAL {total}')


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    kit.LOOK = arg('--look', 'lowpoly')
    scene_name = arg('--scene', 'fort')
    col = bpy.data.collections.new(scene_name)
    bpy.context.scene.collection.children.link(col)
    if scene_name == 'fort':
        import fort
        fort.build(col)
        if '--with-cast' in ARGS:
            import cast
            cast.garrison(col)
    elif scene_name == 'cast':
        import cast
        cast.lineup(col)
    elif scene_name == 'heroes':
        import cast
        cast.heroes(col)
    elif scene_name == 'poses':
        import rig
        rig.sheet(col)
    elif scene_name == 'run':
        import rig
        rig.run_strip(col)
    elif scene_name == 'anim':
        import anim
        anim.scene(col)
    elif scene_name == 'ogres':
        import creatures
        creatures.ogre_sheet(col)
    elif scene_name == 'wyverns':
        import creatures
        creatures.wyvern_sheet(col)
    elif scene_name == 'ogre_anim':
        import creatures
        creatures.ogre_counter(col)
    elif scene_name == 'wyvern_anim':
        import creatures
        creatures.wyvern_counter(col)
    elif scene_name == 'materials':
        import materials
        materials.sheet(col)
    setup_world()
    stats()
    if arg('--save'):
        bpy.ops.wm.save_as_mainfile(filepath=arg('--save'))
    if arg('--frames'):
        render_frames(arg('--shots', 'anim'), arg('--frames'), arg('--out'))
        return
    shots = arg('--shots', 'establishing').split(',')
    render(shots, arg('--out', os.path.join(os.path.dirname(__file__), 'renders')))


main()
