import {
    _decorator, Component, Node, Prefab, instantiate, MeshRenderer, Mesh, Layers,
    RigidBody, Collider, BoxCollider, CylinderCollider, MeshCollider,
    PhysicsSystem, PhysicsMaterial, EAxisDirection,
    v3, Vec3, Quat, Mat4, geometry,
} from 'cc';
import { PrefabCache } from '../core/PrefabCache';
import {
    BODY, CONTAINER, PHYSICS, ROUND_ITEMS, SCENARIOS, SPAWN,
    ScenarioDef, SpawnPlanEntry, SpawnRandoms,
} from './scenario';
import { BodySample } from './metrics';
import { EngineAdapter, runScenario } from './harness';

/**
 * POC A —— 清理后的 Cocos 对照组（当前后端是 ammo/Bullet，见 settings/v2/packages/engine.json）。
 *
 * 这一套的**全部意义**是回答一个问题：正式工程里那些「摔落不真实、突然定格、堆型僵硬」
 * 的毛病，到底来自物理引擎，还是来自压在它上面的三层脚本补丁？所以这里刻意**不写**
 * 正式工程有而 POC B/C 没有的东西：
 *
 *   - 没有 SPAWN_FREEZE_DELAY（GameManager 里每件 0.9s 后无条件转 KINEMATIC）；
 *   - 没有 PilePatrol 的两条冻结判据（整堆静定 PILE_CALM、锚点振幅 STILL_RADIUS）；
 *   - 没有 constrainVisualInside（对动态刚体直接 setWorldPosition 改写位置）；
 *   - 没有巡检限速、没有两段阻尼切换。
 *
 * 物件停下来的唯一途径是 Bullet 自己的休眠。跟 POC B/C 的规则一模一样。
 *
 * 另外两处与正式工程不同、但**必须**如此才能公平比较的地方：
 *
 *   1. 物理与视觉拆成两个节点。正式工程把碰撞体和模型放在同一个节点上，于是渲染插值
 *      写回节点 = 改写刚体位置（Cocos 每步都会 syncSceneToPhysics 把节点 transform 灌回
 *      物理体）。拆开之后数据流单向：物理写 physNode，我们只读；插值只写 visNode，
 *      而 visNode 上没有任何碰撞体，物理压根看不见它。
 *   2. 关掉 autoSimulation，步进由 harness 的固定 1/120 循环驱动。Cocos 默认的
 *      accumulator 会把渲染帧长喂给物理，那正是方案里禁止的做法。
 */

const { ccclass } = _decorator;

/** 碰撞代理档位：'auto' = 薄片圆柱 / 其余方盒（正式工程现状）；'hull' = 凸包。 */
type ProxyMode = 'auto' | 'hull';

interface ModelAsset {
    id: string;
    prefab: Prefab;
    /** 居中所需的平移量（把包围盒中心搬到原点）。 */
    offset: Vec3;
    /** 居中后的局部包围盒半尺寸（未缩放）。 */
    half: Vec3;
    /** 顶点数最多的那个 Mesh，凸包代理用。 */
    hullMesh: Mesh | null;
}

interface Item {
    key: number;
    id: string;
    physNode: Node;
    visNode: Node;
    rb: RigidBody;
    radius: number;
    footprint: number;
    removed: boolean;
    /** 上一物理步与当前物理步的位姿，渲染时插值。 */
    prevP: Vec3; prevQ: Quat;
    curP: Vec3; curQ: Quat;
}

class CocosAdapter implements EngineAdapter {
    readonly name = 'cocos-bullet';
    canvas!: HTMLCanvasElement;

    constructor(private root: Node, private proxy: ProxyMode) {}

    private mat!: PhysicsMaterial;
    private assets = new Map<string, ModelAsset>();
    private items: Item[] = [];
    private nextKey = 1;

    private tmpV = v3();
    private tmpW = v3();
    private lerpP = v3();
    private lerpQ = new Quat();

