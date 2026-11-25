"""Catapulte Mania v7, visual bible: the low-poly kit.

Detailed low-poly pieces built with bmesh, coloured per face (a float colour attribute `Col`,
exported to glTF as COLOR_0): one material per surface kind, no texture, cheap on phones.

Every piece is a function that appends geometry to a `Part` (one mesh object) with a placement
matrix. Sizes are in metres, Z up. Shapes are never perfect: each piece takes a seeded jitter so
a wall of logs reads as cut by hand.
"""
import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

TAU = math.tau

# The look the materials are built for: 'lowpoly' (Principled, the first pass), 'engrave' (the
# living engraving: tints, stepped tones, hatched shadows, ink lines) or 'poster' (tints and
# stepped tones only). stage.py sets it before building.
LOOK = 'lowpoly'
INK = '#1e1f21'
PAPER = '#efe8d8'


# ---------- colour ----------

def lin(hex_code):
    """sRGB hex to linear RGBA (the attribute stores linear values)."""
    h = hex_code.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


def vary(rgba, rng, amount=0.08):
    """The same colour, a little lighter or darker (one tone per face or per piece)."""
    k = 1 + rng.uniform(-amount, amount)
    return (min(1, rgba[0] * k), min(1, rgba[1] * k), min(1, rgba[2] * k), 1.0)


# The chapter 1 palette (sRGB hex). Albedo stays inside measured bounds (0.03 to 0.85).
PAL = {
    'bark': '#5e4029', 'bark_dark': '#4a3220', 'cut': '#c99d68', 'plank': '#7a5638',
    'plank_old': '#7f6a55', 'rope': '#b39058', 'thatch': '#b08b4b', 'thatch_dark': '#86662f',
    'thatch_under': '#4d3a22', 'mountain': '#7d8c99', 'snow': '#e8ecef',
    'stone': '#8d887e', 'stone_light': '#a49e92', 'mortar': '#6c675f', 'iron': '#45484d',
    'grass': '#5a7a35', 'grass_light': '#788f43', 'grass_dry': '#8f8f4c', 'dirt': '#86684a', 'dirt_dark': '#6b533a',
    'crimson': '#a1262a', 'gold': '#d6a23f', 'royal': '#2e5dab', 'cloth': '#d9cdb0',
    'pine': '#2f5a2e', 'pine_light': '#3f6e35', 'leaf': '#4f7d32', 'rock': '#7f8584',
    'hay': '#d8b45a', 'clay': '#b98f6a', 'leather': '#6d4528', 'mail': '#7c8086',
}
C = {k: lin(v) for k, v in PAL.items()}


# ---------- parts ----------

class Part:
    """One mesh object being built: geometry appended in world space, a colour per face."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.float_color.new('Col')
        # skinning: `bone` is a name, or a function of the vertex position that gives one
        self.bone = None
        self.groups = {}
        self.deform = self.bm.verts.layers.deform.verify()

    def _tag(self, v):
        if self.bone is None:
            return
        name = self.bone(v.co) if callable(self.bone) else self.bone
        idx = self.groups.setdefault(name, len(self.groups))
        v[self.deform][idx] = 1.0

    def face(self, pts, rgba):
        verts = [self.bm.verts.new(p) for p in pts]
        for v in verts:
            self._tag(v)
        f = self.bm.faces.new(verts)
        for loop in f.loops:
            loop[self.col] = rgba
        return f

    def face_colors(self, pts, colors):
        verts = [self.bm.verts.new(p) for p in pts]
        f = self.bm.faces.new(verts)
        for loop, rgba in zip(f.loops, colors):
            loop[self.col] = rgba
        return f

    def merge(self, src, matrix, color_of):
        """Copy a temporary bmesh in, placed by `matrix`; `color_of(face)` gives each face's colour."""
        vmap = {v: self.bm.verts.new(matrix @ v.co) for v in src.verts}
        for v in vmap.values():
            self._tag(v)
        for f in src.faces:
            nf = self.bm.faces.new([vmap[v] for v in f.verts])
            rgba = color_of(f)
            for loop in nf.loops:
                loop[self.col] = rgba
        src.free()

    def finish(self, material, collection, smooth=False):
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-4)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        if LOOK == 'lowpoly':
            for p in mesh.polygons:
                p.use_smooth = smooth
        else:
            # engraving: round things shade smoothly (the hatching follows them), boxes stay sharp
            for p in mesh.polygons:
                p.use_smooth = True
            mesh.set_sharp_from_angle(angle=math.radians(48))
        mesh.color_attributes.active_color_name = 'Col'
        mesh.materials.append(material)
        obj = bpy.data.objects.new(self.name, mesh)
        for name, _ in sorted(self.groups.items(), key=lambda kv: kv[1]):
            obj.vertex_groups.new(name=name)
        collection.objects.link(obj)
        return obj


