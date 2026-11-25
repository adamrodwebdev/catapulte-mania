"""Catapulte Mania v7, visual bible: the chapter 1 fort, "The Palisade".

A wooden fort as the mockup's mode B lays it out: a ring of sharpened logs with a gate between
two towers, a fighting walkway behind the front wall, a log hall on a field-stone footing, two
huts, a well and the clutter of a camp. Sizes in metres; the gate faces -Y (the player).
"""
import math

from mathutils import Vector

import kit
import steam
import engine
from kit import C, Part, seed, vary

# Design parameters (metres)
WALL_X = 12.0          # half width of the ring
WALL_Y0, WALL_Y1 = 2.0, 22.0
GATE_HALF = 1.6
LOG_STEP = 0.5
LOG_R = 0.24
LOG_H = (4.3, 4.9)
TOWER_X = 3.1          # gate towers' centres at ±TOWER_X, y = WALL_Y0 + 0.6
TOWER_SIZE = 3.0
TOWER_FLOOR = 5.2
TOWER_TOP = 7.4
WALK_Z = 2.4
HALL = Vector((0.0, 15.0, 0.0))
HALL_W, HALL_D, HALL_WALL = 9.0, 6.0, 3.0
FOOTING = 0.7


def palisade(col, mats):
    rng = seed(7)
    part = Part('MDL_palisade')
    corners = [Vector((-WALL_X, WALL_Y0, 0)), Vector((WALL_X, WALL_Y0, 0)), Vector((WALL_X, WALL_Y1, 0)), Vector((-WALL_X, WALL_Y1, 0))]
    logs = []
    for c in range(4):
        a, b = corners[c], corners[(c + 1) % 4]
        n = int((b - a).length / LOG_STEP)
        side = []
        for k in range(n):
            p = a + (b - a) * (k / n)
            if c == 0 and abs(p.x) < GATE_HALF + 0.3:
                side.append(None)
                continue
            p = p + Vector((rng.uniform(-0.03, 0.03), rng.uniform(-0.03, 0.03), 0))
            kit.log(part, p, rng.uniform(*LOG_H), LOG_R * rng.uniform(0.88, 1.12), rng)
            side.append(p)
        logs.append(side)
    for side in logs:
        for k in range(0, len(side) - 1, 3):
            if side[k] is not None and side[k + 1] is not None:
                kit.lashing(part, side[k], side[k + 1], 3.3 + rng.uniform(-0.1, 0.1), LOG_R, rng)
    # rails on the inner face
    inward = [Vector((0, 0.38, 0)), Vector((-0.38, 0, 0)), Vector((0, -0.38, 0)), Vector((0.38, 0, 0))]
    for c in range(4):
        a, b = corners[c] + inward[c], corners[(c + 1) % 4] + inward[c]
        for z in (1.1, 3.0):
            if c == 0:
                kit.beam(part, a + Vector((0.4, 0, z)), Vector((-GATE_HALF - 0.6, a.y, z)), 0.16, rng)
                kit.beam(part, Vector((GATE_HALF + 0.6, a.y, z)), b + Vector((-0.4, 0, z)), 0.16, rng)
            else:
                kit.beam(part, a + Vector((0, 0, z)), b + Vector((0, 0, z)), 0.16, rng)
    return part.finish(mats['wood'], col)


def walkway(col, mats):
    rng = seed(11)
    part = Part('MDL_walkway')
    y0, y1 = WALL_Y0 + 0.5, WALL_Y0 + 1.7
    for sx in (-1, 1):
        xa, xb = sx * (GATE_HALF + TOWER_SIZE + 0.4), sx * (WALL_X - 0.6)
        lo, hi = min(xa, xb), max(xa, xb)
        x = lo
        while x < hi:
            for y in (y0 + 0.1, y1 - 0.1):
                kit.post(part, Vector((x, y, 0)), Vector((x, y, WALK_Z)), 0.1, rng)
            x += 2.0
        k = lo
        while k < hi:
            kit.plank(part, Vector((k + 0.13, (y0 + y1) / 2, WALK_Z)), 0.24, y1 - y0, 0.07, rng, 'plank_old', tilt=0.0)
            k += 0.27
        kit.beam(part, Vector((lo, y0 + 0.1, WALK_Z - 0.12)), Vector((hi, y0 + 0.1, WALK_Z - 0.12)), 0.14, rng)
        kit.beam(part, Vector((lo, y1 - 0.1, WALK_Z - 0.12)), Vector((hi, y1 - 0.1, WALK_Z - 0.12)), 0.14, rng)
        ladder(part, Vector((sx * (WALL_X - 2.0), y1 + 0.9, 0)), WALK_Z + 0.4, rng, lean=-0.35)
    return part.finish(mats['wood'], col)


