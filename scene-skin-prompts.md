# 场景皮肤背景图 · AI 生图 Prompt 合集

> 用途：为《抓住大鹅》各皮肤生成 2D 背景大板（`resources/textures/<皮肤id>/`）。
> 生图工具：GPT Image / Gemini（Nano Banana、Imagen）。每条均为**完整可直接粘贴**的整段。
> v2：依据真机截图重写——强虚化、场景与容器同环境、软 3D 手游渲染风。
> v3：新增 12 个发散场景（含 3 个截图同款）+ 每个场景标注**容器造型与物理边界类型**（矩形 / 圆形），
> 与代码 `ContainerBoundary` 一一对应——从选题阶段就保证「物品不会离开承载物」。

---

## 出图前必读 · 5 条要点（据截图修订）

1. **背景 = 容器所在的真实环境，不是无关装饰画**。绿购物篮配模糊超市货架、铁锅配灶台、雪糕柜配冰淇淋店、红木盒配玻璃古董柜——容器与背景是**同一个场景**，整体才协调。
2. **重虚化（关键）**：背景几乎全部糊成奶油 bokeh，只留氛围色块与轮廓；顶部区域可略清晰以点题，其余越糊越好。这是背景不抢戏的核心。
3. **软 3D 休闲手游渲染风**：光滑圆润、材质干净、暖调均匀光——和游戏里 3D 翡翠/大鹅物件统一，不要平面卡通插画。
4. **顶部斜向玻璃反光**：加一条淡淡的对角高光，营造"隔着展柜/冰柜玻璃在看"的层次（截图里反复出现）。
5. **背景会被 tint 相乘**：`SceneSkin.backdrop` 颜色会乘到贴图上。要"所见即所得"就把该皮肤 `backdrop` 设成白 `Color(255,255,255)`（同 redwood）；想要统一滤镜再留淡 tint。
6. **容器造型 = 物理边界（关键，新增）**：篮 / 盒 / 柜 / 抽屉是**矩形边界（rect）**，锅 / 碗 / 圆筐 / 煎盘 / 圆盘是**圆形边界（circle）**。选背景时先定容器造型，再按下表标注边界类型——代码 `ContainerBoundary` 会据此生成围栏 / 逃逸回收 / 视觉兜底 / 投放种子，**任何造型都保证物品不飞出承载物**。别画一个「圆锅背景」却配矩形容器，否则物件会停在圆锅外、矩形围栏内的空档里，视觉上就是「跑出锅了」。

**安全区（据截图实测）**：容器占屏幕中部约 55%，**顶部约 25% 是背景主展示区**，底部约 20% 被 7 格暂存槽 + 道具按钮遮住。→ 可辨识内容放**顶部条带和四周边缘**，中下部一律虚化留白。

## 落地步骤

1. 每条 prompt 出 2–4 张挑一张。
2. 1080×1920 生成 → 下采样 + 压缩（背景是大图，压到几十 KB~百 KB）。
3. 放入 `game/assets/resources/textures/<皮肤id>/`。
4. 对应皮肤：`backdrop` 设白、`backdropTex` 指到该名字。

---

## A. 现有 6 套皮肤 · 贴合容器的背景

### 1. 深红木 · 玻璃古董展示柜 (redwood)
```
An antique collector's room seen far behind the scene: a warm redwood display cabinet with glass shelves holding softly blurred jade carvings, porcelain vases and old treasures, dim cozy amber lighting, a faint diagonal reflection streak across the glass. Soft stylized 3D casual mobile-game render, smooth rounded forms and glossy clean materials, warm even lighting, the entire environment strongly out of focus with creamy bokeh and shallow depth of field so it reads as a gentle backdrop, most legible detail concentrated in the top strip above center, calm blurred empty space through the middle and lower area for the game container and item tray, subtle diagonal glass-reflection highlight, gentle edge vignette, cohesive with a cute collectible stacking game. No text, no letters, no numbers, no logo, no watermark, no UI, no people, no characters, no sharp in-focus clutter behind the container, nothing large or busy in the middle and lower center, no harsh perspective distortion. Vertical portrait composition, 9:16 aspect ratio, 1080x1920.
```

