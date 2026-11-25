"""Catapulte Mania v7: the steam pieces, drawn from Fumivore's grammar.

Fumivore's Pressure axis gives the world its shape language: slender uprights carrying heavy
slabs (reversed contrast), and at full pressure every slab becomes an iron plate with a rivet at
each end. Chapter 1 sits at the start of the axis: a timber fort where Mordrac's first engine
smokes, the gate and the tower decks already plated.
"""
import math

from mathutils import Matrix, Vector

import kit
from kit import C, Part, lin, seed, vary

IRON = lin('#3f4246')
BRASS = lin('#b88d3e')
COPPER = lin('#a8582f')
SOOT = lin('#2a2826')
SMOKE = lin('#cfc8ba')


def rivet(part, at, normal, r=0.035, rng=None):
    """A domed rivet head standing out of a plate, facing `normal`."""
    bm = kit.ellipsoid(r, r, r * 0.6, seg=6, rings=4)
    rot = normal.normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4()
    part.merge(bm, Matrix.Translation(at) @ rot, lambda f: IRON)


def plate(part, centre, w, h, normal, rng, thickness=0.025, rivets=2, tone=IRON, rivet_r=None):
    """An iron plate lying on a surface (`normal` points out), a rivet near each end."""
    rot = normal.normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4()
    bm = kit.box(w, h, thickness, bevel=thickness * 0.4)
    part.merge(bm, Matrix.Translation(centre) @ rot, lambda f: vary(tone, rng, 0.05))
    axis = (rot.to_3x3() @ Vector((1, 0, 0))).normalized()
    out = normal.normalized() * (thickness + 0.005)
    for k in range(rivets):
        t = (k + 0.5) / rivets - 0.5
        rivet(part, centre + axis * (t * w * 0.8) + out, normal, r=rivet_r or min(0.04, h * 0.18), rng=rng)


def boiler(metal, at, rng, length=2.4, radius=0.62, rot=0.0):
    """A horizontal riveted boiler on brick saddles, a steam dome, a safety valve."""
    m = Matrix.Translation(at) @ Matrix.Rotation(rot, 4, 'Z')
    shell = kit.loft([kit.ring(14, radius, radius, 0), kit.ring(14, radius, radius, length)])[0]
    turn = Matrix.Rotation(math.pi / 2, 4, 'Y')
    metal.merge(shell, m @ Matrix.Translation((-length / 2, 0, radius + 0.45)) @ turn, lambda f: vary(COPPER, rng, 0.06))
    for k in range(5):
        x = -length / 2 + 0.15 + k * (length - 0.3) / 4
        band = kit.torus(radius + 0.012, 0.022, n=16, m=4)
        metal.merge(band, m @ Matrix.Translation((x, 0, radius + 0.45)) @ turn, lambda f: IRON)
        for j in range(10):
            a = math.tau * j / 10
            n = Vector((0, math.cos(a), math.sin(a)))
            rivet(metal, m @ Vector((x, n.y * (radius + 0.03), radius + 0.45 + n.z * (radius + 0.03))), m.to_3x3() @ n, r=0.026)
    dome = kit.frustum(0.2, 0.16, 0.32, 10)
    metal.merge(dome, m @ Matrix.Translation((0.35, 0, 2 * radius + 0.4)), lambda f: BRASS)
    valve = kit.frustum(0.05, 0.03, 0.28, 6)
    metal.merge(valve, m @ Matrix.Translation((-0.5, 0, 2 * radius + 0.42)), lambda f: BRASS)
    for x in (-length / 3, length / 3):
        saddle = kit.box(0.4, radius * 1.7, 0.55, bevel=0.03, rng=rng, jitter=0.01)
        metal.merge(saddle, m @ Matrix.Translation((x, 0, 0)), lambda f: vary(lin('#7c4a35'), rng, 0.08))


def chimney(metal, base, rng, height=7.5, r0=0.34, r1=0.26):
    """A riveted iron stack in rings, each joint a band of rivets, a flared cap."""
    rings = 6
    for k in range(rings):
        z0, z1 = height * k / rings, height * (k + 1) / rings
        ra = r0 + (r1 - r0) * k / rings
        rb = r0 + (r1 - r0) * (k + 1) / rings
        seg = kit.frustum(ra, rb, z1 - z0, 10)
        metal.merge(seg, Matrix.Translation(base + Vector((0, 0, z0))), lambda f: vary(SOOT if k > 3 else IRON, rng, 0.05))
        band = kit.torus(rb + 0.01, 0.02, n=12, m=4)
        metal.merge(band, Matrix.Translation(base + Vector((0, 0, z1))), lambda f: IRON)
    cap = kit.frustum(r1 + 0.02, r1 + 0.16, 0.25, 10)
    metal.merge(cap, Matrix.Translation(base + Vector((0, 0, height))), lambda f: SOOT)
    return base + Vector((0, 0, height + 0.25))


