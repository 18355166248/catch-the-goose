// ⚠️ 本文件由 lab/sync-spec.mjs 从 lab/shared/ 生成，**请勿手改**。
// 改规格请改 lab/shared/ 下的同名文件，然后重跑：node lab/sync-spec.mjs
// 存在这份副本，只是因为 Cocos 的 assets/ 不能 import 工程外的模块。

/**
 * 堆积实验场 —— 场景规格（三套 POC 的**唯一真相源**）。
 *
 * 只有把「容器尺寸 / 件表 / 件的缩放 / 出生点 / 初速度 / 随机种子 / 重力 / 步长」
 * 全部钉死在同一份数字上，三套引擎的录屏才具备可比性；任何一处让某套 POC 自行
 * 决定，比出来的就不是引擎差异而是参数差异。
 *
 * 数值全部抄自正式工程（game/assets/scripts/core/GameManager.ts 与 ContainerBoundary.ts），
 * 且**只取第一个红木矩形筐**——碗按方案退出第一阶段。
 *
 * 本文件不依赖任何引擎，POC B/C 直接 import；POC A 在 Cocos 工程内，由
 * `node lab/sync-spec.mjs` 生成一份等价副本到 game/assets/scripts/lab/ScenarioSpec.ts
 * （Cocos 的 assets/ 不能 import 工程外的模块）。改本文件后必须重跑同步脚本。
 */

// ---------- 容器（红木矩形筐，与正式工程 FENCE_* 常量一字不差） ----------

export const CONTAINER = {
    /** 围栏中心。正式工程里筐并不在世界原点，相机构图决定了它偏后。 */
    cx: 0,
    cz: -0.88,
    /** 围栏内半宽 / 内半深。可用底面积 = 2.70 × 2.84 = 7.668。 */
    halfX: 1.35,
    halfZ: 1.42,
    /** 地板顶面 y=0；地板是块厚板，中心与尺寸抄自 makeInvisibleWall('basketFloorCollider')。 */
    floor: { cx: 0, cy: -2.25, cz: -0.88, sx: 4.1, sy: 4.5, sz: 4.15 },
    /** 围栏墙：高 7、中心 y=2.5（覆盖 -1 ~ 6）、厚 1.2。 */
    wall: { height: 7, centerY: 2.5, thickness: 1.2 },
} as const;

/** 围栏内可用底面积（件的缩放由它反解）。 */
export const USABLE_AREA = CONTAINER.halfX * 2 * CONTAINER.halfZ * 2;

// ---------- 物理全局（Cocos 侧现值；B/C 需换算到各自引擎的等价项） ----------

export const PHYSICS = {
    gravity: -12,
    /** 固定步长。三套 POC 一律固定步 + 渲染插值，禁止把渲染帧长直接喂给物理。 */
    fixedTimeStep: 1 / 120,
    maxSubSteps: 8,
    /** 接触材质：摩擦 / 滚动摩擦 / 自旋摩擦 / 弹性。 */
    friction: 1.25,
    rollingFriction: 0.9,
    spinningFriction: 0.9,
    restitution: 0.08,
} as const;

/** 单件刚体参数。质量按 idx%3 微扰，与正式工程一致（避免整堆完全同质）。 */
export const BODY = {
    massBase: 0.85,
    massStep: 0.1,
    linearDamping: 0.06,
    angularDamping: 0.3,
    /** 休眠阈值。POC 里**唯一**允许的“停下来”机制就是引擎休眠，禁止脚本冻结。 */
    sleepThreshold: 0.15,
    useCCD: true,
} as const;

// ---------- 投放时序 ----------

export const SPAWN = {
    /** 逐件投放间隔（秒）。 */
    interval: 0.05,
    /** 出生高度基准；同批错开 (idx%5)*0.22 避免同一高度同时生成。 */
    baseY: 2.6,
    yStagger: 0.22,
    /** 初速度：竖直向下 -2.6，水平微扰 ±0.1。 */
    downSpeed: -2.6,
    lateralJitter: 0.2,
    /** 落点抖动（在铺点基础上叠加）。 */
    seedJitterX: 0.12,
    seedJitterZ: 0.08,
    /** 薄片只给竖轴自转，其余全向翻滚。 */
    tumbleFlat: 0.25,
    tumbleNormal: 1.2,
    tumbleYaw: 1.2,
    /** 初始朝向的随机倾角（度）：薄片 12°，其余 32°。 */
    tiltFlat: 12,
    tiltNormal: 32,
} as const;

