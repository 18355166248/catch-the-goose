/**
 * 把 lab/shared/ 的三份共享代码同步进 Cocos 工程。
 *
 * 为什么要拷贝而不是 import：Cocos 只编译 assets/ 目录里的脚本，assets/ 内也不允许
 * import 工程外的模块。而三套 POC 又必须用**同一份**规格与同一把指标尺子，否则比出来
 * 的是参数差异不是引擎差异。折中办法就是把 lab/shared 当唯一真相源，生成一份只读副本
 * 到 game/assets/scripts/lab/，并在文件头打上「生成物，勿手改」的标记。
 *
 * 改了 lab/shared/*.ts 之后必须重跑：
 *   node lab/sync-spec.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, 'shared');
const dst = join(here, '..', 'game', 'assets', 'scripts', 'lab');

const FILES = ['scenario.ts', 'metrics.ts', 'harness.ts'];

const BANNER = `// ⚠️ 本文件由 lab/sync-spec.mjs 从 lab/shared/ 生成，**请勿手改**。
// 改规格请改 lab/shared/ 下的同名文件，然后重跑：node lab/sync-spec.mjs
// 存在这份副本，只是因为 Cocos 的 assets/ 不能 import 工程外的模块。

`;

mkdirSync(dst, { recursive: true });
for (const f of FILES) {
    const text = readFileSync(join(src, f), 'utf8');
    writeFileSync(join(dst, f), BANNER + text);
    console.log(`同步 ${f} → game/assets/scripts/lab/${f}`);
}
console.log('完成。');
