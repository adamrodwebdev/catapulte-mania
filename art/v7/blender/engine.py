"""Catapulte Mania v7: the player's steam catapult.

Built in Fumivore's grammar: slender uprights carry a heavy slab bed whose ends are riveted
plates; the throwing arm is driven by a steam piston fed from a copper boiler, whose brass
pressure gauge is the shot's power. Prussian blue and brass are the player's colours.
Faces +Y (toward the castle); origin at the middle of the axles, on the ground.
"""
import math

from mathutils import Matrix, Vector

import kit
import steam
from kit import C, Part, lin, seed, vary

BLUE = lin('#2f4a6b')
BRASS = steam.BRASS
COPPER = steam.COPPER
IRON = steam.IRON
DIAL = lin('#ebe4d6')
INK = lin('#1e1f21')


def wheel(wood, metal, centre, rng, r=0.72, spokes=10, side=1):
    """A spoked wheel in the XZ plane (axle along X): hub, spokes, felloe, iron tyre with rivets."""
    turn = Matrix.Rotation(math.pi / 2, 4, 'Y')
    tyre = kit.torus(r, 0.07, n=20, m=4)
    metal.merge(tyre, Matrix.Translation(centre) @ turn, lambda f: IRON)
    felloe = kit.torus(r - 0.08, 0.06, n=20, m=4)
    wood.merge(felloe, Matrix.Translation(centre) @ turn, lambda f: vary(C['plank'], rng, 0.05))
    hub = kit.frustum(0.14, 0.12, 0.3, 8)
    metal.merge(hub, Matrix.Translation(centre - Vector((0.15, 0, 0))) @ turn, lambda f: BRASS)
    for k in range(spokes):
        a = math.tau * k / spokes
        d = Vector((0, math.cos(a), math.sin(a)))
        kit.beam(wood, centre + d * 0.12, centre + d * (r - 0.1), 0.06, rng)
    for k in range(8):
        a = math.tau * k / 8 + 0.2
        d = Vector((0, math.cos(a), math.sin(a)))
        steam.rivet(metal, centre + d * r + Vector((side * 0.08, 0, 0)), Vector((side, 0, 0)), r=0.03)


def gauge(metal, centre, normal, rng, r=0.2, reading=0.7):
    """The pressure gauge: brass bezel, paper dial, ink ticks and needle (reading 0..1)."""
    rot = normal.normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4()
    m = Matrix.Translation(centre) @ rot
    metal.merge(kit.frustum(r + 0.04, r + 0.03, 0.06, 16), m, lambda f: BRASS)
    metal.merge(kit.frustum(r, r, 0.065, 16), m, lambda f: DIAL)
    for k in range(9):
        a = math.radians(225 - 270 * k / 8)
        tick = kit.box(0.012, 0.05 if k % 2 == 0 else 0.03, 0.01)
        p = Vector((math.cos(a) * r * 0.8, math.sin(a) * r * 0.8, 0.07))
        metal.merge(tick, m @ Matrix.Translation(p) @ Matrix.Rotation(a - math.pi / 2, 4, 'Z'), lambda f: INK if k < 7 else lin('#a8432c'))
    a = math.radians(225 - 270 * reading)
    needle = kit.box(0.014, r * 0.85, 0.01)
    metal.merge(needle, m @ Matrix.Translation((0, 0, 0.075)) @ Matrix.Rotation(a - math.pi / 2, 4, 'Z') @ Matrix.Translation((0, r * 0.35, 0)), lambda f: INK)


