// ⚠️ 本文件由 lab/sync-spec.mjs 从 lab/shared/ 生成，**请勿手改**。
// 改规格请改 lab/shared/ 下的同名文件，然后重跑：node lab/sync-spec.mjs
// 存在这份副本，只是因为 Cocos 的 assets/ 不能 import 工程外的模块。

/**
 * 指标采集器 —— 三套 POC 共用，保证「落定时间 / 微颤 / 互插 / 覆盖率 / 帧率」
 * 是同一把尺子量出来的。
 *
 * 引擎无关：POC 每帧喂进来一组 {@link BodySample}，采集器自己判定阶段与门槛。
 * 这么设计是因为肉眼看录屏只能判「好看不好看」，而方案里的硬验收标准（落定 2~5s、
 * 落定后 10s 无肉眼可见微颤、移除后只发生局部塌落）全都是可量化的——不量就会变成
 * 三套 POC 各自感觉良好。
 */

import { CONTAINER, METRIC, RunMetrics } from './scenario';

export interface BodySample {
    /** 稳定标识，跨帧对应同一件。 */
    key: number;
    id: string;
    x: number; y: number; z: number;
    /** 线速度模长。 */
    speed: number;
    /** 角速度模长。 */
    spin: number;
    /**
     * 等效体积半径 = cbrt(hx·hy·hz)，用于互插判据。
     *
     * 别用包围盒对角半长：立方状物件的对角半长比它自己大 73%，密堆下正常相邻的件
     * 会被成片误判成"穿插"（实测 56 件凸包堆报出 109 对，其实一对都没穿）。
     * 等效体积半径对球状件正好等于真实半径，对细长件给出居中的代表尺寸。
     */
    radius: number;
    /**
     * 水平投影的等效圆半径，只用于覆盖率。
     *
     * 不能拿包围球半径当覆盖半径：苹果的包围球比它的俯视投影大四成，面积就虚高一倍，
     * 覆盖率会算出 92% 这种明显不对的数（正式工程实测封顶在 55% 上下）。
     * 这里取「与 2hx×2hz 底面等面积的圆」的半径。
     */
    footprint: number;
    /** 引擎是否已把它判为休眠。休眠件不参与「还在动」的统计。 */
    asleep: boolean;
    /** 已被移除测试摘掉的件，后续帧不再喂进来（或标记 removed）。 */
    removed?: boolean;
}

export type Phase = 'pouring' | 'settling' | 'observing' | 'removing' | 'done';

export class MetricsCollector {
    readonly engine: string;
    readonly scenario: string;

    private phase: Phase = 'pouring';
    private t = 0;
    /** 最后一件投放完成的时刻；由 POC 调 {@link markPourDone} 设置。 */
    private pourDoneAt = -1;
    private calmSince = -1;
    private settledAt = -1;
    private observeStart = -1;
    private removeAt = -1;
    private removeResettleAt = -1;
    private removeCalmSince = -1;

    /** 落定瞬间的位置快照，用于算落定后位移。 */
    private settledPos = new Map<number, { x: number; y: number; z: number }>();
    /** 移除测试触发瞬间的位置快照。 */
    private removePos = new Map<number, { x: number; y: number; z: number }>();
    private maxDrift = 0;
    private drifted = new Set<number>();
    private disturbed = new Set<number>();

    private frameMs: number[] = [];
    private stepMs: number[] = [];

    private lastSamples: BodySample[] = [];

    constructor(engine: string, scenario: string) {
        this.engine = engine;
        this.scenario = scenario;
    }

    getPhase(): Phase { return this.phase; }
    getTime(): number { return this.t; }
    /** 落定后已观察的时长（秒）；未落定返回 0。 */
    observedFor(): number {
        return this.settledAt < 0 ? 0 : this.t - this.settledAt;
    }

    markPourDone() {
        if (this.pourDoneAt < 0) {
            this.pourDoneAt = this.t;
            this.phase = 'settling';
        }
    }

