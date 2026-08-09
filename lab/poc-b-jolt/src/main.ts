/**
 * POC B —— Three.js 渲染 + Jolt 物理。
 *
 * 方案里的「首选挑战者」。这一套里**没有任何脚本冻结**：物件停下来的唯一途径是
 * Jolt 自己的休眠，位置也绝不由脚本改写。要比的就是「纯物理能不能自己收敛」。
 *
 * 与 POC A / C 的公平性由 lab/shared/scenario.ts 保证：容器尺寸、件表、缩放、
 * 落点、初速度、随机种子、重力、固定步长全部取自同一份规格。这里只负责把规格
 * 翻译成 Jolt 的调用。
 */

import * as THREE from 'three';
import initJolt from 'jolt-physics';
import type JoltNS from 'jolt-physics';

import {
    BODY, CAMERA, CONTAINER, LIGHT, PHYSICS, ROUND_ITEMS, SCENARIOS, SPAWN,
    allModelIds, ScenarioDef, SpawnPlanEntry, SpawnRandoms,
} from '../../shared/scenario';
import { BodySample } from '../../shared/metrics';
import { EngineAdapter, runScenario } from '../../shared/harness';
import { loadModels, ModelAsset } from './models';

/** 对象层：0 静态、1 动态。Jolt 要求显式声明层与广相层的映射。 */
const LAYER_STATIC = 0;
const LAYER_MOVING = 1;

type Jolt = typeof JoltNS;

interface Item {
    key: number;
    id: string;
    body: JoltNS.Body;
    mesh: THREE.Object3D;
    radius: number;
    footprint: number;
    removed: boolean;
    /** 上一物理步与当前物理步的位姿，渲染时插值——固定步长下不插值必然看到帧级抖动。 */
    prev: { p: THREE.Vector3; q: THREE.Quaternion };
    cur: { p: THREE.Vector3; q: THREE.Quaternion };
}

class JoltAdapter implements EngineAdapter {
    readonly name = 'jolt';
    canvas!: HTMLCanvasElement;

    /** 碰撞代理：'auto' = 薄片圆柱 / 其余方盒（与正式工程同口径）；'hull' = 一律凸包。 */
    constructor(private proxy: 'auto' | 'hull') {}

    private J!: Jolt;
    private jolt!: JoltNS.JoltInterface;
    private phys!: JoltNS.PhysicsSystem;
    private bi!: JoltNS.BodyInterface;

    private renderer!: THREE.WebGLRenderer;
    private scene!: THREE.Scene;
    private camera!: THREE.OrthographicCamera;

    private assets = new Map<string, ModelAsset>();
    private items: Item[] = [];
    private nextKey = 1;

    // 复用的临时对象：每步给几十个刚体读位姿，现场 new 会把 GC 压力做进帧时里。
    private tmpVec!: JoltNS.Vec3;
    private tmpQuat!: JoltNS.Quat;