    async setup(modelIds: string[]) {
        this.canvas = document.querySelector('canvas') as HTMLCanvasElement;

        const ps = PhysicsSystem.instance;
        ps.gravity = v3(0, PHYSICS.gravity, 0);
        ps.fixedTimeStep = PHYSICS.fixedTimeStep;
        ps.maxSubSteps = PHYSICS.maxSubSteps;
        ps.sleepThreshold = BODY.sleepThreshold;
        ps.allowSleep = true;
        // 步进交给 harness：Cocos 自带的 accumulator 会把**渲染帧长**喂给物理，
        // 三套 POC 要求一律固定步 + 渲染插值，所以这里必须接管。
        ps.autoSimulation = false;

        this.mat = new PhysicsMaterial();
        this.mat.setValues(PHYSICS.friction, PHYSICS.rollingFriction,
            PHYSICS.spinningFriction, PHYSICS.restitution);

        this.buildContainer();

        const cache = new PrefabCache();
        await cache.loadAll(modelIds);
        for (const id of modelIds) {
            const prefab = cache.get(id);
            if (!prefab) { console.warn(`[Lab] 模型缺失：${id}`); continue; }
            this.assets.set(id, this.measure(id, prefab));
        }
    }

    /** 地板 + 四面围栏，尺寸与正式工程 makeInvisibleWall 一字不差。 */
    private buildContainer() {
        const f = CONTAINER.floor;
        this.addStaticBox('floor', v3(f.cx, f.cy, f.cz), v3(f.sx, f.sy, f.sz));

        const { height, centerY, thickness: WT } = CONTAINER.wall;
        const { cx, cz, halfX, halfZ } = CONTAINER;
        const spanX = halfX * 2 + WT * 2;
        this.addStaticBox('fenceN', v3(cx, centerY, cz - halfZ - WT / 2), v3(spanX, height, WT));
        this.addStaticBox('fenceS', v3(cx, centerY, cz + halfZ + WT / 2), v3(spanX, height, WT));
        this.addStaticBox('fenceW', v3(cx - halfX - WT / 2, centerY, cz), v3(WT, height, halfZ * 2));
        this.addStaticBox('fenceE', v3(cx + halfX + WT / 2, centerY, cz), v3(WT, height, halfZ * 2));
    }

    private addStaticBox(name: string, pos: Vec3, size: Vec3) {
        const n = new Node(name);
        n.setParent(this.root);
        n.layer = Layers.Enum.DEFAULT;
        n.setPosition(pos);
        const rb = n.addComponent(RigidBody);
        rb.type = RigidBody.Type.STATIC;
        const col = n.addComponent(BoxCollider);
        col.size = size;
        col.sharedMaterial = this.mat;
    }

