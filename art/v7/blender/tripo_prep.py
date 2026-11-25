"""Bring a dense Tripo model down to a game budget without losing its detail.

The dense source is decimated (collapse), then every map is baked again from
the dense surface onto the low mesh: base colour, roughness, metal and a
tangent-space normal map (the source's normal map included). Re-baking all of
them, not only the normals, matters: collapsing moves vertices across texture
seams, and the source maps then show the atlas gaps as white cracks.

    blender -b --factory-startup -P tripo_prep.py -- SRC.glb OUT.glb 20000 4096

Arguments: source GLB, output GLB, target triangles, map size.
CPU bake on 5 threads (about a third of the machine, it runs hot).
"""
import os
import sys

import bpy
import numpy as np

THREADS = 5


def read_args():
    args = sys.argv[sys.argv.index('--') + 1:]
    if len(args) != 4:
        raise SystemExit('usage: SRC.glb OUT.glb TRIS SIZE')
    src, out, tris, size = args
    if not tris.isdigit() or not size.isdigit():
        raise SystemExit('TRIS and SIZE are whole numbers')
    tris, size = int(tris), int(size)
    if not 1000 <= tris <= 200000 or size not in (1024, 2048, 4096):
        raise SystemExit('TRIS in 1000..200000, SIZE 1024, 2048 or 4096')
    return os.path.abspath(src), os.path.abspath(out), tris, size


def joined_mesh():
    """One mesh object, transforms applied, no parents."""
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    for o in meshes:
        world = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = world
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in [o for o in bpy.data.objects if o.type == 'EMPTY']:
        bpy.data.objects.remove(o)
    return obj


def triangles(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def decimated_copy(dense, target):
    low = dense.copy()
    low.data = dense.data.copy()
    low.name = 'low'
    bpy.context.collection.objects.link(low)
    mod = low.modifiers.new('decimate', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = min(1.0, target / triangles(dense))
    mod.use_collapse_triangulate = True
    bpy.ops.object.select_all(action='DESELECT')
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return low


def pixels(image):
    data = np.empty(image.size[0] * image.size[1] * 4, dtype=np.float32)
    image.pixels.foreach_get(data)
    return data.reshape(-1, 4)


class BakedMaterial:
    """The low mesh's new material: one image per baked map, glTF's node layout."""

    def __init__(self, low, size):
        self.mat = bpy.data.materials.new('baked')
        self.mat.use_nodes = True
        low.data.materials.clear()
        low.data.materials.append(self.mat)
        for poly in low.data.polygons:
            poly.material_index = 0
        tree = self.mat.node_tree
        self.bsdf = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
        self.images = {}
        for name, color in (('basecolor', True), ('roughness', False), ('metallic', False), ('normal', False)):
            image = bpy.data.images.new(name, size, size, alpha=False, is_data=not color)
            image.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
            node = tree.nodes.new('ShaderNodeTexImage')
            node.image = image
            node.name = name
            self.images[name] = image

    def target(self, name):
        tree = self.mat.node_tree
        tree.nodes.active = tree.nodes[name]

    def wire(self):
        """Base colour, packed roughness (G) and metal (B), normal map: what the glTF exporter reads."""
        tree = self.mat.node_tree
        nodes, links = tree.nodes, tree.links
        links.new(nodes['basecolor'].outputs['Color'], self.bsdf.inputs['Base Color'])
        rm = bpy.data.images.new('rm', *self.images['roughness'].size, alpha=False, is_data=True)
        rm.colorspace_settings.name = 'Non-Color'
        rough, metal = (pixels(self.images[n]) for n in ('roughness', 'metallic'))
        packed = np.ones_like(rough)
        packed[:, 1] = rough[:, 0]
        packed[:, 2] = metal[:, 0]
        rm.pixels.foreach_set(packed.ravel())
        self.images['rm'] = rm
        rm_node = nodes.new('ShaderNodeTexImage')
        rm_node.image = rm
        split = nodes.new('ShaderNodeSeparateColor')
        links.new(rm_node.outputs['Color'], split.inputs['Color'])
        links.new(split.outputs['Green'], self.bsdf.inputs['Roughness'])
        links.new(split.outputs['Blue'], self.bsdf.inputs['Metallic'])
        normal = nodes.new('ShaderNodeNormalMap')
        links.new(nodes['normal'].outputs['Color'], normal.inputs['Color'])
        links.new(normal.outputs['Normal'], self.bsdf.inputs['Normal'])
        for name in ('roughness', 'metallic'):
            nodes.remove(nodes[name])

    def save(self, base):
        for name in ('basecolor', 'rm', 'normal'):
            image = self.images[name]
            image.filepath_raw = f'{base}_{name}.png'
            image.file_format = 'PNG'
            image.save()


class InputAsEmission:
    """Show one BSDF input of the dense mesh as emission while baking. Exact, unlike
    Cycles' diffuse-colour pass, which turns metal black (no metallic pass exists)."""

    def __init__(self, dense, socket):
        self.saved = []
        for slot in dense.material_slots:
            tree = slot.material.node_tree
            bsdf = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
            out = next(n for n in tree.nodes if n.type == 'OUTPUT_MATERIAL')
            emit = tree.nodes.new('ShaderNodeEmission')
            source = bsdf.inputs[socket]
            if source.links:
                tree.links.new(source.links[0].from_socket, emit.inputs['Color'])
            else:
                v = source.default_value
                emit.inputs['Color'].default_value = tuple(v) if hasattr(v, '__len__') else (v, v, v, 1)
            previous = out.inputs['Surface'].links[0].from_socket
            tree.links.new(emit.outputs['Emission'], out.inputs['Surface'])
            self.saved.append((tree, out, previous, emit))

    def restore(self):
        for tree, out, previous, emit in self.saved:
            tree.links.new(previous, out.inputs['Surface'])
            tree.nodes.remove(emit)


def bake_all(dense, low, size):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 1
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = THREADS
    height = dense.dimensions.z
    settings = scene.render.bake
    settings.use_selected_to_active = True
    settings.cage_extrusion = 0.006 * height
    settings.max_ray_distance = 0.02 * height
    settings.margin = 16
    bpy.ops.object.select_all(action='DESELECT')
    dense.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    material = BakedMaterial(low, size)
    material.target('normal')
    bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT')
    for name, socket in (('basecolor', 'Base Color'), ('roughness', 'Roughness'), ('metallic', 'Metallic')):
        shown = InputAsEmission(dense, socket)
        material.target(name)
        bpy.ops.object.bake(type='EMIT')
        shown.restore()
    material.wire()
    return material


def main():
    src, out, target, size = read_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    dense = joined_mesh()
    low = decimated_copy(dense, target)
    material = bake_all(dense, low, size)
    material.save(os.path.splitext(out)[0])
    bpy.data.objects.remove(dense)
    bpy.ops.object.select_all(action='DESELECT')
    low.select_set(True)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True)
    print(f'PREP {src} -> {out}: {triangles(low)} tris, maps {size}px')


if __name__ == '__main__':
    main()