    async setup(modelIds: string[]) {
        this.J = await initJolt();
        const J = this.J;

        // ---- Jolt 世界 ----
        const settings = new J.JoltSettings();
        settings.mMaxBodies = 2048;
        settings.mMaxBodyPairs = 16384;
        settings.mMaxContactConstraints = 16384;

        const objFilter = new J.ObjectLayerPairFilterTable(2);
        objFilter.EnableCollision(LAYER_STATIC, LAYER_MOVING);
        objFilter.EnableCollision(LAYER_MOVING, LAYER_MOVING);
        const bpTable = new J.BroadPhaseLayerInterfaceTable(2, 2);
        bpTable.MapObjectToBroadPhaseLayer(LAYER_STATIC, new J.BroadPhaseLayer(0));
        bpTable.MapObjectToBroadPhaseLayer(LAYER_MOVING, new J.BroadPhaseLayer(1));
        settings.mObjectLayerPairFilter = objFilter;
        settings.mBroadPhaseLayerInterface = bpTable;
        settings.mObjectVsBroadPhaseLayerFilter =
            new J.ObjectVsBroadPhaseLayerFilterTable(bpTable, 2, objFilter, 2);

        this.jolt = new J.JoltInterface(settings);
        J.destroy(settings);
        this.phys = this.jolt.GetPhysicsSystem();
        this.bi = this.phys.GetBodyInterface();
        this.phys.SetGravity(new J.Vec3(0, PHYSICS.gravity, 0));

        // 求解迭代与休眠：这几个数就是「堆稳不稳、多久停」的主旋钮，POC 的意义
        // 一半在于把它们摆到台面上调，而不是像现在的工程那样靠脚本兜底。
        const ps = this.phys.GetPhysicsSettings();
        ps.mNumVelocitySteps = 12;   // 默认 10；密堆下多两轮明显减少互推
        ps.mNumPositionSteps = 3;    // 默认 2；用来压穿透
        ps.mTimeBeforeSleep = 0.35;  // 默认 0.5；本玩法希望更快落定
        ps.mPointVelocitySleepThreshold = BODY.sleepThreshold;
        ps.mSpeculativeContactDistance = 0.02;
        this.phys.SetPhysicsSettings(ps);

        this.tmpVec = new J.Vec3();
        this.tmpQuat = new J.Quat();

        // ---- 渲染 ----
        // preserveDrawingBuffer：默认情况下 WebGL 把帧呈现出去之后就清空缓冲，
        // 截图/captureStream 若没赶上刚好的重绘时机就会拿到全黑画面。跑测要靠截图
        // 做地面真值，这点开销必须付。
        this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        // updateStyle=false：让 CSS 的 100vw/100vh 决定画布尺寸。三方库写死的行内
        // width/height 会盖过样式表，窗口尺寸一变画布就与视口错位（画面看着像全黑）。
        this.renderer.setSize(innerWidth, innerHeight, false);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(this.renderer.domElement);
        this.canvas = this.renderer.domElement;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(
            CAMERA.clearColor.r / 255, CAMERA.clearColor.g / 255, CAMERA.clearColor.b / 255);

        const aspect = innerWidth / innerHeight;
        const h = CAMERA.orthoHeight;
        this.camera = new THREE.OrthographicCamera(-h * aspect, h * aspect, h, -h, 0.1, 100);
        this.camera.position.set(CAMERA.position.x, CAMERA.position.y, CAMERA.position.z);
        this.camera.rotation.set(
            THREE.MathUtils.degToRad(CAMERA.euler.x),
            THREE.MathUtils.degToRad(CAMERA.euler.y),
            THREE.MathUtils.degToRad(CAMERA.euler.z), 'YXZ');
        addEventListener('resize', () => {
            const a = innerWidth / innerHeight;
            this.camera.left = -h * a; this.camera.right = h * a;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(innerWidth, innerHeight, false);
        });

        const dir = new THREE.DirectionalLight(
            new THREE.Color(LIGHT.dirColor.r / 255, LIGHT.dirColor.g / 255, LIGHT.dirColor.b / 255), 2.6);
        const e = new THREE.Euler(
            THREE.MathUtils.degToRad(LIGHT.dirEuler.x),
            THREE.MathUtils.degToRad(LIGHT.dirEuler.y),
            THREE.MathUtils.degToRad(LIGHT.dirEuler.z), 'YXZ');
        dir.position.set(0, 0, 1).applyEuler(e).multiplyScalar(-10).add(new THREE.Vector3(0, 0, CONTAINER.cz));
        dir.target.position.set(CONTAINER.cx, 0, CONTAINER.cz);
        dir.castShadow = true;
        dir.shadow.mapSize.set(2048, 2048);
        const sc = dir.shadow.camera as THREE.OrthographicCamera;
        sc.left = -4; sc.right = 4; sc.top = 4; sc.bottom = -4; sc.near = 1; sc.far = 30;
        this.scene.add(dir, dir.target);
        this.scene.add(new THREE.HemisphereLight(
            new THREE.Color(LIGHT.ambientSky.r / 255, LIGHT.ambientSky.g / 255, LIGHT.ambientSky.b / 255),
            new THREE.Color(LIGHT.ambientGround.r / 255, LIGHT.ambientGround.g / 255, LIGHT.ambientGround.b / 255),
            1.1));

        this.buildContainer();
        this.assets = await loadModels(modelIds);
    }