### 2. 翡翠青玉 · 青玉展柜 (jade)
```
A cool jade-green curio room seen far behind the scene: glass shelves with faintly blurred jade bangles and green gemstone carvings, soft misty emerald light, a gentle diagonal glass reflection. Soft stylized 3D casual mobile-game render, smooth rounded forms and glossy clean materials, warm even lighting, the entire environment strongly out of focus with creamy bokeh and shallow depth of field so it reads as a gentle backdrop, most legible detail concentrated in the top strip above center, calm blurred empty space through the middle and lower area for the game container and item tray, subtle diagonal glass-reflection highlight, gentle edge vignette, cohesive with a cute collectible stacking game. No text, no letters, no numbers, no logo, no watermark, no UI, no people, no characters, no sharp in-focus clutter behind the container, nothing large or busy in the middle and lower center, no harsh perspective distortion. Vertical portrait composition, 9:16 aspect ratio, 1080x1920.
```

### 3. 鎏金黑檀 · 描金漆器殿 (ebony)
```
An opulent dark lacquer treasure hall seen far behind the scene: blurred black-and-gold cabinets, faint red palace lanterns glowing warm, deep shadows with rich gold highlights, a soft diagonal reflection. Soft stylized 3D casual mobile-game render, smooth rounded forms and glossy clean materials, warm even lighting, the entire environment strongly out of focus with creamy bokeh and shallow depth of field so it reads as a gentle backdrop, most legible detail concentrated in the top strip above center, calm blurred empty space through the middle and lower area for the game container and item tray, subtle diagonal glass-reflection highlight, gentle edge vignette, cohesive with a cute collectible stacking game. No text, no letters, no numbers, no logo, no watermark, no UI, no people, no characters, no sharp in-focus clutter behind the container, nothing large or busy in the middle and lower center, no harsh perspective distortion. Vertical portrait composition, 9:16 aspect ratio, 1080x1920.
```

### 4. 青花瓷 · 青花瓷器展廊 (porcelain)
```
A bright blue-and-white porcelain gallery seen far behind the scene: blurred shelves lined with cobalt-blue patterned vases and plates, clean porcelain-white walls, cool airy light, a faint diagonal glass reflection. Soft stylized 3D casual mobile-game render, smooth rounded forms and glossy clean materials, warm even lighting, the entire environment strongly out of focus with creamy bokeh and shallow depth of field so it reads as a gentle backdrop, most legible detail concentrated in the top strip above center, calm blurred empty space through the middle and lower area for the game container and item tray, subtle diagonal glass-reflection highlight, gentle edge vignette, cohesive with a cute collectible stacking game. No text, no letters, no numbers, no logo, no watermark, no UI, no people, no characters, no sharp in-focus clutter behind the container, nothing large or busy in the middle and lower center, no harsh perspective distortion. Vertical portrait composition, 9:16 aspect ratio, 1080x1920.
```

### 5. 暖阳原木 · 原木食柜 (oak)
```
A warm cozy wooden pantry seen far behind the scene: blurred light-oak shelves with jars and simple ceramics, sheer curtains diffusing honey-gold morning sun, a soft diagonal light streak. Soft stylized 3D casual mobile-game render, smooth rounded forms and glossy clean materials, warm even lighting, the entire environment strongly out of focus with creamy bokeh and shallow depth of field so it reads as a gentle backdrop, most legible detail concentrated in the top strip above center, calm blurred empty space through the middle and lower area for the game container and item tray, subtle diagonal glass-reflection highlight, gentle edge vignette, cohesive with a cute collectible stacking game. No text, no letters, no numbers, no logo, no watermark, no UI, no people, no characters, no sharp in-focus clutter behind the container, nothing large or busy in the middle and lower center, no harsh perspective distortion. Vertical portrait composition, 9:16 aspect ratio, 1080x1920.
```

### 6. 超市购物篮 · 超市货架 (market)
```
A busy convenience-store aisle seen far behind the scene: blurred rows of colorful snacks and bottled drinks on bright shelves, faint payment QR stands low in the frame, cool clean store lighting with warm accents, a soft diagonal reflection. Soft stylized 3D casual mobile-game render, smooth rounded forms and glossy clean materials, warm even lighting, the entire environment strongly out of focus with creamy bokeh and shallow depth of field so it reads as a gentle backdrop, most legible detail concentrated in the top strip above center, calm blurred empty space through the middle and lower area for the game container and item tray, subtle diagonal glass-reflection highlight, gentle edge vignette, cohesive with a cute collectible stacking game. No text, no letters, no numbers, no logo, no watermark, no UI, no people, no characters, no sharp in-focus clutter behind the container, nothing large or busy in the middle and lower center, no harsh perspective distortion. Vertical portrait composition, 9:16 aspect ratio, 1080x1920.
```

---

## B. 新"生活场景"套装（截图同款方向，需配新容器 + 物件）

> 这些是**整套新主题**（容器 + 背景 + 物件），背景先用下列 prompt 出图；容器/物件另做。

