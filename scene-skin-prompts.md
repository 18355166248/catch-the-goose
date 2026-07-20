# 场景皮肤背景图 · AI 生图 Prompt 合集

> 用途：为《抓住大鹅》各皮肤生成 2D 背景大板（`resources/textures/<皮肤id>/`）。
> 生图工具：GPT Image / Gemini（Nano Banana、Imagen）。每条均为**完整可直接粘贴**的整段。
> v2：依据真机截图重写——强虚化、场景与容器同环境、软 3D 手游渲染风。

---

## 出图前必读 · 5 条要点（据截图修订）

1. **背景 = 容器所在的真实环境，不是无关装饰画**。绿购物篮配模糊超市货架、铁锅配灶台、雪糕柜配冰淇淋店、红木盒配玻璃古董柜——容器与背景是**同一个场景**，整体才协调。
2. **重虚化（关键）**：背景几乎全部糊成奶油 bokeh，只留氛围色块与轮廓；顶部区域可略清晰以点题，其余越糊越好。这是背景不抢戏的核心。
3. **软 3D 休闲手游渲染风**：光滑圆润、材质干净、暖调均匀光——和游戏里 3D 翡翠/大鹅物件统一，不要平面卡通插画。
4. **顶部斜向玻璃反光**：加一条淡淡的对角高光，营造"隔着展柜/冰柜玻璃在看"的层次（截图里反复出现）。
5. **背景会被 tint 相乘**：`SceneSkin.backdrop` 颜色会乘到贴图上。要"所见即所得"就把该皮肤 `backdrop` 设成白 `Color(255,255,255)`（同 redwood）；想要统一滤镜再留淡 tint。

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

## 附：容器/物件配套主题（B 组套装参考）

| 主题 | 容器 | 物件方向 | 背景 prompt |
|---|---|---|---|
| 便利店冷饮 | 绿购物篮 / 塑料筐 | 汽水、饮料瓶、罐装 | #7 cooler |
| 乡村厨房 | 黑铁锅 / 大碗 | 切段蔬菜、香肠、鸡蛋 | #8 kitchen |
| 冰淇淋 | 粉色冰柜筐 | 雪糕、甜筒、冰棒 | #9 icecream |
| 烘焙店 | 藤编面包篮 | 面包、可颂、蛋糕 | #10 bakery |
| 火锅 | 铜锅 / 砂锅 | 毛肚、丸子、蔬菜 | #11 hotpot |
| 水果摊 | 竹筐 / 果篮 | 各色水果 | #12 fruit |
