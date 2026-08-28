# 置物筐 3D 模型 Prompt（Tripo3D 文生 3D）

每套背景配一个专属置物容器 3D 模型（GLB）。因为游戏相机是**近乎正俯视**，容器必须
**敞口、浅墙、内部掏空**，否则俯视看不进筐里、或高墙挡住物件。

## 通用硬性要求（每个 prompt 都已内置，建模后自查）

- **一律正方形开口**，长宽相等 → 物理边界统一走 `rect`
- **绝对无盖**：翻盖、半截小盖、铰链盖板、折叠板，一个都不要
- **敞口朝上**，内部**掏空干净**（游戏往里丢 3D 物件）
- **矮墙浅口**：墙高约为开口宽度的 1/4～1/3，别做深锅/高桶
- **单个物体、居中**，开口正对上方（+Y）
- **不要**：把手、提梁、内容物、底下的桌子/支架、地面阴影
- 风格：stylized、smooth、cute casual mobile-game asset，低模，贴图 1–2k
- 导出 **GLB**

## 写 prompt 的三条铁律（血泪教训，改 prompt 前先读）

1. **主体名词必须先验无盖**。`basket` / `hamper` / `pot` / `chest` 这些词，模型脑子里
   默认就带盖带提梁，写多少遍 `No lid` 都压不住。一律换成 `tray` / `dish` / `pan` /
   `open crate`——托盘和浅盘的先验里根本不存在盖子。
2. **别写否定句**。`No lid, no handle` 在扩散模型里往往起反效果：提到 lid 就是把这个
   概念又激活一次。改用正面描述封死几何：
   `one continuous unbroken flat rim running evenly around all four sides`
   ——四边等高连成一圈，几何上就没地方长盖板。
3. **prompt 要短**。Tripo 文生 3D 不解析 `Negative:` 段，长句只稀释主体权重。
   4～5 行封顶，材质/风格各一句就够。

正方形靠 `square` + `equal width and depth` 双保险，比只写 `square opening` 硬。

---

## 1. 深红木 redwood → 中式竹编方托盘（方口 / rect）

```
A shallow square bamboo woven serving tray, one continuous unbroken flat woven rim
running evenly around all four sides, low straight walls, empty interior, equal
width and depth, warm honey-colored bamboo weave with a dark redwood trim, soft
rounded corners, stylized smooth cute casual mobile-game 3D prop, game-ready PBR.
Single centered object.
```

## 2. 翡翠青玉 jade → 青瓷方浅盘（方口 / rect）

```
A shallow square celadon porcelain dish, one continuous unbroken flat rim running
evenly around all four sides, low straight walls, empty interior, equal width and
depth, glossy crackled jade-green glaze with a thin gold rim, soft rounded corners,
elegant Chinese ceramic, stylized smooth cute casual mobile-game 3D prop,
game-ready PBR. Single centered object.
```

## 3. 户外野餐 picnic → 藤编野餐篮（方口 / rect）

```
A shallow square woven rattan bread tray, one continuous unbroken flat rim running
evenly around all four sides, low straight walls, empty interior, light natural
willow weave, soft rounded corners, equal width and depth, stylized smooth cute
casual mobile-game 3D prop, game-ready PBR. Single centered object.
```

> 这套就是三条铁律的来源：`picnic` / `basket` 抽了两轮都带铰链翻盖 + 提梁，
> 换成 `bread tray` 才干净，野餐氛围靠藤编材质本身带出来。
> 仍出小盖子时：Blender 里选中盖板那圈面删掉（几秒），比反复重抽快——
> 重抽的随机性摆在那，方口浅墙这次对了下次未必对。

---

## 备用：日常主题容器（篮子/锅/烧烤架/超市筐/冰箱系）

> 这几种容器偏「厨房 / 超市 / 烧烤」日常场景，需搭配同风格背景才协调。
> 想上这些主题时，先出对应背景图，再配下面的容器。

