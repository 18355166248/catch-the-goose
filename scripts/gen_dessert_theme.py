"""程序化生成「甜品小镇」主题的 9 个物件、图标与陶瓷托盘。

复用 gen_farm_theme.py 的稳定导出/渲染管线；所有几何原创且可重复生成。
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gen_farm_theme as base


C = {
    "pink": (0.92, 0.25, 0.46, 1),
    "pink_light": (1.0, 0.64, 0.73, 1),
    "cocoa": (0.28, 0.075, 0.035, 1),
    "biscuit": (0.76, 0.42, 0.13, 1),
    "vanilla": (0.96, 0.82, 0.55, 1),
    "cream": (1.0, 0.91, 0.72, 1),
    "mint": (0.23, 0.72, 0.55, 1),
    "lavender": (0.50, 0.25, 0.76, 1),
    "berry": (0.66, 0.025, 0.08, 1),
    "lemon": (0.96, 0.69, 0.08, 1),
    "orange": (0.92, 0.28, 0.035, 1),
    "white": (0.97, 0.94, 0.86, 1),
    "gold": (0.72, 0.44, 0.12, 1),
    "black": (0.018, 0.018, 0.015, 1),
}


def torus(name, loc, major, minor, mat, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                     major_segments=24, minor_segments=10,
                                     location=loc, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return obj


def wedge(name, loc, scale, mat):
    """等腰三角柱，尖端朝 +X，适合俯视读成蛋糕切片。"""
    sx, sy, sz = scale
    verts = [
        (sx, 0, -sz), (-sx, -sy, -sz), (-sx, sy, -sz),
        (sx, 0, sz), (-sx, -sy, sz), (-sx, sy, sz),
    ]
    faces = [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3),
             (0, 3, 5, 2), (1, 2, 5, 4)]
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = loc
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new("soft_edges", "BEVEL")
    bevel.width = 0.06
    bevel.segments = 2
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    bpy.ops.object.shade_smooth()
    return obj


def cupcake():
    paper = base.material("cup_paper", C["lemon"], 0.70)
    cake = base.material("cup_cake", C["biscuit"], 0.62)
    pink = base.material("cup_frosting", C["pink"], 0.35)
    berry = base.material("cup_cherry", C["berry"], 0.28)
    parts = [base.cone("wrapper", (0, 0, -0.38), 0.50, 0.43, 0.74, paper, 18),
             base.cylinder("cake", (0, 0, 0.0), 0.42, 0.20, cake, 18)]
    for z, radius in [(0.18, 0.48), (0.48, 0.35), (0.70, 0.21)]:
        parts.append(base.sphere("frosting", (0, 0, z), (radius, radius, radius * 0.58), pink, 18, 10))
    parts.append(base.sphere("cherry", (0, 0, 0.92), (0.13, 0.13, 0.13), berry, 14, 8))
    return base.join(parts, "cupcake")


def donut():
    bread = base.material("donut_bread", C["biscuit"], 0.58)
    cocoa = base.material("donut_cocoa", C["cocoa"], 0.34)
    cream = base.material("donut_sprinkle", C["cream"], 0.60)
    parts = [torus("bread", (0, 0, 0), 0.56, 0.28, bread),
             torus("icing", (0, 0, 0.09), 0.56, 0.235, cocoa)]
    for i in range(9):
        a = i * math.tau / 9 + 0.25
        x, y = math.cos(a) * 0.57, math.sin(a) * 0.57
        sprinkle = base.cylinder("sprinkle", (x, y, 0.34), 0.025, 0.17, cream, 6,
                                  rotation=(math.radians(90), 0, a))
        parts.append(sprinkle)
    return base.join(parts, "donut")


def icecream():
    cone_mat = base.material("icecream_cone", C["biscuit"], 0.72)
    mint = base.material("icecream_mint", C["mint"], 0.38)
    pink = base.material("icecream_berry", C["pink_light"], 0.38)
    cocoa = base.material("icecream_chip", C["cocoa"], 0.35)
    parts = [base.cone("cone", (0, 0, -0.48), 0.08, 0.42, 1.05, cone_mat, 18),
             base.sphere("scoop", (-0.20, 0, 0.30), (0.48, 0.48, 0.46), mint, 20, 12),
             base.sphere("scoop", (0.24, 0, 0.50), (0.43, 0.43, 0.41), pink, 20, 12)]
    for x, y, z in [(0.15, -0.39, 0.56), (0.39, -0.30, 0.68), (-0.29, -0.40, 0.28)]:
        parts.append(base.sphere("chip", (x, y, z), (0.045, 0.025, 0.045), cocoa, 8, 6))
    return base.join(parts, "icecream")


def macaron():
    lavender = base.material("macaron_shell", C["lavender"], 0.44)
    cream = base.material("macaron_cream", C["cream"], 0.55)
    parts = [base.cylinder("shell", (0, 0, -0.24), 0.74, 0.36, lavender, 24),
             base.cylinder("filling", (0, 0, 0), 0.68, 0.19, cream, 24),
             base.cylinder("shell", (0, 0, 0.24), 0.74, 0.36, lavender, 24)]
    for part in parts:
        bevel = part.modifiers.new("round_shell", "BEVEL")
        bevel.width = 0.09
        bevel.segments = 3
        bpy.context.view_layer.objects.active = part
        part.select_set(True)
        bpy.ops.object.modifier_apply(modifier=bevel.name)
        bpy.ops.object.shade_smooth()
    return base.join(parts, "macaron")


def cookie():
    biscuit = base.material("cookie_biscuit", C["biscuit"], 0.76)
    cocoa = base.material("cookie_chip", C["cocoa"], 0.48)
    body = base.cylinder("cookie", (0, 0, 0), 0.80, 0.28, biscuit, 22)
    body.rotation_euler = (math.radians(90), 0, 0)
    base.apply(body)
    parts = [body]
    for x, z, s in [(-0.34, 0.25, 0.09), (0.24, 0.30, 0.07), (0.38, -0.18, 0.10),
                    (-0.15, -0.24, 0.065), (0.05, 0.02, 0.085)]:
        parts.append(base.sphere("chip", (x, -0.16, z), (s, 0.035, s), cocoa, 10, 6))
    return base.join(parts, "cookie")


def cake_slice():
    cake = base.material("cake_vanilla", C["vanilla"], 0.66)
    cream = base.material("cake_cream", C["cream"], 0.46)
    berry = base.material("cake_berry", C["berry"], 0.30)
    pink = base.material("cake_jam", C["pink"], 0.42)
    parts = [wedge("cake", (0, 0, -0.18), (0.85, 0.66, 0.38), cake),
             wedge("cream", (0, 0, 0.26), (0.86, 0.67, 0.10), cream),
             wedge("jam", (-0.06, 0, -0.03), (0.79, 0.61, 0.055), pink)]
    parts.append(base.sphere("berry", (-0.40, 0, 0.51), (0.15, 0.15, 0.15), berry, 14, 8))
    return base.join(parts, "cake_slice")


def candy():
    pink = base.material("candy_pink", C["pink"], 0.32)
    lemon = base.material("candy_wrapper", C["lemon"], 0.50)
    white = base.material("candy_stripe", C["white"], 0.55)
    parts = [base.cylinder("body", (0, 0, 0), 0.42, 1.02, pink, 18,
                                   rotation=(0, math.radians(90), 0)),
             base.cylinder("stripe", (0, 0, 0), 0.435, 0.20, white, 18,
                           rotation=(0, math.radians(90), 0))]
    for side in (-1, 1):
        wrap = base.cone("wrapper", (0.72 * side, 0, 0), 0.42, 0.10, 0.48, lemon, 8,
                         rotation=(0, math.radians(90 * side), 0))
        parts.append(wrap)
    return base.join(parts, "candy")


def pudding():
    custard = base.material("pudding_custard", C["lemon"], 0.38)
    caramel = base.material("pudding_caramel", C["cocoa"], 0.28)
    cream = base.material("pudding_cream", C["cream"], 0.44)
    parts = [base.cone("custard", (0, 0, -0.08), 0.66, 0.48, 1.02, custard, 24),
             base.cylinder("caramel", (0, 0, 0.49), 0.49, 0.12, caramel, 24),
             base.sphere("cream", (0, 0, 0.69), (0.23, 0.23, 0.15), cream, 16, 10)]
    return base.join(parts, "pudding")


def croissant():
    gold = base.material("croissant_gold", C["gold"], 0.62)
    light = base.material("croissant_highlight", C["vanilla"], 0.65)
    parts = []
    for i in range(9):
        t = i / 8
        a = math.radians(205 - 230 * t)
        x, y = math.cos(a) * 0.72, math.sin(a) * 0.50
        radius = 0.17 + 0.23 * math.sin(math.pi * t)
        parts.append(base.sphere("segment", (x, y, 0), (radius * 1.25, radius, radius),
                                 light if i in (3, 5) else gold, 16, 10))
    return base.join(parts, "croissant")


def dessert_tray():
    porcelain = base.material("tray_porcelain", C["white"], 0.26)
    pink = base.material("tray_pink", C["pink_light"], 0.42)
    gold = base.material("tray_gold", C["gold"], 0.36)
    parts = [base.cube("base", (0, 0, -0.12), (3.0, 2.70, 0.13), porcelain, 0.18),
             base.cube("inset", (0, 0, 0.015), (2.74, 2.44, 0.045), pink, 0.14)]
    for z, thickness, mat in [(0.18, 0.13, porcelain), (0.38, 0.08, gold)]:
        parts.extend([
            base.cube("rim", (0, 2.68, z), (3.10, thickness, thickness), mat, 0.09),
            base.cube("rim", (0, -2.68, z), (3.10, thickness, thickness), mat, 0.09),
            base.cube("rim", (3.04, 0, z), (thickness, 2.57, thickness), mat, 0.09),
            base.cube("rim", (-3.04, 0, z), (thickness, 2.57, thickness), mat, 0.09),
        ])
    return base.join(parts, "tray_dessert")


BUILDERS = [
    ("cupcake", cupcake),
    ("donut", donut),
    ("icecream", icecream),
    ("macaron", macaron),
    ("cookie", cookie),
    ("cake_slice", cake_slice),
    ("candy", candy),
    ("pudding", pudding),
    ("croissant", croissant),
]


if __name__ == "__main__":
    for model_name, builder in BUILDERS:
        base.wipe()
        model = builder()
        base.export_glb(model, model_name)
        base.render_icon(model, model_name)

    base.wipe()
    tray = dessert_tray()
    base.export_glb(tray, "tray_dessert", normalize_item=False)
    print("ALL DONE", base.MODELS, base.ICONS)