### 7. 便利店冷饮柜 (cooler)
```
A convenience-store cold-drink cooler seen far behind the scene: blurred glass fridge doors packed with colorful bottled sodas, teas and juices, cool bluish fridge glow with bright store light above, a faint diagonal glass reflection. Soft stylized 3D casual mobile-game render, smooth rounded forms and glossy clean materials, warm even lighting, the entire environment strongly out of focus with creamy bokeh and shallow depth of field so it reads as a gentle backdrop, most legible detail concentrated in the top strip above center, calm blurred empty space through the middle and lower area for the game container and item tray, subtle diagonal glass-reflection highlight, gentle edge vignette, cohesive with a cute collectible stacking game. No text, no letters, no numbers, no logo, no watermark, no UI, no people, no characters, no sharp in-focus clutter behind the container, nothing large or busy in the middle and lower center, no harsh perspective distortion. Vertical portrait composition, 9:16 aspect ratio, 1080x1920.
```

### 8. 乡村厨房灶台 (kitchen)
```
A rustic countryside kitchen seen far behind the scene: a blurred wooden chopping board with green onions and garlic, a red plastic wash basin, warm daylight over a stone-tiled counter, homey cooking mood, soft haze. Soft stylized 3D casual mobile-game render, smooth rounded forms and glossy clean materials, warm even lighting, the entire environment strongly out of focus with creamy bokeh and shallow depth of field so it reads as a gentle backdrop, most legible detail concentrated in the top strip above center, calm blurred empty space through the middle and lower area for the game container and item tray, gentle edge vignette, cohesive with a cute collectible stacking game. No text, no letters, no numbers, no logo, no watermark, no UI, no people, no characters, no sharp in-focus clutter behind the container, nothing large or busy in the middle and lower center, no harsh perspective distortion. Vertical portrait composition, 9:16 aspect ratio, 1080x1920.
```

### 9. 冰淇淋冰柜 (icecream)
```
A cheerful pink ice-cream parlour seen far behind the scene: a blurred open freezer full of colorful popsicles and cones, glossy pastel-pink tiles, playful bright candy-shop lighting, a soft diagonal glass reflection. Soft stylized 3D casual mobile-game render, smooth rounded forms and glossy clean materials, warm even lighting, the entire environment strongly out of focus with creamy bokeh and shallow depth of field so it reads as a gentle backdrop, most legible detail concentrated in the top strip above center, calm blurred empty space through the middle and lower area for the game container and item tray, subtle diagonal glass-reflection highlight, gentle edge vignette, cohesive with a cute collectible stacking game. No text, no letters, no numbers, no logo, no watermark, no UI, no people, no characters, no sharp in-focus clutter behind the container, nothing large or busy in the middle and lower center, no harsh perspective distortion. Vertical portrait composition, 9:16 aspect ratio, 1080x1920.
```

### 10. 面包烘焙店 (bakery)
```
A warm bakery seen far behind the scene: blurred wooden shelves stacked with golden breads, croissants and pastries, soft oven glow, cozy amber light and floating flour dust, a faint diagonal reflection. Soft stylized 3D casual mobile-game render, smooth rounded forms and glossy clean materials, warm even lighting, the entire environment strongly out of focus with creamy bokeh and shallow depth of field so it reads as a gentle backdrop, most legible detail concentrated in the top strip above center, calm blurred empty space through the middle and lower area for the game container and item tray, gentle edge vignette, cohesive with a cute collectible stacking game. No text, no letters, no numbers, no logo, no watermark, no UI, no people, no characters, no sharp in-focus clutter behind the container, nothing large or busy in the middle and lower center, no harsh perspective distortion. Vertical portrait composition, 9:16 aspect ratio, 1080x1920.
```

### 11. 火锅店 (hotpot)
```
A steamy hotpot restaurant table seen far behind the scene: a blurred bubbling red broth pot, small dishes of ingredients around it, rising steam, warm red-lantern restaurant light, soft glow. Soft stylized 3D casual mobile-game render, smooth rounded forms and glossy clean materials, warm even lighting, the entire environment strongly out of focus with creamy bokeh and shallow depth of field so it reads as a gentle backdrop, most legible detail concentrated in the top strip above center, calm blurred empty space through the middle and lower area for the game container and item tray, gentle edge vignette, cohesive with a cute collectible stacking game. No text, no letters, no numbers, no logo, no watermark, no UI, no people, no characters, no sharp in-focus clutter behind the container, nothing large or busy in the middle and lower center, no harsh perspective distortion. Vertical portrait composition, 9:16 aspect ratio, 1080x1920.
```

