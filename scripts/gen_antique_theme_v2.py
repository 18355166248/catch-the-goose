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


BUILDERS = {"tongqian": make_tongqian, "bracelet": make_bracelet}


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
