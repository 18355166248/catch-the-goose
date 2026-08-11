# 古玩铺补充模型

为让古玩铺大师关与其他三个主题保持同样的 9 种 / 56 件口径，新增：

- `yuxi`：青玉方玺、金边与朱红印面，俯视轮廓为方形；
- `ruyi`：浅玉长柄、三瓣云头与朱砂珠，俯视轮廓为细长曲线。

两件均由 `scripts/gen_antique_additions.py` 在 Blender 中程序化生成，不使用第三方模型或贴图。

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background \
  --python scripts/gen_antique_additions.py
```
