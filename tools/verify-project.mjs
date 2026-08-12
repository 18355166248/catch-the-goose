#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(join(root, path), 'utf8');
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

const levelConfig = read('game/assets/scripts/core/LevelConfig.ts');
const gameManager = read('game/assets/scripts/core/GameManager.ts');
const saveData = read('game/assets/scripts/core/SaveData.ts');
const remoteTextures = read('game/assets/scripts/core/ui/RemoteTextures.ts');
const telemetry = read('game/assets/scripts/core/Telemetry.ts');

// 配置里的每个主题必须保持 9 种，而且模型与槽位图标必须成对存在。
const familyMatches = [...levelConfig.matchAll(/family:\s*\[([^\]]+)\]/g)];
check(familyMatches.length === 4, `应有 4 个主题 family，实际 ${familyMatches.length}`);
for (const [index, match] of familyMatches.entries()) {
  const ids = [...match[1].matchAll(/'([^']+)'/g)].map(hit => hit[1]);
  check(ids.length === 9, `第 ${index + 1} 个主题应有 9 种物件，实际 ${ids.length}`);
  for (const id of ids) {
    check(existsSync(join(root, `game/assets/resources/models/${id}.glb`)), `缺模型：${id}.glb`);
    check(existsSync(join(root, `game/assets/resources/icons/${id}.png`)), `缺图标：${id}.png`);
  }
}

check(!gameManager.includes('DAILY_LIMIT_OFF'), '发布代码仍含 DAILY_LIMIT_OFF 测试旁路');
check(gameManager.includes('physicsReady'), '缺少 Jolt 启动门闩');
check(gameManager.includes('loadLevelAssets'), '缺少模型完整性门禁');
check(saveData.includes("BEST = 'goose_best_v2'"), '成绩存档未升级到按主题隔离的 v2');
check(/SaveData\.getBest\(getActiveTheme\(\)\.id\)/.test(gameManager), '读取成绩时未传 themeId');
check(/SaveData\.setBest\(getActiveTheme\(\)\.id,/.test(gameManager), '写入成绩时未传 themeId');

for (const asset of ['station-frame.png', 'selection-badge.png']) {
  const path = join(root, `game/assets/resources/textures/challenge-ui/fallback/${asset}`);
  check(existsSync(path), `缺 CDN 本地降级图：${asset}`);
  if (existsSync(path)) check(statSync(path).size > 1024, `CDN 本地降级图异常小：${asset}`);
}
check(remoteTextures.includes("fallback: 'textures/challenge-ui/fallback/station-frame/texture'"),
  '站点框没有配置本地降级路径');
check(remoteTextures.includes("fallback: 'textures/challenge-ui/fallback/selection-badge/texture'"),
  '选中徽章没有配置本地降级路径');
for (const eventName of ['app_boot', 'physics_ready', 'round_start', 'round_end', 'round_exit',
  'prop_use', 'rescue_use', 'asset_load_failed', 'runtime_error']) {
  check(gameManager.includes(`'${eventName}'`) || telemetry.includes(`'${eventName}'`),
    `缺核心观测事件：${eventName}`);
}
check(telemetry.includes('MAX_QUEUE = 200'), '观测队列缺少 200 条上限');
check(telemetry.includes("telemetryEndpoint?.trim()"), '观测发送未受显式 endpoint 配置控制');

// 有正式产物时一并做静态冒烟；没有构建目录时不妨碍日常类型检查。
const output = join(root, 'game/build/web-mobile');
if (existsSync(output)) {
  const mustExist = ['jolt-glue.js', 'index.html', 'assets/main/index.js'];
  for (const file of mustExist) check(existsSync(join(output, file)), `构建产物缺少 ${file}`);
  const mainPath = join(output, 'assets/main/index.js');
  if (existsSync(mainPath)) check(readFileSync(mainPath, 'utf8').includes('退出本局'), '构建脚本包是空壳');
  const maps = [];
  const walk = dir => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.map')) maps.push(path);
    }
  };
  walk(output);
  check(maps.length === 0, `release 产物含 ${maps.length} 个 source map`);
}

if (failures.length) {
  console.error(`❌ 项目校验失败（${failures.length} 项）`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log('✅ 项目静态门禁通过：主题资源、发布开关、存档隔离、启动门闩、CDN 降级与构建产物均正常');
