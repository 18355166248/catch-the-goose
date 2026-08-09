/**
 * POC C —— Babylon.js 渲染 + Havok 物理。
 *
 * 方案里的「成熟 Web 游戏方案」。和 POC B 一样，这一套里**没有任何脚本冻结**：
 * 物件停下来的唯一途径是 Havok 自己的休眠，位置也绝不由脚本改写。
 *
 * 与 POC A / B 的公平性由 lab/shared/scenario.ts 保证：容器尺寸、件表、缩放、落点、
 * 初速度、随机种子、重力、固定步长全部取自同一份规格。这里只负责把规格翻译成
 * Babylon Physics V2 + Havok 的调用。
 *
 * 三处必须知道的引擎差异（写进结果 JSON 的 notes，不要偷偷抹平）：
 *   1. Havok 的 web 版**没有暴露 CCD 开关**（HavokPhysics.d.ts 里只有 MotionType，
 *      没有 MotionQuality），而 POC B 显式开了 Jolt 的 LinearCast。薄片高速下落的
 *      穿透风险两边不对等，看穿透指标时要记得这一条。
 *   2. Havok 没有暴露求解迭代次数，POC B 那两个旋钮（mNumVelocitySteps /
 *      mNumPositionSteps）在这里无对应项，只能用默认求解器。
 *   3. 休眠阈值同样不可配，只能读状态（HP_Body_GetActivationState），不能设阈值。
 * 这三条决定了「Havok 调不动」本身就是一项选型结论，而不是 POC 写得不够细。
 */