### 12. 水果摊 (fruit)
```
A colorful fruit market stall seen far behind the scene: blurred crates of oranges, apples, watermelons and grapes, bright cheerful daylight under a striped awning, soft haze. Soft stylized 3D casual mobile-game render, smooth rounded forms and glossy clean materials, warm even lighting, the entire environment strongly out of focus with creamy bokeh and shallow depth of field so it reads as a gentle backdrop, most legible detail concentrated in the top strip above center, calm blurred empty space through the middle and lower area for the game container and item tray, gentle edge vignette, cohesive with a cute collectible stacking game. No text, no letters, no numbers, no logo, no watermark, no UI, no people, no characters, no sharp in-focus clutter behind the container, nothing large or busy in the middle and lower center, no harsh perspective distortion. Vertical portrait composition, 9:16 aspect ratio, 1080x1920.
```

---

## C. 中式古风主题（换口味备选）

### 13. 故宫红墙金瓦 (palace)
```
A grand Forbidden City courtyard seen far behind the scene: blurred crimson palace walls and golden roof tiles glowing in warm late-afternoon sun, soft haze, imperial red-and-gold mood. Soft stylized 3D casual mobile-game render, smooth rounded forms and glossy clean materials, warm even lighting, the entire environment strongly out of focus with creamy bokeh and shallow depth of field so it reads as a gentle backdrop, most legible detail concentrated in the top strip above center, calm blurred empty space through the middle and lower area for the game container and item tray, gentle edge vignette, cohesive with a cute collectible stacking game. No text, no letters, no numbers, no logo, no watermark, no UI, no people, no characters, no sharp in-focus clutter behind the container, nothing large or busy in the middle and lower center, no harsh perspective distortion. Vertical portrait composition, 9:16 aspect ratio, 1080x1920.
```

### 14. 夏日荷塘 (lotus)
```
A peaceful summer lotus pond seen far behind the scene: blurred green lily pads and pink lotus blooms, soft water ripples and warm hazy sunlight, fresh gentle mood. Soft stylized 3D casual mobile-game render, smooth rounded forms and glossy clean materials, warm even lighting, the entire environment strongly out of focus with creamy bokeh and shallow depth of field so it reads as a gentle backdrop, most legible detail concentrated in the top strip above center, calm blurred empty space through the middle and lower area for the game container and item tray, gentle edge vignette, cohesive with a cute collectible stacking game. No text, no letters, no numbers, no logo, no watermark, no UI, no people, no characters, no sharp in-focus clutter behind the container, nothing large or busy in the middle and lower center, no harsh perspective distortion. Vertical portrait composition, 9:16 aspect ratio, 1080x1920.
```

### 15. 春节年味 (newyear)
```
A festive Chinese New Year scene seen far behind the scene: blurred rows of red lanterns and soft golden firework bokeh in a twilight sky, red couplets at the edges, warm celebratory glow. Soft stylized 3D casual mobile-game render, smooth rounded forms and glossy clean materials, warm even lighting, the entire environment strongly out of focus with creamy bokeh and shallow depth of field so it reads as a gentle backdrop, most legible detail concentrated in the top strip above center, calm blurred empty space through the middle and lower area for the game container and item tray, gentle edge vignette, cohesive with a cute collectible stacking game. No text, no letters, no numbers, no logo, no watermark, no UI, no people, no characters, no sharp in-focus clutter behind the container, nothing large or busy in the middle and lower center, no harsh perspective distortion. Vertical portrait composition, 9:16 aspect ratio, 1080x1920.
```

### 16. 水墨山水 (inkwash)
```
A tranquil Chinese ink-wash landscape seen far behind the scene: blurred misty mountains fading into pale rice-paper white, a faint lone pine, soft grey-blue washes with lots of airy space. Soft stylized 3D casual mobile-game render, smooth rounded forms and glossy clean materials, warm even lighting, the entire environment strongly out of focus with creamy bokeh and shallow depth of field so it reads as a gentle backdrop, most legible detail concentrated in the top strip above center, calm blurred empty space through the middle and lower area for the game container and item tray, gentle edge vignette, cohesive with a cute collectible stacking game. No text, no letters, no numbers, no logo, no watermark, no UI, no people, no characters, no sharp in-focus clutter behind the container, nothing large or busy in the middle and lower center, no harsh perspective distortion. Vertical portrait composition, 9:16 aspect ratio, 1080x1920.
```

---

## D. 更多生活场景（v3 发散，逐条标注容器 / 边界）

> 每条前的 **【容器 / 边界】** 决定代码怎么围物件：`rect` = 矩形容器（默认，直接用）；
> `circle` = 圆形容器（需在该皮肤声明 `boundary`，并在 `buildBox` 换圆容器几何）。
> 标 ★ 的三条是本轮参考截图同款方向。