### 厨房 · 珐琅方浅烤盘（方口 / rect）
```
A shallow square enameled roasting pan, one continuous unbroken flat rim running
evenly around all four sides, low straight walls, empty smooth interior, equal
width and depth, matte cream enamel with a dark speckled edge, soft rounded
corners, warm kitchen style, stylized smooth cute casual mobile-game 3D prop,
game-ready PBR. Single centered object.
```

### 烧烤架 · 方形浅烤盘架（方口 / rect）
```
A shallow square barbecue grill tray, one continuous unbroken flat rim running
evenly around all four sides, low straight walls, equal width and depth, a subtle
grid grate across the flat bottom, dark metal with warm ember tones, outdoor
barbecue style, stylized smooth cute casual mobile-game 3D prop, game-ready PBR.
Single centered object.
```

### 超市筐 · 塑料方浅箱（方口 / rect）
```
A shallow square open plastic crate, one continuous unbroken flat rim running
evenly around all four sides, low straight walls with a light lattice pattern,
empty interior, equal width and depth, bright glossy red plastic, soft rounded
corners, stylized smooth cute casual mobile-game 3D prop, game-ready PBR.
Single centered object.
```

### 冰箱 · 敞口保鲜格 / 冷藏筐（方口 / rect）
```
A shallow square open storage bin, one continuous unbroken flat rim running evenly
around all four sides, low straight walls, empty interior, equal width and depth,
translucent frosted plastic with a cool light-blue tint and a soft chrome rim,
clean modern kitchen style, stylized smooth cute casual mobile-game 3D prop,
game-ready PBR. Single centered object.
```

---

## 出好模型后怎么接

1. 把 GLB 丢进 `game/assets/resources/models/`（命名如 `basket_redwood.glb`）
2. 告诉我文件名 + 对应哪套皮肤
3. 我登记 manifest、加载摆放、把隐形物理围栏对齐到开口（物件精确落筐内）

先出**第一个**端到端跑通、确认手感，再逐套配齐。

---

# v2 · 农场与甜品容器重做（2026-08-28）

这两件在游戏里不好看的主因是**和背景撞色**，单看模型反而看不出来。

## 背景色实测（新容器定色的依据）

| 皮肤 | 背景图 | 中央区域主色 | 旧容器 | 问题 |
| --- | --- | --- | --- | --- |
| `picnic` | `bg_farm.jpg` | RGB(227,193,75) 金黄 | 粉橙藤编 | 同色系，压在背景上糊成一片 |
| `dessert` | `bg_dessert.jpg` | RGB(249,200,137) 杏色 | 白 + 粉边 | 同属暖色，明度接近，轮廓不跳 |

## 出图方式（`cupcake` 首件的教训，务必遵守）

**概念图只出单一 3/4 视角，不要三视图拼版。** `cupcake` 那张是四宫格，图生 3D
把**四个视图各重建成一个独立实体**，顶视图还变成一片斜立的椭圆薄片。要三视图就
单独出一张给人看，别喂给图生 3D。

生成后走 `scripts/prepare_generated_model.py` → `gltf-transform resize` →
`scripts/tune_generated_material.py` → `gltf-transform prune`。

## 工程约束（两件都适用）

- **开口必须正方形**：都用默认矩形物理边界，长宽不等会让物件贴到看不见的墙上。
- **平底 + 直墙**：都**不开** `meshCollider`，物理走环墙拼的直壁；做成曲面碗底会和
  物理边界对不上（`bowl_jade` 那种才需要开）。
- **不要把手**。`tray_dessert` 现在的双侧金把手正是 `SceneSkin.ts` 里
  `containerSpan: 5.0` 要补偿的东西 —— 把手撑大 AABB，按完整包围盒缩放后内盘反而被压小。
  **新模型去掉把手后要删掉那一行**，回到缺省 4.0。
- **墙高 = 开口宽的 1/4 ~ 1/3**。旧 `basket_farm` 只有 16%，浅得没有存在感。
- **节点名**必须等于模型 id，用 `--name` 参数。

---

## A. `basket_farm` 池塘农场 · 深胡桃藤编方托盘 ✅ 已完成

生成件 43.6MB / 50,310 面，处理后 25,000 面 / 1,045KB，开口 1.000×0.989、墙高比 18.8%。