def build(col, mats, at=Vector((0, 0, 0)), arm_angle=0.45):
    rng = seed(201)
    wood = Part('MDL_engine_wood')
    metal = Part('MDL_engine_metal')
    fumes = Part('MDL_engine_smoke')
    m = Matrix.Translation(at)
    T = lambda x, y, z: m @ Vector((x, y, z))  # noqa: E731
    # wheels and axles
    for y in (-1.5, 1.5):
        for sx in (-1, 1):
            wheel(wood, metal, T(sx * 1.25, y, 0.72), rng, side=sx)
        kit.beam(metal, T(-1.32, y, 0.72), T(1.32, y, 0.72), 0.08, rng, 'iron')
    # the slab bed: heavy, its four ends plated
    bed = kit.box(2.2, 4.6, 0.36, bevel=0.04, rng=rng, jitter=0.006)
    wood.merge(bed, m @ Matrix.Translation((0, 0, 1.0)), lambda f: vary(BLUE, rng, 0.05) if abs(f.normal.z) < 0.5 else vary(C['plank'], rng, 0.05))
    for y in (-2.3, 2.3):
        steam.plate(metal, T(0, y + (0.015 if y > 0 else -0.015), 1.18), 2.0, 0.3, Vector((0, 1 if y > 0 else -1, 0)), rng, rivets=6, tone=IRON)
    for sx in (-1, 1):
        for y in (-1.9, 1.9):
            steam.plate(metal, T(sx * 1.11, y, 1.18), 0.5, 0.3, Vector((sx, 0, 0)), rng, rivets=2, tone=IRON)
    # slender uprights under a heavy cross slab (reversed contrast), the arm's axle between them
    for sx in (-1, 1):
        kit.beam(wood, T(sx * 0.7, 0.6, 1.36), T(sx * 0.7, 0.6, 3.6), 0.11, rng)
        kit.beam(wood, T(sx * 0.7, -0.4, 1.36), T(sx * 0.7, 0.55, 3.5), 0.08, rng)
    cross = kit.box(1.9, 0.5, 0.34, bevel=0.03, rng=rng, jitter=0.004)
    wood.merge(cross, m @ Matrix.Translation((0, 0.6, 3.6)), lambda f: vary(BLUE, rng, 0.05))
    for sx in (-1, 1):
        steam.plate(metal, T(sx * 0.96, 0.6, 3.77), 0.36, 0.28, Vector((sx, 0, 0)), rng, rivets=2)
    pivot = T(0, 0.6, 3.25)
    kit.beam(metal, pivot - Vector((0.75, 0, 0)), pivot + Vector((0.75, 0, 0)), 0.09, rng, 'iron')
    # the arm: long and thin toward the bucket (back, -Y), short and plated toward the piston
    d = Vector((0, -math.cos(arm_angle), -math.sin(arm_angle)))
    tip = pivot + d * 4.0
    short = pivot - d * 0.9
    kit.beam(wood, short, tip, 0.15, rng)
    bucket = kit.box(0.6, 0.55, 0.28, bevel=0.04)
    metal.merge(bucket, Matrix.Translation(tip - Vector((0, 0, 0.12))), lambda f: IRON)
    load = kit.blob(0.26, 0.26, 0.24, rng, 0.12)
    wood.merge(load, Matrix.Translation(tip + Vector((0, 0, 0.18))), lambda f: vary(C['stone'], rng, 0.05))
    for t in (0.25, 0.55):
        band = kit.torus(0.12, 0.025, n=10, m=4)
        metal.merge(band, Matrix.Translation(pivot.lerp(tip, t)) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4(), lambda f: IRON)
    # steam: a copper boiler on the bed, a piston from the bed to the short end of the arm
    steam.boiler(metal, T(0, 1.4, 1.18), rng, length=1.6, radius=0.42, rot=math.pi / 2)
    cyl_base = T(0, 1.35, 1.2)
    metal.merge(kit.frustum(0.17, 0.17, 1.1, 10), Matrix.Translation(cyl_base + Vector((0, 0.05, 1.0))), lambda f: COPPER)
    kit.beam(metal, cyl_base + Vector((0, 0.05, 2.05)), short, 0.05, rng, 'iron')
    stack = steam.chimney(metal, T(0.55, 1.95, 1.18), rng, height=2.0, r0=0.13, r1=0.11)
    steam.smoke(fumes, stack, rng, drift=Vector((-0.9, 0.7, 0)), puffs=6, rise=2.6, size=0.35)
    gauge(metal, T(-0.62, 0.95, 1.95), Vector((0, -1, 0.25)), rng, reading=0.72)
    kit.post(metal, T(-0.62, 1.15, 1.2), T(-0.62, 1.05, 1.9), 0.025, rng)
    # the player's pennant
    kit.post(wood, T(0.9, -1.9, 1.18), T(0.9, -1.9, 4.4), 0.035, rng)
    flag = kit.bmesh.new()
    pts = [(0, 0, 0), (0, -0.9, -0.15), (0, -0.7, -0.3), (0, -0.95, -0.45), (0, 0, -0.6)]
    vs = [flag.verts.new(p) for p in pts]
    flag.faces.new(vs)
    wood.merge(flag, Matrix.Translation(T(0.9, -1.9, 4.35)), lambda f: BLUE)
    return wood.finish(mats['wood'], col), metal.finish(mats['metal'], col), fumes.finish(mats['smoke'], col)
