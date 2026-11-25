"""Catapulte Mania v7, visual bible: the cast, faceless.

One parametric body (a stylised 1.8 m figure, head a little large to read at range) dressed per
role. No face: the role reads from the silhouette, the colour, the headgear and what is held.
Three parts carry the whole cast: cloth and skin (matte), metal (iron, gold), glow (torch flame).
Rest pose: arms 14 degrees out (A-pose), facing -Y, ready for rigging.
"""
import math

from mathutils import Matrix, Vector

import kit
import steam
from kit import C, Part, lin, seed, vary

ROLES = ['soldier', 'knight', 'king', 'ogre', 'scout', 'shieldbearer', 'bannerman', 'engineer', 'general', 'pillager']
FLYERS = ['crow', 'wyvern']
CLAY = lin('#b98f6a')        # the faceless head and hands
OGRE = lin('#7b8758')


class Rig:
    """The three parts a cast is written into."""

    def __init__(self, prefix):
        self.cloth = Part(f'MDL_{prefix}_cloth')
        self.metal = Part(f'MDL_{prefix}_metal')
        self.glow = Part(f'MDL_{prefix}_glow')

    def finish(self, col):
        mats = {
            'cloth': kit.material('M_cast_cloth', 0.78),
            'metal': kit.material('M_cast_metal', 0.42, metallic=0.85),
            'glow': kit.material('M_cast_glow', 0.5, emission=12.0),
        }
        return [self.cloth.finish(mats['cloth'], col), self.metal.finish(mats['metal'], col), self.glow.finish(mats['glow'], col)]


def limb(part, a, b, r0, r1, rgba, rng, n=7):
    d = b - a
    bm = kit.frustum(r0, r1, d.length, n)
    rot = d.normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4()
    part.merge(bm, Matrix.Translation(a) @ rot, lambda f: vary(rgba, rng, 0.03))


def shape(part, bm, m, rgba, rng, amount=0.03):
    part.merge(bm, m, lambda f: vary(rgba, rng, amount))


def body(rig, m, rng, spec):
    """The figure: boots, legs, skirt, torso, arms, neck, head. Returns its anchor points (world)."""
    bulk, tunic, legs = spec.get('bulk', 1.0), spec['tunic'], spec.get('legs', lin('#4b3b2e'))
    skin = spec.get('skin', CLAY)
    cl = rig.cloth
    T = lambda x, y, z: m @ Vector((x, y, z))  # noqa: E731
    for sx in (-1, 1):
        shape(cl, kit.box(0.13 * bulk, 0.27, 0.12, bevel=0.03), m @ Matrix.Translation((sx * 0.11 * bulk, -0.03, 0)), spec.get('boots', lin('#3a2a1e')), rng)
        limb(cl, T(sx * 0.11 * bulk, 0, 0.1), T(sx * 0.11 * bulk, 0, 0.5), 0.066 * bulk, 0.078 * bulk, legs, rng)
        limb(cl, T(sx * 0.11 * bulk, 0, 0.5), T(sx * 0.115 * bulk, 0, 0.93), 0.085 * bulk, 0.105 * bulk, legs, rng)
    # skirt of the tunic, then the torso as a loft of rings
    skirt = kit.loft([kit.ring(8, 0.25 * bulk, 0.18 * bulk, 0.6), kit.ring(8, 0.19 * bulk, 0.14 * bulk, 1.02)])[0]
    shape(cl, skirt, m, tunic, rng)
    belly = spec.get('belly', 1.0)
    torso = kit.loft([kit.ring(8, 0.175 * bulk, 0.125 * bulk * belly, 1.0), kit.ring(8, 0.21 * bulk, 0.145 * bulk * belly, 1.27),
                      kit.ring(8, 0.235 * bulk, 0.135 * bulk, 1.44), kit.ring(8, 0.09, 0.085, 1.53)])[0]
    shape(cl, torso, m, spec.get('chest', tunic), rng)
    belt = kit.torus(0.18 * bulk, 0.025, n=10, m=4, sy=0.72 * belly)
    shape(cl, belt, m @ Matrix.Translation((0, 0, 1.02)), lin('#4a3020'), rng)
    # arms in A-pose
    hands = []
    for sx in (-1, 1):
        sh = T(sx * 0.25 * bulk, 0, 1.42)
        out = math.radians(14)
        elbow = sh + (m.to_3x3() @ Vector((sx * math.sin(out), 0, -math.cos(out)))) * 0.3 * bulk
        wrist = elbow + (m.to_3x3() @ Vector((sx * math.sin(out * 0.6), -0.03, -math.cos(out * 0.6)))) * 0.27 * bulk
        sleeve = spec.get('sleeve', tunic)
        limb(cl, sh, elbow, 0.075 * bulk, 0.065 * bulk, sleeve, rng)
        limb(cl, elbow, wrist, 0.064 * bulk, 0.054 * bulk, spec.get('glove', sleeve), rng)
        hand = kit.box(0.075 * bulk, 0.09 * bulk, 0.11 * bulk, bevel=0.02)
        shape(cl, hand, Matrix.Translation(wrist - Vector((0, 0, 0.1 * bulk))) @ m.to_3x3().to_4x4(), skin, rng)
        hands.append(wrist - Vector((0, 0, 0.06 * bulk)))
    limb(cl, T(0, 0, 1.5), T(0, 0, 1.6), 0.055 * bulk, 0.05 * bulk, skin, rng)
    head_r = spec.get('head', 1.0)
    head = kit.ellipsoid(0.105 * head_r, 0.115 * head_r, 0.135 * head_r, seg=10, rings=7)
    shape(cl, head, m @ Matrix.Translation((0, 0, 1.71 * spec.get('neck', 1.0))), skin, rng, 0.01)
    return {'hands': hands, 'head': T(0, 0, 1.71 * spec.get('neck', 1.0)), 'shoulders': [T(-0.25 * bulk, 0, 1.42), T(0.25 * bulk, 0, 1.42)],
            'chest': T(0, -0.15 * bulk, 1.25), 'back': T(0, 0.14 * bulk, 1.4), 'm': m}


# ---------- headgear ----------

def kettle_hat(rig, a, rng):
    shape(rig.metal, kit.frustum(0.21, 0.2, 0.025, 10), Matrix.Translation(a['head'] + Vector((0, 0, 0.05))), C['iron'], rng)
    shape(rig.metal, kit.frustum(0.125, 0.05, 0.13, 10), Matrix.Translation(a['head'] + Vector((0, 0, 0.07))), C['iron'], rng)


