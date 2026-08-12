# 抓住大鹅

Cocos Creator 3.8.8 + TypeScript 的 H5 物理三消游戏。当前包含水果篮、古玩铺、池塘农场、
甜品小镇四个主题，每个主题均有轻松、标准、大师三档。

## 开发

1. 用 Cocos Creator 3.8.8 打开 `game/`。
2. 改动后运行 `./tools/check.sh`。
3. 正式构建运行 `./tools/build-web.sh`。脚本会强制 release/WASM、关闭 MD5 和 source map，
   并检查 Jolt、空壳包与产物体积。
4. 本地预览运行 `python3 tools/serve.py`，访问 `http://127.0.0.1:5185/`。

## 发布前验收

- 自动门禁：`./tools/check.sh && ./tools/build-web.sh`
- 浏览器：347×603、390×844、1280×720 三档视口完成首页、开局、暂停、退出、重开。
- 真机：按 `docs/real-device-checklist.md` 在 iPhone 8 与骁龙 6 系设备记录结果。

更完整的玩法、架构与历史决策见 `PLAN.md`；逐次视觉验收证据见 `design-qa.md`。
