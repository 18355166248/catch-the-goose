"""程序化生成「池塘农场」主题的 9 个物件、图标与藤编收获篮。

面向 Blender 4.x headless，所有随机因素固定，重复执行会稳定覆盖同名产物。
物件统一归一化到最大边 1.0；容器保留横纵比例，由游戏运行时按开口跨度缩放。

用法：
  /Applications/Blender.app/Contents/MacOS/Blender --background \
    --python scripts/gen_farm_theme.py
"""
from __future__ import annotations

import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "game/assets/resources/models"
ICONS = ROOT / "game/assets/resources/icons"

C = {
    "leaf": (0.10, 0.42, 0.11, 1),
    "leaf_light": (0.25, 0.62, 0.16, 1),
    "orange": (0.92, 0.28, 0.035, 1),
    "yellow": (0.96, 0.67, 0.05, 1),
    "purple": (0.29, 0.055, 0.42, 1),
    "frog": (0.24, 0.64, 0.16, 1),
    "cream": (0.88, 0.73, 0.48, 1),
    "red": (0.72, 0.045, 0.035, 1),
    "teal": (0.055, 0.43, 0.58, 1),
    "pink": (0.91, 0.32, 0.50, 1),
    "white": (0.96, 0.91, 0.78, 1),
    "black": (0.018, 0.022, 0.018, 1),
    "wood": (0.48, 0.23, 0.08, 1),
    "wicker": (0.72, 0.46, 0.18, 1),
    "wicker_light": (0.84, 0.63, 0.31, 1),
}


def wipe() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.meshes, bpy.data.materials, bpy.data.curves,
                       bpy.data.cameras, bpy.data.lights):
        for block in list(collection):
            try:
                collection.remove(block)
            except RuntimeError:
                pass


