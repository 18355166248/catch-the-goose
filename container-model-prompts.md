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