    /**
     * 量一个 prefab 的局部包围盒与凸包网格。
     *
     * glb 的场景根普遍带着 DCC 里的残留平移（正式工程的 centerVisualAndFitCollider 就是在
     * 治这个），不减掉的话碰撞体与视觉永远错位。这里只量一次，之后每件实例化复用。
     */
    private measure(id: string, prefab: Prefab): ModelAsset {
        const probe = instantiate(prefab);
        probe.setParent(this.root);
        probe.setPosition(0, 0, 0);
        probe.setScale(1, 1, 1);
        probe.updateWorldTransform();

        const min = v3(Infinity, Infinity, Infinity);
        const max = v3(-Infinity, -Infinity, -Infinity);
        const invRoot = new Mat4();
        const meshToRoot = new Mat4();
        const corner = v3(), point = v3();
        Mat4.invert(invRoot, probe.worldMatrix);

        let hullMesh: Mesh | null = null;
        let bestVerts = -1;
        for (const mr of probe.getComponentsInChildren(MeshRenderer)) {
            const mesh = mr.mesh;
            const mn = mesh?.struct.minPosition, mx = mesh?.struct.maxPosition;
            if (!mesh || !mn || !mx) continue;
            const verts = mesh.struct.vertexBundles.reduce((s, b) => s + b.view.count, 0);
            if (verts > bestVerts) { bestVerts = verts; hullMesh = mesh; }
            Mat4.multiply(meshToRoot, invRoot, mr.node.worldMatrix);
            for (let mask = 0; mask < 8; mask++) {
                corner.set(mask & 1 ? mx.x : mn.x, mask & 2 ? mx.y : mn.y, mask & 4 ? mx.z : mn.z);
                Vec3.transformMat4(point, corner, meshToRoot);
                Vec3.min(min, min, point);
                Vec3.max(max, max, point);
            }
        }
        probe.destroy();

        const center = v3((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
        const half = v3((max.x - min.x) / 2, (max.y - min.y) / 2, (max.z - min.z) / 2);
        return { id, prefab, offset: v3(-center.x, -center.y, -center.z), half, hullMesh };
    }

    spawn(entry: SpawnPlanEntry, r: SpawnRandoms) {
        const asset = this.assets.get(entry.id);
        if (!asset) return;

        const s = entry.scale;
        const hx = asset.half.x * s, hy = asset.half.y * s, hz = asset.half.z * s;

        // 初始朝向：与正式工程 setNaturalRotation 同形（薄片 12°、其余 32° 随机倾角）。
        const tilt = entry.flat ? SPAWN.tiltFlat : SPAWN.tiltNormal;
        const q = new Quat();
        Quat.fromEuler(q, (r.tiltX - 0.5) * tilt * 2, r.yaw * 360, (r.tiltZ - 0.5) * tilt * 2);

        // ---- 物理节点：只有刚体与碰撞体，没有任何渲染内容 ----
        const physNode = new Node(`phys_${entry.id}_${entry.index}`);
        physNode.setParent(this.root);
        physNode.layer = Layers.Enum.DEFAULT;
        physNode.setPosition(entry.x, entry.y, entry.z);
        physNode.setRotation(q);

        const rb = physNode.addComponent(RigidBody);
        rb.type = RigidBody.Type.DYNAMIC;
        rb.mass = entry.mass;
        rb.linearDamping = BODY.linearDamping;
        rb.angularDamping = BODY.angularDamping;
        rb.sleepThreshold = BODY.sleepThreshold;
        rb.useCCD = BODY.useCCD;

        this.addCollider(physNode, entry, asset, hx, hy, hz);

        const tumble = entry.flat ? SPAWN.tumbleFlat : SPAWN.tumbleNormal;
        rb.setLinearVelocity(v3(
            (r.vx - 0.5) * SPAWN.lateralJitter, SPAWN.downSpeed, (r.vz - 0.5) * SPAWN.lateralJitter));
        rb.setAngularVelocity(v3(
            (r.angX - 0.5) * tumble, (r.angY - 0.5) * SPAWN.tumbleYaw, (r.angZ - 0.5) * tumble));

        // ---- 视觉节点：与物理节点平级，位姿由我们插值写入，物理看不见它 ----
        const visNode = new Node(`vis_${entry.id}_${entry.index}`);
        visNode.setParent(this.root);
        visNode.setPosition(entry.x, entry.y, entry.z);
        visNode.setRotation(q);
        visNode.setScale(s, s, s);
        const model = instantiate(asset.prefab);
        model.setParent(visNode);
        model.setPosition(asset.offset);   // 抵消 glb 的 DCC 残留偏移
        forceLayer(visNode);
        for (const mr of visNode.getComponentsInChildren(MeshRenderer)) {
            mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.ON;
        }

        this.items.push({
            key: this.nextKey++,
            id: entry.id,
            physNode, visNode, rb,
            radius: Math.cbrt(hx * hy * hz),
            footprint: Math.sqrt(4 * hx * hz / Math.PI),
            removed: false,
            prevP: v3(entry.x, entry.y, entry.z), prevQ: q.clone(),
            curP: v3(entry.x, entry.y, entry.z), curQ: q.clone(),
        });
    }

    /**
     * 碰撞代理。
     *
     * hull 档有一处与 POC B/C **不对等**，看结果时必须记得：B/C 用的是按方向分格抽稀到
     * 约 100 点的凸包，而 Cocos 的 MeshCollider 只吃现成的 Mesh 资源、无从喂点集，
     * 所以这里直接把**全量网格**交给 Bullet 做凸包，而且多网格模型只取顶点最多的那一块。
     * 也就是说 POC A 的 hull 档更贵、对多零件模型更不准。这是 Cocos 这条路的真实成本，
     * 不是 POC 偷懒。
     */
    private addCollider(node: Node, entry: SpawnPlanEntry, asset: ModelAsset,
        hx: number, hy: number, hz: number) {
        let col: Collider;
        if (this.proxy === 'hull' && asset.hullMesh) {
            const mc = node.addComponent(MeshCollider);
            mc.convex = true;
            mc.mesh = asset.hullMesh;
            // MeshCollider 不吃 size，靠节点缩放定尺寸；物理节点因此必须跟着缩放。
            node.setScale(entry.scale, entry.scale, entry.scale);
            col = mc;
        } else if (ROUND_ITEMS.has(entry.id)) {
            const cc = node.addComponent(CylinderCollider);
            cc.direction = EAxisDirection.Y_AXIS;
            cc.height = Math.max(0.02, hy * 2);
            cc.radius = Math.max(0.01, Math.max(hx, hz));
            col = cc;
        } else {
            const bc = node.addComponent(BoxCollider);
            bc.size = v3(hx * 2, hy * 2, hz * 2);
            col = bc;
        }
        col.sharedMaterial = this.mat;
    }

    step(dt: number): number {
        const t0 = performance.now();
        for (const it of this.items) {
            if (it.removed) continue;
            Vec3.copy(it.prevP, it.curP);
            Quat.copy(it.prevQ, it.curQ);
        }
        // autoSimulation 关掉之后，postUpdate 什么都不做，得自己按 Cocos 的原顺序推一步。
        // syncSceneToPhysics 对我们是空操作（物理节点的 transform 从不由脚本改写），
        // 保留它是为了与引擎默认路径完全一致，不引入额外的行为差异。
        const world = (PhysicsSystem.instance as unknown as {
            physicsWorld: {
                syncSceneToPhysics(): void;
                step(dt: number, since?: number, maxSub?: number): void;
                emitEvents(): void;
                syncAfterEvents(): void;
            };
        }).physicsWorld;
        world.syncSceneToPhysics();
        world.step(dt);
        world.emitEvents();
        world.syncAfterEvents();

        for (const it of this.items) {
            if (it.removed) continue;
            Vec3.copy(it.curP, it.physNode.worldPosition);
            Quat.copy(it.curQ, it.physNode.worldRotation);
        }
        return performance.now() - t0;
    }

    render(alpha: number) {
        const a = Math.max(0, Math.min(1, alpha));
        for (const it of this.items) {
            if (it.removed) continue;
            Vec3.lerp(this.lerpP, it.prevP, it.curP, a);
            Quat.slerp(this.lerpQ, it.prevQ, it.curQ, a);
            it.visNode.setWorldPosition(this.lerpP);
            it.visNode.setWorldRotation(this.lerpQ);
        }
        // Cocos 的绘制由 director 自己的 rAF 驱动，这里只摆位姿，不触发绘制。
    }

    sample(): BodySample[] {
        return this.items.map(it => {
            if (it.removed) {
                return { key: it.key, id: it.id, x: 0, y: 0, z: 0, speed: 0, spin: 0,
                    radius: it.radius, footprint: it.footprint, asleep: true, removed: true };
            }
            it.rb.getLinearVelocity(this.tmpV);
            it.rb.getAngularVelocity(this.tmpW);
            return {
                key: it.key, id: it.id,
                x: it.curP.x, y: it.curP.y, z: it.curP.z,
                speed: this.tmpV.length(),
                spin: this.tmpW.length(),
                radius: it.radius,
                footprint: it.footprint,
                asleep: it.rb.isSleeping,
                removed: false,
            };
        });
    }

    remove(key: number) {
        const it = this.items.find(i => i.key === key);
        if (!it || it.removed) return;

        const c = it.curP.clone();
        const reach = it.radius * 3 + 0.25;

        it.physNode.destroy();
        it.visNode.destroy();
        it.removed = true;

        // Bullet 不会因为邻居消失自动唤醒已休眠的刚体，不唤醒就会看到
        // "抽了底下那块，上面整堆纹丝不动"。按距离筛一遍逐个弹醒。
        for (const other of this.items) {
            if (other.removed || other === it) continue;
            if (Vec3.distance(other.curP, c) > reach) continue;
            other.rb.wakeUp();
        }
    }
}

/** 代码新建的节点 layer 可能为 0（任何相机都不画），整棵树塞进 DEFAULT 渲染层。 */
function forceLayer(root: Node) {
    root.layer = Layers.Enum.DEFAULT;
    for (const c of root.children) forceLayer(c);
}

/**
 * 实验场入口组件。由 Bootstrap 在 `?lab=1` 时挂上，与 GameManager 互斥
 * （两者都会接管物理与相机，同时存在必然互相打架）。
 */
@ccclass('LabScene')
export class LabScene extends Component {
    start() {
        const params = new URLSearchParams(location.search);
        const proxy: ProxyMode = params.get('proxy') === 'hull' ? 'hull' : 'auto';
        const mode = params.get('mode') === 'fast' ? 'fast' : 'realtime';
        const want = params.get('sc') ?? SCENARIOS[0].id;
        const sc = SCENARIOS.find(s => s.id === want) ?? SCENARIOS[0];
        void this.run(sc, proxy, mode, params.get('rec') !== '0');
    }

    private async run(sc: ScenarioDef, proxy: ProxyMode,
        mode: 'fast' | 'realtime', record: boolean) {
        const adapter = new CocosAdapter(this.node, proxy);
        const m = await runScenario(adapter, sc, { mode, record });
        console.log('[lab] 结果', m);
        (globalThis as unknown as { __labResult: unknown }).__labResult = m;
    }
}

// 供调试时确认射线/几何模块被打包进来（Cocos 会摇掉未引用的模块）。
void geometry;