```
A single three-quarter view of one square woven rattan serving tray, equal width
and depth, low straight walls about one quarter of the opening width, empty
interior with a flat woven base, real over-under basket weaving where dark walnut
rattan strands cross honey-toned strands, one continuous unbroken rolled rim
running evenly around all four sides, soft rounded corners, warm matte finish.
Stylized smooth cute casual mobile-game prop, game-ready PBR.
Single centered object on a clean off-white background, soft studio light.
```

**实测结论（对后续容器同样适用）**：

1. **编织是几何做的，不是法线贴图。** 贴图 256/512/1024 三档渲染几乎无差别，而面数从
   6,000 提到 49,488 时编织才真正立起来。**2.5 万面是收益拐点**，6,000 面会糊成一片。
   证据见 `audit/model-quality/basket_farm-v3/face-budget-study.png`。
2. **滚边上的"疙瘩"是材质不是几何。** 生成件带 `KHR_materials_specular:[2,2,2]`，
   高光噪点糊在滚边上。**Blender 侧断开节点链接删不掉它** —— glTF 导入器把它存在材质
   自定义属性里，导出时原样写回，必须在 glTF JSON 层处理（`tune_generated_material.py`）。
3. 体积代价：1,045KB vs 旧版 208KB。若要压到 ~300KB，需从高模烘焙法线贴图到 6,000 面低模。

---

## B. `tray_dessert` 甜品小镇 · 草莓糖霜方盘

- **石板蓝釉版本已废弃。** `glazed ceramic serving dish` + `crackled glaze` + `gold rim`
  这套词的先验是**高端餐瓷 / 日式陶器**，出来是个冷峻的香皂碟，一点不甜。
  **教训：甜品容器的「甜」不靠颜色，靠形制** —— 糖霜滴落、厚卷边、荷叶褶边这类烘焙语言。
  金边尤其要避开，那是高端餐瓷的符号。
- **新定色**：奶油白盘身 + 草莓粉糖霜从口沿淌下。与杏色背景靠**明度**分离（奶油白更亮、
  更中性）；粉色取比 `cupcake` 玫瑰粉**更深更饱和**的草莓粉，靠饱和度区分。
  糖霜滴落与 `donut` 的可可釉属同一套造型语言，正好构成主题统一 —— playbook 要求
  「主题统一优先依靠造型语言，而不依靠全组染成同色」。
- 滴落沿外壁向下淌、不向外扩，不撑大 AABB，`containerSpan` 仍可回到缺省 4.0。

**概念图 prompt（单一 3/4 视角）· 主推**
```
A single three-quarter view of one square dessert serving dish, equal width and
depth, low straight walls about one quarter of the opening width, empty interior
with a flat almond-cream base, a thick rounded rolled rim running evenly around
all four sides, glossy strawberry-pink icing pouring over the rim and running down
the outer walls in soft uneven rounded drips that stop partway down, creamy white
glaze below the drips, playful bakery feel.
Stylized smooth cute casual mobile-game prop, game-ready PBR.
Single centered object on a clean off-white background, soft studio light.
```

**文生 3D prompt**
```
A square dessert serving dish with equal width and depth, low straight walls about
one quarter of the opening width, a flat almond-cream interior base, a thick
rounded rolled rim running evenly around all four sides, and glossy strawberry-pink
icing pouring over the rim down the outer walls in soft uneven rounded drips that
stop partway down, with creamy white glaze below. Playful bakery feel. Stylized
smooth cute casual mobile-game prop, game-ready PBR. Single centered object.
```

**备选 · 荷叶褶边奶油盘**（若糖霜滴落生成得太碎，换这个）
```
A single three-quarter view of one square dessert serving dish, equal width and
depth, low straight walls about one quarter of the opening width, empty interior
with a flat almond-cream base, the entire top edge formed by a continuous ruffled
scalloped frill like piped cream running evenly around all four sides, creamy white
glaze on the walls warming to soft strawberry pink at the frill, playful bakery feel.
Stylized smooth cute casual mobile-game prop, game-ready PBR.
Single centered object on a clean off-white background, soft studio light.
```