/** 铺点参数（pileSeedPoint 用），与正式工程同名常量对齐。 */
export const SEED = {
    targetLayers: 2.6,
    itemSpanK: 1.02,
    itemWidthK: 1.28,
    pack: 0.85,
    layerInset: 0.1,
    scaleMin: 0.3,
    scaleMax: 0.8,
} as const;

// ---------- 件表 ----------

/** 薄片 / 环形件：碰撞代理用圆柱，且下落只保留竖轴自转。 */
export const ROUND_ITEMS = new Set(['banzhi', 'bracelet', 'pingankou', 'tongqian', 'yuzhuo']);

/**
 * 两个测试档位。
 *
 * 注意与方案原文的一处出入：古玩族（jade 皮肤）现在只有 7 种模型，第 3 关实际是
 * 7×2×3=42 件；56 件那一档来自**水果族**（9 种 × 2 组 + 2 石头）。所以高密度档
 * 用水果族，低密度档用第 1 关的真实配置（4 种 × 3 组 = 36 件）。
 */
export interface ScenarioDef {
    id: string;
    label: string;
    /** 参与的模型 id（glb 文件名）。 */
    items: string[];
    /** 每种的组数（1 组 = 3 件）。 */
    groupsPerItem: number;
    /** 额外干扰件（石头）数量。 */
    distractors: number;
    /** 随机种子：决定队列顺序、落点抖动、初速度、初始朝向。 */
    seed: number;
}

export const SCENARIOS: ScenarioDef[] = [
    {
        id: 's36',
        label: '36 件 · 自然倾倒',
        items: ['apple', 'banana', 'grape', 'orange'],
        groupsPerItem: 3,
        distractors: 0,
        seed: 104729,
    },
    {
        id: 's56',
        label: '56 件 · 高密度倾倒',
        items: ['apple', 'banana', 'grape', 'orange',
                'strawberry', 'lemon', 'pear', 'cherry', 'goose'],
        groupsPerItem: 2,
        distractors: 2,
        seed: 155921,
    },
];

export const DISTRACTOR_ID = 'rock';

/** 三套 POC 需要预载的全部模型（含干扰件）。 */
export function allModelIds(): string[] {
    // 同 harness 里的说明：不能用 [...new Set(...)]，Cocos 侧的降级会把 Set 整个塞进数组。
    const out: string[] = [DISTRACTOR_ID];
    for (const sc of SCENARIOS) {
        for (const id of sc.items) if (out.indexOf(id) < 0) out.push(id);
    }
    return out;
}

// ---------- 相机与灯光（构图一致，否则录屏没法并排看） ----------

export const CAMERA = {
    /**
     * 正交相机：堆再高投影宽度也不变，便于逐帧比对。
     *
     * 这个 4.25 抄自正式工程（Bootstrap 里的 cam.orthoHeight），但**不要直接拿来用**——
     * 它在 Cocos 那边配的是 FIXED_WIDTH 分辨率策略，横向半宽才是被钉死的那一维。
     * 在 Three / Babylon 里照抄成"竖向半高"，桌面横屏看着没事，手机竖屏（aspect≈0.46）
     * 横向可视范围只剩 ±1.96，筐（半宽 1.35）连同外沿会被切掉。请用 {@link orthoExtents}。
     */
    orthoHeight: 4.25,
    /** 容器外沿到画面边缘的留白（世界单位）。 */
    margin: 0.5,
    position: { x: 0, y: 8.2, z: -0.35 },
    /** 欧拉角（度），近俯视。 */
    euler: { x: -87.3, y: 0, z: 0 },
    clearColor: { r: 39, g: 27, b: 23 },
} as const;

export const LIGHT = {
    dirEuler: { x: -62, y: -24, z: 0 },
    dirColor: { r: 255, g: 246, b: 228 },
    ambientSky: { r: 214, g: 196, b: 176 },
    ambientGround: { r: 88, g: 72, b: 60 },
} as const;

