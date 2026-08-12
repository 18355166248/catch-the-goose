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


def rounded_loop(half_w: float, half_h: float, radius: float,
                 lobe: float = 0.0, segments: int = 7):
    """逆时针生成圆角矩形轮廓；lobe 将四角中段外推，形成设计稿的波浪瓷胎。"""
    points = []
    for cx, cy, start in [
        (half_w - radius, half_h - radius, 0),
        (-half_w + radius, half_h - radius, 90),
        (-half_w + radius, -half_h + radius, 180),
        (half_w - radius, -half_h + radius, 270),
    ]:
        for step in range(segments + 1):
            angle = math.radians(start + 90 * step / segments)
            corner_radius = radius + lobe * math.sin(math.pi * step / segments)
            points.append((cx + math.cos(angle) * corner_radius,
                           cy + math.sin(angle) * corner_radius))
    return points


def rounded_prism(name, half_w, half_h, radius, z_bottom, z_top, mat,
                  bevel=0.04, lobe=0.0):
    loop = rounded_loop(half_w, half_h, radius, lobe)
    count = len(loop)
    verts = [(x, y, z_bottom) for x, y in loop] + [(x, y, z_top) for x, y in loop]
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for i in range(count):
        j = (i + 1) % count
        faces.append((i, j, count + j, count + i))
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new("soft_porcelain_edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.ops.object.shade_smooth()
    return obj


def rounded_ring(name, outer, inner, z_bottom, z_top, mat, bevel=0.035):
    """带真实内侧面的圆角矩形环，避免旧版四根直条在角上露接缝。"""
    outer_loop = rounded_loop(*outer)
    inner_loop = rounded_loop(*inner)
    count = len(outer_loop)
    verts = (
        [(x, y, z_bottom) for x, y in outer_loop]
        + [(x, y, z_top) for x, y in outer_loop]
        + [(x, y, z_bottom) for x, y in inner_loop]
        + [(x, y, z_top) for x, y in inner_loop]
    )
    faces = []
    for i in range(count):
        j = (i + 1) % count
        ob_i, ob_j = i, j
        ot_i, ot_j = count + i, count + j
        ib_i, ib_j = count * 2 + i, count * 2 + j
        it_i, it_j = count * 3 + i, count * 3 + j
        faces.extend([
            (ob_i, ob_j, ot_j, ot_i),
            (ot_i, ot_j, it_j, it_i),
            (ib_j, ib_i, it_i, it_j),
            (ob_j, ob_i, ib_i, ib_j),
        ])
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new("rounded_rim", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.ops.object.shade_smooth()
    return obj


def textured_quad(name, width, height, z, image_path):
    """创建水平不透明贴图面；用于把确认稿的盘心材质烘到低模容器顶面。"""
    hw, hh = width * 0.5, height * 0.5
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata([(-hw, -hh, z), (hw, -hh, z), (hw, hh, z), (-hw, hh, z)],
                     [], [(0, 1, 2, 3)])
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for loop, uv in zip(mesh.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
        uv_layer.data[loop.index].uv = uv

    mat = bpy.data.materials.new(name + "Material")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    image_node = nodes.new("ShaderNodeTexImage")
    image_node.image = bpy.data.images.load(str(image_path), check_existing=True)
    # 显式把 UVMap 接入纹理向量；仅创建 mesh UV 在 Blender 5 glTF 导出器中会生成
    # texCoord=-1，Cocos 因而只能显示材质底色。
    uv_node = nodes.new("ShaderNodeUVMap")
    uv_node.uv_map = uv_layer.name
    mat.node_tree.links.new(uv_node.outputs["UV"], image_node.inputs["Vector"])
    mat.node_tree.links.new(image_node.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.48

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
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
    porcelain = base.material("tray_porcelain", (1.0, 0.88, 0.70, 1), 0.25)
    porcelain_shadow = base.material("tray_porcelain_shadow", (0.52, 0.24, 0.22, 1), 0.48)
    blush = base.material("tray_quilt_light", (1.0, 0.66, 0.72, 1), 0.43)
    blush_alt = base.material("tray_quilt_dark", (0.92, 0.46, 0.58, 1), 0.46)
    rose = base.material("tray_rose_enamel", (0.58, 0.055, 0.16, 1), 0.30)
    berry = base.material("tray_strawberry", (0.82, 0.045, 0.055, 1), 0.34)
    cream = base.material("tray_cream", (1.0, 0.91, 0.70, 1), 0.38)
    leaf_green = base.material("tray_leaf", (0.16, 0.48, 0.12, 1), 0.54)
    gold = base.material("tray_gold", (0.78, 0.36, 0.045, 1), 0.25)
    gold.node_tree.nodes["Principled BSDF"].inputs["Metallic"].default_value = 0.55

    # 按确认稿建立“暗色脚座 → 波浪奶油瓷胎 → 深玫红珐琅 → 菱格软垫”四层顶视结构。
    # 这些层次都能被近正俯视相机看见，不再依赖侧面厚度或微小倒角来表达质感。
    parts = [
        rounded_prism("tray_foot", 2.98, 2.48, 0.44, -0.38, -0.21,
                      porcelain_shadow, 0.055, lobe=0.16),
        rounded_prism("tray_body", 3.17, 2.72, 0.54, -0.26, 0.06,
                      porcelain, 0.075, lobe=0.30),
        rounded_prism("tray_well", 2.88, 2.35, 0.36, -0.01, 0.075,
                      blush, 0.035),
        rounded_ring("rose_enamel", (3.01, 2.55, 0.42, 0.10),
                     (2.74, 2.25, 0.31, 0.0), 0.30, 0.58, rose, 0.032),
        rounded_ring("porcelain_rim", (3.17, 2.72, 0.54, 0.30),
                     (3.01, 2.55, 0.42, 0.10), 0.38, 0.68, porcelain, 0.038),
        rounded_ring("inner_gold_piping", (2.78, 2.29, 0.33),
                     (2.67, 2.18, 0.28), 0.52, 0.64, gold, 0.015),
        rounded_ring("outer_gold_piping", (3.22, 2.77, 0.56, 0.30),
                     (3.12, 2.67, 0.50, 0.23), 0.65, 0.76, gold, 0.015),
    ]

    # 只烘焙确认稿的菱格软包盘心，外圈珐琅、金边、把手和角饰仍使用真实 3D 轮廓。
    # 不透明内衬可规避 glTF 对透明贴图 UV/排序的兼容差异，盘心略高于低模底板、仍低于
    # y=0 的物理停靠面，因此不会改变甜品的掉落与堆叠。
    texture_path = base.ROOT / "design/dessert-theme/textures/tray-liner-v1.jpg"
    parts.append(textured_quad("tray_painted_liner", 5.30, 4.32, 0.145, texture_path))

    # 四角草莓奶油是确认稿的主题锚点。装饰只占宽瓷沿，不进入可玩内区；草莓用两个果瓣、
    # 奶油用三层旋涡体概括，移动端缩小后仍读得出来，同时避免不可控的高面数雕刻。
    for x in (-2.77, 2.77):
        for y in (-2.34, 2.34):
            inward_x = -1 if x > 0 else 1
            inward_y = -1 if y > 0 else 1
            cream_x, cream_y = x + inward_x * 0.14, y + inward_y * 0.12
            for dz, radius in [(0.67, 0.28), (0.79, 0.20), (0.90, 0.12)]:
                parts.append(base.sphere("corner_cream", (cream_x, cream_y, dz),
                                         (radius, radius, radius * 0.48), cream, 14, 8))
            berry_x, berry_y = x - inward_x * 0.15, y - inward_y * 0.05
            parts.append(base.sphere("corner_strawberry", (berry_x, berry_y, 0.78),
                                     (0.29, 0.24, 0.19), berry, 16, 10))
            for angle in (-35, 0, 35):
                a = math.radians(angle + (145 if y > 0 else -35))
                leaf = base.ico("strawberry_leaf",
                                (berry_x + math.cos(a) * 0.13,
                                 berry_y + math.sin(a) * 0.13, 0.89),
                                (0.17, 0.08, 0.045), leaf_green, 1)
                leaf.rotation_euler.z = a
                parts.append(leaf)
            for ox, oy in [(-0.07, -0.04), (0.05, -0.02), (0, 0.07)]:
                parts.append(base.sphere("strawberry_seed",
                                         (berry_x + ox, berry_y + oy, 0.91),
                                         (0.018, 0.012, 0.012), gold, 8, 5))

    # 椭圆金属把手必须伸出主体轮廓才看得见。dessert 皮肤会单独放大视觉容器，保证把手
    # 加宽后内盘仍与原物理边界对齐，不会为了装饰反向压小可玩空间。
    for side in (-1, 1):
        handle = torus("serving_handle", (3.38 * side, 0, 0.52), 0.30, 0.075, gold)
        handle.scale = (0.62, 1.55, 1)
        base.apply(handle)
        parts.append(handle)
        for y in (-0.28, 0.28):
            parts.append(base.sphere("handle_mount", (3.08 * side, y, 0.54),
                                     (0.14, 0.16, 0.10), rose, 12, 8))
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
    # 容器精修时使用 --container-only，避免重导出无关甜品和槽位图标。
    if "--container-only" not in sys.argv:
        for model_name, builder in BUILDERS:
            base.wipe()
            model = builder()
            base.export_glb(model, model_name)
            base.render_icon(model, model_name)

    base.wipe()
    tray = dessert_tray()
    base.export_glb(tray, "tray_dessert", normalize_item=False)
    print("ALL DONE", base.MODELS, base.ICONS)