    /** 地板 + 四面围栏，尺寸与正式工程 makeInvisibleWall 一字不差。 */
    private buildContainer() {
        const J = this.J;
        const f = CONTAINER.floor;
        this.addStaticBox(f.cx, f.cy, f.cz, f.sx / 2, f.sy / 2, f.sz / 2, true);

        const { height, centerY, thickness: WT } = CONTAINER.wall;
        const { cx, cz, halfX, halfZ } = CONTAINER;
        const spanX = halfX * 2 + WT * 2;
        this.addStaticBox(cx, centerY, cz - halfZ - WT / 2, spanX / 2, height / 2, WT / 2, false);
        this.addStaticBox(cx, centerY, cz + halfZ + WT / 2, spanX / 2, height / 2, WT / 2, false);
        this.addStaticBox(cx - halfX - WT / 2, centerY, cz, WT / 2, height / 2, halfZ, false);
        this.addStaticBox(cx + halfX + WT / 2, centerY, cz, WT / 2, height / 2, halfZ, false);
        void J;

        // 可见筐底：只为看清覆盖率，不参与物理（物理底板是上面那块厚板）。
        const plate = new THREE.Mesh(
            new THREE.BoxGeometry(halfX * 2, 0.04, halfZ * 2),
            new THREE.MeshStandardMaterial({ color: 0x6b4a33, roughness: 0.95 }));
        plate.position.set(cx, -0.02, cz);
        plate.receiveShadow = true;
        this.scene.add(plate);
    }

    private addStaticBox(x: number, y: number, z: number,
        hx: number, hy: number, hz: number, visible: boolean) {
        const J = this.J;
        const shape = new J.BoxShape(new J.Vec3(hx, hy, hz), 0.01);
        const bcs = new J.BodyCreationSettings(
            shape, new J.RVec3(x, y, z), new J.Quat(0, 0, 0, 1),
            J.EMotionType_Static, LAYER_STATIC);
        bcs.mFriction = PHYSICS.friction;
        bcs.mRestitution = PHYSICS.restitution;
        const body = this.bi.CreateBody(bcs);
        this.bi.AddBody(body.GetID(), J.EActivation_DontActivate);
        J.destroy(bcs);
        void visible;
    }

    spawn(entry: SpawnPlanEntry, r: SpawnRandoms) {
        const J = this.J;
        const asset = this.assets.get(entry.id);
        if (!asset) return;

        const s = entry.scale;
        const hx = asset.half.x * s, hy = asset.half.y * s, hz = asset.half.z * s;

        let shape: JoltNS.Shape;
        if (this.proxy === 'hull' && asset.hullPoints.length >= 12) {
            const chs = new J.ConvexHullShapeSettings();
            const pts = chs.mPoints;
            for (let i = 0; i < asset.hullPoints.length; i += 3) {
                pts.push_back(new J.Vec3(
                    asset.hullPoints[i] * s, asset.hullPoints[i + 1] * s, asset.hullPoints[i + 2] * s));
            }
            // 凸半径给 1cm：完全为 0 会让 GJK 在薄片上退化，接触法线跳变正是抖动来源。
            chs.mMaxConvexRadius = 0.01;
            const res = chs.Create();
            shape = res.Get();
            J.destroy(chs);
        } else if (ROUND_ITEMS.has(entry.id)) {
            // 薄片/环：圆柱代理，半高取 y 向、半径取 xz 较大者。
            shape = new J.CylinderShape(Math.max(0.01, hy), Math.max(0.01, Math.max(hx, hz)), 0.01);
        } else {
            shape = new J.BoxShape(new J.Vec3(hx, hy, hz), 0.01);
        }

        // 初始朝向：与正式工程 setNaturalRotation 同形（薄片 12°、其余 32° 随机倾角）。
        const tilt = entry.flat ? SPAWN.tiltFlat : SPAWN.tiltNormal;
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(
            THREE.MathUtils.degToRad((r.tiltX - 0.5) * tilt * 2),
            THREE.MathUtils.degToRad(r.yaw * 360),
            THREE.MathUtils.degToRad((r.tiltZ - 0.5) * tilt * 2), 'YXZ'));

