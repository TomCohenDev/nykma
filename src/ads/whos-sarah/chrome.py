"""whos-sarah's chrome: the shiny objects the fake ad is proud of. A spinning #1, five stars and a hockey-stick arrow, on one
square transparent plate sequence, each alive only during its own gag (timed by score.json, the same as the page).

    .venv/Scripts/python py/mv.py blender whos-sarah --scene src/ads/whos-sarah/chrome.py --ratio 1x1 --preview --frames 20,130,360
    .venv/Scripts/python py/mv.py blender whos-sarah --scene src/ads/whos-sarah/chrome.py --ratio 1x1 --layer
"""
import json
import math
from pathlib import Path

import bpy

import kit
from tl import bake, lerp, smoothstep

score = json.loads((Path(__file__).parent / "score.json").read_text(encoding="utf-8"))
cuts = score["cuts"]
FONT = Path(__file__).resolve().parents[3] / "public" / "ads" / "whos-sarah" / "ArchivoBlack-Regular.ttf"

T, args = kit.start()
first, last = 0, cuts["g5"] - 1
sc = kit.setup(T, first, last, args, samples=16, transparent=True)
sc.render.motion_blur_shutter = 0.35
frames = list(range(first, last + 1))
start = first + 1


def out_back(t):
    t = min(max(t, 0.0), 1.0)
    return 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2


def out_expo(t):
    return 1.0 if t >= 1 else 1 - 2 ** (-10 * max(t, 0.0))


# ── a studio that only exists in the reflections ─────────────────────────────
world = bpy.data.worlds.new("Studio")
sc.world = world
world.use_nodes = True
nt = world.node_tree
bg = nt.nodes["Background"]
coord = nt.nodes.new("ShaderNodeTexCoord")
sep = nt.nodes.new("ShaderNodeSeparateXYZ")
wave = nt.nodes.new("ShaderNodeMath")
wave.operation = "SINE"
scale = nt.nodes.new("ShaderNodeMath")
scale.operation = "MULTIPLY"
scale.inputs[1].default_value = 7.0
ramp = nt.nodes.new("ShaderNodeValToRGB")
stops = ramp.color_ramp.elements
stops[0].position, stops[0].color = 0.0, (0.01, 0.0, 0.05, 1)
stops[1].position, stops[1].color = 1.0, (1.0, 1.0, 1.0, 1)
for pos, col in ((0.30, (0.09, 0.02, 0.55, 1)), (0.52, (0.05, 0.25, 1.0, 1)), (0.68, (1.0, 0.15, 0.75, 1)), (0.86, (0.9, 0.85, 1.0, 1))):
    e = stops.new(pos)
    e.color = col
wrap = nt.nodes.new("ShaderNodeMath")
wrap.operation = "MULTIPLY_ADD"
wrap.inputs[1].default_value = 0.5
wrap.inputs[2].default_value = 0.5
L = nt.links.new
L(coord.outputs["Generated"], sep.inputs[0])
L(sep.outputs["Z"], scale.inputs[0])
L(scale.outputs[0], wave.inputs[0])
L(wave.outputs[0], wrap.inputs[0])
L(wrap.outputs[0], ramp.inputs["Fac"])
L(ramp.outputs["Color"], bg.inputs["Color"])
bg.inputs["Strength"].default_value = 2.4



def banded(name, bands, low, high, rough, emit=0.0):
    """A flat face reflects one direction, so a mirror would read as one colour. Bands up the object give the 80s chrome look."""
    m, pb = kit.principled(name, (1, 1, 1), rough=rough, metal=1.0)
    nt = m.node_tree
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    fit = nt.nodes.new("ShaderNodeMapRange")
    fit.inputs["From Min"].default_value, fit.inputs["From Max"].default_value = low, high
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = bands[0][0], (*bands[0][1], 1)
    els[1].position, els[1].color = bands[-1][0], (*bands[-1][1], 1)
    for pos, col in bands[1:-1]:
        e = els.new(pos)
        e.color = (*col, 1)
    nt.links.new(tc.outputs["Object"], sep.inputs[0])
    nt.links.new(sep.outputs["Y"], fit.inputs["Value"])
    nt.links.new(fit.outputs[0], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], pb.inputs["Base Color"])
    if emit:
        nt.links.new(ramp.outputs["Color"], pb.inputs["Emission Color"])
        pb.inputs["Emission Strength"].default_value = emit
    return m


