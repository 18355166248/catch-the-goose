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

# 注意是**本工程**开着才算数：编辑器开着另一个工程时，这里的 CLI 依然会全量编译，
# 依然"构建成功"，产出的却是 execute 为空的空壳包——页面停在加载页、控制台一条错误都没有。
# 2026-08-11 踩过：编辑器当时开的是隔壁工程，白验证了一轮。
if ! pgrep -f "CocosCreator --project $ROOT" > /dev/null; then
    echo "⚠️  Cocos 编辑器没有打开本工程（$ROOT/game）。"
    echo "   CLI 全量编译会产出能过构建、但运行时挂在加载页的空壳包。请先在 Creator 里打开本工程。"
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

# 空壳包自查：脚本包必然含玩法层的中文字面量，空壳包只有模块骨架而没有它们。
# 光看构建日志是查不出来的——空壳包一样报 Finished，页面也一样不报错，只是停在加载页。
MAIN="$ROOT/game/build/web-mobile/assets/main/index.js"
if ! grep -q "退出本局" "$MAIN" 2>/dev/null; then
    echo "❌ 产物是空壳包：assets/main/index.js 里找不到玩法层代码（execute 为空）。"
    echo "   几乎总是同一个原因——Cocos 编辑器没开本工程。开了再构建一次。"
    exit 1
fi
echo "✅ 脚本包完整（$(du -h "$MAIN" | cut -f1)）"
