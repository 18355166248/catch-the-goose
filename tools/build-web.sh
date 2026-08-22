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
# 构建失败必须原样向上传递。旧脚本用 `set +e` 再把日志送进 grep，Creator 即使失败，
# 只要目录里还留着上一次的产物，后面的文件检查就可能把旧包误判成新包。
set -euo pipefail

CC="/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# 注意是**本工程**开着才算数：编辑器开着另一个工程时，这里的 CLI 依然会全量编译，
# 依然"构建成功"，产出的却是 execute 为空的空壳包——页面停在加载页、控制台一条错误都没有。
# 2026-08-11 踩过：编辑器当时开的是隔壁工程，白验证了一轮。
PROJECT="$ROOT/game"
OUTPUT="$PROJECT/build/web-mobile"

if ! pgrep -f "CocosCreator --project $PROJECT" > /dev/null; then
    echo "⚠️  Cocos 编辑器没有打开本工程（$ROOT/game）。"
    echo "   CLI 全量编译会产出能过构建、但运行时挂在加载页的空壳包。请先在 Creator 里打开本工程。"
    exit 1
fi

# 只有确认构建前提满足后才删旧目标；这样后续门禁看到的一定是本次新产物。
rm -rf "$OUTPUT"
BUILD_LOG="$(mktemp -t catch-the-goose-build.XXXXXX)"
trap 'rm -f "$BUILD_LOG"' EXIT
set +e
"$CC" --project "$PROJECT" --build \
    "platform=web-mobile;debug=false;sourceMaps=false;nativeCodeBundleMode=wasm;buildPath=project://build;outputName=web-mobile" \
    >"$BUILD_LOG" 2>&1
CREATOR_STATUS=$?
set -e
if ! grep -q 'build Task (web-mobile) Finished' "$BUILD_LOG"; then
    tail -80 "$BUILD_LOG"
    echo "❌ Cocos 构建失败。"
    exit 1
fi
if [ "$CREATOR_STATUS" -ne 0 ]; then
    # Creator 3.8.8 在“编辑器已开 + CLI 构建”模式下偶发完成全部任务后仍返回 1；
    # 不能只信退出码，也不能像旧脚本那样完全忽略。必须同时有 Finished 且无 error 才接受。
    # 已打开编辑器时，CLI worker 收尾会记录 build-script / build-engine SIGTERM 并返回 36，
    # 但任务随后完整 Finished；只豁免这两条已验证的收尾噪声，其他 error 仍立即失败。
    if grep -iE '(^|[^a-z])error:' "$BUILD_LOG" \
        | grep -vE '^\[[0-9]+:.*:ERROR:ssl_client_socket_impl.*handshake failed' \
        | grep -vF 'Exit process with code:null, signal:SIGTERM in task build-script' \
        | grep -qvF 'Exit process with code:null, signal:SIGTERM in task build-engine'; then
        tail -80 "$BUILD_LOG"
        echo "❌ Creator 返回 ${CREATOR_STATUS}，日志同时包含 error。"
        exit 1
    fi
    echo "⚠️  Creator 返回 ${CREATOR_STATUS}，但完整日志确认任务 Finished 且无 error，继续产物门禁。"
fi
grep -iE "Finished|error:" "$BUILD_LOG" \
    | grep -viE "^\s*at |BABEL" \
    | grep -vE '^\[[0-9]+:.*:ERROR:ssl_client_socket_impl.*handshake failed' \
    | grep -vF 'Exit process with code:null, signal:SIGTERM in task build-script' \
    | grep -vF 'Exit process with code:null, signal:SIGTERM in task build-engine' \
    | tail -3 || true

# 不靠目录体积猜构建模式：直接核对 Creator 本次记录下来的生效配置。
for EXPECTED in '"debug":false' '"sourceMaps":false' '"nativeCodeBundleMode":"wasm"' '"md5Cache":false'; do
    if ! grep -q "$EXPECTED" "$BUILD_LOG"; then
        echo "❌ 构建日志缺少生效配置 $EXPECTED。"
        exit 1
    fi
done

GLUE="$OUTPUT/jolt-glue.js"
if [ ! -f "$GLUE" ]; then
    echo "❌ 产物里没有 jolt-glue.js —— 物理会静默失效。检查是否误开了 md5Cache。"
    find "$OUTPUT" -maxdepth 1 -iname '*jolt*' -print || true
    exit 1
fi
echo "✅ jolt-glue.js 就位（$(du -h "$GLUE" | cut -f1)）"

# 空壳包自查：脚本包必然含玩法层的中文字面量，空壳包只有模块骨架而没有它们。
# 光看构建日志是查不出来的——空壳包一样报 Finished，页面也一样不报错，只是停在加载页。
MAIN="$OUTPUT/assets/main/index.js"
if ! grep -q "退出本局" "$MAIN" 2>/dev/null; then
    echo "❌ 产物是空壳包：assets/main/index.js 里找不到玩法层代码（execute 为空）。"
    echo "   几乎总是同一个原因——Cocos 编辑器没开本工程。开了再构建一次。"
    exit 1
fi
echo "✅ 脚本包完整（$(du -h "$MAIN" | cut -f1)）"

# release 构建不应携带 source map；20MB 是当前 17.8MiB 原始发布目录的增长门禁。
if find "$OUTPUT" -type f -name '*.map' -print -quit | grep -q .; then
    echo "❌ release 产物仍包含 source map。"
    exit 1
fi
SIZE_MB="$(du -sm "$OUTPUT" | cut -f1)"
if [ "$SIZE_MB" -gt 20 ]; then
    echo "❌ 产物 ${SIZE_MB}MB，超过 20MB 门禁；检查构建模式与 resources 资源。"
    exit 1
fi
echo "✅ release/WASM 产物门禁通过（${SIZE_MB}MB，无 source map，MD5 关闭）"
