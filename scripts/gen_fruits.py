"""程序化生成「水果摊」场景的低模物件（Blender 4.5，headless）。

设计目标：一眼可辨、颜色高对比、风格统一、低面数（≤2k 三角）、纯色不透明材质。
每件归一化到最大边 = 1.0 并居中到原点，与既有管线（process_new.py）一致，
物理与拾取沿用现有约定，无需改玩法层。

用法：
  & "C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe" ^
     --background --python scripts\\gen_fruits.py
先产出到预览目录 + 渲染对比图；确认质量后再改 OUT 指向 resources/models。
"""
import bpy, os, math, bmesh
from mathutils import Vector

OUT = r"C:\Users\Administrator\AppData\Local\Temp\fruit_preview"
os.makedirs(OUT, exist_ok=True)

# ---- 调色板（Principled Base Color，线性值；渲染后可再微调）----
C = {
    "apple_red":   (0.62, 0.03, 0.03, 1),
    "leaf":        (0.13, 0.42, 0.09, 1),
    "stem_brown":  (0.24, 0.13, 0.05, 1),
    "banana":      (0.86, 0.66, 0.03, 1),
    "banana_tip":  (0.20, 0.15, 0.04, 1),
    "orange":      (0.85, 0.28, 0.01, 1),
    "grape":       (0.26, 0.07, 0.40, 1),
    "straw_red":   (0.70, 0.04, 0.08, 1),
    "straw_seed":  (0.90, 0.82, 0.30, 1),
    "pear":        (0.52, 0.60, 0.07, 1),
    "lemon":       (0.90, 0.78, 0.04, 1),
    "cherry":      (0.45, 0.01, 0.06, 1),
}


def wipe():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for c in (bpy.data.meshes, bpy.data.materials, bpy.data.metaballs,
              bpy.data.curves, bpy.data.images):
        for b in list(c):
            try:
                c.remove(b)
            except Exception:
                pass


def mat(name, color, metallic=0.0, roughness=0.55):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = color
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Roughness"].default_value = roughness
    return m


def uv_sphere(seg=24, ring=14, r=1.0):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=ring, radius=r)
    o = bpy.context.active_object
    bpy.ops.object.shade_smooth()
    return o


def apply_all(o):
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    return o


def normalize_export(o, name):
    """居中 + 最大边=1.0，导出 GLB。"""
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    o.location = (0, 0, 0)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    lo = Vector((min(v.co[i] for v in o.data.vertices) for i in range(3)))
    hi = Vector((max(v.co[i] for v in o.data.vertices) for i in range(3)))
    center = (lo + hi) / 2
    maxd = max(hi - lo) or 1.0
    s = 1.0 / maxd
    o.scale = (s, s, s)
    o.location = (-center.x * s, -center.y * s, -center.z * s)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + ".glb"),
                              export_format='GLB', use_selection=True)
    print("BUILT", name, "faces=", len(o.data.polygons))


def add_stem_leaf(top_z, m_stem, m_leaf, stem_r=0.06, stem_h=0.28, leaf=True):
    parts = []
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=stem_r, depth=stem_h,
                                         location=(0, 0, top_z + stem_h * 0.4))
    st = bpy.context.active_object
    bpy.ops.object.shade_smooth()
    st.rotation_euler = (math.radians(8), 0, 0)
    st.data.materials.append(m_stem)
    parts.append(st)
    if leaf:
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.16,
                                               location=(0.16, 0, top_z + stem_h * 0.5))
        lf = bpy.context.active_object
        lf.scale = (1.1, 0.5, 0.12)
        bpy.ops.object.shade_smooth()
        lf.data.materials.append(m_leaf)
        parts.append(lf)
    return parts


# ---------------- 各水果 ----------------