def ladder(part, foot, height, rng, lean=0.3, width=0.5):
    top = foot + Vector((0, lean, height))
    for sx in (-1, 1):
        kit.post(part, foot + Vector((sx * width / 2, 0, 0)), top + Vector((sx * width / 2, 0, 0)), 0.045, rng, sides=5)
    rungs = int(height / 0.32)
    for k in range(1, rungs):
        t = k / rungs
        p = foot.lerp(top, t)
        kit.post(part, p + Vector((-width / 2, 0, 0)), p + Vector((width / 2, 0, 0)), 0.03, rng, sides=5)


def tower(col, mats, sx):
    rng = seed(20 + sx)
    part = Part(f'MDL_gate_tower_{"L" if sx < 0 else "R"}')
    cx, cy = sx * TOWER_X, WALL_Y0 + 0.6
    h = TOWER_SIZE / 2 - 0.15
    pts = [Vector((cx + dx * h, cy + dy * h, 0)) for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    for p in pts:
        kit.post(part, p - Vector((0, 0, 0.3)), p + Vector((0, 0, TOWER_TOP)), 0.17, rng, sides=7)
    # X braces on the front and the two sides
    for a, b in ((0, 1), (1, 2), (3, 0)):
        pa, pb = pts[a], pts[b]
        kit.beam(part, pa + Vector((0, 0, 0.6)), pb + Vector((0, 0, TOWER_FLOOR - 0.3)), 0.12, rng)
        kit.beam(part, pb + Vector((0, 0, 0.6)), pa + Vector((0, 0, TOWER_FLOOR - 0.3)), 0.12, rng)
    # floor, railing, roof
    for k in range(12):
        x = cx - TOWER_SIZE / 2 - 0.2 + (TOWER_SIZE + 0.4) * (k + 0.5) / 12
        kit.plank(part, Vector((x, cy, TOWER_FLOOR)), (TOWER_SIZE + 0.4) / 12 - 0.02, TOWER_SIZE + 0.4, 0.08, rng, 'plank_old')
    for a in range(4):
        pa, pb = pts[a], pts[(a + 1) % 4]
        for z in (TOWER_FLOOR + 0.55, TOWER_FLOOR + 1.05):
            kit.post(part, pa + Vector((0, 0, z)), pb + Vector((0, 0, z)), 0.05, rng, sides=5)
        for t in (0.33, 0.66):
            p = pa.lerp(pb, t)
            kit.post(part, p + Vector((0, 0, TOWER_FLOOR)), p + Vector((0, 0, TOWER_FLOOR + 1.1)), 0.05, rng, sides=5)
    # reversed contrast: a heavy ring of slabs on the slender posts, plated at the corners
    for side in (-1, 1):
        kit.plank(part, Vector((cx, cy + side * (h + 0.05), TOWER_TOP - 0.42)), TOWER_SIZE + 0.5, 0.26, 0.4, rng, 'plank')
        kit.plank(part, Vector((cx + side * (h + 0.05), cy, TOWER_TOP - 0.42)), 0.26, TOWER_SIZE + 0.5, 0.4, rng, 'plank')
    kit.thatch_pyramid(part, Vector((cx, cy, TOWER_TOP - 0.05)), TOWER_SIZE + 0.9, TOWER_SIZE + 0.9, 2.3, rng)
    ladder(part, Vector((cx, cy + h + 0.5, 0)), TOWER_FLOOR, rng, lean=-0.45)
    kit.banner(part, Vector((cx, cy - h - 0.25, TOWER_FLOOR + 0.9)), rng, w=0.8, h=1.7)
    return part.finish(mats['wood'], col)


def gate(col, mats):
    rng = seed(31)
    part = Part('MDL_gate')
    n = 10
    for k in range(n):
        x = -GATE_HALF + (2 * GATE_HALF) * (k + 0.5) / n
        kit.plank(part, Vector((x, WALL_Y0, 0)), 2 * GATE_HALF / n - 0.02, 0.12, 4.0 + (0.12 if k % 2 else 0), rng, 'plank')
    for z in (0.8, 3.0):
        bm = kit.box(2 * GATE_HALF - 0.1, 0.03, 0.12, bevel=0.01)
        part.merge(bm, kit.Matrix.Translation(Vector((0, WALL_Y0 - 0.08, z))), lambda f: vary(C['iron'], rng, 0.05))
    kit.beam(part, Vector((-GATE_HALF - 0.3, WALL_Y0 - 0.15, 4.25)), Vector((GATE_HALF + 0.3, WALL_Y0 - 0.15, 4.25)), 0.26, rng)
    return part.finish(mats['wood'], col)


def hall(col, mats):
    rng = seed(41)
    part = Part('MDL_hall')
    stones = Part('MDL_hall_footing')
    x0, x1 = HALL.x - HALL_W / 2, HALL.x + HALL_W / 2
    y0, y1 = HALL.y - HALL_D / 2, HALL.y + HALL_D / 2
    # field-stone footing, two courses
    for course in range(2):
        z = course * FOOTING / 2
        for (a, b, along_x) in (((x0, y0), (x1, y0), True), ((x0, y1), (x1, y1), True), ((x0, y0), (x0, y1), False), ((x1, y0), (x1, y1), False)):
            length = (b[0] - a[0]) if along_x else (b[1] - a[1])
            t = -0.35 * (course % 2)
            while t < length:
                w = rng.uniform(0.7, 1.15)
                w = min(w, length - t + 0.3)
                c = t + w / 2
                at = Vector((a[0] + c, a[1], z)) if along_x else Vector((a[0], a[1] + c, z))
                kit.stone(stones, at, w - 0.04 if along_x else 0.55, 0.55 if along_x else w - 0.04, FOOTING / 2 - 0.02, rng,
                          'stone' if rng.random() < 0.7 else 'stone_light')
                t += w
    # log walls: courses alternate between the long and the short walls, crossing at the corners
    r = 0.19
    course = 0
    while True:
        z = FOOTING + r + course * r * 0.95  # each course half a log higher, walls alternating
        if z > FOOTING + HALL_WALL:
            break
        if course % 2 == 0:
            for y in (y0, y1):
                kit.post(part, Vector((x0 - 0.35, y, z)), Vector((x1 + 0.35, y, z)), r, rng, sides=7)
        else:
            for x in (x0, x1):
                kit.post(part, Vector((x, y0 - 0.35, z)), Vector((x, y1 + 0.35, z)), r, rng, sides=7)
        course += 1
    top = FOOTING + HALL_WALL + 0.15
    # door, windows, gable ends, roof
    kit.plank(part, Vector((HALL.x, y0 - 0.2, FOOTING)), 1.4, 0.1, 2.1, rng, 'plank')
    # a heavy lintel over thin door posts: Fumivore's grammar on the hall
    for sx in (-1, 1):
        kit.beam(part, Vector((HALL.x + sx * 0.82, y0 - 0.32, FOOTING)), Vector((HALL.x + sx * 0.82, y0 - 0.32, FOOTING + 2.2)), 0.12, rng)
    kit.plank(part, Vector((HALL.x, y0 - 0.34, FOOTING + 2.2)), 2.6, 0.3, 0.42, rng, 'plank')
    for wx in (-2.8, 2.8):
        bm = kit.box(0.7, 0.08, 0.5, bevel=0.02)
        part.merge(bm, kit.Matrix.Translation(Vector((HALL.x + wx, y0 - 0.21, FOOTING + 1.5))), lambda f: (0.02, 0.015, 0.012, 1))
    gable_h = 3.0
    for x in (x0, x1):
        bm = kit.bmesh.new()
        vs = [bm.verts.new(p) for p in ((x, y0 - 0.2, top), (x, y1 + 0.2, top), (x, HALL.y, top + gable_h))]
        bm.faces.new(vs)
        part.merge(bm, kit.Matrix.Identity(4), lambda f: vary(C['plank_old'], rng, 0.05))
    kit.thatch_gable(part, Vector((HALL.x, HALL.y, top)), HALL_W + 0.6, HALL_D, gable_h + 0.25, rng, layers=3, teeth=13)
    return part.finish(mats['wood'], col), stones.finish(mats['stone'], col)


def hut(col, mats, at, name, rot=0.0):
    rng = seed(hash(name) % 1000)
    part = Part(name)
    m = kit.Matrix.Translation(at) @ kit.Matrix.Rotation(rot, 4, 'Z')
    walls = kit.box(4.0, 3.0, 2.2, bevel=0.05, rng=rng, jitter=0.02)
    tone = vary(C['plank_old'], rng, 0.1)
    part.merge(walls, m, lambda f: vary(tone, rng, 0.04))
    kit.thatch_gable(part, at + Vector((0, 0, 2.2)), 4.0, 3.0, 1.9, rng, layers=2, teeth=7, rot=rot)
    door = kit.box(0.9, 0.06, 1.7, bevel=0.02)
    part.merge(door, m @ kit.Matrix.Translation(Vector((0.6, -1.53, 0))), lambda f: vary(C['plank'], rng, 0.05))
    return part.finish(mats['wood'], col)


def props(col, mats):
    rng = seed(51)
    wood = Part('MDL_props')
    for p in ((-4.2, 11.4), (-3.6, 11.0), (-4.5, 10.7), (-3.9, 10.3), (5.5, 19.0), (6.1, 19.3)):
        kit.barrel(wood, Vector((*p, 0)), rng)
    kit.barrel(wood, Vector((-4.0, 10.9, 0.85)), rng)
    for p, s in (((-6.5, 9.5), 0.9), ((-7.3, 9.6), 0.7), ((-6.8, 9.6), 0.6)):
        bm = kit.box(s, s, s * 0.8, bevel=0.03, rng=rng, jitter=0.01)
        tone = vary(C['plank'], rng, 0.1)
        wood.merge(bm, kit.Matrix.Translation(Vector((*p, 0 if s > 0.65 else 0.72))) @ kit.Matrix.Rotation(rng.uniform(-0.3, 0.3), 4, 'Z'), lambda f, t=tone: vary(t, rng, 0.04))
    for p in ((-9.0, 14.5), (-9.6, 15.6), (-8.4, 15.4)):
        bm = kit.box(1.2, 0.8, 0.55, bevel=0.14, rng=rng, jitter=0.03)
        wood.merge(bm, kit.Matrix.Translation(Vector((*p, 0))) @ kit.Matrix.Rotation(rng.uniform(0, 3), 4, 'Z'), lambda f: vary(C['hay'], rng, 0.08))
    # well: a ring of stones, two posts, a small roof
    stones = Part('MDL_well')
    centre = Vector((6.0, 9.0, 0))
    for k in range(10):
        a = math.tau * k / 10
        kit.stone(stones, centre + Vector((math.cos(a) * 0.95, math.sin(a) * 0.95, 0)), 0.62, 0.36, 0.75, rng, rot=a + math.pi / 2)
    for sx in (-1, 1):
        kit.post(wood, centre + Vector((sx * 1.0, 0, 0)), centre + Vector((sx * 1.0, 0, 2.2)), 0.08, rng)
    kit.thatch_gable(wood, centre + Vector((0, 0, 2.1)), 2.4, 1.4, 0.8, rng, layers=1, teeth=5)
    return wood.finish(mats['wood'], col), stones.finish(mats['stone'], col)


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, 1.0)


