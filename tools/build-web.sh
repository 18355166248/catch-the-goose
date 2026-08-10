#!/usr/bin/env bash
# Cocos web-mobile 构建。
#
# 两条约束写在这里，别在命令行里临时改：
#
# 1. **不要开 md5Cache**。它会把产物根目录的文件按内容改名，包括
#    build-templates 拷过去的 jolt-glue.js（→ jolt-glue.<hash>.js）。
#    而 JoltLoader 是按固定路径 `jolt-glue.js` 用原生动态 import 加载它的，
#    改名即 404 → 物理静默不初始化 → 物件停在投放点不动、消除也不塌，
#    看着像"堆积效果变差"而不是"物理没了"。踩过一次，代价很大。
#    浏览器缓存问题请用 tools/serve.py 的 no-store 头解决，不要靠改文件名。
#
# 2. 构建期间**保持 Cocos 编辑器开着**。CLI 单独跑全量编译会产出能过构建、
#    但运行时 cc.game.init() 挂住不返回的坏包（不报错，极难反查）。
# 不用 pipefail：构建日志要过两道 grep，过滤后为空会让整条管道非零退出，
# 而那并不代表构建失败。成败以最后的产物检查为准。
set -uo pipefail
set +e

CC="/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if ! pgrep -f "CocosCreator --project" > /dev/null; then
    echo "⚠️  Cocos 编辑器没开。CLI 全量编译可能产出坏包，建议先打开工程。"
fi

"$CC" --project "$ROOT/game" --build "platform=web-mobile;buildPath=project://build" \
    2>&1 | grep -iE "Finished|error:" | grep -viE "^\s*at |BABEL" | tail -3

GLUE="$ROOT/game/build/web-mobile/jolt-glue.js"
if [ ! -f "$GLUE" ]; then
    echo "❌ 产物里没有 jolt-glue.js —— 物理会静默失效。检查是否误开了 md5Cache。"
    ls "$ROOT/game/build/web-mobile/" | grep -i jolt || echo "(根目录无任何 jolt 文件)"
    exit 1
fi
echo "✅ jolt-glue.js 就位（$(du -h "$GLUE" | cut -f1)）"
