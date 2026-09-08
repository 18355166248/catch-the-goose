# 可重复的逐模型重建与验收

2026-09-08 增加的 `gen_basket_redwood_v2.py`、`gen_banana_v2.py`、`gen_corn_v2.py`
使用仓库内 `model_refresh_geometry.py`。候选始终写入被忽略的
`assets-3d/candidates/refresh-2026-09-08/`，脚本不会直接覆盖游戏资源。

旧流程引用的 `/Users/xmly/.agents/skills/img2threejs/forge/stage2_spec/validate_sculpt_spec.py`
在此 Windows 环境不存在。本轮采用仓库内的 schemaVersion 1 规格和
`scripts/validate_model_spec.py --strict-quality`，检查质量契约、预算、部件连接层级和细节映射。
这是当前生成器的独立校验器，不代表运行过旧 img2threejs 规格校验。

```text
python scripts/validate_model_spec.py design/fruit-theme/banana-v2/banana-sculpt-spec.json --strict-quality
blender --background --python-exit-code 1 --python scripts/gen_banana_v2.py
blender --background --python-exit-code 1 --python scripts/render_model_audit.py -- --only banana --models-dir assets-3d/candidates/refresh-2026-09-08 --output audit/model-quality/banana-v2/final
```

生成器另行检查网格闭合、三角面与材质预算、纹理尺寸和最大边归一化，导出同名 `.metrics.json`。
规格中的尺寸描述不能代替几何检查；正面、侧面（112°）、背面（232°）仍需视觉复核。
`render_model_audit.py` 现在支持显式指定容器，并在模型不存在时失败，避免旧版静默输出零张图。
容器审计使用固定 1.70 正交视野，物件保持 1.48，同一模型前后机位一致。

通过后再逐个复制 GLB、生成目标物件图标、用 Creator 导入，并核对原有 UUID、网格数、材质数和面数。
Windows 构建前关闭该工程的编辑器，运行 `node tools/check.mjs` 和 `node tools/build-web.mjs`。

运行 `python tools/serve.py` 启动发布预览后，`tools/model-runtime-audit.cjs` 使用 Playwright
检查水果/农场主题在 390×844、347×603、1280×720 下的新部件加载、物理约束、真实鼠标入槽、
受控冻结、三消及解冻。先用鼠标点击第一件，另外两件调用同一玩法拾取方法；受控冻结只在
隔离的测试浏览器设置，不改关卡或持久存档。报告写入 `audit/runtime/model-refresh.json`，
390×844 截图写入各模型 `in-game/`。

Playwright 可由环境已有安装提供；默认加载 `playwright`，或设置 `PLAYWRIGHT_MODULE` 为模块路径。
`GAME_URL` 可覆盖默认的 `http://127.0.0.1:5185/`。运行前必须等待发布构建成功，避免读取半成品。
该脚本覆盖本轮三个模型，不是全模型或真实手机性能基准。