        const bcs = new J.BodyCreationSettings(
            shape, new J.RVec3(entry.x, entry.y, entry.z),
            new J.Quat(q.x, q.y, q.z, q.w), J.EMotionType_Dynamic, LAYER_MOVING);
        bcs.mFriction = PHYSICS.friction;
        bcs.mRestitution = PHYSICS.restitution;
        bcs.mLinearDamping = BODY.linearDamping;
        bcs.mAngularDamping = BODY.angularDamping;
        bcs.mAllowSleeping = true;
        // LinearCast = Jolt 的连续碰撞。薄片高速下落时不开必穿地板。
        bcs.mMotionQuality = BODY.useCCD ? J.EMotionQuality_LinearCast : J.EMotionQuality_Discrete;
        // 只覆盖质量、保留形状算出的惯性张量：直接给惯性容易把薄片调成陀螺。
        bcs.mOverrideMassProperties = J.EOverrideMassProperties_CalculateInertia;
        bcs.mMassPropertiesOverride.mMass = entry.mass;
        // 内边去除：凸包/方盒拼成的堆，物件滑过相邻件接缝时会被"虚拟棱"绊一下，
        // 这正是"落定后突然抽一下"的常见来源。Jolt 有专门开关，POC 里默认开。
        bcs.mEnhancedInternalEdgeRemoval = true;

        const body = this.bi.CreateBody(bcs);
        this.bi.AddBody(body.GetID(), J.EActivation_Activate);
        J.destroy(bcs);

        const tumble = entry.flat ? SPAWN.tumbleFlat : SPAWN.tumbleNormal;
        body.SetLinearVelocity(new J.Vec3(
            (r.vx - 0.5) * SPAWN.lateralJitter, SPAWN.downSpeed, (r.vz - 0.5) * SPAWN.lateralJitter));
        body.SetAngularVelocity(new J.Vec3(
            (r.angX - 0.5) * tumble, (r.angY - 0.5) * SPAWN.tumbleYaw, (r.angZ - 0.5) * tumble));

        const mesh = asset.template.clone(true);
        mesh.scale.setScalar(s);
        mesh.position.set(entry.x, entry.y, entry.z);
        mesh.quaternion.copy(q);
        this.scene.add(mesh);