def make_apple():
    o = uv_sphere(28, 18)
    o.scale = (1.0, 1.0, 0.88)
    apply_all(o)
    # 顶/底轻微凹陷
    bm = bmesh.new(); bm.from_mesh(o.data)
    for v in bm.verts:
        if v.co.z > 0.75:
            v.co.z -= (v.co.z - 0.75) * 1.3
        if v.co.z < -0.78:
            v.co.z += (-0.78 - v.co.z) * 0.6
    bm.to_mesh(o.data); bm.free()
    o.data.materials.append(mat("apple", C["apple_red"], roughness=0.32))
    parts = [o] + add_stem_leaf(0.62, mat("stem", C["stem_brown"]),
                                mat("leaf", C["leaf"]))
    o = join(parts, "apple")
    normalize_export(o, "apple")


def make_banana():
    # 用弯曲曲线 + 圆管倒角 + 逐点半径，稳定得到两头尖的香蕉，弧面平躺于 XY。
    cu = bpy.data.curves.new("bananaC", 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = 0.30
    cu.bevel_resolution = 6
    cu.resolution_u = 6
    sp = cu.splines.new('BEZIER')
    sp.bezier_points.add(4)  # 共 5 点
    arc = [(-1.5, -0.55), (-0.85, 0.1), (0.0, 0.32), (0.85, 0.1), (1.5, -0.55)]
    rad = [0.05, 0.85, 1.0, 0.85, 0.05]  # 两端收成尖
    for i, ((x, y), r) in enumerate(zip(arc, rad)):
        bp = sp.bezier_points[i]
        bp.co = (x, y, 0)
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
        bp.radius = r
    ob = bpy.data.objects.new("banana", cu)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.convert(target='MESH')
    ob = bpy.context.active_object
    bpy.ops.object.shade_smooth()
    ob.data.materials.append(mat("banana", C["banana"], roughness=0.45))
    normalize_export(ob, "banana")


def make_orange():
    o = uv_sphere(28, 18)
    o.scale = (1.0, 1.0, 0.94)
    apply_all(o)
    o.data.materials.append(mat("orange", C["orange"], roughness=0.5))
    parts = [o] + add_stem_leaf(0.66, mat("ostem", C["leaf"]),
                                mat("oleaf", C["leaf"]), stem_r=0.05,
                                stem_h=0.12, leaf=False)
    o = join(parts, "orange")
    normalize_export(o, "orange")


def make_grape():
    m = bpy.data.metaballs.new("gm")
    m.resolution = 0.16; m.threshold = 0.6
    ob = bpy.data.objects.new("grapes", m)
    bpy.context.scene.collection.objects.link(ob)
    # 三角锥状串
    rows = [(-0.0, 1.7, 3), (-0.0, 1.05, 0), (0.0, 0.45, 0), (0.0, -0.1, 0)]
    layout = [
        (0, 1.75, 0), (0.42, 1.15, 0), (-0.42, 1.15, 0), (0, 1.15, 0.42),
        (0.55, 0.45, 0), (-0.55, 0.45, 0), (0, 0.45, 0.55), (0, 0.45, -0.5),
        (0.3, -0.2, 0.3), (-0.3, -0.2, -0.2), (0, -0.75, 0),
    ]
    for (x, z, y) in layout:
        e = m.elements.new()
        e.co = (x, y, z); e.radius = 0.62
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.convert(target='MESH')
    ob = bpy.context.active_object
    bpy.ops.object.shade_smooth()
    ob.data.materials.append(mat("grape", C["grape"], roughness=0.3))
    parts = [ob] + add_stem_leaf(1.9, mat("gstem", C["stem_brown"]),
                                 mat("gleaf", C["leaf"]), stem_h=0.4, leaf=True)
    ob = join(parts, "grape")
    normalize_export(ob, "grape")


def make_strawberry():
    o = uv_sphere(26, 18)
    apply_all(o)
    bm = bmesh.new(); bm.from_mesh(o.data)
    for v in bm.verts:
        z = v.co.z  # -1..1
        # 归一化高度 0(底)..1(顶)，横向按二次曲线收窄成明显锥形
        h = (z + 1.0) / 2.0
        f = 0.12 + 0.98 * (h ** 0.75)
        v.co.x *= f; v.co.y *= f
        # 底部拉尖、顶部略压平
        if z < 0:
            v.co.z = z * 1.45
        else:
            v.co.z = z * 0.9
    bm.to_mesh(o.data); bm.free()
    o.data.materials.append(mat("straw", C["straw_red"], roughness=0.3))
    # 绿萼：顶部一圈明显小叶 + 短梗
    leaves = []
    for i in range(6):
        a = i / 6 * math.tau
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.34,
            location=(math.cos(a) * 0.34, math.sin(a) * 0.34, 0.82))
        lf = bpy.context.active_object
        lf.scale = (1.0, 0.42, 0.14)
        lf.rotation_euler = (0, math.radians(48), a)
        bpy.ops.object.shade_smooth()
        lf.data.materials.append(mat("scal%d" % i, C["leaf"]))
        leaves.append(lf)
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.06, depth=0.3,
                                        location=(0, 0, 1.0))
    stem = bpy.context.active_object
    bpy.ops.object.shade_smooth()
    stem.data.materials.append(mat("sstem", C["leaf"]))
    leaves.append(stem)
    o = join([o] + leaves, "strawberry")
    normalize_export(o, "strawberry")