def great_helm(rig, a, rng, crest=None):
    h = a['head']
    shape(rig.metal, kit.frustum(0.135, 0.125, 0.28, 10), Matrix.Translation(h - Vector((0, 0, 0.13))), C['iron'], rng)
    shape(rig.cloth, kit.box(0.2, 0.02, 0.025), Matrix.Translation(h + Vector((0, -0.128, 0.02))), lin('#151515'), rng)
    if crest:
        shape(rig.cloth, kit.ellipsoid(0.035, 0.16, 0.09, 6, 5), Matrix.Translation(h + Vector((0, 0.02, 0.21))), crest, rng)


def crown(rig, a, rng):
    h = a['head'] + Vector((0, 0, 0.07))
    shape(rig.metal, kit.frustum(0.12, 0.125, 0.06, 10), Matrix.Translation(h), C['gold'], rng)
    for k in range(6):
        ang = math.tau * k / 6
        p = h + Vector((math.cos(ang) * 0.115, math.sin(ang) * 0.115, 0.06))
        shape(rig.metal, kit.frustum(0.025, 0.0, 0.07, 4), Matrix.Translation(p), C['gold'], rng)


def hood(rig, a, rng, rgba):
    h = a['head']
    bm = kit.loft([kit.ring(9, 0.17, 0.16, -0.16), kit.ring(9, 0.14, 0.15, 0.06), [Vector((0, 0.1, 0.24))] * 9], cap_bottom=False, cap_top=False)[0]
    shape(rig.cloth, bm, Matrix.Translation(h), rgba, rng)


def cap(rig, a, rng, rgba):
    shape(rig.cloth, kit.ellipsoid(0.125, 0.135, 0.07, 9, 5), Matrix.Translation(a['head'] + Vector((0, 0.01, 0.07))), rgba, rng)


def plumed_helm(rig, a, rng):
    h = a['head']
    shape(rig.metal, kit.ellipsoid(0.125, 0.135, 0.12, 10, 6), Matrix.Translation(h + Vector((0, 0, 0.04))), lin('#2c2e33'), rng)
    shape(rig.metal, kit.box(0.025, 0.04, 0.12), Matrix.Translation(h + Vector((0, -0.13, -0.08))), C['gold'], rng)
    for k in range(4):
        shape(rig.cloth, kit.ellipsoid(0.04, 0.09, 0.05, 6, 4), Matrix.Translation(h + Vector((0, 0.04 + k * 0.06, 0.18 - k * 0.025))), C['crimson'], rng)


# ---------- gear ----------

def pole(rig, a, b, r, rgba, rng, metal=False):
    limb(rig.metal if metal else rig.cloth, a, b, r, r * 0.9, rgba, rng, n=5)


def spear(rig, a, rng, hand=1, length=2.3):
    p = a['hands'][hand]
    pole(rig, p - Vector((0, 0, 0.6)), p + Vector((0, 0, length - 0.6)), 0.022, C['plank'], rng)
    shape(rig.metal, kit.frustum(0.04, 0.0, 0.22, 4), Matrix.Translation(p + Vector((0, 0, length - 0.6))), C['iron'], rng)


def sword(rig, a, rng, hand=1, size=1.0):
    p = a['hands'][hand]
    shape(rig.metal, kit.box(0.05 * size, 0.012, 0.75 * size, bevel=0.005), Matrix.Translation(p + Vector((0, -0.05, -0.8 * size))), lin('#b9bec4'), rng)
    shape(rig.metal, kit.box(0.2 * size, 0.03, 0.03), Matrix.Translation(p + Vector((0, -0.05, -0.06))), C['gold'], rng)


def shield(rig, a, rng, kind='kite', hand=0):
    p = a['hands'][hand] + Vector((-0.08 if hand == 0 else 0.08, -0.12, 0))
    if kind == 'tower':
        bm = kit.box(0.62, 0.05, 1.15, bevel=0.03)
        shape(rig.cloth, bm, Matrix.Translation(p + Vector((0, 0, -0.55))), C['crimson'], rng)
        for z in (-0.5, 0.0, 0.5):  # a new box each time: merge frees its source
            shape(rig.metal, kit.box(0.66, 0.03, 0.06), Matrix.Translation(p + Vector((0, -0.03, z))), C['iron'], rng)
        return
    if kind == 'round':
        bm = kit.frustum(0.3, 0.29, 0.04, 12)
        shape(rig.cloth, bm, Matrix.Translation(p) @ Matrix.Rotation(math.pi / 2, 4, 'X'), C['crimson'], rng)
        shape(rig.metal, kit.ellipsoid(0.07, 0.04, 0.07, 6, 4), Matrix.Translation(p + Vector((0, -0.04, 0))), C['iron'], rng)
        return
    pts = [Vector((-0.26, 0, 0.32)), Vector((0.26, 0, 0.32)), Vector((0.22, 0, -0.05)), Vector((0, 0, -0.5)), Vector((-0.22, 0, -0.05))]
    bm = kit.bmesh.new()
    front = [bm.verts.new(q) for q in pts]
    back = [bm.verts.new(q + Vector((0, 0.04, 0))) for q in pts]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    for i in range(5):
        j = (i + 1) % 5
        bm.faces.new([front[i], back[i], back[j], front[j]])
    shape(rig.cloth, bm, Matrix.Translation(p), C['crimson'], rng)
    shape(rig.metal, kit.box(0.06, 0.02, 0.62), Matrix.Translation(p + Vector((0, -0.015, -0.32))), C['gold'], rng)


def riveted_pauldrons(rig, a, rng, rgba):
    """A domed shoulder guard and a lame under it, riveted: plate armour in the font's grammar."""
    R3, b = a['m'].to_3x3(), a['bulk']
    for k, s in enumerate(a['shoulders']):
        sx = -1 if k == 0 else 1
        top = s + R3 @ Vector((sx * 0.04, 0, 0.035))
        shape(rig.metal, kit.ellipsoid(0.125 * b, 0.125 * b, 0.07 * b, seg=12, rings=7), Matrix.Translation(top), rgba, rng, 0.02)
        lame = s + R3 @ Vector((sx * 0.085, 0, -0.04))
        shape(rig.metal, kit.ellipsoid(0.1 * b, 0.105 * b, 0.045 * b, seg=10, rings=6), Matrix.Translation(lame), darker(rgba, 0.85), rng, 0.02)
        for dy in (-0.05, 0.05):
            steam.rivet(rig.metal, top + R3 @ Vector((sx * 0.02, dy, 0.065 * b)), R3 @ Vector((sx * 0.3, 0, 1)), r=0.018)
    return
    for k, s in enumerate(a['shoulders']):
        sx = -1 if k == 0 else 1
        steam.plate(rig.metal, s + a['m'].to_3x3() @ Vector((sx * 0.07, 0, 0.02)), 0.24, 0.24, a['m'].to_3x3() @ Vector((sx * 1.0, 0, 0.9)), rng, thickness=0.045, rivets=2, tone=rgba, rivet_r=0.022)