def wall_wear(x, y):
    """Trampled earth along the foot of the palisade, inside and out."""
    dx = abs(abs(x) - WALL_X) if WALL_Y0 - 1.5 < y < WALL_Y1 + 1.5 else 99
    dy = min(abs(y - WALL_Y0), abs(y - WALL_Y1)) if abs(x) < WALL_X + 1.5 else 99
    return max(0.0, 1 - min(dx, dy) / 1.6) * 0.8


def mountains(col, mats):
    """Two rings of ridges on the horizon: green-blue hills, then blue peaks with snow.

    Each ring is one strip: a base row below the ground and a ridge row whose height is a sum of
    sines (several octaves), so the skyline reads as ranges, not as separate pyramids.
    """
    rng = seed(81)
    part = Part('MDL_mountains')
    for radius, base_h, amp, steps, tones in (
        (340.0, 4.0, 20.0, 180, ('#7d9488', '#9fb1b6')),
        (520.0, 12.0, 52.0, 220, ('#9aabbd', '#b9c6d3')),
    ):
        phases = [rng.uniform(0, math.tau) for _ in range(4)]
        ridge, mid, foot = [], [], []
        for k in range(steps):
            a = math.tau * k / steps
            n = (math.sin(a * 5 + phases[0]) * 0.5 + math.sin(a * 11 + phases[1]) * 0.3
                 + math.sin(a * 23 + phases[2]) * 0.15 + math.sin(a * 47 + phases[3]) * 0.08)
            h = base_h + amp * max(0.0, 0.55 + n)
            r = radius + rng.uniform(-6, 6)
            ridge.append(Vector((math.cos(a) * r, 10 + math.sin(a) * r, h)))
            mid.append(Vector((math.cos(a) * (r - 70), 10 + math.sin(a) * (r - 70), h * 0.42)))
            foot.append(Vector((math.cos(a) * (r - 170), 10 + math.sin(a) * (r - 170), -6)))
        for k in range(steps):
            j = (k + 1) % steps
            top = max(ridge[k].z, ridge[j].z)
            snow = top > base_h + amp * 0.95
            low, shoulder = kit.lin(tones[0]), kit.lin(tones[1])
            high = kit.lin('#eef1f3') if snow and radius > 400 else shoulder
            part.face_colors([foot[k], foot[j], mid[j], mid[k]], [low, low, low, low])
            part.face_colors([mid[k], mid[j], ridge[j], ridge[k]], [low, low, high, high])
    return part.finish(mats['far'], col)