### 17. ★ 中式糖水铺 · 青花瓷甜品碗 (dessert) —— 【容器：青花大碗 / 边界：circle】
```
A Cantonese dessert (tong sui) shop counter seen far behind the scene: blurred blue-and-white porcelain bowls of mango sago, red bean soup and tofu pudding, a folded paper menu, plates of diced mango and beans on a warm wooden counter. Soft stylized 3D casual mobile-game render, smooth rounded forms and glossy clean materials, warm even lighting, the entire environment strongly out of focus with creamy bokeh and shallow depth of field so it reads as a gentle backdrop, most legible detail concentrated in the top strip above center, calm blurred empty space through the middle and lower area for the game container and item tray, gentle edge vignette, cohesive with a cute collectible stacking game. No text, no letters, no numbers, no logo, no watermark, no UI, no people, no characters, no sharp in-focus clutter behind the container, nothing large or busy in the middle and lower center, no harsh perspective distortion. Vertical portrait composition, 9:16 aspect ratio, 1080x1920.
```

### 18. ★ 早市摊 · 竹编圆筐特价 (bazaar) —— 【容器：竹编圆筐 / 边界：circle】
```
A cheerful morning street-market stall seen far behind the scene: a blurred round woven bamboo tray on a lace tablecloth, small ceramic lucky cat and cute figurine toys, a tiny potted cactus, a bargain-sale mood, warm daylight and soft haze. Soft stylized 3D casual mobile-game render, smooth rounded forms and glossy clean materials, warm even lighting, the entire environment strongly out of focus with creamy bokeh and shallow depth of field so it reads as a gentle backdrop, most legible detail concentrated in the top strip above center, calm blurred empty space through the middle and lower area for the game container and item tray, gentle edge vignette, cohesive with a cute collectible stacking game. No text, no letters, no numbers, no logo, no watermark, no UI, no people, no characters, no sharp in-focus clutter behind the container, nothing large or busy in the middle and lower center, no harsh perspective distortion. Vertical portrait composition, 9:16 aspect ratio, 1080x1920.
```

### 19. ★ 情人节礼物 · 粉色礼盒 (gift) —— 【容器：方形粉色礼盒 / 边界：rect】
```
A romantic Valentine tabletop seen far behind the scene: blurred pink roses, a softly lit scented candle, a wrapped pink gift box with a satin ribbon, scattered rose petals on light wood, dreamy pastel-pink mood. Soft stylized 3D casual mobile-game render, smooth rounded forms and glossy clean materials, warm even lighting, the entire environment strongly out of focus with creamy bokeh and shallow depth of field so it reads as a gentle backdrop, most legible detail concentrated in the top strip above center, calm blurred empty space through the middle and lower area for the game container and item tray, gentle edge vignette, cohesive with a cute collectible stacking game. No text, no letters, no numbers, no logo, no watermark, no UI, no people, no characters, no sharp in-focus clutter behind the container, nothing large or busy in the middle and lower center, no harsh perspective distortion. Vertical portrait composition, 9:16 aspect ratio, 1080x1920.
```

### 20. 日式早餐 · 铸铁煎锅 (breakfast) —— 【容器：圆煎锅 / 边界：circle】
```
A bright cozy breakfast kitchen seen far behind the scene: a blurred round cast-iron frying pan on a stove, sunny-side eggs, toast and a wooden cutting board, honey-gold morning light, homey soft haze. Soft stylized 3D casual mobile-game render, smooth rounded forms and glossy clean materials, warm even lighting, the entire environment strongly out of focus with creamy bokeh and shallow depth of field so it reads as a gentle backdrop, most legible detail concentrated in the top strip above center, calm blurred empty space through the middle and lower area for the game container and item tray, gentle edge vignette, cohesive with a cute collectible stacking game. No text, no letters, no numbers, no logo, no watermark, no UI, no people, no characters, no sharp in-focus clutter behind the container, nothing large or busy in the middle and lower center, no harsh perspective distortion. Vertical portrait composition, 9:16 aspect ratio, 1080x1920.
```