def material(name: str, color, roughness: float = 0.48):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def apply(obj) -> None:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def sphere(name: str, loc, scale, mat, segments=20, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings,
                                         location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    apply(obj)
    bpy.ops.object.shade_smooth()
    obj.data.materials.append(mat)
    return obj


def ico(name: str, loc, scale, mat, subdivisions=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1,
                                          location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    apply(obj)
    bpy.ops.object.shade_smooth()
    obj.data.materials.append(mat)
    return obj


def cylinder(name: str, loc, radius, depth, mat, vertices=12, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                        location=loc, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return obj


def cone(name: str, loc, r1, r2, depth, mat, vertices=12, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2,
                                    depth=depth, location=loc, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return obj


def cube(name: str, loc, scale, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    apply(obj)
    if bevel:
        mod = obj.modifiers.new("soft_edges", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.ops.object.shade_smooth()
    obj.data.materials.append(mat)
    return obj


def join(parts, name: str):
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    return obj


def normalize(obj) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    low = Vector((min(v.co[i] for v in obj.data.vertices) for i in range(3)))
    high = Vector((max(v.co[i] for v in obj.data.vertices) for i in range(3)))
    center = (low + high) * 0.5
    scale = 1.0 / (max(high - low) or 1.0)
    obj.scale = (scale,) * 3
    obj.location = -center * scale
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def export_glb(obj, name: str, normalize_item=True) -> None:
    if normalize_item:
        normalize(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    MODELS.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(MODELS / f"{name}.glb"),
                              export_format="GLB", use_selection=True)
    print("BUILT", name, "faces=", len(obj.data.polygons))


def look_at(obj, target=(0, 0, 0)) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def render_icon(obj, name: str) -> None:
    scene = bpy.context.scene
    # Blender 5.2 把 Eevee 枚举名从 4.x 的 BLENDER_EEVEE_NEXT 改回 BLENDER_EEVEE。
    # 运行时按当前版本实际暴露的枚举选择，避免脚本在两代 Blender 间失效。
    engines = bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items.keys()
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
    scene.render.resolution_x = 192
    scene.render.resolution_y = 192
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.look = "AgX - Medium High Contrast"

    camera_data = bpy.data.cameras.new("IconCamera")
    camera = bpy.data.objects.new("IconCamera", camera_data)
    scene.collection.objects.link(camera)
    camera.location = (2.7, -4.2, 2.9)
    camera_data.type = "ORTHO"
    look_at(camera)
    scene.camera = camera

    camera_inv = camera.matrix_world.inverted()
    points = [camera_inv @ (obj.matrix_world @ Vector(corner)) for corner in obj.bound_box]
    width = max(p.x for p in points) - min(p.x for p in points)
    height = max(p.y for p in points) - min(p.y for p in points)
    camera_data.ortho_scale = max(width, height) * 1.28

    for index, (location, energy, size, color) in enumerate([
        ((3.5, -4.0, 5.5), 800, 4.0, (1.0, 0.86, 0.68)),
        ((-4.0, -1.0, 3.0), 500, 4.5, (0.62, 0.80, 1.0)),
        ((1.0, 4.0, 4.0), 550, 3.0, (0.76, 1.0, 0.82)),
    ]):
        data = bpy.data.lights.new(f"IconLight{index}", "AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        data.color = color
        light = bpy.data.objects.new(f"IconLight{index}", data)
        scene.collection.objects.link(light)
        light.location = location
        look_at(light)

    ICONS.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(ICONS / f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print("ICON", name)


def carrot():
    orange = material("carrot_orange", C["orange"], 0.58)
    green = material("carrot_leaf", C["leaf"], 0.62)
    parts = [cone("root", (0, 0, -0.18), 0.38, 0.08, 1.55, orange, 16)]
    for angle in (-0.45, 0, 0.45):
        parts.append(cone("leaf", (math.sin(angle) * 0.16, 0, 0.78),
                          0.13, 0.025, 0.75, green, 8,
                          rotation=(0, angle, 0)))
    return join(parts, "carrot")


def corn():
    yellow = material("corn_kernel", C["yellow"], 0.52)
    green = material("corn_husk", C["leaf"], 0.63)
    parts = [sphere("cob", (0, 0, 0.05), (0.48, 0.48, 1.05), yellow, 22, 14)]
    for side in (-1, 1):
        leaf = ico("husk", (0.34 * side, 0, -0.30), (0.22, 0.11, 0.95), green, 2)
        leaf.rotation_euler = (0, math.radians(18 * side), 0)
        parts.append(leaf)
    return join(parts, "corn")


def eggplant():
    purple = material("eggplant_purple", C["purple"], 0.32)
    green = material("eggplant_calyx", C["leaf"], 0.58)
    parts = [sphere("body", (0, 0, -0.20), (0.58, 0.54, 1.05), purple, 24, 16)]
    for i in range(5):
        a = i * math.tau / 5
        leaf = ico("calyx", (math.cos(a) * 0.23, math.sin(a) * 0.23, 0.76),
                   (0.34, 0.13, 0.10), green, 1)
        leaf.rotation_euler = (0, 0, a)
        parts.append(leaf)
    parts.append(cylinder("stem", (0, 0, 1.02), 0.09, 0.42, green, 8,
                            rotation=(0, math.radians(-12), 0)))
    return join(parts, "eggplant")


def frog():
    green = material("frog_green", C["frog"], 0.45)
    cream = material("frog_belly", C["cream"], 0.62)
    black = material("frog_eye", C["black"], 0.26)
    parts = [sphere("body", (0, 0, -0.12), (0.75, 0.63, 0.48), green),
             sphere("head", (0, -0.08, 0.43), (0.62, 0.54, 0.43), green),
             sphere("belly", (0, -0.50, -0.06), (0.38, 0.10, 0.29), cream, 16, 10)]
    for side in (-1, 1):
        parts.append(sphere("eye", (0.34 * side, -0.30, 0.72), (0.16, 0.15, 0.17), green, 16, 10))
        parts.append(sphere("pupil", (0.34 * side, -0.43, 0.74), (0.065, 0.04, 0.08), black, 12, 8))
        parts.append(ico("leg", (0.67 * side, 0.08, -0.31), (0.42, 0.24, 0.15), green, 2))
    return join(parts, "frog")


def pumpkin():
    orange = material("pumpkin_orange", C["orange"], 0.60)
    green = material("pumpkin_stem", C["leaf"], 0.66)
    parts = []
    for i in range(8):
        a = i * math.tau / 8
        parts.append(sphere("lobe", (math.cos(a) * 0.24, math.sin(a) * 0.24, 0),
                            (0.46, 0.46, 0.66), orange, 18, 12))
    parts.append(cone("stem", (0, 0, 0.72), 0.13, 0.08, 0.42, green, 8))
    return join(parts, "pumpkin")


def mushroom():
    red = material("mushroom_red", C["red"], 0.48)
    cream = material("mushroom_cream", C["white"], 0.70)
    parts = [sphere("cap", (0, 0, 0.38), (0.82, 0.82, 0.42), red, 24, 14),
             cone("stem", (0, 0, -0.28), 0.28, 0.19, 0.95, cream, 14)]
    for x, y, s in [(-0.28, -0.52, 0.10), (0.26, -0.57, 0.12),
                    (0.02, -0.69, 0.08), (0.44, -0.34, 0.07)]:
        parts.append(sphere("spot", (x, y, 0.50), (s, 0.045, s), cream, 12, 8))
    return join(parts, "mushroom")


def koi():
    teal = material("koi_teal", C["teal"], 0.30)
    orange = material("koi_orange", C["orange"], 0.43)
    white = material("koi_fin", C["white"], 0.60)
    black = material("koi_eye", C["black"], 0.24)
    parts = [sphere("body", (0, 0, 0), (1.05, 0.48, 0.43), teal, 24, 14),
             sphere("patch", (0.24, -0.40, 0.16), (0.31, 0.08, 0.22), orange, 14, 8)]
    for side in (-1, 1):
        tail = ico("tail", (-1.00, 0.34 * side, 0), (0.46, 0.29, 0.10), orange, 1)
        tail.rotation_euler = (0, 0, math.radians(24 * side))
        parts.append(tail)
        parts.append(sphere("eye", (0.70, -0.39, 0.18 * side), (0.07, 0.035, 0.07), black, 10, 6))
    top_fin = ico("fin", (-0.10, 0, 0.42), (0.38, 0.08, 0.23), white, 1)
    parts.append(top_fin)
    return join(parts, "koi")


def lotus():
    pink = material("lotus_pink", C["pink"], 0.42)
    pale = material("lotus_pale", (1.0, 0.65, 0.74, 1), 0.48)
    yellow = material("lotus_center", C["yellow"], 0.62)
    parts = [sphere("center", (0, 0, 0.24), (0.25, 0.25, 0.17), yellow, 16, 10)]
    for ring, count, radius, scale, mat in [
        (0, 8, 0.48, (0.52, 0.19, 0.18), pink),
        (1, 6, 0.30, (0.40, 0.15, 0.30), pale),
    ]:
        for i in range(count):
            a = i * math.tau / count + ring * 0.25
            petal = ico("petal", (math.cos(a) * radius, math.sin(a) * radius, 0.10 + ring * 0.12),
                        scale, mat, 2)
            petal.rotation_euler = (0, math.radians(-18 - ring * 20), a)
            parts.append(petal)
    return join(parts, "lotus")


def duck():
    yellow = material("duck_yellow", C["yellow"], 0.50)
    orange = material("duck_bill", C["orange"], 0.58)
    black = material("duck_eye", C["black"], 0.25)
    parts = [sphere("body", (0, 0.05, -0.10), (0.86, 0.62, 0.58), yellow),
             sphere("head", (0.42, -0.08, 0.55), (0.46, 0.43, 0.44), yellow)]
    bill = ico("bill", (0.82, -0.22, 0.49), (0.34, 0.22, 0.10), orange, 1)
    parts.append(bill)
    for side in (-1, 1):
        wing = ico("wing", (-0.06, 0.48 * side, 0.04), (0.50, 0.15, 0.28), yellow, 2)
        wing.rotation_euler = (0, 0, math.radians(8 * side))
        parts.append(wing)
        parts.append(sphere("eye", (0.64, -0.34, 0.68 + 0.0 * side), (0.06, 0.035, 0.06), black, 10, 6))
        break
    return join(parts, "duck")


def harvest_basket():
    # 容器在游戏里只有约 320px 宽，精致感主要来自清楚的三层关系：深色内衬托住
    # 交错编织、立桩形成侧壁节奏、双层包边压住轮廓。不能靠贴满细线堆细节，缩小后会糊。
    shadow = material("basket_shadow", (0.24, 0.085, 0.025, 1), 0.82)
    dark = material("basket_dark", (0.43, 0.18, 0.045, 1), 0.72)
    wicker = material("basket_honey", (0.72, 0.38, 0.095, 1), 0.66)
    light = material("basket_straw", (0.92, 0.66, 0.27, 1), 0.62)
    parts = [
        cube("shadow_plinth", (0, 0, -0.20), (3.02, 2.68, 0.10), shadow, 0.16),
        cube("woven_liner", (0, 0, -0.075), (2.82, 2.48, 0.055), dark, 0.12),
    ]

    # 短藤片按经纬交替铺陈，和旧版贯穿整筐的横竖栅格不同；每格方向翻转后才会读成
    # 真正的压一挑一编织，而不是铁丝网。底面始终低于 y=0 的物理停靠面，不顶起物件。
    for row in range(-5, 6):
        for col in range(-6, 7):
            horizontal = (row + col) % 2 == 0
            sx, sy = (0.205, 0.105) if horizontal else (0.105, 0.205)
            parts.append(cube(
                "weave_tile",
                (col * 0.42, row * 0.42, 0.01 + (0.012 if horizontal else 0)),
                (sx, sy, 0.035),
                light if horizontal else wicker,
                0,
            ))

    # 四边立桩给侧壁真实高度，间距略宽于底部纹理，避免缩小后形成摩尔纹。
    for col in range(-6, 7):
        x = col * 0.43
        for y in (-2.55, 2.55):
            parts.append(cube("wall_stake", (x, y, 0.34), (0.075, 0.10, 0.38),
                              light if col % 2 else wicker, 0))
    for row in range(-5, 6):
        y = row * 0.44
        for x in (-2.90, 2.90):
            parts.append(cube("wall_stake", (x, y, 0.34), (0.10, 0.075, 0.38),
                              wicker if row % 2 else light, 0))

    # 下束带收住侧壁，顶部用深色承托 + 蜂蜜色包边形成厚实的手工篮沿。
    for z, thickness, mat in [
        (0.14, 0.095, dark),
        (0.66, 0.15, shadow),
        (0.72, 0.105, light),
    ]:
        parts.extend([
            cube("rim", (0, 2.66, z), (3.10, thickness, thickness), mat, 0.09),
            cube("rim", (0, -2.66, z), (3.10, thickness, thickness), mat, 0.09),
            cube("rim", (3.01, 0, z), (thickness, 2.55, thickness), mat, 0.09),
            cube("rim", (-3.01, 0, z), (thickness, 2.55, thickness), mat, 0.09),
        ])

    # 四角包柱遮住四组直条的拼缝，也让外轮廓在农场浅色背景上保持完整。
    for x in (-3.00, 3.00):
        for y in (-2.65, 2.65):
            parts.append(cylinder("corner_wrap", (x, y, 0.34), 0.16, 0.88,
                                  dark, 12))
    return join(parts, "basket_farm")


BUILDERS = [
    ("carrot", carrot),
    ("corn", corn),
    ("eggplant", eggplant),
    ("frog", frog),
    ("pumpkin", pumpkin),
    ("mushroom", mushroom),
    ("koi", koi),
    ("lotus", lotus),
    ("duck", duck),
]


if __name__ == "__main__":
    # 容器精修时使用 --container-only，避免无关的 9 个物件和图标被 Blender 重导出。
    if "--container-only" not in sys.argv:
        for model_name, builder in BUILDERS:
            wipe()
            model = builder()
            export_glb(model, model_name)
            render_icon(model, model_name)

    wipe()
    basket = harvest_basket()
    export_glb(basket, "basket_farm", normalize_item=False)
    print("ALL DONE", MODELS, ICONS)