def _sock(node, identifier):
    return next(s for s in node.inputs if s.identifier == identifier)


def ink_material(name, emission=0.0, hatch=True):
    """The living engraving, one shader for every surface.

    Light is read as a value (Diffuse -> Shader to RGB, EEVEE), stepped into four tones that
    darken the face's tint (muted toward the paper, as a hand-coloured print), then the shadow
    is drawn: diagonal hatching under 0.42, cross-hatching under 0.2, lines in screen space,
    thicker as it gets darker. A faint paper grain over all; emission only, so the drawing is
    what the camera sees.
    """
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    N, L = nt.nodes, nt.links
    N.clear()
    out = N.new('ShaderNodeOutputMaterial')
    col = N.new('ShaderNodeVertexColor')
    col.layer_name = 'Col'

    def math_node(op, a, b=None, c=None, clamp=False):
        n = N.new('ShaderNodeMath')
        n.operation = op
        n.use_clamp = clamp
        for i, v in enumerate((a, b, c)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                L.new(v, n.inputs[i])
        return n.outputs[0]

    def mix_rgb(fac, a, b, blend='MIX'):
        n = N.new('ShaderNodeMix')
        n.data_type = 'RGBA'
        n.blend_type = blend
        for ident, v in (('Factor_Float', fac), ('A_Color', a), ('B_Color', b)):
            s = _sock(n, ident)
            if isinstance(v, (int, float)):
                s.default_value = v
            elif isinstance(v, tuple):
                s.default_value = v
            else:
                L.new(v, s)
        return next(o for o in n.outputs if o.identifier == 'Result_Color')

    # the face tint, muted toward the paper
    bw = N.new('ShaderNodeRGBToBW')
    L.new(col.outputs['Color'], bw.inputs[0])
    grey = N.new('ShaderNodeCombineColor')
    for i in range(3):
        L.new(bw.outputs[0], grey.inputs[i])
    paper = lin(PAPER)
    muted = mix_rgb(0.22, col.outputs['Color'], grey.outputs[0])
    tint = mix_rgb(0.12, muted, paper, 'MULTIPLY')
    # light as a value
    diff = N.new('ShaderNodeBsdfDiffuse')
    s2r = N.new('ShaderNodeShaderToRGB')
    L.new(diff.outputs[0], s2r.inputs[0])
    lum = N.new('ShaderNodeRGBToBW')
    L.new(s2r.outputs['Color'], lum.inputs[0])
    light = math_node('MULTIPLY', lum.outputs[0], 0.52, clamp=True)
    ramp = N.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'CONSTANT'
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = 0.0, (0.66, 0.66, 0.66, 1)
    els[1].position, els[1].color = 0.22, (0.84, 0.84, 0.84, 1)
    e = els.new(0.42)
    e.color = (1.0, 1.0, 1.0, 1)
    e = els.new(0.7)
    e.color = (1.14, 1.14, 1.14, 1)
    L.new(light, ramp.inputs[0])
    toned = mix_rgb(1.0, tint, ramp.outputs['Color'], 'MULTIPLY')
    result = toned
    if hatch:
        tc = N.new('ShaderNodeTexCoord')
        sep = N.new('ShaderNodeSeparateXYZ')
        L.new(tc.outputs['Window'], sep.inputs[0])
        x = math_node('MULTIPLY', sep.outputs['X'], 16 / 9)
        u = math_node('MULTIPLY', math_node('ADD', x, sep.outputs['Y']), 150.0)
        v = math_node('MULTIPLY', math_node('SUBTRACT', x, sep.outputs['Y']), 150.0)
        w1 = math_node('MULTIPLY', math_node('SUBTRACT', 0.3, light), 1.7, clamp=True)
        w2 = math_node('MULTIPLY', math_node('SUBTRACT', 0.12, light), 3.0, clamp=True)
        h1 = math_node('LESS_THAN', math_node('FRACT', u), math_node('MINIMUM', w1, 0.6))
        h2 = math_node('LESS_THAN', math_node('FRACT', v), math_node('MINIMUM', w2, 0.55))
        h = math_node('MULTIPLY', math_node('MAXIMUM', h1, h2), 0.8)
        result = mix_rgb(h, toned, lin(INK))
    noise = N.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 900.0
    tc2 = N.new('ShaderNodeTexCoord')
    L.new(tc2.outputs['Window'], noise.inputs['Vector'])
    grain = math_node('MULTIPLY_ADD', noise.outputs[0], 0.12, 0.94)
    grained = mix_rgb(1.0, result, (1, 1, 1, 1), 'MULTIPLY')
    gmul = N.new('ShaderNodeMix')
    gmul.data_type = 'RGBA'
    gmul.blend_type = 'MULTIPLY'
    _sock(gmul, 'Factor_Float').default_value = 1.0
    L.new(result, _sock(gmul, 'A_Color'))
    gcol = N.new('ShaderNodeCombineColor')
    for i in range(3):
        L.new(grain, gcol.inputs[i])
    L.new(gcol.outputs[0], _sock(gmul, 'B_Color'))
    del grained
    em = N.new('ShaderNodeEmission')
    L.new(next(o for o in gmul.outputs if o.identifier == 'Result_Color'), em.inputs['Color'])
    em.inputs['Strength'].default_value = 1.0 + emission
    L.new(em.outputs[0], out.inputs['Surface'])
    return mat


def material(name, roughness=0.85, metallic=0.0, emission=0.0):
    """One material reading the `Col` attribute (glTF COLOR_0), built for the current look."""
    if LOOK in ('engrave', 'poster'):
        return ink_material(name, emission=emission, hatch=LOOK == 'engrave')
    mat = bpy.data.materials.new(name)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes['Principled BSDF']
    attr = nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if emission:
        links.new(attr.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = emission
    return mat


# ---------- primitives (temporary bmesh, local space) ----------

def loft(rings, cap_bottom=True, cap_top=True):
    """Faces between rings of equal size (lists of Vectors); returns the bmesh and its side faces by ring."""
    bm = bmesh.new()
    vr = [[bm.verts.new(p) for p in ring] for ring in rings]
    bands = []
    n = len(rings[0])
    for a, b in zip(vr, vr[1:]):
        band = []
        for i in range(n):
            j = (i + 1) % n
            if a[i].co == b[i].co and a[j].co == b[j].co:
                continue
            quad = [a[i], a[j], b[j], b[i]]
            if b[i].co == b[j].co:  # apex
                quad = [a[i], a[j], b[i]]
            band.append(bm.faces.new(quad))
        bands.append(band)
    if cap_bottom:
        bm.faces.new(list(reversed(vr[0])))
    if cap_top and vr[-1][0].co != vr[-1][1].co:
        bm.faces.new(vr[-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    return bm, bands


def ring(n, rx, ry, z, rng=None, jitter=0.0, phase=0.0, dx=0.0, dy=0.0):
    pts = []
    for i in range(n):
        a = phase + TAU * i / n
        k = 1 + (rng.uniform(-jitter, jitter) if rng else 0)
        pts.append(Vector((dx + math.cos(a) * rx * k, dy + math.sin(a) * ry * k, z)))
    return pts


def box(w, d, h, bevel=0.0, rng=None, jitter=0.0):
    """A box from z = 0 to h, centred in x and y, its edges bevelled, its corners nudged by hand."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * w, v.co.y * d, (v.co.z + 0.5) * h))
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=bevel, segments=1, affect='EDGES', profile=0.5)
    if rng and jitter:
        for v in bm.verts:
            v.co += Vector((rng.uniform(-jitter, jitter), rng.uniform(-jitter, jitter), rng.uniform(-jitter, jitter) * 0.5))
    return bm


def torus(R, r, n=10, m=5, sy=1.0):
    """A low-poly ring (rope, hoop) round the Z axis; `sy` squashes it into an ellipse."""
    bm = bmesh.new()
    grid = []
    for i in range(n):
        a = TAU * i / n
        row = []
        for j in range(m):
            b = TAU * j / m
            rr = R + r * math.cos(b)
            row.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a) * sy, r * math.sin(b))))
        grid.append(row)
    for i in range(n):
        for j in range(m):
            a, b = grid[i][j], grid[(i + 1) % n][j]
            c, d = grid[(i + 1) % n][(j + 1) % m], grid[i][(j + 1) % m]
            bm.faces.new([a, b, c, d])
    return bm


def blob(rx, ry, rz, rng, jitter=0.12, subdiv=1):
    """A jittered icosphere: bushes, tree crowns, rocks, heads."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    for v in bm.verts:
        k = 1 + rng.uniform(-jitter, jitter)
        v.co = Vector((v.co.x * rx * k, v.co.y * ry * k, v.co.z * rz * k))
    return bm


def ellipsoid(rx, ry, rz, seg=8, rings=6):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * rx, v.co.y * ry, v.co.z * rz))
    return bm


def frustum(r0, r1, h, n=8, sx=1.0):
    bm, _ = loft([ring(n, r0 * sx, r0, 0), ring(n, r1 * sx, r1, h)])
    return bm


# ---------- pieces ----------

def log(part, at, height, radius, rng, sharpened=True, bend=0.04, sides=7, buried=0.3):
    """A palisade log: bark sides, a sharpened tip of fresh wood, a slight bend."""
    tip = radius * 2.2 if sharpened else 0
    zs = [-buried, height * 0.35, height * 0.7, height - tip]
    rings = []
    phase = rng.uniform(0, TAU)
    for z in zs:
        b = bend * math.sin(math.pi * (z + buried) / (height + buried))
        rings.append(ring(sides, radius, radius, z, rng, 0.07, phase, dx=b))
    if sharpened:
        rings.append([Vector((rng.uniform(-0.03, 0.03), rng.uniform(-0.03, 0.03), height))] * sides)
    bm, bands = loft(rings, cap_bottom=False, cap_top=not sharpened)
    tip_faces = set(bands[-1]) if sharpened else set()
    bark = vary(C['bark'], rng, 0.12)
    part.merge(bm, Matrix.Translation(at), lambda f: vary(C['cut'], rng, 0.06) if f in tip_faces else vary(bark, rng, 0.08))


def lashing(part, a, b, z, radius, rng):
    """Rope round two neighbouring logs, as palisades are tied."""
    mid = (a + b) / 2
    span = (b - a).length / 2 + radius + 0.04
    angle = math.atan2(b.y - a.y, b.x - a.x)
    for k in (0.0, 0.09):
        bm = torus(span, 0.028, n=12, m=4, sy=(radius + 0.05) / span)
        m = Matrix.Translation(mid + Vector((0, 0, z + k))) @ Matrix.Rotation(angle, 4, 'Z')
        part.merge(bm, m, lambda f: vary(C['rope'], rng, 0.1))


def stone(part, at, w, d, h, rng, tone='stone', rot=0.0):
    """A field stone block: bevelled, nudged corners, one tone per block."""
    bm = box(w, d, h, bevel=min(w, d, h) * 0.18, rng=rng, jitter=min(w, d, h) * 0.06)
    rgba = vary(C[tone], rng, 0.12)
    part.merge(bm, Matrix.Translation(at) @ Matrix.Rotation(rot, 4, 'Z'), lambda f: vary(rgba, rng, 0.04))


def plank(part, at, w, d, h, rng, tone='plank', rot=0.0, tilt=0.0):
    bm = box(w, d, h, bevel=min(w, d, h) * 0.25, rng=rng, jitter=0.006)
    rgba = vary(C[tone], rng, 0.1)
    m = Matrix.Translation(at) @ Matrix.Rotation(rot, 4, 'Z') @ Matrix.Rotation(tilt, 4, 'X')
    part.merge(bm, m, lambda f: vary(rgba, rng, 0.03))


def beam(part, a, b, size, rng, tone='plank'):
    """A squared timber from point a to point b."""
    d = b - a
    length = d.length
    bm = box(size, size, length, bevel=size * 0.2, rng=rng, jitter=0.004)
    rot = d.normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4()
    rgba = vary(C[tone], rng, 0.1)
    part.merge(bm, Matrix.Translation(a) @ rot, lambda f: vary(rgba, rng, 0.03))


def post(part, a, b, radius, rng, sides=6):
    """A round pole from a to b (posts, rails, ladder sides)."""
    d = b - a
    rings = [ring(sides, radius, radius, 0, rng, 0.06), ring(sides, radius * 0.92, radius * 0.92, d.length, rng, 0.06)]
    bm, _ = loft(rings)
    rot = d.normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4()
    rgba = vary(C['bark'], rng, 0.12)
    part.merge(bm, Matrix.Translation(a) @ rot, lambda f: vary(rgba, rng, 0.05))


def thatch_pyramid(part, at, w, d, h, rng, layers=4, overhang=0.45, teeth=8):
    """A square straw roof in layers, each with a ragged lower edge; apex at `at.z + h`."""
    for i in range(layers):
        t0, t1 = i / layers, (i + 1) / layers
        s0 = (1 - t0 * 0.92) + overhang / max(w, d) * (1 - t0)
        s1 = 1 - t1 * 0.92
        z0, z1 = h * t0 - 0.12, h * min(1, t1 + 0.12)
        bottom, top = [], []
        corners = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
        for c in range(4):
            (x0, y0), (x1, y1) = corners[c], corners[(c + 1) % 4]
            for k in range(teeth):
                f = k / teeth
                x, y = x0 + (x1 - x0) * f, y0 + (y1 - y0) * f
                drop = rng.uniform(0.12, 0.24) if k % 2 else rng.uniform(0.0, 0.05)
                bottom.append(Vector((x * w / 2 * s0, y * d / 2 * s0, z0 - drop)))
                top.append(Vector((x * w / 2 * s1, y * d / 2 * s1, z1)) if i < layers - 1 else Vector((0, 0, h)))
        inner = [Vector((p.x * 0.86, p.y * 0.86, p.z + 0.26)) for p in bottom]
        bm, bands = loft([inner, bottom, top], cap_bottom=False, cap_top=False)
        under = set(bands[0])
        tone = C['thatch'] if i % 2 == 0 else C['thatch_dark']
        part.merge(bm, Matrix.Translation(at), lambda f, tone=tone: vary(C['thatch_under'], rng, 0.1) if f in under else vary(tone, rng, 0.12))


def thatch_gable(part, at, length, width, h, rng, layers=3, overhang=0.5, teeth=13, rot=0.0):
    """A ridged straw roof along X: two slopes in layers, a rolled ridge."""
    m = Matrix.Translation(at) @ Matrix.Rotation(rot, 4, 'Z')
    half = length / 2 + overhang * 0.6
    for side in (-1, 1):
        for i in range(layers):
            t0, t1 = i / layers, min(1, (i + 1) / layers + 0.15)
            y0 = side * (width / 2 + overhang) * (1 - t0)
            y1 = side * (width / 2 + overhang) * (1 - t1)
            z0, z1 = h * t0 - 0.1, h * t1
            lower, upper = [], []
            for k in range(teeth + 1):
                x = -half + 2 * half * k / teeth
                drop = rng.uniform(0.12, 0.24) if k % 2 else rng.uniform(0.0, 0.05)
                lower.append(Vector((x, y0, z0 - drop)))
                upper.append(Vector((x, y1, z1)))
            bm = bmesh.new()
            lv = [bm.verts.new(p) for p in lower]
            uv = [bm.verts.new(p) for p in upper]
            dv = [bm.verts.new(p + Vector((0, -side * 0.2, 0.24))) for p in lower]
            under = set()
            for k in range(teeth):
                bm.faces.new([lv[k], lv[k + 1], uv[k + 1], uv[k]])
                under.add(bm.faces.new([dv[k], dv[k + 1], lv[k + 1], lv[k]]))
            tone = C['thatch'] if i % 2 == 0 else C['thatch_dark']
            part.merge(bm, m, lambda f, tone=tone: vary(C['thatch_under'], rng, 0.1) if f in under else vary(tone, rng, 0.12))
    ridge = loft([ring(6, 0.22, 0.22, -half), ring(6, 0.22, 0.22, half)])[0]
    for v in ridge.verts:
        v.co = Vector((v.co.z, v.co.x, v.co.y + h))
    part.merge(ridge, m, lambda f: vary(C['thatch_under'], rng, 0.08))


def barrel(part, at, rng, r=0.32, h=0.85):
    zs = [0, 0.22, 0.5, 0.78, 1.0]
    ks = [0.84, 0.97, 1.0, 0.97, 0.84]
    bm, _ = loft([ring(10, r * k, r * k, z * h) for z, k in zip(zs, ks)])
    staves = vary(C['plank'], rng, 0.1)
    part.merge(bm, Matrix.Translation(at), lambda f: vary(staves, rng, 0.07) if abs(f.normal.z) < 0.9 else vary(C['cut'], rng, 0.05))
    for z, k in ((0.14, 0.93), (0.86, 0.93)):
        part.merge(torus(r * k + 0.012, 0.018, n=12, m=4), Matrix.Translation(at + Vector((0, 0, z * h))), lambda f: vary(C['iron'], rng, 0.05))


def pine(part, at, rng, height=7.0):
    log(part, at, height * 0.3, 0.16, rng, sharpened=False, bend=0.0, sides=5, buried=0.1)
    for i, (z, r) in enumerate(((0.2, 1.7), (0.45, 1.3), (0.68, 0.9))):
        n = 7
        base = ring(n, r, r, height * z, rng, 0.12, rng.uniform(0, TAU))
        skirt = [Vector((p.x * 1.05, p.y * 1.05, p.z - 0.35 + rng.uniform(-0.1, 0.1))) for p in base]
        apex = [Vector((rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1), height * (z + 0.36)))] * n
        bm, _ = loft([skirt, base, apex], cap_bottom=True, cap_top=False)
        tone = vary(C['pine'] if i % 2 == 0 else C['pine_light'], rng, 0.1)
        part.merge(bm, Matrix.Translation(at), lambda f, tone=tone: vary(tone, rng, 0.06))


def oak(part, at, rng, height=6.0):
    log(part, at, height * 0.45, 0.22, rng, sharpened=False, bend=0.08, sides=6, buried=0.1)
    for _ in range(4):
        off = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), height * rng.uniform(0.55, 0.8)))
        r = rng.uniform(1.3, 1.9)
        bm = blob(r, r, r * 0.8, rng, 0.15)
        tone = vary(C['leaf'], rng, 0.15)
        part.merge(bm, Matrix.Translation(at + off), lambda f, tone=tone: vary(tone, rng, 0.07))