### 21. 珠宝店 · 天鹅绒圆盘 (jewelry) —— 【容器：天鹅绒圆盘 / 边界：circle】
```
An elegant jewelry boutique display seen far behind the scene: blurred velvet trays and a glass showcase holding rings, gemstones and gold pieces, soft warm spotlights, a faint diagonal glass reflection, luxe hushed mood. Soft stylized 3D casual mobile-game render, smooth rounded forms and glossy clean materials, warm even lighting, the entire environment strongly out of focus with creamy bokeh and shallow depth of field so it reads as a gentle backdrop, most legible detail concentrated in the top strip above center, calm blurred empty space through the middle and lower area for the game container and item tray, subtle diagonal glass-reflection highlight, gentle edge vignette, cohesive with a cute collectible stacking game. No text, no letters, no numbers, no logo, no watermark, no UI, no people, no characters, no sharp in-focus clutter behind the container, nothing large or busy in the middle and lower center, no harsh perspective distortion. Vertical portrait composition, 9:16 aspect ratio, 1080x1920.
```

### 22. 学生书桌 · 文具铅笔盒 (stationery) —— 【容器：长方形铅笔盒 / 边界：rect】
```
A cozy student study desk seen far behind the scene: blurred open notebooks, a cup full of colored pencils, a warm desk-lamp glow, sticky notes and a small potted plant, calm evening study mood. Soft stylized 3D casual mobile-game render, smooth rounded forms and glossy clean materials, warm even lighting, the entire environment strongly out of focus with creamy bokeh and shallow depth of field so it reads as a gentle backdrop, most legible detail concentrated in the top strip above center, calm blurred empty space through the middle and lower area for the game container and item tray, gentle edge vignette, cohesive with a cute collectible stacking game. No text, no letters, no numbers, no logo, no watermark, no UI, no people, no characters, no sharp in-focus clutter behind the container, nothing large or busy in the middle and lower center, no harsh perspective distortion. Vertical portrait composition, 9:16 aspect ratio, 1080x1920.
```

### 23. 中式茶席 · 竹茶盘 (tea) —— 【容器：长方形竹茶盘 / 边界：rect】
```
A serene Chinese tea ceremony table seen far behind the scene: blurred clay teapots and small tea cups, a bamboo tea tray, rising steam, a scroll and warm dark wood, tranquil zen mood. Soft stylized 3D casual mobile-game render, smooth rounded forms and glossy clean materials, warm even lighting, the entire environment strongly out of focus with creamy bokeh and shallow depth of field so it reads as a gentle backdrop, most legible detail concentrated in the top strip above center, calm blurred empty space through the middle and lower area for the game container and item tray, gentle edge vignette, cohesive with a cute collectible stacking game. No text, no letters, no numbers, no logo, no watermark, no UI, no people, no characters, no sharp in-focus clutter behind the container, nothing large or busy in the middle and lower center, no harsh perspective distortion. Vertical portrait composition, 9:16 aspect ratio, 1080x1920.
```

### 24. 花店 · 锌铁花桶 (florist) —— 【容器：圆花桶 / 边界：circle】
```
A fresh flower shop seen far behind the scene: blurred zinc metal buckets brimming with tulips, roses and eucalyptus, green foliage and wrapping paper, bright airy daylight, cheerful springtime mood. Soft stylized 3D casual mobile-game render, smooth rounded forms and glossy clean materials, warm even lighting, the entire environment strongly out of focus with creamy bokeh and shallow depth of field so it reads as a gentle backdrop, most legible detail concentrated in the top strip above center, calm blurred empty space through the middle and lower area for the game container and item tray, gentle edge vignette, cohesive with a cute collectible stacking game. No text, no letters, no numbers, no logo, no watermark, no UI, no people, no characters, no sharp in-focus clutter behind the container, nothing large or busy in the middle and lower center, no harsh perspective distortion. Vertical portrait composition, 9:16 aspect ratio, 1080x1920.
```

### 25. 五金工坊 · 零件盒 (hardware) —— 【容器：多格方形零件盒 / 边界：rect】
```
A tidy hardware workshop bench seen far behind the scene: a blurred pegboard with hanging tools, jars of screws and bolts, grey metal shelving, cool clean industrial light with warm accents. Soft stylized 3D casual mobile-game render, smooth rounded forms and glossy clean materials, warm even lighting, the entire environment strongly out of focus with creamy bokeh and shallow depth of field so it reads as a gentle backdrop, most legible detail concentrated in the top strip above center, calm blurred empty space through the middle and lower area for the game container and item tray, gentle edge vignette, cohesive with a cute collectible stacking game. No text, no letters, no numbers, no logo, no watermark, no UI, no people, no characters, no sharp in-focus clutter behind the container, nothing large or busy in the middle and lower center, no harsh perspective distortion. Vertical portrait composition, 9:16 aspect ratio, 1080x1920.
```