def ground(col, mats):
    """A 200 m field: flat round the fort, rolling hills beyond, a dirt road to the gate."""
    rng = seed(61)
    part = Part('MDL_ground')
    size, n = 200.0, 100
    step = size / n

    def height(x, y):
        d = max(0.0, math.hypot(x / 1.3, (y - 10) / 1.0) - 30)
        return (math.sin(x * 0.05) * math.cos(y * 0.043) * 2.5 + math.sin(x * 0.11 + y * 0.07) * 1.2) * min(1, d / 25) + d * 0.04

    def road(x, y):
        if y > WALL_Y0 + 1:
            return 1.0 if (abs(x) < 9 and WALL_Y0 < y < WALL_Y1) else 0.0
        centre = math.sin(y * 0.08) * 1.6 * min(1, -y / 20)
        return max(0.0, 1 - abs(x - centre) / 2.2)

    def noise(x, y):
        return (math.sin(x * 0.21 + math.cos(y * 0.13) * 2) + math.sin(y * 0.17 - x * 0.05) + math.sin((x + y) * 0.6) * 0.35) / 2.35

    def colour(p):
        n = noise(p.x, p.y)
        g = mix(C['grass'], C['grass_light'], 0.5 + 0.5 * n)
        g = mix(g, C['grass_dry'], max(0.0, n - 0.4) * 0.8)
        worn = max(road(p.x, p.y), wall_wear(p.x, p.y))
        return mix(g, C['dirt'] if n > -0.2 else C['dirt_dark'], min(1.0, worn * 1.4))

    grid = [[Vector((-size / 2 + i * step, -size / 2 + 10 + j * step, 0)) for i in range(n + 1)] for j in range(n + 1)]
    for row in grid:
        for p in row:
            p.z = height(p.x, p.y)
    tones = [[colour(p) for p in row] for row in grid]
    for j in range(n):
        for i in range(n):
            quad = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]]
            cols = [tones[j][i], tones[j][i + 1], tones[j + 1][i + 1], tones[j + 1][i]]
            part.face_colors(quad, cols)
    # grass tufts: three blades each
    for _ in range(800):
        x, y = rng.uniform(-60, 60), rng.uniform(-45, 70)
        if road(x, y) > 0.2 or (abs(x) < WALL_X + 0.6 and WALL_Y0 - 0.6 < y < WALL_Y1 + 0.6):
            continue
        base = Vector((x, y, height(x, y)))
        tone = vary(C['grass_light'], rng, 0.18)
        for b in range(3):
            a = rng.uniform(0, math.tau)
            d = Vector((math.cos(a), math.sin(a), 0))
            tip = base + d * 0.12 + Vector((0, 0, rng.uniform(0.25, 0.45)))
            part.face([base - d.cross(Vector((0, 0, 1))) * 0.05, base + d.cross(Vector((0, 0, 1))) * 0.05, tip], tone)
    return part.finish(mats['ground'], col), height, road