def breastplate(rig, a, rng, rgba):
    c = a['chest']
    steam.plate(rig.metal, c + a['m'].to_3x3() @ Vector((0, -0.02, 0.06)), 0.34, 0.28, a['m'].to_3x3() @ Vector((0, -1, 0.1)), rng, thickness=0.04, rivets=4, tone=rgba, rivet_r=0.018)


def stovepipe_helm(rig, a, rng):
    """The general's tall helm, a riveted stack with a brass band and a crimson plume."""
    h = a['head']
    shape(rig.metal, kit.frustum(0.135, 0.125, 0.38, 12), Matrix.Translation(h - Vector((0, 0, 0.1))), lin('#2c2e33'), rng)
    shape(rig.metal, kit.torus(0.133, 0.02, n=12, m=4), Matrix.Translation(h + Vector((0, 0, 0.12))), steam.BRASS, rng)
    shape(rig.cloth, kit.box(0.2, 0.02, 0.025), Matrix.Translation(h + Vector((0, -0.132, 0.02))), lin('#151515'), rng)
    for k in range(4):
        shape(rig.cloth, kit.ellipsoid(0.04, 0.08, 0.06, 6, 4), Matrix.Translation(h + Vector((0, 0.03 + k * 0.05, 0.32 - k * 0.04))), C['crimson'], rng)


def goggles(rig, a, rng):
    h = a['head']
    for sx in (-1, 1):
        shape(rig.metal, kit.torus(0.035, 0.012, n=10, m=4), Matrix.Translation(h + Vector((sx * 0.045, -0.11, 0.06))) @ Matrix.Rotation(math.pi / 2, 4, 'X'), steam.BRASS, rng)


def shovel(rig, a, rng, hand=1):
    p = a['hands'][hand]
    pole(rig, p + Vector((0, 0, 0.2)), p - Vector((0, 0, 0.7)), 0.02, C['plank'], rng)
    shape(rig.metal, kit.box(0.22, 0.03, 0.26, bevel=0.01), Matrix.Translation(p - Vector((0, 0, 0.98))), steam.IRON, rng)


def absorb(dst, src, fn):
    """Move a part's vertices with fn, then merge it into dst keeping its colours."""
    layer = src.col
    for v in src.bm.verts:
        v.co = fn(v.co)
    dst.merge(src.bm, Matrix.Identity(4), lambda f: tuple(f.loops[0][layer]))


def pauldrons(rig, a, rng, rgba):
    for s in a['shoulders']:
        shape(rig.metal, kit.ellipsoid(0.13, 0.12, 0.09, 8, 5), Matrix.Translation(s + Vector((0, 0, 0.04))), rgba, rng)


def cape(rig, a, rng, rgba, length=1.2, width=0.55):
    top = a['back'] + Vector((0, 0.02, 0.05))
    bm = kit.bmesh.new()
    rows = 4
    grid = []
    for j in range(rows + 1):
        t = j / rows
        w = width * (0.8 + 0.4 * t)
        z = -length * t
        grid.append([bm.verts.new((x * w / 2, 0.05 * t + 0.04 * math.sin(x * 3 + j), z)) for x in (-1, -0.33, 0.33, 1)])
    for j in range(rows):
        for i in range(3):
            bm.faces.new([grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]])
    shape(rig.cloth, bm, Matrix.Translation(top), rgba, rng)


def tabard(rig, a, rng, rgba, trim=None):
    c = a['chest']
    shape(rig.cloth, kit.box(0.3, 0.03, 0.62, bevel=0.01), Matrix.Translation(c + Vector((0, -0.01, -0.5))), rgba, rng)
    if trim:
        shape(rig.cloth, kit.box(0.31, 0.035, 0.04), Matrix.Translation(c + Vector((0, -0.015, -0.5))), trim, rng)


def robe(rig, a, rng, rgba, trim):
    m = a['m']
    bm = kit.loft([kit.ring(10, 0.36, 0.3, 0.0), kit.ring(10, 0.22, 0.17, 1.05)])[0]
    shape(rig.cloth, bm, m, rgba, rng)
    shape(rig.cloth, kit.torus(0.33, 0.04, n=12, m=4, sy=0.85), m @ Matrix.Translation((0, 0, 0.06)), trim, rng)


def torch(rig, a, rng, hand=1):
    p = a['hands'][hand]
    pole(rig, p - Vector((0, 0, 0.15)), p + Vector((0, 0, 0.45)), 0.025, C['plank'], rng)
    shape(rig.cloth, kit.frustum(0.05, 0.06, 0.1, 6), Matrix.Translation(p + Vector((0, 0, 0.4))), lin('#3b2a1c'), rng)
    shape(rig.glow, kit.blob(0.09, 0.09, 0.2, rng, 0.2), Matrix.Translation(p + Vector((0, 0, 0.62))), lin('#ff9a2e'), rng)


def bow(rig, a, rng, hand=0):
    p = a['hands'][hand] + Vector((-0.05, -0.05, 0))
    prev = None
    for k in range(9):
        t = (k / 8) * 2 - 1
        q = p + Vector((-0.12 * (1 - t * t), 0, t * 0.62))
        if prev:
            pole(rig, prev, q, 0.018, lin('#5a3a22'), rng)
        prev = q
    pole(rig, p + Vector((0, 0, 0.62)), p + Vector((0, 0, -0.62)), 0.005, lin('#d8d0bc'), rng)


def quiver(rig, a, rng):
    b = a['back']
    limb(rig.cloth, b + Vector((0.1, 0.05, -0.35)), b + Vector((-0.12, 0.08, 0.2)), 0.06, 0.07, C['leather'], rng)
    for k in range(3):
        pole(rig, b + Vector((-0.1 + k * 0.03, 0.08, 0.15)), b + Vector((-0.16 + k * 0.03, 0.09, 0.38)), 0.008, lin('#e8e0d0'), rng)


def hammer(rig, a, rng, hand=1):
    p = a['hands'][hand]
    pole(rig, p - Vector((0, 0, 0.1)), p - Vector((0, 0, 0.62)), 0.02, C['plank'], rng)
    shape(rig.metal, kit.box(0.2, 0.08, 0.08, bevel=0.01), Matrix.Translation(p - Vector((0, 0, 0.7))), C['iron'], rng)


