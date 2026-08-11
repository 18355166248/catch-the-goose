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

模型均为原创程序化几何，纯色 PBR 材质，物件最大边归一化为 1.0，单件不超过 2k 面。

复现命令：

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background \
  --python scripts/gen_farm_theme.py
```
