# 抓住大鹅

Cocos Creator 3.8.8 + TypeScript 的 H5 物理三消游戏。当前包含水果篮、古玩铺、池塘农场、
甜品小镇四个主题，每个主题均有轻松、标准、大师三档。

## 开发

1. 用 Cocos Creator 3.8.8 打开 `game/`。
2. 改动后运行 `node tools/check.mjs`（Node.js 20.11+；Windows / macOS 通用）。
3. Windows 等资源导入完成后保存并关闭 Creator，macOS 保持本工程编辑器打开；
   再运行 `node tools/build-web.mjs`。脚本会强制 release/WASM、关闭 MD5 和 source map，
   并检查 Jolt、空壳包与产物体积。
4. 本地预览运行 `python tools/serve.py`（macOS 可用 `python3`），访问 `http://127.0.0.1:5185/`。

检查需要 Python 3.8+ 和 Bash（Windows 自动查找 Git for Windows 的 Bash）。TypeScript
优先使用项目依赖，其次使用 Creator 自带版本，无需临时联网安装。首次打开工程后等待
Creator 生成 `game/temp/declarations/` 类型声明。非默认安装目录可通过 `COCOS_CREATOR`
指定编辑器可执行文件；也支持 `TSC_PATH`、`BASH_PATH`、`PYTHON` 覆盖工具路径。
原有 `./tools/check.sh` 和 `./tools/build-web.sh` 继续可用。

逻辑回归测试位于 `tests/*.test.mjs`，统一检查命令会自动运行，覆盖存档容错、统计队列并发与模型加载。
本轮优化记录见 `docs/optimization-2026-09-08.md`。

## 发布前验收

- 自动门禁：依次运行 `node tools/check.mjs` 和 `node tools/build-web.mjs`
- 浏览器：347×603、390×844、1280×720 三档视口完成首页、开局、暂停、退出、重开。
- 真机：按 `docs/real-device-checklist.md` 在 iPhone 8 与骁龙 6 系设备记录结果。

更完整的玩法、架构与历史决策见 `PLAN.md`；逐次视觉验收证据见 `design-qa.md`。