def apron(rig, a, rng):
    c = a['chest']
    shape(rig.cloth, kit.box(0.34, 0.03, 0.75, bevel=0.01), Matrix.Translation(c + Vector((0, -0.03, -0.62))), C['leather'], rng)
    shape(rig.cloth, kit.box(0.16, 0.1, 0.18, bevel=0.02), Matrix.Translation(a['hands'][0] + Vector((0.12, 0, -0.05))), lin('#5d4430'), rng)


def axe(rig, a, rng, hand=0):
    p = a['hands'][hand]
    pole(rig, p - Vector((0, 0, 0.2)), p + Vector((0, 0, 0.5)), 0.02, C['plank'], rng)
    shape(rig.metal, kit.box(0.04, 0.2, 0.16, bevel=0.01), Matrix.Translation(p + Vector((0, -0.08, 0.35))), C['iron'], rng)


def club(rig, a, rng, hand=1):
    p = a['hands'][hand]
    limb(rig.cloth, p + Vector((0, 0, 0.05)), p + Vector((0.05, -0.1, -1.1)), 0.05, 0.13, C['bark'], rng)


def banner_pole(rig, a, rng, hand=1):
    p = a['hands'][hand]
    pole(rig, p - Vector((0, 0, 0.8)), p + Vector((0, 0, 2.2)), 0.025, C['plank'], rng)
    shape(rig.metal, kit.ellipsoid(0.05, 0.05, 0.08, 6, 4), Matrix.Translation(p + Vector((0, 0, 2.26))), C['gold'], rng)
    kit.banner(rig.cloth, p + Vector((0.4, 0, 2.05)), rng, w=0.75, h=1.25)



# ---------- the body, second version (2026-11-25): anatomy first, then clothes ----------
# Landmarks of the 1.8 m figure (z, metres): ankle 0.10, calf 0.30, knee 0.50, hip 0.88,
# waist 1.07, ribcage 1.20, chest 1.32, shoulder 1.43, neck 1.50-1.62, head centre 1.73.

def limb_profile(part, a, b, profile, rgba, rng, n=9):
    """A limb from a to b whose radius follows `profile` [(t, r)]: joints and muscles read."""
    d = b - a
    rings = [kit.ring(n, r, r, t * d.length) for t, r in profile]
    bm = kit.loft(rings)[0]
    rot = d.normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4()
    part.merge(bm, Matrix.Translation(a) @ rot, lambda f: vary(rgba, rng, 0.02))


def darker(rgba, k=0.72):
    return (rgba[0] * k, rgba[1] * k, rgba[2] * k, 1.0)


def bone(rig, name):
    """Every part written from now on belongs to this bone (or to the bone a function gives)."""
    rig.cloth.bone = rig.metal.bone = rig.glow.bone = name


def side(sx):
    return 'R' if sx < 0 else 'L'