        const p = new THREE.Vector3(entry.x, entry.y, entry.z);
        this.items.push({
            key: this.nextKey++,
            id: entry.id,
            body, mesh,
            radius: Math.cbrt(hx * hy * hz),
            footprint: Math.sqrt(4 * hx * hz / Math.PI),
            removed: false,
            prev: { p: p.clone(), q: q.clone() },
            cur: { p: p.clone(), q: q.clone() },
        });
    }

    step(dt: number): number {
        const t0 = performance.now();
        // 每件在步进前存一份旧位姿，渲染时按 alpha 插值——固定 1/120 步长配 60Hz 渲染
        // 会产生 2:1 的采样混叠，不插值就是逐帧抖（正式工程踩过这个坑）。
        for (const it of this.items) {
            if (it.removed) continue;
            it.prev.p.copy(it.cur.p);
            it.prev.q.copy(it.cur.q);
        }
        this.jolt.Step(dt, 1);
        for (const it of this.items) {
            if (it.removed) continue;
            const p = it.body.GetPosition();
            const q = it.body.GetRotation();
            it.cur.p.set(p.GetX(), p.GetY(), p.GetZ());
            it.cur.q.set(q.GetX(), q.GetY(), q.GetZ(), q.GetW());
        }
        return performance.now() - t0;
    }

    render(alpha: number) {
        const a = Math.max(0, Math.min(1, alpha));
        for (const it of this.items) {
            if (it.removed) continue;
            it.mesh.position.lerpVectors(it.prev.p, it.cur.p, a);
            it.mesh.quaternion.slerpQuaternions(it.prev.q, it.cur.q, a);
        }
        this.renderer.render(this.scene, this.camera);
    }

    sample(): BodySample[] {
        return this.items.map(it => {
            if (it.removed) {
                return { key: it.key, id: it.id, x: 0, y: 0, z: 0, speed: 0, spin: 0,
                    radius: it.radius, footprint: it.footprint, asleep: true, removed: true };
            }
            const v = it.body.GetLinearVelocity();
            const w = it.body.GetAngularVelocity();
            return {
                key: it.key, id: it.id,
                x: it.cur.p.x, y: it.cur.p.y, z: it.cur.p.z,
                speed: Math.hypot(v.GetX(), v.GetY(), v.GetZ()),
                spin: Math.hypot(w.GetX(), w.GetY(), w.GetZ()),
                radius: it.radius,
                footprint: it.footprint,
                asleep: !it.body.IsActive(),
                removed: false,
            };
        });
    }

    remove(key: number) {
        const it = this.items.find(i => i.key === key);
        if (!it || it.removed) return;
        const J = this.J;
        // 摘件前记下它的世界包围盒，摘完唤醒同一片区域——Jolt 不会因为邻居消失自动
        // 唤醒已休眠的物理岛，不唤醒就会看到"抽了底下那块，上面整堆纹丝不动"。
        const box = it.body.GetWorldSpaceBounds();
        const min = box.mMin, max = box.mMax;
        const grow = 0.25;
        const wake = new J.AABox(
            new J.Vec3(min.GetX() - grow, min.GetY() - grow, min.GetZ() - grow),
            new J.Vec3(max.GetX() + grow, max.GetY() + grow, max.GetZ() + grow));

        this.bi.RemoveBody(it.body.GetID());
        this.bi.DestroyBody(it.body.GetID());
        this.scene.remove(it.mesh);
        it.removed = true;

        this.bi.ActivateBodiesInAABox(wake,
            new J.BroadPhaseLayerFilter(), new J.ObjectLayerFilter());
        J.destroy(wake);
    }
}

// ---------- 页面装配 ----------

const bar = document.getElementById('lab-bar')!;

function addButton(label: string, fn: () => void) {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = () => { [...bar.querySelectorAll('button')].forEach(x => (x as HTMLButtonElement).disabled = true); fn(); };
    bar.appendChild(b);
    return b;
}

/**
 * URL 参数：
 *   ?sc=s36|s56    直接开跑某一档（不传则等按钮）
 *   ?proxy=auto|hull  碰撞代理：auto = 薄片圆柱/其余方盒；hull = 一律凸包
 *   ?mode=fast|realtime  fast 采数（后台也跑得动）／realtime 录屏
 *   ?rec=0         关掉录屏
 */
const params = new URLSearchParams(location.search);
const proxy = (params.get('proxy') === 'hull' ? 'hull' : 'auto') as 'auto' | 'hull';
const mode = (params.get('mode') === 'fast' ? 'fast' : 'realtime') as 'fast' | 'realtime';

async function run(sc: ScenarioDef) {
    const adapter = new JoltAdapter(proxy);
    const m = await runScenario(adapter, sc, { mode, record: params.get('rec') !== '0' });
    console.log('[lab] 结果', m);
    (window as any).__labResult = m;
}

for (const sc of SCENARIOS) addButton(`${sc.label}`, () => run(sc));

void allModelIds; // 预留：需要一次性预热全部模型时用

const want = params.get('sc');
if (want) {
    const sc = SCENARIOS.find(s => s.id === want);
    if (sc) run(sc);
}