CHROME = [(0.0, (0.75, 0.45, 1.0)), (0.3, (0.16, 0.08, 0.7)), (0.47, (0.03, 0.02, 0.25)), (0.5, (1.0, 0.95, 1.0)), (0.72, (0.5, 0.8, 1.0)), (1.0, (1.0, 1.0, 1.0))]
chrome = banded("Chrome", CHROME, -2.0, 2.0, 0.05, emit=0.5)
gold = banded("Gold", [(0.0, (1.0, 0.35, 0.05)), (0.48, (1.0, 0.62, 0.1)), (0.52, (1.0, 0.92, 0.45)), (1.0, (1.0, 0.98, 0.8))], -0.9, 0.9, 0.08, emit=0.55)
steel, _ = kit.principled("Steel", (0.95, 0.96, 1.0), rough=0.06, metal=1.0)

# ── #1 ───────────────────────────────────────────────────────────────────────
font = bpy.data.fonts.load(str(FONT))
num = kit.text("#1", font, 5.2, (0, 0, 0), rot=(math.radians(90), 0, 0), extrude=0.42, bevel=0.09, align="CENTER", mat=chrome, name="Num")
num.data.bevel_resolution = 4
num.data.align_y = "CENTER"
num.data.resolution_u = 24

g1 = (cuts["g1"], cuts["g2"])
flinch = score["flinch"][0]


def rock(f):
    """Struts until the pen touches it, then stops dead and shrinks back a little."""
    t = T.t(f)
    calm = 0.42 * math.sin(t * 2.3 + 0.5)
    hit = smoothstep(flinch[0] - 2, flinch[0] + 8, f)
    shake = 0.05 * math.sin(f * 1.9) * math.exp(-(f - flinch[0]) / 12) if f >= flinch[0] else 0.0
    return lerp(calm, 0.42 * math.sin(T.t(flinch[0]) * 2.3 + 0.5) * 0.3, hit) + shake


bake(num, "rotation_euler", [(math.radians(90) + 0.08 * math.sin(T.t(f) * 3), 0, rock(f)) for f in frames], start)
bake(num, "scale", [(s, s, s) for s in ((1.0 - 0.1 * smoothstep(flinch[0], flinch[0] + 10, f)) if g1[0] <= f < g1[1] else 0.0 for f in frames)], start)

# ── five stars ───────────────────────────────────────────────────────────────


def star_curve(name, outer=0.86, inner=0.38):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "2D"
    cu.fill_mode = "BOTH"
    cu.extrude = 0.14
    cu.bevel_depth = 0.05
    cu.bevel_resolution = 3
    sp = cu.splines.new("POLY")
    sp.points.add(9)
    for i in range(10):
        r = outer if i % 2 == 0 else inner
        a = math.pi / 2 + i * math.pi / 5
        sp.points[i].co = (r * math.cos(a), r * math.sin(a), 0, 1)
    sp.use_cyclic_u = True
    cu.materials.append(gold)
    return cu


stars = []
g2 = (cuts["g2"], cuts["g3"])
for i in range(5):
    ob = bpy.data.objects.new(f"Star{i}", star_curve(f"Star{i}"))
    sc.collection.objects.link(ob)
    stars.append(ob)
    at = g2[0] + 3 + i * 3
    x = (i - 2) * 1.74
    bake(ob, "location", [(x, 0, 0.12 * math.sin(T.t(f) * 5 + i)) for f in frames], start)
    pop = [(out_back((f - at) / 12) if g2[0] <= f < g2[1] else 0.0) for f in frames]
    bake(ob, "scale", [(max(p, 0.0),) * 3 for p in pop], start)
    bake(ob, "rotation_euler", [(math.radians(90), 2.5 * math.pi * (1 - out_expo((f - at) / 22)), 0.3 * math.sin(T.t(f) * 2.2 + i * 0.8)) for f in frames], start)