def body(rig, m, rng, spec):
    """The figure, rebuilt for the engraving: torso shaped through hips, waist, ribs and chest,
    sloping shoulders, knees and calves, deltoids and elbows, mitten hands with a thumb, a skull
    and a jaw with no face; then the clothes: quilted gambeson, folded skirt, belt with buckle and
    pouches, cuffs, boots with tops. Anchors come back in world space, with the figure's matrix."""
    b, bel = spec.get('bulk', 1.0), spec.get('belly', 1.0)
    tunic, legs = spec['tunic'], spec.get('legs', lin('#4b3b2e'))
    skin, boots = spec.get('skin', CLAY), spec.get('boots', lin('#3a2a1e'))
    chest_c, sleeve = spec.get('chest', tunic), spec.get('sleeve', tunic)
    glove = spec.get('glove', sleeve)
    nk, hd = spec.get('neck', 1.0), spec.get('head', 1.0) * 1.12
    s = m.to_scale().x
    R3 = m.to_3x3()
    T = lambda x, y, z: m @ Vector((x, y, z))  # noqa: E731
    cl, mt = rig.cloth, rig.metal
    # legs: thigh to knee, knee to ankle; boots with a foot, a shaft and a turned-down top
    for sx in (-1, 1):
        relaxed = sx < 0
        hip = T(sx * 0.1 * b, 0, 0.9)
        knee = T(sx * 0.095 * b - (0.012 if relaxed else 0), -0.045 if relaxed else -0.012, 0.49 if relaxed else 0.5)
        ankle = T(sx * 0.1 * b - (0.03 if relaxed else 0), 0.02 if relaxed else 0.01, 0.1)
        foot_at = (sx * 0.1 * b - (0.03 if relaxed else 0), 0.02 if relaxed else 0.01)
        bone(rig, f'thigh.{side(sx)}')
        limb_profile(cl, knee, hip, [(0, 0.06 * b * s), (0.15, 0.066 * b * s), (0.65, 0.09 * b * s), (1, 0.1 * b * s)], legs, rng)
        bone(rig, f'thigh.{side(sx)}')
        shape(cl, kit.ellipsoid(0.095 * b * s, 0.09 * b * s, 0.08 * b * s, seg=10, rings=6), Matrix.Translation(hip), legs, rng, 0.02)
        bone(rig, f'shin.{side(sx)}')
        shape(cl, kit.ellipsoid(0.066 * b * s, 0.07 * b * s, 0.06 * b * s, seg=10, rings=6), Matrix.Translation(knee), legs, rng, 0.02)
        limb_profile(cl, ankle, knee, [(0, 0.05 * b * s), (0.45, 0.07 * b * s), (0.85, 0.061 * b * s), (1, 0.06 * b * s)], legs, rng)
        turn = Matrix.Rotation(sx * 0.2, 4, 'Z')
        bone(rig, f'foot.{side(sx)}')
        shape(cl, kit.box(0.115 * b, 0.27, 0.085, bevel=0.03), m @ Matrix.Translation((foot_at[0], foot_at[1], 0)) @ turn @ Matrix.Translation((0, -0.055, 0)), boots, rng)
        bone(rig, f'shin.{side(sx)}')
        shape(cl, kit.frustum(0.066 * b, 0.072 * b, 0.25, 10), m @ Matrix.Translation((foot_at[0], foot_at[1], 0.05)), boots, rng)
        shape(cl, kit.torus(0.077 * b, 0.02, n=12, m=4), m @ Matrix.Translation((foot_at[0], foot_at[1], 0.3)), darker(boots, 1.25), rng)
    # torso, one loft of twelve sides from the hips to the base of the neck
    prof = [(0.84, 0.165 * b, 0.115 * b, 0.0), (0.95, 0.18 * b, 0.125 * b * bel, 0.0), (1.07, 0.155 * b, 0.112 * b * bel, -0.005),
            (1.2, 0.18 * b, 0.125 * b, -0.008), (1.32, 0.205 * b, 0.135 * b, -0.01), (1.42, 0.212 * b, 0.115 * b, 0.0),
            (1.49, 0.13 * b, 0.095 * b, 0.01), (1.53, 0.066, 0.062, 0.01)]
    z_waist = (m @ Vector((0, 0, 1.02))).z
    bone(rig, lambda co: 'spine' if co.z > z_waist else 'hips')
    torso = kit.loft([kit.ring(12, rx, ry, z, dy=dy) for z, rx, ry, dy in prof])[0]
    shape(cl, torso, m, chest_c, rng, 0.015)
    if spec.get('quilt'):
        for z, rx, ry in ((1.12, 0.165, 0.117), (1.19, 0.177, 0.123), (1.26, 0.192, 0.13), (1.33, 0.206, 0.134)):
            shape(cl, kit.torus(rx * b + 0.004, 0.009, n=16, m=3, sy=(ry * bel if z < 1.15 else ry) / rx),
                  m @ Matrix.Translation((0, -0.008, z)), darker(chest_c, 0.8), rng)
    # skirt with folds at the hem
    bone(rig, 'hips')
    if spec.get('skirt', True):
        def folded(n, rx, ry, z, depth):
            pts = kit.ring(n, rx, ry, z)
            return [Vector((q.x * (1 + depth * (-1) ** i), q.y * (1 + depth * (-1) ** i), q.z)) for i, q in enumerate(pts)]
        skirt = kit.loft([folded(16, 0.168 * b, 0.122 * b * bel, 1.05, 0.0), folded(16, 0.2 * b, 0.15 * b * bel, 0.84, 0.03),
                          folded(16, 0.25 * b, 0.19 * b * bel, 0.6, 0.07)], cap_bottom=False, cap_top=False)[0]
        shape(cl, skirt, m, tunic, rng, 0.02)
    # belt, buckle, pouches
    shape(cl, kit.torus(0.172 * b, 0.024, n=14, m=4, sy=0.73 * bel), m @ Matrix.Translation((0, -0.004, 1.04)), lin('#3e2a1c'), rng)
    shape(mt, kit.box(0.07, 0.02, 0.055, bevel=0.006), m @ Matrix.Translation((0, -0.128 * b * bel - 0.012, 1.015)), steam.BRASS, rng)
    for sx, y in ((1, -0.06), (-1, 0.02)):
        shape(cl, kit.box(0.1, 0.055, 0.12, bevel=0.018), m @ Matrix.Translation((sx * 0.17 * b, y * b, 0.9)), lin('#5a3e28'), rng)
    # arms: deltoid, elbow, forearm, cuff, mitten hand and thumb
    hands = []
    for sx in (-1, 1):
        sh = T(sx * 0.215 * b, 0, 1.43)
        out = math.radians(13)
        elbow = sh + R3 @ Vector((sx * math.sin(out), 0.0, -math.cos(out))) * 0.29 * b
        wrist = elbow + R3 @ Vector((sx * math.sin(out * 0.4), -0.34, -math.cos(out * 0.4))).normalized() * 0.26 * b
        bone(rig, f'upper_arm.{side(sx)}')
        shape(cl, kit.ellipsoid(0.08 * b * s, 0.078 * b * s, 0.075 * b * s, seg=10, rings=6), Matrix.Translation(sh), sleeve, rng, 0.02)
        limb_profile(cl, sh, elbow, [(0, 0.074 * b * s), (0.2, 0.076 * b * s), (0.7, 0.057 * b * s), (1, 0.051 * b * s)], sleeve, rng)
        bone(rig, f'forearm.{side(sx)}')
        shape(cl, kit.ellipsoid(0.054 * b * s, 0.054 * b * s, 0.054 * b * s, seg=10, rings=6), Matrix.Translation(elbow), glove, rng, 0.02)
        limb_profile(cl, elbow, wrist, [(0, 0.051 * b * s), (0.3, 0.056 * b * s), (1, 0.041 * b * s)], glove, rng)
        d = (wrist - elbow).normalized()
        rot = d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        shape(cl, kit.torus(0.046 * b * s, 0.014 * s, n=10, m=4), Matrix.Translation(wrist) @ rot, darker(glove, 0.8), rng)
        bone(rig, f'hand.{side(sx)}')
        palm = kit.box(0.075 * b * s, 0.038 * b * s, 0.095 * b * s, bevel=0.012 * s)
        shape(cl, palm, Matrix.Translation(wrist + d * 0.005) @ rot, skin, rng)
        thumb = kit.box(0.025 * s, 0.025 * s, 0.05 * s, bevel=0.006 * s)
        shape(cl, thumb, Matrix.Translation(wrist + d * 0.02 + R3 @ Vector((-sx * 0.03, -0.03, 0))) @ rot, skin, rng)
        hands.append(wrist + d * 0.06 * s)
    # neck, skull and jaw: a head with no face
    bone(rig, 'neck')
    limb_profile(cl, T(0, 0.008, 1.49), T(0, 0.004, 1.63 * nk), [(0, 0.056 * b * s), (1, 0.047 * b * s)], skin, rng)
    bone(rig, 'head')
    shape(cl, kit.ellipsoid(0.093 * hd, 0.106 * hd, 0.113 * hd, seg=12, rings=8), m @ Matrix.Translation((0, 0.006, 1.735 * nk)), skin, rng, 0.01)
    shape(cl, kit.ellipsoid(0.072 * hd, 0.074 * hd, 0.056 * hd, seg=10, rings=6), m @ Matrix.Translation((0, -0.022, 1.66 * nk)), skin, rng, 0.01)
    if spec.get('coif'):
        coif = kit.loft([kit.ring(12, 0.2 * b, 0.135 * b, 1.44), kit.ring(12, 0.12, 0.125, 1.6 * nk), kit.ring(12, 0.112, 0.122, 1.75 * nk),
                         kit.ring(12, 0.07, 0.08, 1.84 * nk), [Vector((0, 0.005, 1.865 * nk))] * 12], cap_bottom=False, cap_top=False)[0]
        shape(mt, coif, m, C['mail'], rng, 0.03)
    bone(rig, None)
    return {'hands': hands, 'head': T(0, 0, 1.73 * nk), 'shoulders': [T(-0.215 * b, 0, 1.43), T(0.215 * b, 0, 1.43)],
            'chest': T(0, -0.135 * b, 1.25), 'back': T(0, 0.125 * b, 1.38), 'm': m, 'bulk': b, 'belly': bel}


