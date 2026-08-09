// ⚠️ 本文件由 lab/sync-spec.mjs 从 lab/shared/ 生成，**请勿手改**。
// 改规格请改 lab/shared/ 下的同名文件，然后重跑：node lab/sync-spec.mjs
// 存在这份副本，只是因为 Cocos 的 assets/ 不能 import 工程外的模块。

/**
 * 跑测外壳 —— 录屏 + HUD + 结果导出，三套 POC 共用。
 *
 * 把「录 webm、显示当前阶段、跑完自动摘底层件、导出指标 JSON」这些与引擎无关的
 * 部分收在这里，POC 只需实现 {@link EngineAdapter}（建场景 / 投一件 / 步进 / 采样 / 摘一件）。
 * 这样三套 POC 的流程、时序、录制窗口完全相同，比出来的差异才是引擎差异。
 */

import { MetricsCollector, BodySample } from './metrics';
import { RunMetrics, ScenarioDef, SpawnPlanEntry, SpawnRandoms, buildSpawnPlan } from './scenario';

export interface EngineAdapter {
    /** 引擎名，进结果 JSON 与文件名。 */
    readonly name: string;
    /** 建容器、相机、灯光；预载模型。 */
    setup(modelIds: string[]): Promise<void>;
    /** 按计划投放一件。 */
    spawn(entry: SpawnPlanEntry, rnd: SpawnRandoms): void;
    /** 固定步长步进一次物理；返回本次步进耗时（毫秒）。 */
    step(dt: number): number;
    /** 渲染一帧（内部做物理状态插值）。 */
    render(alpha: number): void;
    /** 当前全部件的采样。 */
    sample(): BodySample[];
    /** 摘掉指定件（模拟玩家点走），并唤醒受影响的邻居。 */
    remove(key: number): void;
    /** 供录屏用的画布。 */
    readonly canvas: HTMLCanvasElement;
}

export interface HarnessOptions {
    /** 仿真时长上限（秒），超时强制收尾，避免某套 POC 永不落定把跑测挂死。 */
    maxSeconds?: number;
    /** 是否录 webm。默认 true；fast 模式下强制关闭（画面不是真实速度，录了没用）。 */
    record?: boolean;
    /** 'realtime' 出录屏，'fast' 出数据。默认 realtime。 */
    mode?: 'realtime' | 'fast';
}

export async function runScenario(
    adapter: EngineAdapter,
    sc: ScenarioDef,
    opts: HarnessOptions = {},
): Promise<RunMetrics> {
    const maxSeconds = opts.maxSeconds ?? 45;
    const mode = opts.mode ?? 'realtime';
    const record = (opts.record ?? true) && mode === 'realtime';

    const { plan, randoms, itemScale } = buildSpawnPlan(sc);
    // 去重故意不用 [...new Set(...)]：POC A 跑在 Cocos 里，本仓的 TS 编译目标会把展开
    // 运算符降级成 [].concat(iterator)，而 concat **不展开迭代器**——整个 Set 会被当成
    // 单个元素塞进数组，于是模型 id 变成 "[object Set]"，一件都加载不出来且不报类型错。
    // 正式工程的 GameManager 在冰封件选取上踩过同一个坑，那里也是改成手写循环。
    const modelIds: string[] = [];
    for (const p of plan) if (modelIds.indexOf(p.id) < 0) modelIds.push(p.id);
    await adapter.setup(modelIds);

    const metrics = new MetricsCollector(adapter.name, sc.id);
    const hud = makeHud(`${adapter.name} · ${sc.label} · ${plan.length} 件 · scale=${itemScale.toFixed(3)} · ${mode}`);
    const rec = record ? startRecording(adapter.canvas) : null;

    const FIXED = 1 / 120;
    /**
     * realtime = 按墙钟跑，画面是真实速度，用来录屏；
     * fast     = 每个 tick 猛推一大批物理步，不受 rAF 节流影响，用来采数。
     *
     * 分两种模式是被浏览器逼的：跑测标签页一旦不在前台，rAF 会被降频甚至暂停，
     * realtime 模式下仿真会停在原地，采不到数。fast 模式改用 setTimeout + 大批量步进，
     * 后台被限到 1Hz 也仍有 2 倍实时的推进速度。
     */
    const stepsPerTick = mode === 'fast' ? 240 : 8;
    /** 每 6 个物理步（1/120 × 6 = 0.05s）采一次指标 = 20Hz。 */
    const PROBE = 6;
    let sinceProbe = 0;
    let acc = 0;
    let simTime = 0;
    let nextSpawn = 0;
    let last = performance.now();
    const wallStart = last;
    let removedDone = false;

    return new Promise<RunMetrics>((resolve) => {
        const loop = () => {
            const now = performance.now();
            const frameMs = now - last;
            last = now;
            // 帧长裁剪：切后台回来时别把几秒的欠账一次性喂给物理（会直接炸堆）。
            acc += mode === 'fast' ? stepsPerTick * FIXED : Math.min(frameMs / 1000, 0.1);

            let stepMs = 0;
            let steps = 0;
            let phase = metrics.getPhase();
            let awake = 0;
            while (acc >= FIXED && steps < stepsPerTick) {
                // 投放严格挂在物理时间轴上，而不是渲染帧上——否则不同机器的帧率
                // 会改变投放节奏，三套 POC 的堆型就不可比了。
                while (nextSpawn < plan.length && plan[nextSpawn].t <= simTime) {
                    adapter.spawn(plan[nextSpawn], randoms[nextSpawn]);
                    nextSpawn++;
                    if (nextSpawn === plan.length) metrics.markPourDone();
                }
                stepMs += adapter.step(FIXED);
                simTime += FIXED;
                acc -= FIXED;
                steps++;
                sinceProbe++;

                // 指标采样固定 20Hz（每 PROBE 个物理步一次），**与模式无关**。
                // 早先把采样挂在渲染帧上，fast 模式一帧推 240 步 = 2 仿真秒，于是
                // 「落定时间」只能是 2 秒的整数倍——验收门槛是 2~5 秒，这个分辨率
                // 根本判不出来。挪进步进循环后 fast 与 realtime 的读数才可比。
                if (sinceProbe >= PROBE) {
                    sinceProbe = 0;
                    const s = adapter.sample();
                    phase = metrics.update(PROBE * FIXED, s);
                    awake = s.filter(x => !x.removed && !x.asleep).length;
                    if (phase === 'removing' && !removedDone) {
                        const key = metrics.pickBottomKey();
                        if (key != null) {
                            adapter.remove(key);
                            metrics.markRemoved(adapter.sample());
                        }
                        removedDone = true;
                    }
                    if (phase === 'done') break;
                }
            }
            adapter.render(acc / FIXED);
            // 帧率统计只在 realtime 模式下有意义，且剔除 >200ms 的帧：浏览器把后台标签页的
            // rAF 降到 1Hz 甚至暂停，那些帧长既不代表渲染成本，也会把 p50/p5 拉成垃圾数。
            const perStepMs = stepMs / Math.max(1, steps);
            if (mode === 'realtime' && frameMs < 200) metrics.recordFrame(frameMs, perStepMs);
            else if (mode === 'fast') metrics.recordStepOnly(perStepMs);

            hud.set(phase, metrics.getTime(), awake);

            // 墙钟兜底只防「物理慢到跑不完」，所以给得很宽，正常跑测不会碰到它。
            const wallStuck = performance.now() - wallStart > 5 * 60 * 1000;
            if (phase === 'done' || simTime > maxSeconds || wallStuck) {
                const out = metrics.finish();
                hud.done(out);
                rec?.stop(`${adapter.name}-${sc.id}`);
                // 跑完后继续以 rAF 重绘最终堆型：不再重绘的话，浏览器下一次合成就把
                // 画面清空，截图与肉眼复核都只能看到黑屏。
                const idle = () => { adapter.render(1); requestAnimationFrame(idle); };
                requestAnimationFrame(idle);
                resolve(out);
                return;
            }
            schedule(loop);
        };
        schedule(loop);
    });

    function schedule(fn: () => void) {
        if (mode === 'fast') setTimeout(fn, 0);
        else requestAnimationFrame(fn);
    }
}