# ── the hockey stick ─────────────────────────────────────────────────────────
g4 = (cuts["g4"], cuts["g5"])
cu = bpy.data.curves.new("Stick", "CURVE")
cu.dimensions = "3D"
cu.bevel_depth = 0.27
cu.bevel_resolution = 6
cu.resolution_u = 48
cu.use_fill_caps = True
sp = cu.splines.new("BEZIER")
sp.bezier_points.add(1)
a, b = sp.bezier_points
a.co, a.handle_left, a.handle_right = (-4.3, 0, -3.5), (-5, 0, -3.5), (0.4, 0, -3.4)
b.co, b.handle_left, b.handle_right = (3.5, 0, 3.0), (2.0, 0, -0.6), (4, 0, 4.2)
cu.materials.append(steel)
stick = bpy.data.objects.new("Stick", cu)
sc.collection.objects.link(stick)

bpy.ops.mesh.primitive_cone_add(vertices=48, radius1=0.78, depth=1.6, location=(0, 0, 0))
head = bpy.context.active_object
head.data.materials.append(steel)
bpy.ops.object.shade_smooth()

grow = [out_expo((f - g4[0]) / 22) if g4[0] <= f < g4[1] else 0.0 for f in frames]
bake(cu, "bevel_factor_end", [max(g, 0.002) for g in grow], start)


def along(k):
    """The curve's point and direction at share k."""
    u = 1 - k
    p0, p1, p2, p3 = (-4.3, -3.5), (0.4, -3.4), (2.0, -0.6), (3.5, 3.0)
    x = u**3 * p0[0] + 3 * u * u * k * p1[0] + 3 * u * k * k * p2[0] + k**3 * p3[0]
    z = u**3 * p0[1] + 3 * u * u * k * p1[1] + 3 * u * k * k * p2[1] + k**3 * p3[1]
    dx = 3 * u * u * (p1[0] - p0[0]) + 6 * u * k * (p2[0] - p1[0]) + 3 * k * k * (p3[0] - p2[0])
    dz = 3 * u * u * (p1[1] - p0[1]) + 6 * u * k * (p2[1] - p1[1]) + 3 * k * k * (p3[1] - p2[1])
    return x, z, math.atan2(dx, dz)


ends = [along(max(g, 0.002)) for g in grow]
bake(head, "location", [(x + 0.5 * math.sin(r), 0, z + 0.5 * math.cos(r)) for x, z, r in ends], start)
bake(head, "rotation_euler", [(0, r, 0) for _, _, r in ends], start)
bake(head, "scale", [(1.0 if g > 0 else 0.0,) * 3 for g in grow], start)
bake(stick, "scale", [(1.0 if g4[0] <= f < g4[1] else 0.0,) * 3 for f in frames], start)

for name, loc, power, color in (("Key", (-5, -8, 6), 900, (1.0, 0.95, 1.0)), ("Rim", (6, 4, 2), 1400, (0.5, 0.4, 1.0)), ("Kick", (2, -6, -6), 500, (1.0, 0.3, 0.8))):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy, ld.color, ld.size = power, color, 6.0
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    ob.rotation_euler = (0, 0, 0)
    con = ob.constraints.new("TRACK_TO")
    empty = bpy.data.objects.get("Aim") or bpy.data.objects.new("Aim", None)
    if not empty.users_collection:
        sc.collection.objects.link(empty)
    con.target = empty
    con.track_axis, con.up_axis = "TRACK_NEGATIVE_Z", "UP_Y"
    sc.collection.objects.link(ob)

cam, cd, target = kit.camera(lens=62, fstop=8.0)
cd.dof.use_dof = False
cam.location = (0, -15.5, 0)
target.location = (0, 0, 0)

kit.render(args, sc)