BODY_RADII = [(0.6, 0.25, 0.19), (0.84, 0.2, 0.15), (1.05, 0.168, 0.122), (1.2, 0.18, 0.125), (1.32, 0.205, 0.135), (1.42, 0.212, 0.118), (1.47, 0.17, 0.1)]


def radii_at(z):
    pts = BODY_RADII
    if z <= pts[0][0]:
        z0, rx0, ry0 = pts[0]
        z1, rx1, ry1 = pts[1]
        t = (z - z0) / (z1 - z0)
        return rx0 + (rx1 - rx0) * t, ry0 + (ry1 - ry0) * t
    for (z0, rx0, ry0), (z1, rx1, ry1) in zip(pts, pts[1:]):
        if z0 <= z <= z1:
            t = (z - z0) / (z1 - z0)
            return rx0 + (rx1 - rx0) * t, ry0 + (ry1 - ry0) * t
    return pts[-1][1], pts[-1][2]


def wrap(rig, a, rng, rgba, centre_deg, half_deg, z_top, z_bot, off=0.014, rows=7, cols=7, part=None):
    """A cloth panel that follows the body: rings of the torso and skirt radii, a little outside."""
    m, b, bel = a['m'], a['bulk'], a.get('belly', 1.0)
    bm = kit.bmesh.new()
    grid = []
    for j in range(rows):
        z = z_top + (z_bot - z_top) * j / (rows - 1)
        rx, ry = radii_at(z)
        row = []
        for i in range(cols):
            ang = math.radians(centre_deg - half_deg + 2 * half_deg * i / (cols - 1))
            row.append(bm.verts.new((math.cos(ang) * (rx * b + off), math.sin(ang) * (ry * b * (bel if z < 1.15 else 1.0) + off), z)))
        grid.append(row)
    for j in range(rows - 1):
        for i in range(cols - 1):
            bm.faces.new([grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]])
    shape(part or rig.cloth, bm, m, rgba, rng, 0.015)


def tabard(rig, a, rng, rgba, trim=None):
    """Front and back panels wrapped on the body from the shoulders to mid-thigh, a trim at the hem."""
    for centre in (-90, 90):
        wrap(rig, a, rng, rgba, centre, 38, 1.46, 0.64)
        if trim:
            wrap(rig, a, rng, trim, centre, 39, 0.7, 0.64, off=0.02, rows=2)
    return
    """(old flat panels below, unused)"""
    m, b = a['m'], a['bulk']
    for y, k in ((-0.152, -1), (0.14, 1)):
        panel = kit.box(0.3 * b, 0.022, 0.72, bevel=0.006)
        for v in panel.verts:
            if v.co.z < 0.36:
                v.co.x *= 1.0 + (0.36 - v.co.z) * 0.45
        shape(rig.cloth, panel, m @ Matrix.Translation((0, y * b, 0.68)), rgba, rng, 0.02)
        if trim:
            band = kit.box(0.37 * b, 0.026, 0.035)
            shape(rig.cloth, band, m @ Matrix.Translation((0, (y + k * 0.004) * b, 0.7)), trim, rng)


def apron(rig, a, rng):
    wrap(rig, a, rng, steam.SOOT, -90, 42, 1.36, 0.42, off=0.02)
    shape(rig.cloth, kit.box(0.16, 0.1, 0.18, bevel=0.02), Matrix.Translation(a['hands'][0] + Vector((0.12, 0, -0.05))), lin('#5d4430'), rng)
    return
    m, b = a['m'], a['bulk']
    panel = kit.box(0.34 * b, 0.025, 0.85, bevel=0.008)
    for v in panel.verts:
        if v.co.z < 0.4:
            v.co.x *= 1.0 + (0.4 - v.co.z) * 0.3
    shape(rig.cloth, panel, m @ Matrix.Translation((0, -0.155 * b, 0.48)), steam.SOOT, rng, 0.03)
    shape(rig.cloth, kit.box(0.16, 0.1, 0.18, bevel=0.02), Matrix.Translation(a['hands'][0] + Vector((0.12, 0, -0.05))), lin('#5d4430'), rng)


def cape(rig, a, rng, rgba, length=1.2, width=0.55):
    """A cape hung from the shoulders, folds running down it, wider at the hem."""
    m, b = a['m'], a['bulk']
    bm = kit.bmesh.new()
    rows, cols = 5, 7
    grid = []
    for j in range(rows + 1):
        t = j / rows
        w = width * b * (0.75 + 0.45 * t)
        row = []
        for i in range(cols):
            u = i / (cols - 1) * 2 - 1
            fold = 0.035 * t * math.cos(u * math.pi * 2.5)
            row.append(bm.verts.new((u * w / 2, 0.13 * b + 0.07 * t + fold + 0.05 * u * u, 1.45 - length * t)))
        grid.append(row)
    for j in range(rows):
        for i in range(cols - 1):
            bm.faces.new([grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]])
    shape(rig.cloth, bm, m, rgba, rng, 0.02)


def robe(rig, a, rng, rgba, trim):
    m = a['m']
    bm = kit.loft([kit.ring(14, 0.37, 0.31, 0.0), kit.ring(14, 0.3, 0.24, 0.5), kit.ring(14, 0.2, 0.15, 1.06)], cap_bottom=False, cap_top=False)[0]
    shape(rig.cloth, bm, m, rgba, rng, 0.02)
    shape(rig.cloth, kit.torus(0.355, 0.045, n=14, m=4, sy=0.84), m @ Matrix.Translation((0, 0, 0.06)), trim, rng)
    shape(rig.cloth, kit.torus(0.205, 0.04, n=12, m=4, sy=0.75), m @ Matrix.Translation((0, 0, 1.38)), trim, rng)


def heroes(col):
    """Six roles big enough to judge: soldier, knight, general, stoker, scout, steam ogre."""
    rng = seed(93)
    rig = Rig('heroes')
    for i, role in enumerate(('soldier', 'knight', 'general', 'engineer', 'scout')):
        figure(rig, role, Vector(((i - 2.6) * 1.15, 0, 0)), rng)
    figure(rig, 'ogre', Vector((3.75, 0.6, 0)), rng, facing=-0.25)
    objs = rig.finish(col)
    floor = Part('MDL_floor')
    floor.face(kit.ring(48, 9.0, 5.0, 0), lin('#9c958a'))
    floor.finish(kit.material('M_floor', 0.9), col)
    return objs