import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3, Quaternion, Matrix } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
import {
    PhysicsShapeBox, PhysicsShapeCylinder, PhysicsShapeConvexHull, PhysicsShape,
} from '@babylonjs/core/Physics/v2/physicsShape';
import { PhysicsMotionType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import type { PhysicsEngine as PhysicsEngineV2 } from '@babylonjs/core/Physics/v2/physicsEngine';
import '@babylonjs/core/Physics/physicsEngineComponent';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import '@babylonjs/core/Rendering/depthRendererSceneComponent';
import HavokPhysics from '@babylonjs/havok';

import {
    BODY, CAMERA, CONTAINER, LIGHT, PHYSICS, ROUND_ITEMS, SCENARIOS, SPAWN,
    ScenarioDef, SpawnPlanEntry, SpawnRandoms,
} from '../../shared/scenario';
import { BodySample } from '../../shared/metrics';
import { EngineAdapter, runScenario } from '../../shared/harness';
import { loadModels, instantiateModel, ModelAsset } from './models';

/** Havok 的 ActivationState 枚举：0 = ACTIVE、1 = INACTIVE（见 HavokPhysics.d.ts）。 */
const HK_INACTIVE = 1;

interface Item {
    key: number;
    id: string;
    body: PhysicsBody;
    node: TransformNode;
    radius: number;
    footprint: number;
    removed: boolean;
    /** 上一物理步与当前物理步的位姿，渲染时插值——固定步长下不插值必然看到帧级抖动。 */
    prev: { p: Vector3; q: Quaternion };
    cur: { p: Vector3; q: Quaternion };
}

class HavokAdapter implements EngineAdapter {
    readonly name = 'havok';
    canvas!: HTMLCanvasElement;

    /** 碰撞代理：'auto' = 薄片圆柱 / 其余方盒（与正式工程同口径）；'hull' = 一律凸包。 */
    constructor(private proxy: 'auto' | 'hull') {}

    private engine!: Engine;
    private scene!: Scene;
    private plugin!: HavokPlugin;
    private physEngine!: PhysicsEngineV2;
    private shadow!: ShadowGenerator;

    private assets = new Map<string, ModelAsset>();
    private items: Item[] = [];
    private nextKey = 1;
    /** 凸包 shape 按 (id, scale) 缓存：同一件在同一缩放下的凸包完全一样，重复构造纯浪费。 */
    private hullCache = new Map<string, PhysicsShape>();

    private tmpV = new Vector3();
    private tmpW = new Vector3();

    async setup(modelIds: string[]) {
        // ---- 渲染 ----
        this.canvas = document.createElement('canvas');
        document.body.appendChild(this.canvas);
        // preserveDrawingBuffer：默认情况下 WebGL 呈现完就清空缓冲，截图 / captureStream
        // 若没赶上刚好的重绘时机会拿到全黑画面。跑测要靠截图做地面真值，这点开销必须付。
        this.engine = new Engine(this.canvas, true, { preserveDrawingBuffer: true, stencil: true });
        this.scene = new Scene(this.engine);
        // Babylon 默认左手系，而规格里的坐标全部来自 Cocos / Three 的右手系。不切过来
        // 的话 z 轴整体镜像：容器中心 cz=-0.88 会跑到相机背后，画面全黑（踩过一次）。
        // 必须在装载 glb **之前**设置——glTF 本身是右手系，加载器据此决定要不要做 -Z 翻转。
        this.scene.useRightHandedSystem = true;
        this.scene.clearColor = new Color4(
            CAMERA.clearColor.r / 255, CAMERA.clearColor.g / 255, CAMERA.clearColor.b / 255, 1);
        // 正交俯视相机不会有物件飞进飞出视野，关掉逐帧剔除省下的时间不小。
        this.scene.autoClear = true;
        this.scene.skipFrustumClipping = true;

        const cam = new FreeCamera('cam',
            new Vector3(CAMERA.position.x, CAMERA.position.y, CAMERA.position.z), this.scene);
        cam.mode = FreeCamera.ORTHOGRAPHIC_CAMERA;
        // 用 setTarget 而不是照抄规格里的欧拉角：Babylon 的 rotation.x 正负与
        // Cocos / Three 相反，直接套 -87.3° 会让相机朝天看。瞄准筐心得到的构图与规格
        // 等价（从 (0,8.2,-0.35) 看 (0,0,-0.88) 即俯角 86.3°，规格是 87.3°），
        // 而且不依赖任何一家的欧拉约定。相机只影响录屏构图，不影响物理与指标。
        cam.setTarget(new Vector3(CONTAINER.cx, 0, CONTAINER.cz));
        cam.minZ = 0.1;
        cam.maxZ = 100;
        const applyOrtho = () => {
            const a = this.engine.getRenderWidth() / this.engine.getRenderHeight();
            const h = CAMERA.orthoHeight;
            cam.orthoTop = h; cam.orthoBottom = -h;
            cam.orthoLeft = -h * a; cam.orthoRight = h * a;
        };
        applyOrtho();
        addEventListener('resize', () => { this.engine.resize(); applyOrtho(); });

        const dir = new DirectionalLight('dir',
            dirFromEuler(LIGHT.dirEuler), this.scene);
        dir.position = new Vector3(0, 10, CONTAINER.cz);
        dir.intensity = 2.6;
        dir.diffuse = rgb(LIGHT.dirColor);
        this.shadow = new ShadowGenerator(2048, dir);
        this.shadow.usePercentageCloserFiltering = true;

        const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), this.scene);
        hemi.intensity = 1.1;
        hemi.diffuse = rgb(LIGHT.ambientSky);
        hemi.groundColor = rgb(LIGHT.ambientGround);

        // ---- 物理 ----
        const havok = await HavokPhysics();
        // 第一个参数 useDeltaForWorldStep=true：让 executeStep 用我们传进去的 dt，
        // 而不是插件内部那个 _fixedTimeStep，这样固定步长由本 POC 统一掌握。
        this.plugin = new HavokPlugin(true, havok);
        this.scene.enablePhysics(new Vector3(0, PHYSICS.gravity, 0), this.plugin);
        this.physEngine = this.scene.getPhysicsEngine() as unknown as PhysicsEngineV2;

        // 关掉 Babylon 自己的物理推进：scene.render() 会按**渲染帧长**调
        // _advancePhysicsEngineStep，那正是方案里禁止的"把渲染帧长喂给物理"。
        // 接管之后步进只由 harness 的固定 1/120 循环驱动，与 POC A/B 完全一致。
        (this.scene as unknown as { _advancePhysicsEngineStep: (s: number) => void })
            ._advancePhysicsEngineStep = () => {};

        this.buildContainer();
        this.assets = await loadModels(modelIds, this.scene);
    }

    /** 地板 + 四面围栏，尺寸与正式工程 makeInvisibleWall 一字不差。 */
    private buildContainer() {
        const f = CONTAINER.floor;
        this.addStaticBox('floor', f.cx, f.cy, f.cz, f.sx, f.sy, f.sz);

        const { height, thickness: WT, centerY } = CONTAINER.wall;
        const { cx, cz, halfX, halfZ } = CONTAINER;
        const spanX = halfX * 2 + WT * 2;
        this.addStaticBox('fenceN', cx, centerY, cz - halfZ - WT / 2, spanX, height, WT);
        this.addStaticBox('fenceS', cx, centerY, cz + halfZ + WT / 2, spanX, height, WT);
        this.addStaticBox('fenceW', cx - halfX - WT / 2, centerY, cz, WT, height, halfZ * 2);
        this.addStaticBox('fenceE', cx + halfX + WT / 2, centerY, cz, WT, height, halfZ * 2);

        // 可见筐底：只为看清覆盖率，不参与物理（物理底板是上面那块厚板）。
        const plate = CreateBox('plate', { width: halfX * 2, height: 0.04, depth: halfZ * 2 }, this.scene);
        plate.position.set(cx, -0.02, cz);
        const mat = new StandardMaterial('plateMat', this.scene);
        mat.diffuseColor = new Color3(0.42, 0.29, 0.2);
        mat.specularColor = Color3.Black();
        plate.material = mat;
        plate.receiveShadows = true;
    }

    private addStaticBox(name: string, x: number, y: number, z: number,
        sx: number, sy: number, sz: number) {
        const node = new TransformNode(name, this.scene);
        node.position.set(x, y, z);
        const shape = new PhysicsShapeBox(
            Vector3.Zero(), Quaternion.Identity(), new Vector3(sx, sy, sz), this.scene);
        shape.material = { friction: PHYSICS.friction, restitution: PHYSICS.restitution };
        const body = new PhysicsBody(node, PhysicsMotionType.STATIC, false, this.scene);
        body.shape = shape;
        body.disablePreStep = true;
    }

    spawn(entry: SpawnPlanEntry, r: SpawnRandoms) {
        const asset = this.assets.get(entry.id);
        if (!asset) return;

        const s = entry.scale;
        const hx = asset.half.x * s, hy = asset.half.y * s, hz = asset.half.z * s;

        // 初始朝向：与正式工程 setNaturalRotation 同形（薄片 12°、其余 32° 随机倾角）。
        const tilt = entry.flat ? SPAWN.tiltFlat : SPAWN.tiltNormal;
        const q = Quaternion.FromEulerAngles(
            deg((r.tiltX - 0.5) * tilt * 2), deg(r.yaw * 360), deg((r.tiltZ - 0.5) * tilt * 2));

        const node = instantiateModel(asset, this.scene, s);
        node.position.set(entry.x, entry.y, entry.z);
        node.rotationQuaternion = q.clone();
        for (const m of node.getChildMeshes(false)) this.shadow.addShadowCaster(m as Mesh);

        const shape = this.makeShape(entry, asset, s, hx, hy, hz);
        const body = new PhysicsBody(node, PhysicsMotionType.DYNAMIC, false, this.scene);
        body.shape = shape;
        body.setMassProperties({ mass: entry.mass });
        body.setLinearDamping(BODY.linearDamping);
        body.setAngularDamping(BODY.angularDamping);
        // disablePreStep 必须开：不开的话 executeStep 每步都会把**节点当前 transform**
        // 灌回物理体，而我们的 render() 会把节点摆到插值位姿——等于每步都在改写刚体
        // 位置，正是方案里点名要禁掉的那类操作。开了之后数据流是单向的：物理 → 节点。
        body.disablePreStep = true;

        const tumble = entry.flat ? SPAWN.tumbleFlat : SPAWN.tumbleNormal;
        body.setLinearVelocity(new Vector3(
            (r.vx - 0.5) * SPAWN.lateralJitter, SPAWN.downSpeed, (r.vz - 0.5) * SPAWN.lateralJitter));
        body.setAngularVelocity(new Vector3(
            (r.angX - 0.5) * tumble, (r.angY - 0.5) * SPAWN.tumbleYaw, (r.angZ - 0.5) * tumble));

        const p = new Vector3(entry.x, entry.y, entry.z);
        this.items.push({
            key: this.nextKey++,
            id: entry.id,
            body, node,
            radius: Math.cbrt(hx * hy * hz),
            footprint: Math.sqrt(4 * hx * hz / Math.PI),
            removed: false,
            prev: { p: p.clone(), q: q.clone() },
            cur: { p: p.clone(), q: q.clone() },
        });
    }

    /** 碰撞代理：与 POC B 同口径（hull 档一律凸包，auto 档薄片圆柱 / 其余方盒）。 */
    private makeShape(entry: SpawnPlanEntry, asset: ModelAsset, s: number,
        hx: number, hy: number, hz: number): PhysicsShape {
        if (this.proxy === 'hull' && asset.hullPoints.length >= 12) {
            const cacheKey = `${entry.id}|${s.toFixed(4)}`;
            const hit = this.hullCache.get(cacheKey);
            if (hit) return hit;
            // Havok 的凸包只吃 mesh，所以拿抽稀后的点集拼一个只有顶点、没有索引的
            // 临时 mesh（CONVEX_HULL 分支 needIndices=false，不给索引也能建）。
            const proxy = new Mesh(`hull_${cacheKey}`, this.scene);
            const vd = new VertexData();
            const pts = new Float32Array(asset.hullPoints.length);
            for (let i = 0; i < pts.length; i++) pts[i] = asset.hullPoints[i] * s;
            vd.positions = pts as unknown as number[];
            vd.applyToMesh(proxy);
            proxy.setEnabled(false);
            const shape = new PhysicsShapeConvexHull(proxy, this.scene);
            shape.material = { friction: PHYSICS.friction, restitution: PHYSICS.restitution };
            this.hullCache.set(cacheKey, shape);
            return shape;
        }
        let shape: PhysicsShape;
        if (ROUND_ITEMS.has(entry.id)) {
            // 薄片/环：圆柱代理，轴沿 y、半高取 y 向、半径取 xz 较大者（与 POC B 一致）。
            const h = Math.max(0.01, hy);
            shape = new PhysicsShapeCylinder(
                new Vector3(0, -h, 0), new Vector3(0, h, 0),
                Math.max(0.01, Math.max(hx, hz)), this.scene);
        } else {
            shape = new PhysicsShapeBox(
                Vector3.Zero(), Quaternion.Identity(),
                new Vector3(hx * 2, hy * 2, hz * 2), this.scene);
        }
        shape.material = { friction: PHYSICS.friction, restitution: PHYSICS.restitution };
        return shape;
    }

    step(dt: number): number {
        const t0 = performance.now();
        // 每件在步进前存一份旧位姿，渲染时按 alpha 插值——固定 1/120 步长配 60Hz 渲染
        // 会产生 2:1 的采样混叠，不插值就是逐帧抖（正式工程踩过这个坑）。
        for (const it of this.items) {
            if (it.removed) continue;
            it.prev.p.copyFrom(it.cur.p);
            it.prev.q.copyFrom(it.cur.q);
        }
        this.physEngine._step(dt);
        // executeStep 里的 sync() 已经把物理位姿写进了节点，直接读回即可。
        for (const it of this.items) {
            if (it.removed) continue;
            it.cur.p.copyFrom(it.node.position);
            if (it.node.rotationQuaternion) it.cur.q.copyFrom(it.node.rotationQuaternion);
        }
        return performance.now() - t0;
    }

    render(alpha: number) {
        const a = Math.max(0, Math.min(1, alpha));
        for (const it of this.items) {
            if (it.removed) continue;
            Vector3.LerpToRef(it.prev.p, it.cur.p, a, it.node.position);
            Quaternion.SlerpToRef(it.prev.q, it.cur.q, a, it.node.rotationQuaternion!);
        }
        this.scene.render();
    }

    sample(): BodySample[] {
        return this.items.map(it => {
            if (it.removed) {
                return { key: it.key, id: it.id, x: 0, y: 0, z: 0, speed: 0, spin: 0,
                    radius: it.radius, footprint: it.footprint, asleep: true, removed: true };
            }
            it.body.getLinearVelocityToRef(this.tmpV);
            it.body.getAngularVelocityToRef(this.tmpW);
            return {
                key: it.key, id: it.id,
                x: it.cur.p.x, y: it.cur.p.y, z: it.cur.p.z,
                speed: this.tmpV.length(),
                spin: this.tmpW.length(),
                radius: it.radius,
                footprint: it.footprint,
                asleep: this.isAsleep(it.body),
                removed: false,
            };
        });
    }

    /**
     * Babylon 的 PhysicsBody 没有公开的休眠查询，只能问底层 Havok。
     * 拿不到就返回 false —— 宁可把休眠件当成"还醒着"，也不要凭空报告"整堆已休眠"，
     * 后者会让落定时间这个核心指标虚假变好。
     */
    private isAsleep(body: PhysicsBody): boolean {
        const id = (body as unknown as { _pluginData?: { hpBodyId?: unknown } })._pluginData?.hpBodyId;
        if (!id) return false;
        const res = this.plugin._hknp.HP_Body_GetActivationState(id);
        return Array.isArray(res) && res[1] === HK_INACTIVE;
    }

    remove(key: number) {
        const it = this.items.find(i => i.key === key);
        if (!it || it.removed) return;

        // 摘件前记下它的位置，摘完唤醒同一片区域——Havok 不会因为邻居消失自动唤醒
        // 已休眠的刚体，不唤醒就会看到"抽了底下那块，上面整堆纹丝不动"。
        // Babylon 没有 AABB 批量唤醒接口（Jolt 有 ActivateBodiesInAABox），
        // 只能自己按距离筛一遍再逐个 setActivationControl 弹醒。
        const c = it.cur.p.clone();
        const reach = it.radius * 3 + 0.25;

        it.body.dispose();
        it.node.dispose(false, true);
        it.removed = true;

        for (const other of this.items) {
            if (other.removed || other === it) continue;
            if (Vector3.Distance(other.cur.p, c) > reach) continue;
            // 弹醒的手法：给一个 0 冲量。Havok 认为受力就必须醒，而这不改变任何状态量，
            // 比"改速度再改回来"干净——后者会往堆里注入能量，塌落就不是纯自然的了。
            other.body.applyImpulse(Vector3.Zero(), other.cur.p);
        }
    }
}

