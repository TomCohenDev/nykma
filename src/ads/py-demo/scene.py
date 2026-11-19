"""py-demo's 3D: a ring of pillars around a glowing core, on a transparent ground when it's a plate.
It renders only the drop (the second section), and every value comes from timeline.json:
pillars rise with the bass and treble, the core kicks on each beat, the ring turns one way per bar.

    .venv/Scripts/python py/mv.py blender py-demo --scene src/ads/py-demo/scene.py --preview --frames 100,130
    .venv/Scripts/python py/mv.py blender py-demo --scene src/ads/py-demo/scene.py --layer
"""
import math

import bpy

import kit
from tl import bake, lerp, smoothstep

T, args = kit.start()
_, drop, _ = T.section(T.duration / 2)  # the middle of the ad is inside the drop
first, last = T.frame(drop["start"]), T.frame(drop["end"]) - 1
sc = kit.setup(T, first, last, args, samples=32, transparent=args.layer)
kit.world(color=(0.01, 0.012, 0.03))
kit.compositor(bloom=0.7, threshold=0.8, size=0.7, preview=args.preview)

frames = list(range(first, last + 1))
times = [T.t(f) for f in frames]
start = first + 1

# ── the ring ─────────────────────────────────────────────────────────────────
PILLARS = 28
RADIUS = 4.2
steel, _ = kit.principled("Steel", (0.32, 0.36, 0.5), rough=0.38, metal=0.55)
hot, hot_em = kit.emission("Hot", (1.0, 0.42, 0.12), 4.0)
ice, ice_em = kit.emission("Ice", (0.2, 0.6, 1.0), 3.0)

root = bpy.data.objects.new("Ring", None)
sc.collection.objects.link(root)
pillars = []
for i in range(PILLARS):
    a = 2 * math.pi * i / PILLARS
    bpy.ops.mesh.primitive_cube_add(size=1, location=(RADIUS * math.cos(a), RADIUS * math.sin(a), 0))
    ob = bpy.context.active_object
    ob.name = f"Pillar{i}"
    ob.rotation_euler.z = a
    ob.data.materials.append(steel if i % 2 else ice)
    ob.parent = root
    pillars.append(ob)

bpy.ops.mesh.primitive_torus_add(major_radius=1.5, minor_radius=0.2, major_segments=96, minor_segments=24, location=(0, 0, 1.2))
core = bpy.context.active_object
core.data.materials.append(hot)

for name, kind, loc, power, color in (("Key", "AREA", (-6, -7, 9), 3200, (1.0, 0.85, 0.75)),
                                      ("Rim", "AREA", (7, 8, 5), 2400, (0.45, 0.65, 1.0))):
    ld = bpy.data.lights.new(name, kind)
    ld.energy, ld.color, ld.size = power, color, 7.0
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    ob.rotation_euler = (math.radians(55), 0, math.atan2(-loc[0], loc[1]))
    sc.collection.objects.link(ob)

# ── motion: all of it baked, one key per frame ───────────────────────────────
for i, ob in enumerate(pillars):
    wave = [0.5 + 0.5 * math.sin(2 * math.pi * (i / PILLARS * 3 - T.count(T.beats, t) / 8)) for t in times]
    curve = "low" if i % 2 else "high"
    tall = [0.35 + 3.2 * T.energy(curve, f) * lerp(0.35, 1.0, w) for f, w in zip(frames, wave)]
    bake(ob, "scale", [(0.34, 0.34, h) for h in tall], start)
    bake(ob, "location", [(ob.location.x, ob.location.y, h / 2) for h in tall], start)

# Turning is accumulated once over the whole slice, so any frame renders the same on its own.
angle, turn = 0.0, []
for f, t in zip(frames, times):
    angle += (0.3 + 1.1 * T.energy("rms", f)) / T.fps
    turn.append((0.0, 0.0, angle))
bake(root, "rotation_euler", turn, start)

kick = [T.pulse(T.beats, t, 0.14) for t in times]
bake(core, "scale", [(s, s, s) for s in (1 + 0.38 * k for k in kick)], start)
bake(core, "rotation_euler", [(math.radians(68) + 0.3 * math.sin(t * 1.4), 0.3 * math.cos(t * 1.1), t * 0.8) for t in times], start)
bake(hot_em.inputs["Strength"], "default_value", [1.6 + 7.0 * k for k in kick], start)
bake(ice_em.inputs["Strength"], "default_value", [0.5 + 2.2 * T.energy("high", f) for f in frames], start)

cam, cd, target = kit.camera(lens=34, fstop=4.0)
span = max(times[-1] - times[0], 1e-6)
bake(cam, "location", [lerp((0.0, -13.5, 6.4), (2.6, -11.8, 4.4), smoothstep(0, 1, (t - times[0]) / span)) for t in times], start)
target.location = (0, 0, 1.3)

kit.render(args, sc)