# ---------- the roles ----------

def figure(rig, role, at, rng, facing=0.0, scale=1.0):
    m = Matrix.Translation(at) @ Matrix.Rotation(facing, 4, 'Z') @ Matrix.Scale(scale, 4)
    red, dark_red = C['crimson'], lin('#6e1a1d')
    if role == 'soldier':
        a = body(rig, m, rng, {'tunic': lin('#7a6a56'), 'chest': lin('#8a7a62'), 'quilt': True, 'coif': True})
        tabard(rig, a, rng, red, C['gold'])
        kettle_hat(rig, a, rng)
        spear(rig, a, rng)
    elif role == 'knight':
        a = body(rig, m, rng, {'tunic': dark_red, 'chest': lin('#9aa0a8'), 'sleeve': lin('#9aa0a8'), 'legs': lin('#7d838a'), 'bulk': 1.08})
        riveted_pauldrons(rig, a, rng, lin('#8d939b'))
        tabard(rig, a, rng, red, C['gold'])
        breastplate(rig, a, rng, lin('#8d939b'))
        great_helm(rig, a, rng, crest=red)
        shield(rig, a, rng, 'kite')
        sword(rig, a, rng)
    elif role == 'king':
        a = body(rig, m, rng, {'tunic': lin('#5b1d3a'), 'sleeve': lin('#5b1d3a')})
        robe(rig, a, rng, lin('#5b1d3a'), lin('#ece6da'))
        cape(rig, a, rng, red, length=1.35, width=0.7)
        crown(rig, a, rng)
        pole(rig, a['hands'][1] - Vector((0, 0, 0.1)), a['hands'][1] + Vector((0, 0, 0.6)), 0.018, C['gold'], rng, metal=True)
    elif role == 'ogre':
        # the steam ogre: built upright, then hunched; an iron collar and a boiler on its back
        tmp = Rig('tmp')
        sc = 1.75 * scale
        mo = Matrix.Translation(at) @ Matrix.Rotation(facing, 4, 'Z') @ Matrix.Scale(sc, 4)
        a = body(tmp, mo, rng, {'tunic': lin('#5d4a33'), 'chest': OGRE, 'sleeve': OGRE, 'legs': OGRE, 'skin': OGRE,
                                'boots': OGRE, 'bulk': 1.45, 'belly': 1.5, 'head': 0.82, 'neck': 0.97})
        club(tmp, a, rng)
        shape(tmp.metal, kit.torus(0.2, 0.045, n=12, m=4), mo @ Matrix.Translation((0, 0, 1.5)), steam.IRON, rng)
        for k in range(6):
            ang = math.tau * k / 6
            steam.rivet(tmp.metal, mo @ Vector((math.cos(ang) * 0.24, math.sin(ang) * 0.24, 1.5)), mo.to_3x3() @ Vector((math.cos(ang), math.sin(ang), 0)), r=0.03)
        shape(tmp.metal, kit.frustum(0.2, 0.18, 0.55, 12), mo @ Matrix.Translation((0, 0.42, 0.95)), steam.COPPER, rng)
        steam.chimney(tmp.metal, mo @ Vector((0.16, 0.46, 1.45)), rng, height=0.32 * sc, r0=0.04 * sc, r1=0.035 * sc)
        fwd = Matrix.Rotation(facing, 3, 'Z') @ Vector((0, -1, 0))

        def hunch(co):
            z = (co.z - at.z) / sc
            if z <= 1.0:
                return co
            out = co + fwd * ((z - 1.0) * 0.28 * sc)
            out.z -= max(0.0, z - 1.5) * 0.2 * sc
            return out
        absorb(rig.cloth, tmp.cloth, hunch)
        absorb(rig.metal, tmp.metal, hunch)
        tmp.glow.bm.free()
    elif role == 'scout':
        a = body(rig, m, rng, {'tunic': lin('#4f5a33'), 'legs': lin('#3e3a2a'), 'bulk': 0.94, 'quilt': True})
        hood(rig, a, rng, lin('#4a5530'))
        bow(rig, a, rng)
        quiver(rig, a, rng)
    elif role == 'shieldbearer':
        a = body(rig, m, rng, {'tunic': lin('#6f6150'), 'chest': lin('#7d6e58'), 'quilt': True, 'coif': True, 'bulk': 1.05})
        kettle_hat(rig, a, rng)
        shield(rig, a, rng, 'tower')
        spear(rig, a, rng, length=1.8)
    elif role == 'bannerman':
        a = body(rig, m, rng, {'tunic': red, 'chest': lin('#7d6e58'), 'quilt': True, 'coif': True})
        tabard(rig, a, rng, C['gold'], red)
        kettle_hat(rig, a, rng)
        banner_pole(rig, a, rng)
    elif role == 'engineer':
        # the stoker: Mordrac's engineer, sooty, goggles up, shovel in hand
        a = body(rig, m, rng, {'tunic': lin('#5a4a3a'), 'sleeve': lin('#a89a80'), 'glove': lin('#2f2a25')})
        apron(rig, a, rng)
        cap(rig, a, rng, lin('#3a3430'))
        goggles(rig, a, rng)
        shovel(rig, a, rng)
    elif role == 'general':
        a = body(rig, m, rng, {'tunic': lin('#1f1c22'), 'chest': lin('#2c2e33'), 'sleeve': lin('#2c2e33'), 'legs': lin('#2c2e33'), 'bulk': 1.12})
        riveted_pauldrons(rig, a, rng, lin('#34373d'))
        cape(rig, a, rng, red, length=1.4, width=0.75)
        tabard(rig, a, rng, dark_red, C['gold'])
        breastplate(rig, a, rng, lin('#34373d'))
        stovepipe_helm(rig, a, rng)
        sword(rig, a, rng, size=1.2)
    elif role == 'pillager':
        a = body(rig, m, rng, {'tunic': lin('#6a5a42'), 'legs': lin('#4a4034'), 'sleeve': lin('#7d6a4c'), 'bulk': 0.98})
        hood(rig, a, rng, lin('#5b4a36'))
        torch(rig, a, rng)
        axe(rig, a, rng)
    else:
        raise ValueError(role)