def nature(col, mats, height, road):
    rng = seed(71)
    trees = Part('MDL_trees')
    rocks = Part('MDL_rocks')
    placed = 0
    while placed < 150:
        x, y = rng.uniform(-95, 95), rng.uniform(-60, 100)
        if math.hypot(x / 1.3, y - 12) < 30 or road(x, y) > 0 or (abs(x) < 14 and y < 0):
            continue
        at = Vector((x, y, height(x, y) - 0.1))
        (kit.pine if rng.random() < 0.65 else kit.oak)(trees, at, rng, rng.uniform(6, 10))
        placed += 1
    for _ in range(40):
        x, y = rng.uniform(-50, 50), rng.uniform(-40, 60)
        if (abs(x) < WALL_X + 1 and WALL_Y0 - 1 < y < WALL_Y1 + 1) or road(x, y) > 0:
            continue
        kit.rock(rocks, Vector((x, y, height(x, y))), rng.uniform(0.3, 1.2), rng)
    return trees.finish(mats['foliage'], col), rocks.finish(mats['stone'], col)


def hall_plates(col, mats):
    """Iron plates on the hall: the lintel's ends and the four corners of the log crossings."""
    rng = seed(43)
    metal = Part('MDL_hall_plates')
    y0 = HALL.y - HALL_D / 2
    for sx in (-1, 1):
        steam.plate(metal, Vector((HALL.x + sx * 1.1, y0 - 0.5, FOOTING + 2.41)), 0.36, 0.34, Vector((0, -1, 0)), rng, rivets=2)
    for cx in (HALL.x - HALL_W / 2, HALL.x + HALL_W / 2):
        for cy in (HALL.y - HALL_D / 2, HALL.y + HALL_D / 2):
            out = Vector((0, -1 if cy < HALL.y else 1, 0))
            for z in (FOOTING + 0.8, FOOTING + 2.2):
                steam.plate(metal, Vector((cx, cy + out.y * 0.22, z)), 0.5, 0.3, out, rng, rivets=2)
    return metal.finish(mats['metal'], col)


