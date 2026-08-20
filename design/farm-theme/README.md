# 池塘农场主题素材说明

## 场景底图

- `bg_farm-source.png`：2026-08-11 使用 Codex 内置 imagegen 生成的原创 9:16 源图。
- 游戏切图：`game/assets/resources/textures/bg_farm.jpg`，720×1280、JPEG 82%。
- 用途：第三张可玩地图「池塘农场」的 3D 场景背景。中央 55% 刻意留空，只在四周放
  池塘、木栅栏、芦苇和农舍，避免背景装饰被误认成可点击物件。

最终生成提示词：

> Use case: stylized-concept. Asset type: vertical mobile game background for a 3D matching game.
> Create an original polished pond-farm environment at warm golden morning, with a shallow blue-green
> pond, wooden fence, reeds, lotus leaves, a red barn and distant fields around the outer frame. Use a
> high-end stylized 3D casual-game look, portrait 9:16 and an elevated 45-degree view. Keep the central
> 55% visually quiet as an empty stage for a separately rendered 3D container. No basket, UI, text,
> characters, animals, loose collectibles, fruit, jade artifacts, logo or watermark.

## 3D 模型与图标

`scripts/gen_farm_theme.py` 使用 Blender 4.x/5.x headless 程序化生成：

- 9 个物件：`carrot`、`corn`、`eggplant`、`frog`、`pumpkin`、`mushroom`、`koi`、
  `lotus`、`duck`；
- 1 个容器：`basket_farm`；
- 9 张 192×192 透明槽位图标。

模型均为原创程序化几何，纯色 PBR 材质，物件最大边归一化为 1.0。青蛙约 8.1k、鸭子
约 5.9k、莲花约 3.9k、南瓜约 3.2k 三角面，其余单件不超过约 2.1k；胡萝卜横纹、
玉米错列粒阵、南瓜明暗
分瓣、蘑菇斑点，以及动物的表情和肢体均针对近俯视真机视角保留。

### 青蛙与鸭子角色设计稿

最终重建参考：`concepts/frog-duck-character-sheet-v1.png`。设计稿由 Codex 内置 imagegen
生成，随后仅将适合低多边形程序化建模的圆润大形、比例、配色和表情还原到 GLB。

最终提示词摘要：为竖屏移动端 3D 配对游戏制作青蛙和鸭子的统一角色设计表，每个角色
包含近俯视三分之四主视图以及正/侧辅助视图；青蛙采用紧凑梨形坐姿、头身融合、宽距大眼、
折叠后腿、三趾前脚与浅色腹部；鸭子采用直立圆身、独立圆头、扁宽橙色上下喙、贴身分层
翅膀、小尾羽、蹼足与头顶绒羽。使用高品质休闲手游 3D 黏土质感，要求 100 像素下仍清楚，
并可由球体、椭球和简单锥形几何还原；避免凸眼、扁平身体、豆形轮廓、斗鸡眼和复杂碎羽。
藤编篮采用深色内衬、经纬交替短藤片、四边立桩与双层包边，约 4k 三角面；细小编织件
刻意不做倒角，把面数留给实际可见的外轮廓。只重生成容器时在命令末尾追加
`-- --container-only`；只重生成九个物件与图标时追加 `-- --items-only`。

复现命令：

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background \
  --python scripts/gen_farm_theme.py
```