def crow(rig, at, rng, scale=1.0, flap=0.3):
    m = Matrix.Translation(at) @ Matrix.Scale(scale, 4)
    black = lin('#1e2024')
    shape(rig.cloth, kit.ellipsoid(0.09, 0.2, 0.085, 8, 5), m, black, rng)
    shape(rig.cloth, kit.ellipsoid(0.065, 0.07, 0.065, 8, 5), m @ Matrix.Translation((0, -0.2, 0.05)), black, rng)
    shape(rig.cloth, kit.frustum(0.025, 0.0, 0.09, 4), m @ Matrix.Translation((0, -0.26, 0.04)) @ Matrix.Rotation(math.pi / 2, 4, 'X'), lin('#3a3530'), rng)
    for sx in (-1, 1):
        bm = kit.bmesh.new()
        pts = [(0, -0.06, 0), (sx * 0.5, 0.0, flap * 0.5), (sx * 0.42, 0.14, flap * 0.4), (0, 0.1, 0)]
        vs = [bm.verts.new(p) for p in pts]
        bm.faces.new(vs if sx > 0 else list(reversed(vs)))
        shape(rig.cloth, bm, m, black, rng)
    bm = kit.bmesh.new()
    vs = [bm.verts.new(p) for p in ((-0.04, 0.15, 0), (0.04, 0.15, 0), (0.1, 0.36, -0.02), (-0.1, 0.36, -0.02))]
    bm.faces.new(vs)
    shape(rig.cloth, bm, m, black, rng)


def wyvern(rig, at, rng, scale=1.0, flap=0.5):
    m = Matrix.Translation(at) @ Matrix.Scale(scale, 4)
    hide, belly, membrane = lin('#3b5a48'), lin('#a39565'), lin('#7a2b2b')
    shape(rig.cloth, kit.ellipsoid(0.32, 0.75, 0.3, 10, 7), m, hide, rng)
    limb(rig.cloth, m @ Vector((0, -0.6, 0.1)), m @ Vector((0, -1.25, 0.55)), 0.18, 0.11, hide, rng)
    shape(rig.cloth, kit.ellipsoid(0.13, 0.32, 0.12, 8, 5), m @ Matrix.Translation((0, -1.45, 0.6)), hide, rng)
    for sx in (-1, 1):
        shape(rig.cloth, kit.frustum(0.035, 0.0, 0.2, 4), m @ Matrix.Translation((sx * 0.07, -1.32, 0.7)) @ Matrix.Rotation(-0.6, 4, 'X'), belly, rng)
    tail = [m @ Vector((0, 0.6 + k * 0.45, -0.05 - 0.05 * k * k)) for k in range(5)]
    for k in range(4):
        limb(rig.cloth, tail[k], tail[k + 1], 0.16 * (1 - k / 4.5), 0.16 * (1 - (k + 1) / 4.5), hide, rng)
    for sx in (-1, 1):
        root = m @ Vector((sx * 0.25, -0.25, 0.2))
        elbow = m @ Vector((sx * 1.3, -0.1, 0.2 + flap * 0.7))
        tip = m @ Vector((sx * 2.4, 0.4, 0.1 + flap))
        limb(rig.cloth, root, elbow, 0.07, 0.05, hide, rng)
        limb(rig.cloth, elbow, tip, 0.045, 0.02, hide, rng)
        rear = [m @ Vector((sx * x, y, 0.0)) for x, y in ((0.3, 0.55), (1.0, 0.75), (1.75, 0.95))]
        bm = kit.bmesh.new()
        ring_pts = [root, elbow, tip] + list(reversed(rear))
        vs = [bm.verts.new(p) for p in ring_pts]
        bm.faces.new([vs[0], vs[1], vs[5]])
        bm.faces.new([vs[1], vs[4], vs[5]])
        bm.faces.new([vs[1], vs[2], vs[3], vs[4]])
        shape(rig.cloth, bm, Matrix.Identity(4), membrane, rng)
        for leg in (0,):
            limb(rig.cloth, m @ Vector((sx * 0.2, 0.35, -0.15)), m @ Vector((sx * 0.25, 0.55, -0.6)), 0.08, 0.05, hide, rng)
        del leg


def lineup(col):
    rng = seed(91)
    rig = Rig('cast')
    spacing = 1.25
    order = ROLES
    for i, role in enumerate(order):
        x = (i - (len(order) - 1) / 2) * spacing
        if role == 'ogre':
            x += 0.0
        figure(rig, role, Vector((x, 0, 0)), rng)
    crow(rig, Vector((-5.2, 1.5, 3.9)), rng, scale=1.6)
    wyvern(rig, Vector((4.6, 4.0, 4.6)), rng, scale=0.8)
    objs = rig.finish(col)
    floor = Part('MDL_floor')
    disc = kit.ring(48, 9.0, 4.0, 0)
    floor.face(disc, lin('#9c958a'))
    floor.finish(kit.material('M_floor', 0.9), col)
    return objs


def garrison(col):
    """The defenders at their posts in the fort, the pillagers outside, flyers overhead."""
    import fort
    rng = seed(92)
    rig = Rig('garrison')
    s = 1.12  # heroic scale: read at range
    y_walk = fort.WALL_Y0 + 1.1
    for x in (-9.5, -7.4, 7.6):
        figure(rig, 'soldier', Vector((x, y_walk, fort.WALK_Z + 0.04)), rng, scale=s)
    figure(rig, 'bannerman', Vector((-fort.TOWER_X, fort.WALL_Y0 + 0.9, fort.TOWER_FLOOR + 0.05)), rng, scale=s)
    figure(rig, 'scout', Vector((fort.TOWER_X, fort.WALL_Y0 + 0.9, fort.TOWER_FLOOR + 0.05)), rng, scale=s)
    figure(rig, 'shieldbearer', Vector((-5.0, y_walk, fort.WALK_Z + 0.04)), rng, scale=s)
    figure(rig, 'knight', Vector((1.2, 7.0, 0)), rng, facing=0.2, scale=s)
    figure(rig, 'king', Vector((0.0, 11.2, 0)), rng, scale=s)
    figure(rig, 'general', Vector((-1.4, 10.4, 0)), rng, facing=-0.3, scale=s)
    figure(rig, 'engineer', Vector((-5.2, 10.6, 0)), rng, facing=0.7, scale=s)
    figure(rig, 'ogre', Vector((6.5, 13.0, 0)), rng, facing=-0.4, scale=s)
    for x, y in ((-16.0, -6.0), (-18.0, -3.5)):
        figure(rig, 'pillager', Vector((x, y, 0)), rng, facing=-2.5, scale=s)
    crow(rig, Vector((-4.0, 6.0, 11.0)), rng, scale=1.6, flap=0.6)
    crow(rig, Vector((-1.5, 4.0, 12.5)), rng, scale=1.6, flap=-0.1)
    wyvern(rig, Vector((9.0, 6.0, 15.0)), rng, scale=1.4, flap=0.8)
    return rig.finish(col)
