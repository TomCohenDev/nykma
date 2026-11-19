"""Shared Blender setup for scenes: args, render settings, compositor, materials.

Every scene script starts with `T, args = kit.start()` and ends with `kit.render(args, sc)`.
A scene renders its own slice of the timeline (`first`..`last`, 0-based timeline frames), and
files are numbered by timeline frame + 1, so a plate's file number is the ad's frame + 1.
`mv.py blender` puts this folder and the scene's folder on sys.path, so `import kit` just works.
Blender 5.x and 4.5 LTS (the last for Intel Macs) both work: the few names they differ in are handled here.
"""
import argparse
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tl import Timeline, bake  # noqa: E402,F401

SIZES = {"16x9": (1920, 1080), "1x1": (1080, 1080), "9x16": (1080, 1920)}  # as src/engine/ratio.ts


def start():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--timeline", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--preview", action="store_true")
    ap.add_argument("--frames")
    ap.add_argument("--layer", action="store_true")
    ap.add_argument("--ratio", default="16x9", choices=SIZES)
    args = ap.parse_args(argv)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return Timeline(args.timeline), args


def setup(T, first: int, last: int, args, samples: int = 64, look: str = "AgX - Punchy", transparent: bool = False):
    """`transparent` renders straight-alpha RGBA, so a plate sits over whatever the page draws behind it."""
    sc = bpy.context.scene
    engines = {e.identifier for e in sc.render.bl_rna.properties["engine"].enum_items}
    sc.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in engines else "BLENDER_EEVEE_NEXT"  # 4.5 calls it NEXT
    sc.render.fps = T.fps
    sc.frame_start, sc.frame_end = first + 1, last + 1
    sc.render.resolution_x, sc.render.resolution_y = SIZES[args.ratio]
    sc.render.resolution_percentage = 50 if args.preview else 100
    sc.eevee.taa_render_samples = 16 if args.preview else samples
    sc.eevee.use_raytracing = True
    sc.render.use_motion_blur = True
    sc.render.motion_blur_shutter = 0.5
    sc.render.film_transparent = transparent
    sc.view_settings.view_transform = "AgX"
    try:
        sc.view_settings.look = look
    except TypeError:
        pass
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA" if transparent else "RGB"
    return sc


def world(color=(0.004, 0.004, 0.007), strength=1.0, fog: float = 0.0, anisotropy: float = 0.55):
    """Dark world, optionally filled with fog so lights draw visible beams."""
    w = bpy.data.worlds.new("World")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes["Background"]
    bg.inputs["Color"].default_value = (*color, 1)
    bg.inputs["Strength"].default_value = strength
    if fog > 0:
        vol = nt.nodes.new("ShaderNodeVolumePrincipled")
        vol.inputs["Density"].default_value = fog
        vol.inputs["Anisotropy"].default_value = anisotropy
        nt.links.new(vol.outputs[0], nt.nodes["World Output"].inputs["Volume"])
        ee = bpy.context.scene.eevee
        for k, v in (("volumetric_end", 60.0), ("volumetric_tile_size", "4"), ("volumetric_samples", 64),
                     ("use_volumetric_shadows", True), ("volumetric_shadow_samples", 32)):
            if hasattr(ee, k):
                setattr(ee, k, v)
    return w


def compositor(bloom: float = 0.5, threshold: float = 1.0, size: float = 0.8, dispersion: float = 0.008, preview=False):
    sc = bpy.context.scene
    v5 = hasattr(sc, "compositing_node_group")
    if v5:
        comp = bpy.data.node_groups.new("Comp", "CompositorNodeTree")
        comp.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    else:  # 4.5: the scene's own tree, ending in a Composite node
        sc.use_nodes = True
        comp = sc.node_tree
        comp.nodes.clear()
    rl = comp.nodes.new("CompositorNodeRLayers")
    gl = comp.nodes.new("CompositorNodeGlare")
    if v5:
        gl.inputs["Type"].default_value = "Bloom"
        gl.inputs["Quality"].default_value = "Medium" if preview else "High"
    else:  # settings on the node in 4.5, and Size only exists once the type is Bloom
        gl.glare_type = "BLOOM"
        gl.quality = "MEDIUM" if preview else "HIGH"
    gl.inputs["Threshold"].default_value = threshold
    gl.inputs["Strength"].default_value = bloom
    gl.inputs["Size"].default_value = size
    ld = comp.nodes.new("CompositorNodeLensdist")
    if "Dispersion" in ld.inputs:
        ld.inputs["Dispersion"].default_value = dispersion
    go = comp.nodes.new("NodeGroupOutput" if v5 else "CompositorNodeComposite")
    comp.links.new(rl.outputs["Image"], gl.inputs["Image"])
    comp.links.new(gl.outputs["Image"], ld.inputs["Image"])
    out = ld.outputs["Image"]
    if sc.render.film_transparent:
        # Glare and lens distortion hand back an opaque image (seen in 4.5), which turns a plate into a black frame.
        # Put the alpha back: the render's own, or the bloom's brightness where it glows past the object's edge.
        bw = comp.nodes.new("CompositorNodeRGBToBW")
        mx = None
        for kind in ("CompositorNodeMath", "ShaderNodeMath"):
            try:
                mx = comp.nodes.new(kind)
                break
            except RuntimeError:
                continue
        mx.operation = "MAXIMUM"
        sa = comp.nodes.new("CompositorNodeSetAlpha")
        comp.links.new(out, bw.inputs[0])
        comp.links.new(rl.outputs["Alpha"], mx.inputs[0])
        comp.links.new(bw.outputs[0], mx.inputs[1])
        comp.links.new(out, sa.inputs["Image"])
        comp.links.new(mx.outputs[0], sa.inputs["Alpha"])
        out = sa.outputs["Image"]
    comp.links.new(out, go.inputs[0])
    if v5:
        sc.compositing_node_group = comp