def rock(part, at, size, rng):
    bm = blob(size, size * rng.uniform(0.7, 1.1), size * 0.6, rng, 0.25, subdiv=1)
    tone = vary(C['rock'], rng, 0.12)
    part.merge(bm, Matrix.Translation(at) @ Matrix.Rotation(rng.uniform(0, TAU), 4, 'Z'), lambda f: vary(tone, rng, 0.06))


def banner(part, pole_top, rng, w=0.7, h=1.3, tone='crimson'):
    """A swallowtail banner hanging from a cross bar, with a gold border band."""
    pts_top = [Vector((x, 0, 0)) for x in (-w / 2, w / 2)]
    bm = bmesh.new()
    rows = 4
    grid = []
    for j in range(rows + 1):
        z = -h * j / rows
        wave = 0.06 * math.sin(j * 1.3)
        grid.append([bm.verts.new((x, wave, z)) for x in (-w / 2, 0, w / 2)])
    grid[-1][1].co.z += h * 0.25  # the swallowtail notch
    for j in range(rows):
        for i in range(2):
            bm.faces.new([grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]])
    rgba = C[tone]
    part.merge(bm, Matrix.Translation(pole_top), lambda f: vary(rgba, rng, 0.04))
    beam(part, pole_top + Vector((-w / 2 - 0.08, 0, 0.02)), pole_top + Vector((w / 2 + 0.08, 0, 0.02)), 0.05, rng, 'plank')
    del pts_top


def seed(n):
    return random.Random(n)