    recordFrame(dtMs: number, physicsMs: number) {
        this.frameMs.push(dtMs);
        this.stepMs.push(physicsMs);
    }

    /** fast 模式：帧率不可比，只留单步物理耗时（它与实时模式一致，可以比）。 */
    recordStepOnly(physicsMsPerStep: number) {
        this.stepMs.push(physicsMsPerStep);
    }

    /**
     * 每帧喂一次。返回本帧后的阶段，POC 据此决定何时触发移除测试、何时停止录制。
     */
    update(dt: number, samples: BodySample[]): Phase {
        this.t += dt;
        this.lastSamples = samples;
        const live = samples.filter(s => !s.removed);

        // 「静」的定义：没有任何一件还在真运动。休眠件直接算静——引擎休眠是这次 POC
        // 唯一允许的停止机制，把它算成「还在动」会让所有引擎都判不出落定。
        const moving = live.some(s => !s.asleep && (s.speed > METRIC.calmSpeed || s.spin > METRIC.calmSpeed * 4));

        if (this.phase === 'settling') {
            if (!moving) {
                if (this.calmSince < 0) this.calmSince = this.t;
                if (this.t - this.calmSince >= METRIC.calmHold) {
                    this.settledAt = this.t - METRIC.calmHold; // 回溯到真正安静下来的那一刻
                    this.observeStart = this.t;
                    this.phase = 'observing';
                    for (const s of live) this.settledPos.set(s.key, { x: s.x, y: s.y, z: s.z });
                }
            } else {
                this.calmSince = -1;
            }
        } else if (this.phase === 'observing') {
            for (const s of live) {
                const p0 = this.settledPos.get(s.key);
                if (!p0) continue;
                const d = Math.hypot(s.x - p0.x, s.y - p0.y, s.z - p0.z);
                if (d > this.maxDrift) this.maxDrift = d;
                if (d > METRIC.driftLimit) this.drifted.add(s.key);
            }
            if (this.t - this.observeStart >= METRIC.driftWindow) {
                this.phase = 'removing';   // POC 看到这个阶段就去摘底层那一件
            }
        } else if (this.phase === 'removing' && this.removeAt >= 0) {
            for (const s of live) {
                const p0 = this.removePos.get(s.key);
                if (!p0) continue;
                if (Math.hypot(s.x - p0.x, s.y - p0.y, s.z - p0.z) > METRIC.removeDisturb) {
                    this.disturbed.add(s.key);
                }
            }
            if (this.removeResettleAt < 0) {
                if (!moving) {
                    if (this.removeCalmSince < 0) this.removeCalmSince = this.t;
                    if (this.t - this.removeCalmSince >= METRIC.calmHold) {
                        this.removeResettleAt = this.t - METRIC.calmHold;
                    }
                } else {
                    this.removeCalmSince = -1;
                }
            }
            if (this.t - this.removeAt >= METRIC.removeWindow) this.phase = 'done';
        }
        return this.phase;
    }

    /** POC 摘掉底层一件时调用，传入摘除后仍在场的件。 */
    markRemoved(samples: BodySample[]) {
        if (this.removeAt >= 0) return;
        this.removeAt = this.t;
        for (const s of samples) {
            if (!s.removed) this.removePos.set(s.key, { x: s.x, y: s.y, z: s.z });
        }
    }

    /** 挑「堆底那一件」：容器中心附近、y 最低的件。移除它才是真的抽底。 */
    pickBottomKey(): number | null {
        const live = this.lastSamples.filter(s => !s.removed);
        if (!live.length) return null;
        let best: BodySample | null = null;
        let bestScore = Infinity;
        for (const s of live) {
            const rxz = Math.hypot(s.x - CONTAINER.cx, s.z - CONTAINER.cz);
            // y 为主、离中心距离为辅：抽边缘那件几乎不会引发塌落，测不出东西。
            const score = s.y * 3 + rxz;
            if (score < bestScore) { bestScore = score; best = s; }
        }
        return best ? best.key : null;
    }

