"""Generate v2 antique-theme GLB candidates with Blender 4.5.

Single-model example:

  blender --background --python scripts/gen_antique_theme_v2.py -- tongqian

Candidates are intentionally written outside Cocos resources. Promote a GLB only after the
fixed-camera, side, and back audit views pass.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "assets-3d/candidates/v2"


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials):
        for datablock in list(datablocks):
            datablocks.remove(datablock)


def material(name: str, color: tuple[float, float, float, float], *, metalness: float,
             roughness: float) -> bpy.types.Material:
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    principled = result.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Metallic"].default_value = metalness
    principled.inputs["Roughness"].default_value = roughness
    return result


def apply_modifiers(obj: bpy.types.Object) -> None:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    for modifier in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=modifier.name)


def join(objects: list[bpy.types.Object], name: str) -> bpy.types.Object:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    objects[0].name = name
    return objects[0]


def bevel(obj: bpy.types.Object, width: float, segments: int = 2) -> None:
    modifier = obj.modifiers.new("edge-softness", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    apply_modifiers(obj)


def curve_stroke(name: str, points: list[tuple[float, float]], z: float,
                 radius: float, mat: bpy.types.Material) -> bpy.types.Object:
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    curve.resolution_u = 2
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, (x, y) in zip(spline.points, points):
        point.co = (x, y, z, 1.0)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    return bpy.context.active_object


def curve_stroke_3d(name: str, points: list[tuple[float, float, float]], radius: float,
                    mat: bpy.types.Material) -> bpy.types.Object:
    """在任意曲面方向生成粗线浮雕，适合无法投影到统一 XY 平面的装饰路径。"""
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, (x, y, z) in zip(spline.points, points):
        point.co = (x, y, z, 1.0)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    return bpy.context.active_object


def normalize_export_parts(objects: list[bpy.types.Object], name: str, output: Path) -> None:
    """整套部件共享中心与比例，避免候选导出后凸缘、钱文和主体相互错位。"""
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    low = Vector((1e9, 1e9, 1e9))
    high = Vector((-1e9, -1e9, -1e9))
    for obj in objects:
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            low = Vector(min(low[i], point[i]) for i in range(3))
            high = Vector(max(high[i], point[i]) for i in range(3))
    center = (low + high) * 0.5
    scale = 1.0 / (max(high - low) or 1.0)

    for obj in objects:
        obj.location = (obj.location - center) * scale
        obj.scale = (scale, scale, scale)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    output.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=str(output / f"{name}.glb"),
        export_format="GLB",
        use_selection=True,
    )
    triangles = sum(len(poly.vertices) - 2 for obj in objects for poly in obj.data.polygons)
    print("BUILT", name, "parts=", [obj.name for obj in objects], "triangles=", triangles)


def make_tongqian(output: Path) -> None:
    # 古玩铺环境反射较弱，高金属度会把铜色压成近黑；让漫反射主导颜色，凸缘仍保留金属高光。
    bronze = material("tongqian_bronze", (0.58, 0.26, 0.055, 1), metalness=0.45,
                      roughness=0.46)
    worn = material("tongqian_worn_edges", (0.86, 0.50, 0.12, 1), metalness=0.52,
                    roughness=0.36)
    dark = material("tongqian_recess", (0.28, 0.11, 0.03, 1), metalness=0.34,
                    roughness=0.66)
    patina = material("tongqian_patina", (0.045, 0.20, 0.14, 1), metalness=0.32,
                      roughness=0.76)

    # 先用真正的布尔开孔建立连续方孔隧道；旧模型的问题正是把中心顶点压低成漏斗。
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=1.0, depth=0.12)
    body = bpy.context.active_object
    body.name = "coin-body"
    body.data.materials.append(dark)
    bevel(body, 0.025, 3)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
    cutter = bpy.context.active_object
    cutter.name = "square-hole-cutter"
    cutter.scale = (0.43, 0.43, 0.40)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel(cutter, 0.035, 3)
    boolean = body.modifiers.new("true-square-through-hole", "BOOLEAN")
    boolean.operation = "DIFFERENCE"
    boolean.solver = "EXACT"
    boolean.object = cutter
    apply_modifiers(body)
    bpy.data.objects.remove(cutter, do_unlink=True)
    for polygon in body.data.polygons:
        polygon.use_smooth = True

    # 外缘使用圆管凸起控制高光，内方框由四条带倒角的实体梁构成，中心负空间始终保持开放。
    bpy.ops.mesh.primitive_torus_add(major_radius=0.87, minor_radius=0.075,
                                     major_segments=64, minor_segments=8,
                                     location=(0, 0, 0.072))
    outer_rim = bpy.context.active_object
    outer_rim.name = "outer-rim"
    outer_rim.data.materials.append(worn)
    for polygon in outer_rim.data.polygons:
        polygon.use_smooth = True

    square_parts = []
    rail_specs = [
        ((0, 0.275, 0.084), (0.56, 0.085, 0.085)),
        ((0, -0.275, 0.084), (0.56, 0.085, 0.085)),
        ((0.275, 0, 0.084), (0.085, 0.56, 0.085)),
        ((-0.275, 0, 0.084), (0.085, 0.56, 0.085)),
    ]
    for index, (location, scale) in enumerate(rail_specs):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
        rail = bpy.context.active_object
        rail.name = f"inner-rim-{index}"
        rail.scale = scale
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        rail.data.materials.append(worn)
        bevel(rail, 0.035, 3)
        square_parts.append(rail)
    inner_rim = join(square_parts, "inner-rim")

    # 四向钱文采用原创的宽笔画浮雕，不使用可读历史文字；粗线在手机俯视画面中比细刻纹稳定。
    strokes = []
    stroke_sets = [
        [(-0.19, 0.54), (0.19, 0.54)], [(0, 0.54), (0, 0.73)],
        [(-0.16, 0.70), (0, 0.80), (0.16, 0.70)],
        [(-0.19, -0.54), (0.19, -0.54)], [(0, -0.54), (0, -0.76)],
        [(-0.17, -0.70), (0, -0.80), (0.17, -0.70)],
        [(-0.55, 0.18), (-0.73, 0.18), (-0.73, 0), (-0.55, 0), (-0.55, -0.18), (-0.73, -0.18)],
        [(0.55, 0.18), (0.73, 0.18), (0.73, 0), (0.55, 0), (0.55, -0.18), (0.73, -0.18)],
    ]
    for index, points in enumerate(stroke_sets):
        strokes.append(curve_stroke(f"glyph-stroke-{index}", points, 0.135, 0.045, bronze))
    glyphs = join(strokes, "glyph-system")

    # 绿锈只放在少量凹槽接触点，提供年代感但不把整枚铜钱染绿。
    patina_parts = []
    for index, (x, y, sx, sy) in enumerate([
        (-0.56, 0.29, 0.13, 0.025), (0.57, -0.30, 0.11, 0.022),
        (-0.29, -0.50, 0.09, 0.02), (0.31, 0.51, 0.08, 0.02),
    ]):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=6, radius=1.0,
                                             location=(x, y, 0.071))
        spot = bpy.context.active_object
        spot.name = f"patina-{index}"
        spot.scale = (sx, sy, 0.008)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        spot.data.materials.append(patina)
        patina_parts.append(spot)
    patina_marks = join(patina_parts, "patina-marks")

    normalize_export_parts([body, outer_rim, inner_rim, glyphs, patina_marks], "tongqian", output)


def make_bracelet(output: Path) -> None:
    # 紫晶、鎏金和浅玉必须在古玩铺偏绿环境光下仍能分区，因此不用过高金属度或透明材质。
    amethyst = material("bracelet_amethyst", (0.30, 0.07, 0.50, 1), metalness=0.04,
                        roughness=0.30)
    amethyst_light = material("bracelet_amethyst_highlight", (0.50, 0.16, 0.72, 1),
                              metalness=0.03, roughness=0.25)
    antique_gold = material("bracelet_antique_gold", (0.82, 0.43, 0.075, 1),
                            metalness=0.48, roughness=0.34)
    gold_shadow = material("bracelet_gold_recess", (0.28, 0.095, 0.018, 1),
                           metalness=0.25, roughness=0.58)
    cord_mat = material("bracelet_wine_cord", (0.18, 0.012, 0.035, 1), metalness=0.0,
                        roughness=0.78)
    jade = material("bracelet_pale_jade", (0.50, 0.79, 0.61, 1), metalness=0.0,
                    roughness=0.38)

    # 绳体先建立完整闭环，珠粒之间保留少量间隙，避免旧模型缩小时重新融合成一圈球形噪点。
    bpy.ops.mesh.primitive_torus_add(major_radius=1.23, minor_radius=0.045,
                                     major_segments=48, minor_segments=6)
    cord = bpy.context.active_object
    cord.name = "elastic-cord"
    cord.data.materials.append(cord_mat)
    for polygon in cord.data.polygons:
        polygon.use_smooth = True

    beads = []
    spacers = []
    ring_radius = 1.23
    spacer_slots = {4, 8, 12}
    for index in range(16):
        angle = -math.pi / 2 + index * math.tau / 16
        x, y = ring_radius * math.cos(angle), ring_radius * math.sin(angle)
        if index == 0:
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.34,
                                                  location=(x, y, 0.015))
            focal = bpy.context.active_object
            focal.name = "focal-gold-bead"
            focal.scale = (1.08, 0.94, 0.92)
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            focal.data.materials.append(antique_gold)
            beads.append(focal)
        elif index in spacer_slots:
            bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=0.15,
                                                 location=(x, y, 0))
            spacer = bpy.context.active_object
            spacer.name = f"gold-spacer-{index}"
            # 隔珠沿圆周方向略扁，正面仍保留足够的金色面积作为节奏点。
            spacer.scale = (0.78 + 0.20 * abs(math.cos(angle)),
                            0.78 + 0.20 * abs(math.sin(angle)), 0.82)
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            spacer.data.materials.append(antique_gold)
            spacers.append(spacer)
        else:
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.285,
                                                  location=(x, y, 0))
            bead = bpy.context.active_object
            bead.name = f"amethyst-bead-{index:02d}"
            # 固定序列的微小比例差制造天然珠感，同时保证每次生成完全可复现。
            scale_variation = (0.97, 1.035, 1.0, 1.055, 0.985)[index % 5]
            bead.scale = (scale_variation, 1.0 / scale_variation, 0.96 + (index % 3) * 0.025)
            bead.rotation_euler[2] = index * 0.41
            bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
            bead.data.materials.append(amethyst_light if index in {2, 7, 13} else amethyst)
            beads.append(bead)

    # 主珠用原创对称云纹形成明确朝向；采用实体粗线，俯视缩小后仍可见，而非依赖法线贴图。
    motif_strokes = []
    motif_sets = [
        [(-0.21, -1.23), (-0.10, -1.14), (0.0, -1.20), (0.10, -1.14), (0.21, -1.23)],
        [(-0.18, -1.31), (-0.08, -1.25), (0.0, -1.30), (0.08, -1.25), (0.18, -1.31)],
        [(0.0, -1.08), (0.0, -1.38)],
    ]
    for index, points in enumerate(motif_sets):
        motif_strokes.append(curve_stroke(f"focal-cloud-{index}", points, 0.315, 0.025,
                                          gold_shadow))
    focal_motif = join(motif_strokes, "focal-cloud-relief")

    # 连接环和浅玉坠打破完美圆环轮廓，让手串在散落、旋转时仍有稳定的上下方向。
    bpy.ops.mesh.primitive_torus_add(major_radius=0.115, minor_radius=0.030,
                                     major_segments=20, minor_segments=6,
                                     location=(0, -1.60, 0.0))
    charm_loop = bpy.context.active_object
    charm_loop.name = "charm-loop"
    charm_loop.data.materials.append(antique_gold)

    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.11, radius2=0.065, depth=0.14,
                                    location=(0, -1.73, 0.0), rotation=(math.pi / 2, 0, 0))
    charm_cap = bpy.context.active_object
    charm_cap.name = "charm-cap"
    charm_cap.data.materials.append(antique_gold)
    bevel(charm_cap, 0.015, 2)

    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.25,
                                          location=(0, -1.94, -0.005))
    charm = bpy.context.active_object
    charm.name = "pale-jade-charm"
    charm.scale = (0.70, 1.08, 0.44)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    charm.data.materials.append(jade)

    normalize_export_parts(
        [cord, join(beads, "bead-system"), join(spacers, "spacer-system"), focal_motif,
         charm_loop, charm_cap, charm],
        "bracelet",
        output,
    )


def make_baoshi(output: Path) -> None:
    # 透明宝石在 Cocos 密堆环境里容易消失，使用不透明深绿基色配合多层切面明度模拟翡翠通透感。
    emerald_deep = material("baoshi_emerald_deep", (0.008, 0.075, 0.022, 1), metalness=0.02,
                            roughness=0.28)
    emerald_mid = material("baoshi_emerald_mid", (0.015, 0.20, 0.055, 1), metalness=0.015,
                           roughness=0.24)
    emerald_light = material("baoshi_emerald_highlight", (0.055, 0.39, 0.12, 1), metalness=0.01,
                             roughness=0.20)
    antique_gold = material("baoshi_antique_gold", (0.47, 0.20, 0.025, 1), metalness=0.46,
                            roughness=0.36)
    gold_recess = material("baoshi_gold_recess", (0.11, 0.025, 0.004, 1), metalness=0.20,
                           roughness=0.62)

    # 主石使用桌面、冠部、腰棱、亭部四级截面；宽桌面和深亭部比单个规则多面体更像切割宝石。
    sides = 8
    vertices = [(0.0, 0.0, 0.44)]
    levels = [
        (0.62, 0.44),
        (0.88, 0.18),
        (0.92, 0.02),
        (0.70, -0.34),
    ]
    for radius, z in levels:
        for index in range(sides):
            angle = math.pi / 8 + index * math.tau / sides
            vertices.append((radius * math.cos(angle), radius * math.sin(angle), z))
    vertices.append((0.0, 0.0, -0.48))
    bottom_index = len(vertices) - 1

    faces = []
    material_indices = []
    for index in range(sides):
        nxt = (index + 1) % sides
        faces.append((0, 1 + index, 1 + nxt))
        # 桌面必须是一整块稳定深绿，亮度变化只发生在外围冠部，避免重新读成廉价彩色三角块。
        material_indices.append(0)
    for level_index in range(len(levels) - 1):
        start = 1 + level_index * sides
        next_start = start + sides
        for index in range(sides):
            nxt = (index + 1) % sides
            faces.extend([(start + index, next_start + index, next_start + nxt),
                          (start + index, next_start + nxt, start + nxt)])
            if level_index == 0:
                material_indices.extend([2 if index in {1, 2} else 1] * 2)
            elif level_index == 1:
                material_indices.extend([1] * 2)
            else:
                material_indices.extend([0] * 2)
    last_start = 1 + (len(levels) - 1) * sides
    for index in range(sides):
        nxt = (index + 1) % sides
        faces.append((last_start + index, bottom_index, last_start + nxt))
        material_indices.append(0)

    mesh = bpy.data.meshes.new("octagonal-cut-jade-mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    gem = bpy.data.objects.new("octagonal-cut-jade", mesh)
    bpy.context.scene.collection.objects.link(gem)
    for mat in (emerald_deep, emerald_mid, emerald_light):
        mesh.materials.append(mat)
    for polygon, mat_index in zip(mesh.polygons, material_indices):
        polygon.material_index = mat_index

    # 深色八角托底只从腰棱外侧露出，提供古玩镶嵌结构而不会把物件误读成戒指。
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=1.04, depth=0.20,
                                        location=(0, 0, -0.20), rotation=(0, 0, math.pi / 8))
    base = bpy.context.active_object
    base.name = "octagonal-setting-base"
    base.data.materials.append(gold_recess)
    bevel(base, 0.045, 2)

    bpy.ops.mesh.primitive_torus_add(major_radius=0.945, minor_radius=0.075,
                                     major_segments=8, minor_segments=6,
                                     location=(0, 0, 0.055), rotation=(0, 0, math.pi / 8))
    bezel = bpy.context.active_object
    bezel.name = "raised-gold-bezel"
    bezel.data.materials.append(antique_gold)

    # 四爪沿对角线跨过腰棱并与托底重叠，避免只放四个悬浮金块的常见错误。
    prongs = []
    for index, angle in enumerate([math.pi / 4, 3 * math.pi / 4, 5 * math.pi / 4,
                                   7 * math.pi / 4]):
        radius = 0.82
        bpy.ops.mesh.primitive_cube_add(size=1.0,
                                        location=(radius * math.cos(angle),
                                                  radius * math.sin(angle), 0.20),
                                        rotation=(0, 0, angle))
        prong = bpy.context.active_object
        prong.name = f"protective-prong-{index}"
        prong.scale = (0.18, 0.34, 0.24)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        bevel(prong, 0.06, 3)
        prong.data.materials.append(antique_gold)
        prongs.append(prong)

    # 八枚低矮莲瓣位于托座外壁，侧视提供节奏；高度受控，不遮挡主石桌面。
    lotus_panels = []
    for index in range(sides):
        angle = index * math.tau / sides
        radius = 0.94
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1.0,
                                              location=(radius * math.cos(angle),
                                                        radius * math.sin(angle), -0.11))
        panel = bpy.context.active_object
        panel.name = f"lotus-panel-{index}"
        panel.scale = (0.16, 0.30, 0.075)
        panel.rotation_euler[2] = angle
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        panel.data.materials.append(antique_gold)
        lotus_panels.append(panel)

    normalize_export_parts(
        [gem, base, bezel, join(prongs, "protective-prong-system"),
         join(lotus_panels, "lotus-setting-panels")],
        "baoshi",
        output,
    )


def make_hulu(output: Path) -> None:
    # 用户确认采用高饱和蜜蜡琥珀方向；颜色分层靠实体切面与明暗材质，不使用会在密堆中消失的透明。
    amber_deep = material("hulu_burnt_amber", (0.20, 0.028, 0.001, 1), metalness=0.0,
                          roughness=0.30)
    amber_mid = material("hulu_honey_amber", (0.58, 0.14, 0.003, 1), metalness=0.0,
                         roughness=0.24)
    amber_light = material("hulu_golden_highlight", (0.85, 0.30, 0.010, 1), metalness=0.0,
                           roughness=0.20)
    amber_relief = material("hulu_amber_relief", (0.36, 0.060, 0.002, 1), metalness=0.0,
                            roughness=0.32)
    antique_gold = material("hulu_antique_gold", (0.36, 0.105, 0.009, 1), metalness=0.46,
                            roughness=0.36)
    vermilion = material("hulu_vermilion_cord", (0.55, 0.015, 0.008, 1), metalness=0.0,
                         roughness=0.66)
    cord_shadow = material("hulu_cord_shadow", (0.18, 0.003, 0.002, 1), metalness=0.0,
                           roughness=0.82)

    # 一张连续旋转曲面连接双肚与短腰；轮廓宽高接近，避免旧模型的两球拼接和前稿的细长瓶形。
    segments = 32
    profile = [
        (0.28, -1.00), (0.70, -0.95), (0.90, -0.73), (0.97, -0.40),
        (0.91, -0.10), (0.49, 0.055),  # 腰部纵向极短，只承担明确收束。
        (0.64, 0.15), (0.76, 0.38), (0.70, 0.64), (0.43, 0.82), (0.29, 0.88),
    ]
    vertices = []
    for ring_index, (radius, z) in enumerate(profile):
        for index in range(segments):
            angle = index * math.tau / segments
            # 八向极浅起伏打散完美球面高光，同时不把主体变成南瓜。
            rib = 1.0 + 0.018 * math.cos(8 * angle) * (0.35 if ring_index == 5 else 1.0)
            vertices.append((radius * rib * math.cos(angle),
                             radius * rib * math.sin(angle), z))
    faces = []
    mat_indices = []
    for ring_index in range(len(profile) - 1):
        start = ring_index * segments
        next_start = start + segments
        for index in range(segments):
            nxt = (index + 1) % segments
            faces.extend([(start + index, next_start + index, next_start + nxt),
                          (start + index, next_start + nxt, start + nxt)])
            # 固定方向的暖亮带模拟蜜蜡内部明度层次，保证每次生成可复现。
            sector = index % segments
            material_index = 2 if sector in {2, 3, 4, 5} else (0 if sector in {18, 19, 20} else 1)
            mat_indices.extend([material_index, material_index])
    mesh = bpy.data.meshes.new("continuous-plump-gourd-mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    body = bpy.data.objects.new("continuous-plump-amber-body", mesh)
    bpy.context.scene.collection.objects.link(body)
    for mat in (amber_deep, amber_mid, amber_light):
        mesh.materials.append(mat)
    for polygon, mat_index in zip(mesh.polygons, mat_indices):
        polygon.material_index = mat_index
        polygon.use_smooth = True

    # 稳定底面用一块低矮圆片封口，物理落地时不会依赖尖点或悬空装饰。
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.30, depth=0.035,
                                        location=(0, 0, -0.995))
    base = bpy.context.active_object
    base.name = "stable-amber-foot"
    base.data.materials.append(amber_deep)
    bevel(base, 0.018, 2)

    # 颈口只保留细金环，拒绝前稿的厚重金属腰带和笼架。
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.31, depth=0.10,
                                        location=(0, 0, 0.89))
    neck_cap = bpy.context.active_object
    neck_cap.name = "thin-gold-neck-cap"
    neck_cap.data.materials.append(antique_gold)
    bevel(neck_cap, 0.035, 3)

    # 短绳环紧贴主体，长度不会主导归一化尺寸，也不会把现有方盒碰撞代理拉成细长尾巴。
    bpy.ops.mesh.primitive_torus_add(major_radius=0.18, minor_radius=0.042,
                                     major_segments=28, minor_segments=7,
                                     location=(0, 0, 1.09), rotation=(math.pi / 2, 0, 0))
    cord_loop = bpy.context.active_object
    cord_loop.name = "compact-red-cord-loop"
    cord_loop.data.materials.append(vermilion)

    knot_parts = []
    for index, (x, z, scale_x) in enumerate([
        (-0.12, 0.96, 0.12), (0.12, 0.96, 0.12), (0.0, 1.00, 0.14), (0.0, 0.93, 0.13),
    ]):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1.0,
                                              location=(x, -0.015, z))
        knot = bpy.context.active_object
        knot.name = f"cord-knot-{index}"
        knot.scale = (scale_x, 0.075, 0.085)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        knot.data.materials.append(vermilion if index % 2 == 0 else cord_shadow)
        knot_parts.append(knot)
    knot_system = join(knot_parts, "compact-red-knot")

    # 同材质宽云纹使用实体粗线；路径贴近下肚正面，随机旋转时也至少保留一段可见浮雕。
    cloud_strokes = []
    cloud_paths_xz = [
        [(-0.68, -0.47), (-0.56, -0.31), (-0.37, -0.30), (-0.28, -0.44),
         (-0.38, -0.55), (-0.53, -0.50)],
        [(-0.28, -0.44), (-0.08, -0.29), (0.12, -0.36), (0.18, -0.50),
         (0.05, -0.59), (-0.11, -0.53)],
        [(0.16, -0.49), (0.35, -0.35), (0.57, -0.39), (0.67, -0.52)],
    ]
    for index, path in enumerate(cloud_paths_xz):
        points = []
        for x, z in path:
            # 下肚截面近似椭圆，按 x 位置贴合正面，额外外推 0.018 避免浮雕陷入主体。
            section_radius = 0.94
            y = -math.sqrt(max(0.01, section_radius ** 2 - x ** 2)) - 0.018
            points.append((x, y, z))
        cloud_strokes.append(curve_stroke_3d(f"amber-cloud-{index}", points, 0.038,
                                             amber_relief))
    cloud_relief = join(cloud_strokes, "broad-amber-cloud-relief")

    normalize_export_parts(
        [body, base, neck_cap, cord_loop, knot_system, cloud_relief],
        "hulu",
        output,
    )


def make_yuzhuo(output: Path) -> None:
    # 首版用分面材质模拟飘花，边界会读成马赛克；改用嵌入 GLB 的连续纹理，让色根跨面平滑流动。
    jade = bpy.data.materials.new("yuzhuo_continuous_jade_marbling")
    jade.use_nodes = True
    jade_principled = jade.node_tree.nodes.get("Principled BSDF")
    jade_principled.inputs["Metallic"].default_value = 0.0
    jade_principled.inputs["Roughness"].default_value = 0.24

    texture_width = 512
    texture_height = 256
    jade_image = bpy.data.images.new("yuzhuo_white_emerald_marbling",
                                     width=texture_width, height=texture_height)
    pixels = []

    def smoothstep(edge0: float, edge1: float, value: float) -> float:
        amount = max(0.0, min(1.0, (value - edge0) / (edge1 - edge0)))
        return amount * amount * (3.0 - 2.0 * amount)

    cream_rgb = Vector((0.78, 0.75, 0.61))
    pale_rgb = Vector((0.40, 0.55, 0.29))
    emerald_rgb = Vector((0.055, 0.29, 0.070))
    for y in range(texture_height):
        phi = y * math.tau / texture_height
        for x in range(texture_width):
            theta = x * math.tau / texture_width
            broad = (0.58 * math.sin(2 * theta + 0.35)
                     + 0.30 * math.sin(5 * theta - 0.9)
                     + 0.14 * math.cos(3 * phi - theta))
            flowing = (broad + 0.12 * math.sin(13 * theta + 1.7 * math.sin(2 * phi))
                       + 0.07 * math.sin(23 * theta - 3 * phi))
            pale_amount = smoothstep(-0.18, 0.22, flowing)
            deep_amount = smoothstep(0.34, 0.78, flowing)
            color = cream_rgb.lerp(pale_rgb, pale_amount)
            color = color.lerp(emerald_rgb, deep_amount * 0.88)

            # 不叠加深色细线：在游戏缩略图里它会被误读为裂纹；只用连续色根表达天然玉纹。
            # 轻微乳白颗粒打散纯色，但幅度受控，不生成首版那种像素块。
            grain = 0.018 * math.sin(31 * theta + 17 * phi) * math.sin(19 * theta - 13 * phi)
            pixels.extend((max(0.0, min(1.0, color.x + grain)),
                           max(0.0, min(1.0, color.y + grain)),
                           max(0.0, min(1.0, color.z + grain)), 1.0))
    jade_image.pixels.foreach_set(pixels)
    jade_image.pack()
    texture_node = jade.node_tree.nodes.new("ShaderNodeTexImage")
    texture_node.image = jade_image
    texture_node.interpolation = "Linear"
    texture_node.extension = "REPEAT"
    jade.node_tree.links.new(texture_node.outputs["Color"], jade_principled.inputs["Base Color"])

    antique_gold = material("yuzhuo_antique_gold", (0.23, 0.058, 0.003, 1), metalness=0.52,
                            roughness=0.38)
    gold_highlight = material("yuzhuo_worn_gold_edge", (0.46, 0.17, 0.010, 1), metalness=0.58,
                             roughness=0.29)

    # 主环必须保持真正正圆；天然感只交给玉色纹理，避免几何起伏在固定机位下读成椭圆或变形。
    major_segments = 64
    minor_segments = 16
    vertices = []
    for major_index in range(major_segments):
        theta = major_index * math.tau / major_segments
        major_radius = 1.0
        tube_radius = 0.25
        for minor_index in range(minor_segments):
            phi = minor_index * math.tau / minor_segments
            polished = 1.0
            local_radius = tube_radius * polished
            vertices.append(((major_radius + local_radius * math.cos(phi)) * math.cos(theta),
                             (major_radius + local_radius * math.cos(phi)) * math.sin(theta),
                             local_radius * math.sin(phi)))

    faces = []
    for major_index in range(major_segments):
        next_major = (major_index + 1) % major_segments
        for minor_index in range(minor_segments):
            next_minor = (minor_index + 1) % minor_segments
            a = major_index * minor_segments + minor_index
            b = next_major * minor_segments + minor_index
            c = next_major * minor_segments + next_minor
            d = major_index * minor_segments + next_minor
            faces.extend([(a, b, c), (a, c, d)])

    mesh = bpy.data.meshes.new("hand-polished-jade-bangle-mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="continuous-marble-uv")
    for polygon in mesh.polygons:
        raw_uvs = []
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            raw_uvs.append((vertex_index // minor_segments / major_segments,
                            vertex_index % minor_segments / minor_segments))
        seam_u = max(uv[0] for uv in raw_uvs) - min(uv[0] for uv in raw_uvs) > 0.5
        seam_v = max(uv[1] for uv in raw_uvs) - min(uv[1] for uv in raw_uvs) > 0.5
        for loop_index, (u, v) in zip(polygon.loop_indices, raw_uvs):
            uv_layer.data[loop_index].uv = ((u + 1.0 if seam_u and u < 0.5 else u),
                                            (v + 1.0 if seam_v and v < 0.5 else v))
    body = bpy.data.objects.new("plump-white-and-emerald-jade-bangle", mesh)
    bpy.context.scene.collection.objects.link(body)
    mesh.materials.append(jade)
    for polygon in mesh.polygons:
        polygon.use_smooth = True

    # 金缮环真正包住圆条截面，不用悬浮贴片；位置偏左上，固定俯视与随机旋转都能形成识别点。
    clasp_theta = math.radians(148)
    clasp_center = Vector((math.cos(clasp_theta), math.sin(clasp_theta), 0.0))
    tangent = Vector((-math.sin(clasp_theta), math.cos(clasp_theta), 0.0))
    bpy.ops.mesh.primitive_torus_add(major_radius=0.30, minor_radius=0.026,
                                     major_segments=28, minor_segments=6,
                                     location=clasp_center)
    collar = bpy.context.active_object
    collar.name = "gold-repair-collar"
    collar.rotation_mode = "QUATERNION"
    collar.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(tangent)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    collar.data.materials.append(antique_gold)

    # 四瓣云扣由一组相互重叠的低矮实体构成，并增加较小亮边层，避免三瓣布局读成蝴蝶结。
    cloud_parts = []
    cloud_highlights = []
    radial = Vector((math.cos(clasp_theta), math.sin(clasp_theta), 0.0))
    plaque_center = clasp_center + radial * 0.04 + Vector((0, 0, 0.295))
    for index, (along_tangent, along_radial, sx, sy) in enumerate([
        (-0.115, 0.0, 0.16, 0.14), (0.115, 0.0, 0.16, 0.14),
        (0.0, 0.09, 0.17, 0.15), (0.0, -0.085, 0.17, 0.15),
    ]):
        location = plaque_center + tangent * along_tangent + radial * along_radial
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0, location=location)
        lobe = bpy.context.active_object
        lobe.name = f"cloud-clasp-lobe-{index}"
        lobe.scale = (sx, sy, 0.045)
        lobe.rotation_euler[2] = clasp_theta
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        lobe.data.materials.append(antique_gold)
        cloud_parts.append(lobe)

        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1.0,
                                              location=location + Vector((0, 0, 0.035)))
        highlight = bpy.context.active_object
        highlight.name = f"cloud-clasp-highlight-{index}"
        highlight.scale = (sx * 0.52, sy * 0.52, 0.020)
        highlight.rotation_euler[2] = clasp_theta
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        highlight.data.materials.append(gold_highlight)
        cloud_highlights.append(highlight)

    normalize_export_parts(
        [body, collar, join(cloud_parts, "four-lobed-cloud-clasp"),
         join(cloud_highlights, "worn-cloud-clasp-highlight")],
        "yuzhuo",
        output,
    )


def make_banzhi(output: Path) -> None:
    # 浅青蓝玉、乳白云雾和蜜糖皮色写入同一张连续贴图，避免古玩铺连续出现深绿色单色块。
    jade = bpy.data.materials.new("banzhi_celadon_honey_jade")
    jade.use_nodes = True
    principled = jade.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Metallic"].default_value = 0.0
    principled.inputs["Roughness"].default_value = 0.34
    # 玉的“润”来自浅层散射而非镜面清漆；少量次表面让背光边缘泛白，同时避免塑料高光。
    if "Subsurface Weight" in principled.inputs:
        principled.inputs["Subsurface Weight"].default_value = 0.16
        principled.inputs["Subsurface Radius"].default_value = (0.72, 1.0, 0.86)
        principled.inputs["Subsurface Scale"].default_value = 0.11
    if "Coat Weight" in principled.inputs:
        principled.inputs["Coat Weight"].default_value = 0.07
        principled.inputs["Coat Roughness"].default_value = 0.24
    width, height = 512, 256
    image = bpy.data.images.new("banzhi_celadon_honey_texture", width=width, height=height)
    rough_image = bpy.data.images.new("banzhi_jade_roughness", width=width, height=height)
    normal_image = bpy.data.images.new("banzhi_jade_micro_normal", width=width, height=height)
    aqua = Vector((0.48, 0.78, 0.73))
    cream = Vector((0.79, 0.90, 0.84))
    turquoise = Vector((0.12, 0.55, 0.51))
    honey = Vector((0.82, 0.48, 0.13))
    pixels = []
    rough_pixels = []
    normal_pixels = []

    def ss(a: float, b: float, value: float) -> float:
        amount = max(0.0, min(1.0, (value - a) / (b - a)))
        return amount * amount * (3.0 - 2.0 * amount)

    def stone_field(u: float, v: float) -> float:
        """多频低振幅场模拟棉絮和色根；只影响表面响应，不生成会读成裂纹的深色线。"""
        return (0.50
                + 0.23 * math.sin(math.tau * (2.1 * u + 0.28 * math.sin(math.tau * v)))
                + 0.13 * math.sin(math.tau * (5.2 * u - 1.7 * v + 0.1 * math.sin(math.tau * 3 * u)))
                + 0.08 * math.sin(math.tau * (11 * u + 7 * v)))

    for y in range(height):
        v = y / (height - 1)
        for x in range(width):
            u = x / width
            field = stone_field(u, v)
            cloudy = ss(0.38, 0.68, field) * (0.45 + 0.25 * math.sin(math.tau * 3 * v) ** 2)
            color = aqua.lerp(cream, cloudy)
            teal_field = 0.5 + 0.5 * math.sin(math.tau * (3.1 * u - 0.8 * v + 0.13 * field))
            teal = ss(0.62, 0.90, teal_field)
            color = color.lerp(turquoise, teal * 0.20)
            # 糖色是侧面局部沁色而不是整圈深色底座：用环向软遮罩切断连续色带，保持玉体轻盈。
            patch_center = 0.13
            circular_distance = abs(((u - patch_center + 0.5) % 1.0) - 0.5)
            side_patch = 1.0 - ss(0.14, 0.32, circular_distance)
            honey_line = 0.42 + 0.08 * math.sin(math.tau * (1.3 * u + 0.12))
            vertical_patch = ss(0.12, 0.24, v) * (1.0 - ss(honey_line, honey_line + 0.13, v))
            honey_mask = side_patch * vertical_patch
            color = color.lerp(honey, honey_mask * 0.72)
            # 斜口是最强识别面，保持明确浅青而不是过曝乳白。
            color = color.lerp(aqua, ss(0.78, 1.0, v) * 0.34)
            grain = 0.022 * math.sin(math.tau * (17 * u + 11 * v)) * math.sin(math.tau * (9 * u - 13 * v))
            pixels.extend((max(0.0, min(1.0, color.x + grain)),
                           max(0.0, min(1.0, color.y + grain)),
                           max(0.0, min(1.0, color.z + grain)), 1.0))
            roughness = 0.30 + 0.10 * (1.0 - ss(0.34, 0.75, field)) + 0.06 * honey_mask
            rough_pixels.extend((roughness, roughness, roughness, 1.0))
            du = (stone_field(u + 1.0 / width, v) - stone_field(u - 1.0 / width, v)) * 2.2
            dv = (stone_field(u, v + 1.0 / height) - stone_field(u, v - 1.0 / height)) * 2.2
            normal = Vector((-du, -dv, 1.0)).normalized()
            normal_pixels.extend((normal.x * 0.5 + 0.5, normal.y * 0.5 + 0.5,
                                  normal.z * 0.5 + 0.5, 1.0))
    image.pixels.foreach_set(pixels)
    rough_image.pixels.foreach_set(rough_pixels)
    normal_image.pixels.foreach_set(normal_pixels)
    image.pack()
    rough_image.pack()
    normal_image.pack()
    tex = jade.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.interpolation = "Linear"
    tex.extension = "REPEAT"
    jade.node_tree.links.new(tex.outputs["Color"], principled.inputs["Base Color"])
    # 游戏固定顶光会让厚戒体下缘失去全部色相；复用玉色贴图作极弱自发光，仅托起暗部，模拟透光而非发光体。
    if "Emission Color" in principled.inputs:
        jade.node_tree.links.new(tex.outputs["Color"], principled.inputs["Emission Color"])
        principled.inputs["Emission Strength"].default_value = 0.12
    rough_tex = jade.node_tree.nodes.new("ShaderNodeTexImage")
    rough_tex.image = rough_image
    rough_tex.image.colorspace_settings.name = "Non-Color"
    rough_tex.interpolation = "Linear"
    jade.node_tree.links.new(rough_tex.outputs["Color"], principled.inputs["Roughness"])
    normal_tex = jade.node_tree.nodes.new("ShaderNodeTexImage")
    normal_tex.image = normal_image
    normal_tex.image.colorspace_settings.name = "Non-Color"
    normal_tex.interpolation = "Linear"
    normal_map = jade.node_tree.nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = 0.12
    jade.node_tree.links.new(normal_tex.outputs["Color"], normal_map.inputs["Color"])
    jade.node_tree.links.new(normal_map.outputs["Normal"], principled.inputs["Normal"])

    relief_jade = material("banzhi_turquoise_relief", (0.055, 0.37, 0.34, 1), metalness=0.0,
                           roughness=0.34)
    gold = material("banzhi_warm_gold_liner", (0.72, 0.52, 0.24, 1), metalness=0.34,
                    roughness=0.52)
    worn_gold = material("banzhi_worn_gold_accents", (0.73, 0.40, 0.055, 1), metalness=0.56,
                         roughness=0.32)

    segments = 64
    vertices = []
    for index in range(segments):
        theta = index * math.tau / segments
        top_z = 0.54 + 0.14 * math.cos(theta)
        vertices.extend([
            (0.79 * math.cos(theta), 0.79 * math.sin(theta), -0.64),
            (0.86 * math.cos(theta), 0.86 * math.sin(theta), top_z),
            (0.47 * math.cos(theta), 0.47 * math.sin(theta), -0.60),
            (0.50 * math.cos(theta), 0.50 * math.sin(theta), top_z - 0.055),
        ])
    faces = []
    for index in range(segments):
        nxt = (index + 1) % segments
        a, b, c, d = index * 4, index * 4 + 1, index * 4 + 2, index * 4 + 3
        na, nb, nc, nd = nxt * 4, nxt * 4 + 1, nxt * 4 + 2, nxt * 4 + 3
        faces.extend([(a, na, nb), (a, nb, b), (c, d, nd), (c, nd, nc),
                      (b, nb, nd), (b, nd, d), (a, c, nc), (a, nc, na)])
    mesh = bpy.data.meshes.new("sloped-open-thumb-ring-mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="banzhi-wrapped-uv")
    for polygon in mesh.polygons:
        raw = []
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            u = (vertex_index // 4) / segments
            kind = vertex_index % 4
            v = 0.0 if kind in {0, 2} else 1.0
            raw.append((u, v))
        seam = max(u for u, _ in raw) - min(u for u, _ in raw) > 0.5
        for loop_index, (u, v) in zip(polygon.loop_indices, raw):
            uv_layer.data[loop_index].uv = (u + 1.0 if seam and u < 0.5 else u, v)
    body = bpy.data.objects.new("celadon-sloped-thumb-ring-body", mesh)
    bpy.context.scene.collection.objects.link(body)
    mesh.materials.append(jade)
    for polygon in mesh.polygons:
        polygon.use_smooth = True

    # 金内衬只覆盖内壁和开口薄缘，保留真实通孔，不用封口圆片制造假洞。
    liner_vertices = []
    for index in range(segments):
        theta = index * math.tau / segments
        top_z = 0.54 + 0.14 * math.cos(theta) - 0.065
        liner_vertices.extend([(0.465 * math.cos(theta), 0.465 * math.sin(theta), -0.57),
                               (0.465 * math.cos(theta), 0.465 * math.sin(theta), top_z),
                               (0.505 * math.cos(theta), 0.505 * math.sin(theta), top_z)])
    liner_faces = []
    for index in range(segments):
        nxt = (index + 1) % segments
        a, b, c = index * 3, index * 3 + 1, index * 3 + 2
        na, nb, nc = nxt * 3, nxt * 3 + 1, nxt * 3 + 2
        liner_faces.extend([(a, b, nb), (a, nb, na), (b, c, nc), (b, nc, nb)])
    liner_mesh = bpy.data.meshes.new("open-gold-liner-mesh")
    liner_mesh.from_pydata(liner_vertices, [], liner_faces)
    liner_mesh.update()
    liner = bpy.data.objects.new("warm-gold-inner-liner", liner_mesh)
    bpy.context.scene.collection.objects.link(liner)
    liner_mesh.materials.append(gold)
    for polygon in liner_mesh.polygons:
        polygon.use_smooth = True

    # 山云纹贴合面向游戏相机的外壁；粗玉色主线保证缩略图可读，金色只磨亮山脊高边。
    relief_paths = [
        [(-0.58, -0.16), (-0.34, 0.09), (-0.16, -0.05)],
        [(-0.20, -0.02), (0.02, 0.27), (0.25, -0.03)],
        [(0.18, -0.02), (0.40, 0.16), (0.60, -0.10)],
        [(-0.62, -0.25), (-0.48, -0.15), (-0.34, -0.24), (-0.20, -0.15), (-0.05, -0.26)],
        [(-0.05, -0.28), (0.12, -0.17), (0.28, -0.27), (0.44, -0.17), (0.62, -0.25)],
    ]
    # 两朵卷云用收缩螺旋而不是折线，和上方三座山峰形成明确的山云层级。
    for center_x in (-0.38, 0.38):
        spiral = []
        for step in range(13):
            angle = step * math.tau / 5.8
            radius = 0.15 * (1.0 - step / 16.0)
            spiral.append((center_x + radius * math.cos(angle),
                           -0.20 + radius * 0.62 * math.sin(angle)))
        relief_paths.append(spiral)
    relief_parts = []
    camera_radial = Vector((0.59, -0.81, 0.0))
    camera_tangent = Vector((0.81, 0.59, 0.0))
    for index, path in enumerate(relief_paths):
        points = []
        for x, z in path:
            position = camera_radial * (math.sqrt(max(0.01, 0.81 ** 2 - x ** 2)) + 0.022)
            position += camera_tangent * x
            points.append((position.x, position.y, z))
        relief_parts.append(curve_stroke_3d(f"mountain-cloud-relief-{index}", points, 0.044,
                                            relief_jade))
    gold_paths = [relief_paths[0], relief_paths[1], relief_paths[2]]
    gold_parts = []
    for index, path in enumerate(gold_paths):
        points = []
        for x, z in path:
            position = camera_radial * (math.sqrt(max(0.01, 0.81 ** 2 - x ** 2)) + 0.068)
            position += camera_tangent * x
            points.append((position.x, position.y, z + 0.012))
        gold_parts.append(curve_stroke_3d(f"worn-gold-ridge-{index}", points, 0.013,
                                          worn_gold))

    normalize_export_parts(
        [body, liner, join(relief_parts, "broad-mountain-cloud-relief"),
         join(gold_parts, "restrained-worn-gold-ridges")],
        "banzhi",
        output,
    )


BUILDERS = {
    "tongqian": make_tongqian,
    "bracelet": make_bracelet,
    "baoshi": make_baoshi,
    "hulu": make_hulu,
    "yuzhuo": make_yuzhuo,
    "banzhi": make_banzhi,
}


def main() -> None:
    requested = [arg for arg in sys.argv[sys.argv.index("--") + 1:] if arg] if "--" in sys.argv else []
    names = requested or list(BUILDERS)
    unknown = [name for name in names if name not in BUILDERS]
    if unknown:
        raise SystemExit(f"Unknown antique v2 model(s): {', '.join(unknown)}")
    for name in names:
        clear_scene()
        BUILDERS[name](DEFAULT_OUTPUT)


if __name__ == "__main__":
    main()