// ---------- 小工具 ----------

const deg = (d: number) => d * Math.PI / 180;
const rgb = (c: { r: number; g: number; b: number }) => new Color3(c.r / 255, c.g / 255, c.b / 255);

/** 由欧拉角求平行光方向：本地 -Z 经旋转后的朝向。 */
function dirFromEuler(e: { x: number; y: number; z: number }): Vector3 {
    const m = Matrix.RotationYawPitchRoll(deg(e.y), deg(e.x), deg(e.z));
    return Vector3.TransformNormal(new Vector3(0, 0, -1), m).normalize();
}

// ---------- 页面装配 ----------

const bar = document.getElementById('lab-bar')!;

function addButton(label: string, fn: () => void) {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = () => {
        bar.querySelectorAll('button').forEach(x => ((x as HTMLButtonElement).disabled = true));
        fn();
    };
    bar.appendChild(b);
    return b;
}

/**
 * URL 参数（与 POC B 完全一致，方便两边对着跑）：
 *   ?sc=s36|s56       直接开跑某一档（不传则等按钮）
 *   ?proxy=auto|hull  碰撞代理：auto = 薄片圆柱/其余方盒；hull = 一律凸包
 *   ?mode=fast|realtime  fast 采数（后台也跑得动）／realtime 录屏
 *   ?rec=0            关掉录屏
 */
const params = new URLSearchParams(location.search);
const proxy = (params.get('proxy') === 'hull' ? 'hull' : 'auto') as 'auto' | 'hull';
const mode = (params.get('mode') === 'fast' ? 'fast' : 'realtime') as 'fast' | 'realtime';

async function run(sc: ScenarioDef) {
    const adapter = new HavokAdapter(proxy);
    const m = await runScenario(adapter, sc, { mode, record: params.get('rec') !== '0' });
    console.log('[lab] 结果', m);
    (window as any).__labResult = m;
}

for (const sc of SCENARIOS) addButton(sc.label, () => run(sc));

const want = params.get('sc');
if (want) {
    const sc = SCENARIOS.find(s => s.id === want);
    if (sc) run(sc);
}