def clouds(col, mats):
    """Cloud banks drawn in the sky: flattened puffs, their undersides hatched by the engraving."""
    rng = seed(111)
    part = Part('MDL_clouds')
    for k in range(9):
        a = rng.uniform(0.15, 0.85) * math.pi
        dist = rng.uniform(230, 330)
        centre = Vector((math.cos(a) * dist, 10 + math.sin(a) * dist, rng.uniform(70, 115)))
        for j in range(rng.randint(6, 9)):
            off = Vector((rng.uniform(-22, 22), rng.uniform(-6, 6), rng.uniform(-2, 5) - abs(j - 4) * 0.8))
            r = rng.uniform(8, 16)
            bm = kit.blob(r, r * 0.7, r * 0.34, rng, 0.1, subdiv=2)
            part.merge(bm, kit.Matrix.Translation(centre + off), lambda f: vary(kit.lin('#f3eee3'), rng, 0.02))
    return part.finish(mats['cloud'], col)


def build(col):
    mats = {
        'wood': kit.material('M_wood', 0.88),
        'stone': kit.material('M_stone', 0.9),
        'ground': kit.material('M_ground', 0.95),
        'foliage': kit.material('M_foliage', 0.8),
        'far': kit.material('M_far', 1.0, emission=0.35),
        'metal': kit.material('M_metal', 0.45, metallic=0.8),
        'smoke': kit.material('M_smoke', 1.0, emission=0.3),
        'cloud': kit.material('M_cloud', 1.0, emission=0.35),
    }
    palisade(col, mats)
    walkway(col, mats)
    for sx in (-1, 1):
        tower(col, mats, sx)
    gate(col, mats)
    hall(col, mats)
    hut(col, mats, Vector((-7.0, 18.5, 0)), 'MDL_hut_L', 0.1)
    steam.boiler_house(col, mats, Vector((7.4, 18.0, 0)), -0.15)
    steam.plate_the_gate(col, mats, __import__('fort'))
    hall_plates(col, mats)
    engine.build(col, mats, Vector((0.0, -40.0, 0.0)))
    clouds(col, mats)
    props(col, mats)
    _, height, road = ground(col, mats)
    mountains(col, mats)
    nature(col, mats, height, road)
    return mats