    /** 汇总。POC 在 phase === 'done' 时调一次。 */
    finish(): RunMetrics {
        const live = this.lastSamples.filter(s => !s.removed);
        return {
            engine: this.engine,
            scenario: this.scenario,
            itemCount: this.lastSamples.length,
            settleTime: this.settledAt < 0 || this.pourDoneAt < 0 ? -1
                : round(this.settledAt - this.pourDoneAt),
            maxDrift: round(this.maxDrift, 4),
            jitteryCount: this.drifted.size,
            overlapPairs: countOverlaps(live),
            escapedCount: live.filter(isEscaped).length,
            pileTopY: round(live.reduce((m, s) => Math.max(m, s.y), 0)),
            // 最高点会被单独一件卡在高处带偏，中位高度才代表整堆是"摊开"还是"垒成柱"。
            pileMedianY: round(percentile(live.map(s => s.y), 50)),
            coverage: round(coverage(live), 3),
            // fast 模式没有可比的帧率，直接给 -1，别让人误读成"这套引擎跑不动"。
            fpsP50: this.frameMs.length ? round(1000 / percentile(this.frameMs, 50)) : -1,
            fpsP5: this.frameMs.length ? round(1000 / percentile(this.frameMs, 95)) : -1,  // 帧时 p95 = 帧率 p5
            stepMsP50: round(percentile(this.stepMs, 50), 3),
            removeDisturbRatio: live.length ? round(this.disturbed.size / live.length, 3) : 0,
            removeResettle: this.removeResettleAt < 0 || this.removeAt < 0 ? -1
                : round(this.removeResettleAt - this.removeAt),
        };
    }
}

function round(v: number, digits = 2): number {
    const k = 10 ** digits;
    return Math.round(v * k) / k;
}

function percentile(arr: number[], p: number): number {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(s.length * p / 100))];
}

/** 质心越过围栏 + 15cm 余量，或掉到地板面以下，即算逃逸。 */
function isEscaped(s: BodySample): boolean {
    if (s.y < -0.05) return true;
    return Math.abs(s.x - CONTAINER.cx) > CONTAINER.halfX + 0.15
        || Math.abs(s.z - CONTAINER.cz) > CONTAINER.halfZ + 0.15;
}

/**
 * 互插件对数。用「中心距 < 半径和 × overlapK」而不是引擎的接触穿透深度，
 * 是为了三套引擎能用同一口径——各家穿透深度的定义与符号都不一样，没法直接比。
 */
function countOverlaps(list: BodySample[]): number {
    let n = 0;
    for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
            const a = list[i], b = list[j];
            const lim = (a.radius + b.radius) * METRIC.overlapK;
            const d2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
            if (d2 < lim * lim) n++;
        }
    }
    return n;
}

/**
 * 筐内俯视覆盖率：在筐底矩形上撒 4096 个点，落进任一件水平投影圆内即算覆盖。
 * 正交俯视相机下这个数字直接对应「筐底露不露」，是堆积观感的客观代理。
 */
function coverage(list: BodySample[]): number {
    const N = 4096;
    let hit = 0;
    for (let i = 0; i < N; i++) {
        // 分层采样比纯随机稳定：同一堆重复算两次不会有可见抖动。
        const u = ((i * 2654435761) >>> 0) / 4294967296;
        const v = ((i * 40503 + 12345) % 4096) / 4096;
        const px = CONTAINER.cx + (u * 2 - 1) * CONTAINER.halfX;
        const pz = CONTAINER.cz + (v * 2 - 1) * CONTAINER.halfZ;
        for (const s of list) {
            if ((px - s.x) ** 2 + (pz - s.z) ** 2 < s.footprint * s.footprint) { hit++; break; }
        }
    }
    return hit / N;
}
