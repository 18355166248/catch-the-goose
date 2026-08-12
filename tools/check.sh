#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TSC="/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript/lib/tsc.js"

node "$TSC" --noEmit -p "$ROOT/game/tsconfig.check.json"
node "$ROOT/tools/verify-project.mjs"
node "$ROOT/tools/analyze-telemetry.mjs" "$ROOT/tests/fixtures/telemetry.sample.json" > /dev/null
bash -n "$ROOT/tools/build-web.sh" "$ROOT/scripts/compress_glb.sh"

# 只编译源码对象、不落 pyc，避免自测污染工作区或 Cocos 资源扫描目录。
python3 -B -c 'import ast,pathlib,sys; [ast.parse(p.read_text(), filename=str(p)) for arg in sys.argv[1:] for p in pathlib.Path(arg).glob("*.py")]' \
    "$ROOT/tools" "$ROOT/scripts"

echo "✅ 类型、项目约束、Shell 与 Python 语法全部通过"
