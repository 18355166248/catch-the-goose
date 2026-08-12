# 甜品小镇主题素材说明

## 场景底图

- `bg_dessert-source.png`：2026-08-11 使用 Codex 内置 imagegen 生成的原创 9:16 源图。
- 游戏切图：`game/assets/resources/textures/bg_dessert.jpg`，720×1280、JPEG 82%。
- 画面结构：甜品建筑、遮阳棚和花箱只围在外圈，中央 55% 保持为空广场，用于承接独立
  3D 陶瓷托盘和可点击物件。

最终生成提示词：

> Use case: stylized-concept. Asset type: vertical mobile game background for a 3D matching game.
> Create an original polished dessert-town environment at golden hour, with candy-colored European
> bakery facades, striped awnings, cafe tables, flower boxes, a cobblestone lane and a distant cake-like
> clock tower. Use a high-end stylized 3D casual-game look, portrait 9:16 and elevated 45-degree view.
> Keep the central 55% as a clean empty plaza for a separately rendered dessert tray. No tray, UI,
> readable text, characters, animals, loose collectibles, fruit, jade artifacts, logo or watermark.

## 3D 模型与图标

`scripts/gen_dessert_theme.py` 复用池塘农场的 Blender 导出/渲染管线，程序化生成：

- 9 个物件：`cupcake`、`donut`、`icecream`、`macaron`、`cookie`、`cake_slice`、
  `candy`、`pudding`、`croissant`；
- 1 个容器：`tray_dessert`；
- 9 张 192×192 透明槽位图标。

模型全部为原创程序化几何，物件最大边归一化为 1.0，单件不超过 1.5k 面。
陶瓷托盘针对游戏近正俯视相机采用一体圆角瓷胎、奶油/粉色格纹衬纸、完整内侧壁、
金色管边和四角莓果奶油徽章，约 9.5k 三角面；可见细节集中在顶面，避免只增加侧面厚度却
在实际游戏中看不出来。只重生成容器时在命令末尾追加 `-- --container-only`。

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background \
  --python scripts/gen_dessert_theme.py
```
