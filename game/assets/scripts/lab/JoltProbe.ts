import { _decorator, Component } from 'cc';
import { loadJolt, JoltAPI } from './JoltLoader';

const { ccclass } = _decorator;

/**
 * 可行性探针：验证 Cocos 的 assets 脚本能不能 import npm 里的 Jolt 并真的跑起来。
 *
 * 这是「保留 Cocos 渲染 + Jolt 接管物理」这条路的**地基**。地基不成立，选型就得重来，
 * 所以在动 GameManager 之前先用最小代价把它钉死。探针只回答四个问题：
 *   1. Cocos 的构建管线能不能解析 `import initJolt from 'jolt-physics'`；
 *   2. wasm 能不能在浏览器里实例化（用 wasm-compat 版，wasm 以 base64 内联在 JS 里，
 *      不需要额外托管 .wasm 文件，省掉 Cocos 资源管线对二进制文件的处理）；
 *   3. 能不能建世界、建刚体、步进；
 *   4. 步进结果对不对（自由落体位移是否符合解析解）。
 *
 * 验证完即可删除。留着不碍事，但它不是玩法的一部分。
 */
@ccclass('JoltProbe')
export class JoltProbe extends Component {
    start() {
        void this.run();
    }

    private async run() {
        const t0 = performance.now();
        let J: JoltAPI;
        try {
            J = await loadJolt();
        } catch (e) {
            console.error('[JoltProbe] ❌ wasm 实例化失败', e);
            report({ ok: false, stage: 'init', error: String(e) });
            return;
        }
        const initMs = performance.now() - t0;

        // 最小世界：两个对象层（静态 / 动态）+ 一块地板 + 一个自由落体的球。
        const settings = new J.JoltSettings();
        settings.mMaxBodies = 64;
        const objFilter = new J.ObjectLayerPairFilterTable(2);
        objFilter.EnableCollision(0, 1);
        objFilter.EnableCollision(1, 1);
        const bpTable = new J.BroadPhaseLayerInterfaceTable(2, 2);
        bpTable.MapObjectToBroadPhaseLayer(0, new J.BroadPhaseLayer(0));
        bpTable.MapObjectToBroadPhaseLayer(1, new J.BroadPhaseLayer(1));
        settings.mObjectLayerPairFilter = objFilter;
        settings.mBroadPhaseLayerInterface = bpTable;
        settings.mObjectVsBroadPhaseLayerFilter =
            new J.ObjectVsBroadPhaseLayerFilterTable(bpTable, 2, objFilter, 2);

        const jolt = new J.JoltInterface(settings);
        J.destroy(settings);
        const phys = jolt.GetPhysicsSystem();
        const bi = phys.GetBodyInterface();
        phys.SetGravity(new J.Vec3(0, -12, 0));

        // 地板（静态）
        const floorShape = new J.BoxShape(new J.Vec3(5, 0.5, 5), 0.01);
        const floorSettings = new J.BodyCreationSettings(
            floorShape, new J.RVec3(0, -0.5, 0), new J.Quat(0, 0, 0, 1),
            J.EMotionType_Static, 0);
        const floor = bi.CreateBody(floorSettings);
        bi.AddBody(floor.GetID(), J.EActivation_DontActivate);
        J.destroy(floorSettings);

        // 自由落体球：从 y=5 静止释放，重力 -12。
        const ballShape = new J.SphereShape(0.5);
        const ballSettings = new J.BodyCreationSettings(
            ballShape, new J.RVec3(0, 5, 0), new J.Quat(0, 0, 0, 1),
            J.EMotionType_Dynamic, 1);
        ballSettings.mLinearDamping = 0;   // 关阻尼，才能对上解析解
        const ball = bi.CreateBody(ballSettings);
        bi.AddBody(ball.GetID(), J.EActivation_Activate);
        J.destroy(ballSettings);

        // 步进 0.5 秒（60 步 × 1/120）。
        const STEP = 1 / 120;
        const N = 60;
        const tStep = performance.now();
        for (let i = 0; i < N; i++) jolt.Step(STEP, 1);
        const stepMs = (performance.now() - tStep) / N;

        const y = ball.GetPosition().GetY();
        // 解析解：y = 5 - ½·g·t²，g=12、t=0.5 → 5 - 1.5 = 3.5。
        // 半隐式欧拉会有一步的偏差（约 ½·g·dt·t = 0.025），给 5cm 容差。
        const expected = 5 - 0.5 * 12 * (N * STEP) ** 2;
        const err = Math.abs(y - expected);
        const ok = err < 0.05;

        const result = {
            ok,
            initMs: +initMs.toFixed(1),
            stepMs: +stepMs.toFixed(4),
            fallY: +y.toFixed(4),
            expectedY: +expected.toFixed(4),
            error: +err.toFixed(4),
        };
        console.log(ok
            ? `[JoltProbe] ✅ Cocos 里跑通 Jolt：wasm 实例化 ${result.initMs}ms，单步 ${result.stepMs}ms，自由落体 y=${result.fallY}（理论 ${result.expectedY}）`
            : `[JoltProbe] ❌ 步进结果不对：y=${result.fallY}，理论 ${result.expectedY}`);
        report(result);
    }
}

function report(r: unknown) {
    (globalThis as unknown as { __joltProbe: unknown }).__joltProbe = r;
}