/**
 * 正交相机的可视范围：保证容器在**任意宽高比**下都完整入画，横屏竖屏都不切边。
 *
 * 只固定竖向半高（照抄 CAMERA.orthoHeight）在手机竖屏下会切掉筐的左右两侧；
 * 只固定横向半宽又会让桌面横屏把筐缩成一小块。这里两维都给下限，取能同时满足的那个：
 * 竖向至少覆盖 halfZ+margin，横向至少覆盖 halfX+margin。
 *
 * @param aspect 视口宽 / 高
 * @returns halfHeight = 竖向半高；halfWidth = 横向半宽（= halfHeight × aspect）
 */
export function orthoExtents(aspect: number): { halfHeight: number; halfWidth: number } {
    const a = Math.max(aspect, 1e-3);
    const needW = CONTAINER.halfX + CAMERA.margin;
    const needH = CONTAINER.halfZ + CAMERA.margin;
    const halfHeight = Math.max(needH, needW / a);
    return { halfHeight, halfWidth: halfHeight * a };
}

// ---------- 确定性随机（三套 POC 必须逐次调用同序，才能得到同一堆） ----------

/** 正式工程的 levelRandom：32 位 LCG。种子相同 → 序列完全一致。 */
export function makeRandom(seed: number): () => number {
    let state = seed >>> 0 || 1;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

/** 整数散列 → [0,1)，给铺点做与调用顺序无关的确定性抖动。 */
export function hash01(n: number): number {
    let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function gcd(a: number, b: number): number {
    while (b) { const t = a % b; a = b; b = t; }
    return a;
}

// ---------- 队列与落点（与正式工程同形，保证堆型可比） ----------

export interface SpawnPlanEntry {
    index: number;
    id: string;
    /** 世界落点（未叠 seedJitter，jitter 在生成时按同一 RNG 取）。 */
    x: number;
    z: number;
    y: number;
    scale: number;
    mass: number;
    flat: boolean;
    /** 投放时刻（秒，相对场景开始）。 */
    t: number;
}

/**
 * 把一个 ScenarioDef 展开成完整投放计划。
 *
 * **RNG 调用顺序即协议**：洗牌 → 逐件 (jitterX, jitterZ, vx, vz, tiltX, yaw, tiltZ, angX, angY, angZ)。
 * 三套 POC 必须按同一顺序取数，否则堆型不同、比较失效。这里把随机数一次性算好放进
 * 计划里，正是为了让三套 POC 无从跑偏。
 */
export function buildSpawnPlan(sc: ScenarioDef): {
    plan: SpawnPlanEntry[];
    itemScale: number;
    randoms: SpawnRandoms[];
} {
    const rand = makeRandom(sc.seed);

    const queue: string[] = [];
    for (const id of sc.items) {
        for (let i = 0; i < sc.groupsPerItem * 3; i++) queue.push(id);
    }
    shuffleInPlace(queue, rand);
    for (let i = 0; i < sc.distractors; i++) queue.push(DISTRACTOR_ID);
    if (sc.distractors > 0) shuffleInPlace(queue, rand);

    const itemScale = Math.min(SEED.scaleMax, Math.max(SEED.scaleMin,
        Math.sqrt(SEED.targetLayers * USABLE_AREA / Math.max(1, queue.length)) / SEED.itemSpanK));

    const plan: SpawnPlanEntry[] = [];
    const randoms: SpawnRandoms[] = [];
    queue.forEach((id, index) => {
        const idx = index + 1;
        const seedPt = pileSeedPoint(index, itemScale);
        const r: SpawnRandoms = {
            jitterX: rand(), jitterZ: rand(),
            vx: rand(), vz: rand(),
            tiltX: rand(), yaw: rand(), tiltZ: rand(),
            angX: rand(), angY: rand(), angZ: rand(),
        };
        randoms.push(r);
        // 单件缩放随 idx 微扰 1.2%，与正式工程一致（完全同尺寸的堆看着像复制粘贴）。
        const scale = itemScale + (idx % 4) * 0.012;
        plan.push({
            index,
            id,
            x: seedPt.x + (r.jitterX - 0.5) * SPAWN.seedJitterX,
            z: seedPt.z + (r.jitterZ - 0.5) * SPAWN.seedJitterZ,
            y: SPAWN.baseY + (idx % 5) * SPAWN.yStagger,
            scale,
            mass: BODY.massBase + (idx % 3) * BODY.massStep,
            flat: ROUND_ITEMS.has(id),
            t: idx * SPAWN.interval,
        });
    });

    return { plan, itemScale, randoms };
}

export interface SpawnRandoms {
    jitterX: number; jitterZ: number;
    vx: number; vz: number;
    tiltX: number; yaw: number; tiltZ: number;
    angX: number; angY: number; angZ: number;
}

function shuffleInPlace<T>(arr: T[], rand: () => number) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

/**
 * 分层铺点：先按单件占地算一层放得下几件，同层按分格抖动铺满矩形（四角也铺到），
 * 上层错半格并向内收，形成自然坡度。移植自 GameManager.pileSeedPoint 的矩形分支。
 */
export function pileSeedPoint(index: number, itemScale: number): { x: number; z: number } {
    const w = itemScale * SEED.itemWidthK;
    const span = itemScale * SEED.itemSpanK;
    const perLayer = Math.max(4, Math.floor(USABLE_AREA / (span * span) * SEED.pack));
    const layer = Math.floor(index / perLayer);
    const j = index % perLayer;

    const aspect = CONTAINER.halfX / CONTAINER.halfZ;
    const cols = Math.max(1, Math.round(Math.sqrt(perLayer * aspect)));
    const rows = Math.max(1, Math.ceil(perLayer / cols));
    const cells = rows * cols;
    let stride = Math.max(1, Math.round(cells * 0.618));
    while (gcd(stride, cells) !== 1) stride++;
    const cell = (j * stride + layer * 3) % cells;
    const half = layer % 2 ? 0.5 : 0;
    const u1 = ((cell % cols) + 0.15 + 0.7 * hash01(index * 2 + 1) + half) / cols;
    const u2 = (Math.floor(cell / cols) + 0.15 + 0.7 * hash01(index * 2 + 2)) / rows;

    const inset = w * 0.5 + layer * SEED.layerInset;
    const hx = Math.max(0.05, CONTAINER.halfX - inset);
    const hz = Math.max(0.05, CONTAINER.halfZ - inset);
    return {
        x: CONTAINER.cx + ((u1 % 1) * 2 - 1) * hx,
        z: CONTAINER.cz + ((u2 % 1) * 2 - 1) * hz,
    };
}

// ---------- 验收指标口径（三套 POC 用同一套定义采集） ----------

export const METRIC = {
    /** 判「整堆已落定」：全体线速度上限（m/s）。 */
    calmSpeed: 0.05,
    /** 且需连续保持这么久（秒）才算落定，避免瞬时穿越低速被误判。 */
    calmHold: 0.5,
    /** 落定后观察窗（秒）：窗内任一件位移超过 driftLimit 即判「有微颤」。 */
    driftWindow: 10,
    driftLimit: 0.01,
    /** 互插判据：两件中心距 < 各自包围球半径之和 × 此系数，即算明显穿插。 */
    overlapK: 0.6,
    /** 移除测试：落定后移除堆底一件，观察窗内位移超过此值的件计入「被扰动」。 */
    removeWindow: 3,
    removeDisturb: 0.02,
} as const;

/** 一次跑测的结果，三套 POC 输出同一结构，方便并排 diff。 */
export interface RunMetrics {
    engine: string;
    scenario: string;
    itemCount: number;
    /** 从最后一件投放到整堆落定的时长（秒）；-1 表示观察窗内始终没落定。 */
    settleTime: number;
    /** 落定后 driftWindow 内单件最大位移（米）。 */
    maxDrift: number;
    /** 落定后仍有位移超过 driftLimit 的件数。 */
    jitteryCount: number;
    /** 明显互插的件对数。 */
    overlapPairs: number;
    /** 逃出容器（质心越界或掉出地板）的件数。 */
    escapedCount: number;
    /** 堆顶高度（最高件质心 y）。 */
    pileTopY: number;
    /** 堆的中位高度（质心 y 的中位数）——判「摊开」还是「垒成柱」。 */
    pileMedianY: number;
    /** 筐内俯视覆盖率估计（件的水平投影面积并集 / 筐底面积，蒙特卡洛采样）。 */
    coverage: number;
    /** 渲染帧率 p50 / p5。 */
    fpsP50: number;
    fpsP5: number;
    /** 物理步进耗时中位数（毫秒）。 */
    stepMsP50: number;
    /** 移除底层一件后被扰动的件数占比。 */
    removeDisturbRatio: number;
    /** 移除后重新落定所需时长（秒）；-1 = 观察窗内未再落定。 */
    removeResettle: number;
}