def make_pear():
    m = bpy.data.metaballs.new("pm")
    m.resolution = 0.14; m.threshold = 0.6
    ob = bpy.data.objects.new("pear", m)
    bpy.context.scene.collection.objects.link(ob)
    e1 = m.elements.new(); e1.co = (0, 0, -0.55); e1.radius = 1.0
    e2 = m.elements.new(); e2.co = (0, 0, 0.5); e2.radius = 0.62
    e3 = m.elements.new(); e3.co = (0, 0, 1.05); e3.radius = 0.38
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.convert(target='MESH')
    ob = bpy.context.active_object
    bpy.ops.object.shade_smooth()
    ob.data.materials.append(mat("pear", C["pear"], roughness=0.4))
    parts = [ob] + add_stem_leaf(1.35, mat("pstem", C["stem_brown"]),
                                 mat("pleaf", C["leaf"]), stem_h=0.3, leaf=False)
    ob = join(parts, "pear")
    normalize_export(ob, "pear")


def make_lemon():
    o = uv_sphere(26, 16)
    o.scale = (1.5, 0.92, 0.92)
    apply_all(o)
    bm = bmesh.new(); bm.from_mesh(o.data)
    for v in bm.verts:
        t = abs(v.co.x) / 1.5
        if t > 0.7:  # 两端小尖
            v.co.x *= 1.0 + (t - 0.7) * 0.8
    bm.to_mesh(o.data); bm.free()
    o.data.materials.append(mat("lemon", C["lemon"], roughness=0.5))
    normalize_export(o, "lemon")


def make_cherry():
    balls = []
    for dx in (-0.62, 0.62):
        s = uv_sphere(22, 14, r=0.9)
        s.location = (dx, 0, -0.4)
        apply_all(s)
        s.data.materials.append(mat("cher", C["cherry"], roughness=0.28))
        balls.append(s)
    stems = []
    for dx, bend in ((-0.62, -1), (0.62, 1)):
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.05, depth=1.5,
            location=(dx * 0.5, 0, 0.7))
        st = bpy.context.active_object
        st.rotation_euler = (0, math.radians(20 * bend), 0)
        bpy.ops.object.shade_smooth()
        st.data.materials.append(mat("cstem%d" % bend, C["leaf"]))
        stems.append(st)
    o = join(balls + stems, "cherry")
    normalize_export(o, "cherry")


BUILDERS = [make_apple, make_banana, make_orange, make_grape,
            make_strawberry, make_pear, make_lemon, make_cherry]

for fn in BUILDERS:
    wipe()
    fn()

print("ALL DONE ->", OUT)
