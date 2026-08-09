import { _decorator, Component, Node, v3, Quat, geometry } from 'cc';
import { JoltWorld } from '../core/JoltWorld';

const { ccclass } = _decorator;

/**
 * 可行性探针：验证 Cocos 里能不能跑 Jolt，以及 {@link JoltWorld} 这层封装本身对不对。
 *
 * 这是「保留 Cocos 渲染 + Jolt 接管物理」的地基。在动 GameManager 之前先把地基钉死，
 * 免得改完 2000 行才发现底层的某个动词根本跑不通。探针逐个走一遍玩法真正会用到的动词：
 *   init → 静态地板 → 投件 → 步进 → 位姿同步 → 射线拾取 → 摘件 → 休眠查询。
 *
 * 验证完即可删除（连同 Bootstrap 里的 ?joltprobe=1 分支）。
 */
@ccclass('JoltProbe')
export class JoltProbe extends Component {
    start() {
        void this.run();
    }

    private async run() {
        const out: Record<string, unknown> = {};
        const world = new JoltWorld();

        const t0 = performance.now();
        await world.init(-12);
        out.initMs = +(performance.now() - t0).toFixed(1);
        out.ready = world.isReady;
        if (!world.isReady) { report(out, false, 'init 失败'); return; }

        // 地板：顶面 y=0，与正式工程的 basketFloorCollider 同口径（厚板防穿底）。
        world.addStaticBox(v3(0, -2.25, 0), v3(8, 4.5, 8), 0, 1.25, 0.08);

        // 三件盒子从不同高度落下，落到地板上应停在 y≈半高。
        const nodes: Node[] = [];
        const keys: number[] = [];
        for (let i = 0; i < 3; i++) {
            const n = new Node(`probe_${i}`);
            n.setParent(this.node);
            nodes.push(n);
            keys.push(world.spawn(n, {
                shape: { kind: 'box', half: v3(0.25, 0.25, 0.25) },
                mass: 1, linearDamping: 0.06, angularDamping: 0.3,
                friction: 1.25, restitution: 0.08, useCCD: true,
                position: v3(i * 0.8 - 0.8, 2 + i * 0.5, 0),
                rotation: new Quat(),
                linearVelocity: v3(0, -2.6, 0),
                angularVelocity: v3(),
            }));
        }
        out.keys = keys.join(',');
        out.spawnOk = keys.every(k => k > 0);

        // 步进 3 秒（360 步 × 1/120），足够落定并进入休眠。
        const STEP = 1 / 120;
        const tStep = performance.now();
        for (let i = 0; i < 360; i++) world.step(STEP);
        out.stepMs = +((performance.now() - tStep) / 360).toFixed(4);

        world.syncNodes(1);
        const p = v3();
        world.getPosition(keys[0], p);
        out.restY = +p.y.toFixed(3);
        // 半高 0.25 + Jolt 的凸半径余量，落定应在 0.25 附近。
        out.restOk = Math.abs(p.y - 0.25) < 0.06;
        // 节点位姿必须被同步过去（渲染靠它）。
        out.nodeSynced = Math.abs(nodes[0].worldPosition.y - p.y) < 1e-4;
        out.asleep = world.isAsleep(keys[0]);

        // 射线拾取：从正上方朝下打，应命中第 0 件。
        const ray = new geometry.Ray(p.x, 5, p.z, 0, -1, 0);
        const hit = world.raycast(ray);
        out.rayHit = hit;
        out.rayOk = hit === keys[0];

        // 摘件：摘掉后在场数减一，且再打同一条射线不该命中它。
        const before = world.liveCount;
        world.remove(keys[0]);
        const hit2 = world.raycast(ray);
        out.removeOk = world.liveCount === before - 1 && hit2 !== keys[0];

        const ok = !!(out.spawnOk && out.restOk && out.nodeSynced && out.rayOk && out.removeOk);
        report(out, ok, ok ? '' : '有子项未通过');
    }
}

function report(out: Record<string, unknown>, ok: boolean, why: string) {
    out.ok = ok;
    (globalThis as unknown as { __joltProbe: unknown }).__joltProbe = out;
    console.log(ok
        ? `[JoltProbe] ✅ JoltWorld 全部动词跑通：${JSON.stringify(out)}`
        : `[JoltProbe] ❌ ${why}：${JSON.stringify(out)}`);
}