### 26. 中药铺 · 戥盘抓药 (herbal) —— 【容器：圆木戥盘 / 边界：circle】
```
A traditional Chinese medicine shop seen far behind the scene: a blurred wall of small wooden herb drawers, a brass balance scale, glass jars of dried herbs and roots, warm dim amber light, old apothecary mood. Soft stylized 3D casual mobile-game render, smooth rounded forms and glossy clean materials, warm even lighting, the entire environment strongly out of focus with creamy bokeh and shallow depth of field so it reads as a gentle backdrop, most legible detail concentrated in the top strip above center, calm blurred empty space through the middle and lower area for the game container and item tray, gentle edge vignette, cohesive with a cute collectible stacking game. No text, no letters, no numbers, no logo, no watermark, no UI, no people, no characters, no sharp in-focus clutter behind the container, nothing large or busy in the middle and lower center, no harsh perspective distortion. Vertical portrait composition, 9:16 aspect ratio, 1080x1920.
```

### 27. 日式寿司 · 圆木盘 (sushi) —— 【容器：圆木盘 / 边界：circle】
```
A minimalist Japanese sushi counter seen far behind the scene: blurred round wooden plates and a sushi boat, small soy-sauce dishes and pickled ginger, a bamboo mat, cool clean light with warm wood, calm izakaya mood. Soft stylized 3D casual mobile-game render, smooth rounded forms and glossy clean materials, warm even lighting, the entire environment strongly out of focus with creamy bokeh and shallow depth of field so it reads as a gentle backdrop, most legible detail concentrated in the top strip above center, calm blurred empty space through the middle and lower area for the game container and item tray, gentle edge vignette, cohesive with a cute collectible stacking game. No text, no letters, no numbers, no logo, no watermark, no UI, no people, no characters, no sharp in-focus clutter behind the container, nothing large or busy in the middle and lower center, no harsh perspective distortion. Vertical portrait composition, 9:16 aspect ratio, 1080x1920.
```

### 28. 户外野餐 · 藤编野餐篮 (picnic) —— 【容器：方形藤编篮 / 边界：rect】
```
A sunny outdoor picnic seen far behind the scene: a blurred plaid blanket on green grass, a wicker picnic basket, sandwiches, fruit and a thermos, dappled warm sunlight and soft garden bokeh, breezy cheerful mood. Soft stylized 3D casual mobile-game render, smooth rounded forms and glossy clean materials, warm even lighting, the entire environment strongly out of focus with creamy bokeh and shallow depth of field so it reads as a gentle backdrop, most legible detail concentrated in the top strip above center, calm blurred empty space through the middle and lower area for the game container and item tray, gentle edge vignette, cohesive with a cute collectible stacking game. No text, no letters, no numbers, no logo, no watermark, no UI, no people, no characters, no sharp in-focus clutter behind the container, nothing large or busy in the middle and lower center, no harsh perspective distortion. Vertical portrait composition, 9:16 aspect ratio, 1080x1920.
```

---

## 复用片段（自己拼新场景时用）

**STYLE 后缀：**
```
Soft stylized 3D casual mobile-game render, smooth rounded forms and glossy clean materials, warm even lighting, the entire environment strongly out of focus with creamy bokeh and shallow depth of field so it reads as a gentle backdrop, most legible detail concentrated in the top strip above center, calm blurred empty space through the middle and lower area for the game container and item tray, subtle diagonal glass-reflection highlight, gentle edge vignette, cohesive with a cute collectible stacking game.
```

**NEGATIVE 后缀：**
```
No text, no letters, no numbers, no logo, no watermark, no UI, no people, no characters, no sharp in-focus clutter behind the container, nothing large or busy in the middle and lower center, no harsh perspective distortion.
```

**尺寸：** `Vertical portrait composition, 9:16 aspect ratio, 1080x1920.`（GPT Image 用 `portrait 2:3, 1024x1536`）

---

## 附一：全场景 · 容器与边界对照表

> `边界` 列直接对应代码 `ContainerBoundary`：`rect` 用默认边界（免声明）；`circle` 需在该皮肤声明 `boundary`。
> 物件方向仅套装场景给出参考。