def smoke(part, top, rng, drift=Vector((1.4, 0.9, 0)), puffs=11, rise=9.0, size=1.0):
    """A column of smoke leaning with the wind: puffs that swell and thin as they rise."""
    for k in range(puffs):
        t = k / (puffs - 1)
        p = top + drift * (t * t * 4) + Vector((rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), rise * t))
        r = (0.35 + 1.5 * t) * size
        bm = kit.blob(r, r * 0.9, r * 0.8, rng, 0.06, subdiv=2)
        tone = lin('#8f897f') if k < 3 else SMOKE
        part.merge(bm, Matrix.Translation(p), lambda f, tone=tone: vary(tone, rng, 0.05))


def boiler_house(col, mats, at, rot=0.0):
    """Mordrac's first engine: an open timber shed over a boiler, its stack smoking."""
    rng = seed(101)
    wood = Part('MDL_boiler_shed')
    metal = Part('MDL_boiler')
    fumes = Part('MDL_smoke')
    m = Matrix.Translation(at) @ Matrix.Rotation(rot, 4, 'Z')
    w, d, h = 4.4, 3.2, 2.9
    for dx in (-1, 1):
        for dy in (-1, 1):
            kit.post(wood, m @ Vector((dx * w / 2, dy * d / 2, 0)), m @ Vector((dx * w / 2, dy * d / 2, h)), 0.11, rng)
    # reversed contrast: thin posts under a heavy slab roof plated at its ends
    slab = kit.box(w + 0.7, d + 0.7, 0.32, bevel=0.03, rng=rng, jitter=0.01)
    wood.merge(slab, m @ Matrix.Translation((0, 0, h)), lambda f: vary(C['plank'], rng, 0.06))
    for dx in (-1, 1):
        plate(metal, m @ Vector((dx * (w / 2 + 0.36), 0, h + 0.16)), d + 0.4, 0.26, m.to_3x3() @ Vector((dx, 0, 0)), rng, rivets=4)
    boiler(metal, at, rng, rot=rot)
    top = chimney(metal, m @ Vector((1.0, 0, h + 0.32)), rng)
    for k, p in enumerate(((-1.2, 1.9), (-1.7, 2.3), (-0.9, 2.5))):
        coal = kit.blob(0.55, 0.5, 0.3, rng, 0.25)
        wood.merge(coal, m @ Matrix.Translation((p[0], p[1], 0.1)), lambda f: vary(SOOT, rng, 0.1))
    smoke(fumes, top, rng)
    return wood.finish(mats['wood'], col), metal.finish(mats['metal'], col), fumes.finish(mats['smoke'], col)


def plate_the_gate(col, mats, fort):
    """Iron plates riveted across the gate leaves and at the ends of the tower decks."""
    rng = seed(102)
    metal = Part('MDL_plates')
    for z in (0.8, 2.0, 3.2):
        plate(metal, Vector((0, fort.WALL_Y0 - 0.09, z)), 2 * fort.GATE_HALF - 0.2, 0.16, Vector((0, -1, 0)), rng, rivets=8)
    for sx in (-1, 1):
        cx, cy = sx * fort.TOWER_X, fort.WALL_Y0 + 0.6
        # a heavy fascia round each deck, plated at its corners
        for side in (-1, 1):
            beam = kit.box(fort.TOWER_SIZE + 0.6, 0.18, 0.42, bevel=0.03, rng=rng, jitter=0.005)
            metal.merge(beam, Matrix.Translation((cx, cy + side * (fort.TOWER_SIZE / 2 + 0.28), fort.TOWER_FLOOR - 0.3)),
                           lambda f: vary(C['plank'], rng, 0.05))
            for ex in (-1, 1):
                plate(metal, Vector((cx + ex * (fort.TOWER_SIZE / 2 + 0.1), cy + side * (fort.TOWER_SIZE / 2 + 0.38), fort.TOWER_FLOOR - 0.09)),
                      0.5, 0.36, Vector((0, side, 0)), rng, rivets=2)
    return metal.finish(mats['metal'], col)