// ---------- 录屏 ----------

function startRecording(canvas: HTMLCanvasElement) {
    // captureStream(0) + requestFrame 会与 rAF 打架，直接按 60fps 拉流最稳。
    const stream = canvas.captureStream(60);
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
        .find(m => MediaRecorder.isTypeSupported(m)) ?? '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8e6 } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.start(1000);
    return {
        stop(name: string) {
            rec.onstop = () => {
                const url = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
                const a = document.createElement('a');
                a.href = url;
                a.download = `${name}.webm`;
                // 不自动点：浏览器会把连续多次下载当成滥用而拦截。挂在 HUD 上让人手动取。
                a.textContent = `⬇ 下载录屏 ${name}.webm`;
                a.style.cssText = 'display:block;color:#8ef;margin-top:6px';
                document.getElementById('lab-hud')?.appendChild(a);
            };
            rec.stop();
        },
    };
}

// ---------- HUD ----------

function makeHud(title: string) {
    let el = document.getElementById('lab-hud');
    if (!el) {
        el = document.createElement('div');
        el.id = 'lab-hud';
        el.style.cssText = [
            'position:fixed', 'left:8px', 'top:8px', 'z-index:99',
            'font:12px/1.5 ui-monospace,Menlo,monospace', 'color:#eee',
            'background:rgba(0,0,0,.62)', 'padding:8px 10px', 'border-radius:6px',
            'white-space:pre', 'pointer-events:auto',
        ].join(';');
        document.body.appendChild(el);
    }
    const head = document.createElement('div');
    head.textContent = title;
    head.style.cssText = 'color:#ffd88a;margin-bottom:4px';
    el.appendChild(head);
    const line = document.createElement('div');
    el.appendChild(line);

    return {
        set(phase: string, t: number, awake: number) {
            line.textContent = `阶段 ${phase}  t=${t.toFixed(1)}s  未休眠 ${awake}`;
        },
        done(m: RunMetrics) {
            line.textContent = [
                `落定 ${m.settleTime}s`,
                `落定后最大位移 ${m.maxDrift}m（${m.jitteryCount} 件超阈）`,
                `互插 ${m.overlapPairs} 对  逃逸 ${m.escapedCount} 件`,
                `堆顶 ${m.pileTopY}  中位高 ${m.pileMedianY}  覆盖率 ${(m.coverage * 100).toFixed(1)}%`,
                `帧率 p50 ${m.fpsP50} / p5 ${m.fpsP5}  步进 ${m.stepMsP50}ms`,
                `抽底扰动 ${(m.removeDisturbRatio * 100).toFixed(0)}%  再落定 ${m.removeResettle}s`,
            ].join('\n');
            (window as any).__labResult = m;
        },
    };
}