| # | 场景 | 容器 | 边界 | 物件方向 |
|---|---|---|---|---|
| 1 | 深红木 redwood | 红木展示盒 | rect | 玉器、钱币、手串 |
| 2 | 翡翠青玉 jade | 青玉展盒 | rect | 翡翠件 |
| 3 | 鎏金黑檀 ebony | 描金漆盒 | rect | 金玉件 |
| 4 | 青花瓷 porcelain | 青花展盒 | rect | 瓷器件 |
| 5 | 暖阳原木 oak | 原木食柜盒 | rect | 杂货 |
| 6 | 超市购物篮 market | 塑料购物篮 | rect | 零食饮料 |
| 7 | 便利店冷饮 cooler | 购物篮 / 塑料筐 | rect | 汽水、饮料瓶、罐装 |
| 8 | 乡村厨房 kitchen | 黑铁锅 / 大碗 | **circle** | 切段蔬菜、香肠、鸡蛋 |
| 9 | 冰淇淋 icecream | 粉色冰柜筐 | rect | 雪糕、甜筒、冰棒 |
| 10 | 烘焙店 bakery | 藤编面包篮 | rect | 面包、可颂、蛋糕 |
| 11 | 火锅 hotpot | 铜锅 / 砂锅 | **circle** | 毛肚、丸子、蔬菜 |
| 12 | 水果摊 fruit | 竹筐 / 果篮 | rect | 各色水果 |
| 13–16 | 古风背景 palace/lotus/newyear/inkwash | 沿用默认展盒 | rect | 通用 |
| 17 | ★ 糖水铺 dessert | 青花大碗 | **circle** | 芋圆、西米、红豆 |
| 18 | ★ 早市特价 bazaar | 竹编圆筐 | **circle** | 摆件、玩具 |
| 19 | ★ 情人节礼盒 gift | 方形粉色礼盒 | rect | 巧克力、口红、小熊 |
| 20 | 早餐煎锅 breakfast | 圆煎锅 | **circle** | 煎蛋、吐司、香肠 |
| 21 | 珠宝店 jewelry | 天鹅绒圆盘 | **circle** | 戒指、宝石 |
| 22 | 学生书桌 stationery | 长方形铅笔盒 | rect | 文具、彩铅 |
| 23 | 中式茶席 tea | 长方形竹茶盘 | rect | 茶壶、茶杯 |
| 24 | 花店 florist | 圆花桶 | **circle** | 花束、绿植 |
| 25 | 五金工坊 hardware | 多格方形零件盒 | rect | 螺丝、零件 |
| 26 | 中药铺 herbal | 圆木戥盘 | **circle** | 药材、根茎 |
| 27 | 日式寿司 sushi | 圆木盘 | **circle** | 寿司、小碟 |
| 28 | 户外野餐 picnic | 方形藤编篮 | rect | 三明治、水果 |

---

## 附二：工程边界约定（给程序 —— 保证物品永不离开承载物）

**一句话**：容器造型不同（矩形篮 / 圆锅 / 圆碗 / 圆盘），但「物品绝不飞出承载物」这条对所有造型通用，已抽象成
[`game/assets/scripts/core/ContainerBoundary.ts`](game/assets/scripts/core/ContainerBoundary.ts)。四个环节都走它：

1. **物理围栏** `buildWallSpecs` —— 矩形出 4 面厚墙，圆形出一圈 28 段切向薄墙（内壁恰在半径上），第一道硬阻挡；
2. **逃逸回收** `isEscaped` + `respawn` —— 巡检发现质心越界 / 掉底就从容器中心偏上重新倒入；
3. **视觉兜底** `clampAabb` —— 把渲染 AABB 拉回形状内（圆形沿最远角径向推回），杜绝网格探出容器；
4. **投放种子** `seedScale` —— 小容器自动收窄初始堆，一开局就不会溢出。

**新增一个圆形场景怎么做**（以糖水碗 dessert 为例）：

① 在 [`SceneSkin.ts`](game/assets/scripts/core/SceneSkin.ts) 该皮肤对象里加 `boundary`（圆心 / 半径按可见碗内壁量取）：

```ts
{
  id: 'dessert', name: '糖水碗',
  // ……floor / frame / rim / accent / shadow / backdrop 照常……
  boundary: {
    wall:  { kind: 'circle', cx: 0, cz: -0.88, radius: 1.25 }, // 物理围栏：贴碗内壁
    clamp: { kind: 'circle', cx: 0, cz: -0.88, radius: 1.40 }, // 视觉兜底：略大一圈
  },
}
```

② 在 `GameManager.buildBox()` 里把该皮肤的可见容器几何换成圆碗（矩形皮肤走原木盒分支即可）。
围栏 / 逃逸 / 兜底 / 投放**全部自动生效**，无需改动 `update`、`constrainVisualInside`、`spawnItems`。

**要点**：`wall` 贴容器内壁（约束刚体质心），`clamp` 比 `wall` 略大（约束渲染外轮廓，兜底防漏）；
矩形皮肤不写 `boundary` 即回落默认矩形，行为与历史版本一字不差。以后要长条 / 椭圆容器，只在
`ContainerBoundary` 里加一个 `kind` 分支即可，四个环节继续通用。