def principled(name, color, rough=0.5, metal=0.0, emit=None, emit_strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    pb = m.node_tree.nodes["Principled BSDF"]
    pb.inputs["Base Color"].default_value = (*color, 1)
    pb.inputs["Roughness"].default_value = rough
    pb.inputs["Metallic"].default_value = metal
    if emit:
        pb.inputs["Emission Color"].default_value = (*emit, 1)
        pb.inputs["Emission Strength"].default_value = emit_strength
    return m, pb


def emission(name, color, strength=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*color, 1)
    em.inputs["Strength"].default_value = strength
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    return m, em


def chalk(name, color=(0.86, 0.87, 0.84), glow=0.25, grain=90.0):
    """Chalk with a write-on reveal: everything left of the `reveal` value (object-space X)
    shows, with a soft leading edge, broken up by noise so strokes look dusty.

    Returns (material, reveal value node, principled node). Bake reveal per frame.
    """
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    reveal = nt.nodes.new("ShaderNodeValue")
    reveal.outputs[0].default_value = 99.0
    edge = nt.nodes.new("ShaderNodeMath")
    edge.operation = "SUBTRACT"  # reveal - x  > 0 → shown
    soft = nt.nodes.new("ShaderNodeMapRange")
    soft.inputs["From Min"].default_value, soft.inputs["From Max"].default_value = 0.0, 0.06
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = grain
    noise.inputs["Detail"].default_value = 4.0
    dust = nt.nodes.new("ShaderNodeMapRange")
    dust.inputs["From Min"].default_value, dust.inputs["From Max"].default_value = 0.38, 0.62
    dust.inputs["To Min"].default_value = 0.35
    alpha = nt.nodes.new("ShaderNodeMath")
    alpha.operation = "MULTIPLY"
    pb = nt.nodes.new("ShaderNodeBsdfPrincipled")
    pb.inputs["Base Color"].default_value = (*color, 1)
    pb.inputs["Roughness"].default_value = 0.95
    pb.inputs["Emission Color"].default_value = (*color, 1)
    pb.inputs["Emission Strength"].default_value = glow
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    L = nt.links.new
    L(tc.outputs["Object"], sep.inputs[0])
    L(reveal.outputs[0], edge.inputs[0])
    L(sep.outputs["X"], edge.inputs[1])
    L(edge.outputs[0], soft.inputs["Value"])
    L(tc.outputs["Object"], noise.inputs["Vector"])
    L(noise.outputs["Fac"], dust.inputs["Value"])
    L(soft.outputs["Result"], alpha.inputs[0])
    L(dust.outputs["Result"], alpha.inputs[1])
    L(alpha.outputs[0], mix.inputs["Fac"])
    L(tr.outputs[0], mix.inputs[1])
    L(pb.outputs[0], mix.inputs[2])
    L(mix.outputs[0], out.inputs["Surface"])
    return m, reveal, pb


def text(body, font, size, loc, rot=(1.5708, 0, 0), extrude=0.0, bevel=0.0, align="LEFT", mat=None, name=None):
    cu = bpy.data.curves.new(name or body, "FONT")
    cu.body = body
    cu.font = font
    cu.size = size
    cu.extrude = extrude
    cu.bevel_depth = bevel
    cu.align_x = align
    ob = bpy.data.objects.new(name or body, cu)
    ob.location = loc
    ob.rotation_euler = rot
    bpy.context.scene.collection.objects.link(ob)
    if mat:
        cu.materials.append(mat)
    return ob


def width(ob) -> float:
    bpy.context.view_layer.update()
    return ob.dimensions.x


def camera(lens=35.0, fstop=2.8, sensor=36.0):
    cd = bpy.data.cameras.new("Cam")
    cd.lens = lens
    cd.sensor_width = sensor
    cd.dof.use_dof = True
    cd.dof.aperture_fstop = fstop
    cam = bpy.data.objects.new("Cam", cd)
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    target = bpy.data.objects.new("Target", None)
    bpy.context.scene.collection.objects.link(target)
    tr = cam.constraints.new("TRACK_TO")
    tr.target = target
    tr.track_axis, tr.up_axis = "TRACK_NEGATIVE_Z", "UP_Y"
    cd.dof.focus_object = target
    return cam, cd, target


def render(args, sc):
    """--frames: those Blender frames as still_00001.png (####.png with --layer, so <Plate> can read them).
    Otherwise the scene's whole slice as ####.png."""
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    if args.frames:
        for f in (int(x) for x in args.frames.split(",")):
            sc.frame_set(f)
            sc.render.filepath = str(out / (f"{f:04d}" if args.layer else f"still_{f:05d}"))
            bpy.ops.render.render(write_still=True)
            print(f"still {f} -> {sc.render.filepath}")
    else:
        sc.render.filepath = str(out / "####")
        bpy.ops.render.render(animation=True)
