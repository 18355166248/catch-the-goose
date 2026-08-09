import { Node, Mesh, MeshRenderer, gfx, v3, Vec3, Quat, Mat4, geometry } from 'cc';
import { loadJolt, JoltAPI } from '../lab/JoltLoader';

/**
 * Jolt 物理世界（取代 Cocos 内置的 ammo/Bullet）。
 *
 * 为什么换：见 lab/ 的同场对比。要点是 Cocos+Bullet 在本玩法的密堆下**永不收敛**——
 * 36 件跑满 45 仿真秒一件都不休眠（32 件处于 WANTS_DEACTIVATION，但休眠按接触岛整体
 * 判定，一件不静全岛不睡）。正式工程那三层脚本兜底（0.9s 定时硬冻、PilePatrol 两条
 * 冻结判据、constrainVisualInside 位置改写）都是在给这个擦屁股。换 PhysX 也一样，
 * 还多出半空悬停。Jolt 落定 1.45s、落定后零位移、抽底 0% 扰动，单步 0.05ms。
 *
 * 本类是**唯一**碰 Jolt 的地方，对外只暴露玩法需要的动词：投一件、摘一件、射线拾取、
 * 步进、把位姿同步给节点、唤醒一片区域。GameManager 不该出现任何 Jolt 类型。
 *
 * 三条硬规矩（正是实验里胜出的那套条件，别破例）：
 *   1. 固定步长 + 渲染插值。禁止把渲染帧长直接喂给物理。
 *   2. 物件停下来的唯一途径是 Jolt 自己的休眠。**不许**任何脚本冻结。
 *   3. 不许脚本改写动态刚体的位置。节点位姿是物理的输出，不是输入。
 */

/** 对象层：0 静态、1 动态。Jolt 要求显式声明层与广相层的映射。 */
const LAYER_STATIC = 0;
const LAYER_MOVING = 1;

/** 碰撞代理形状。凸包是堆型的决定因素（实测堆顶 3.4→1.5、覆盖率 78%→87%）。 */
export type ProxyShape =
    | { kind: 'box'; half: Vec3 }
    | { kind: 'cylinder'; halfHeight: number; radius: number }
    | { kind: 'hull'; points: Float32Array };

export interface BodyOptions {
    shape: ProxyShape;
    mass: number;
    linearDamping: number;
    angularDamping: number;
    friction: number;
    restitution: number;
    useCCD: boolean;
    position: Vec3;
    rotation: Quat;
    linearVelocity: Vec3;
    angularVelocity: Vec3;
}

/** 一个受物理驱动的物件。key 用于跨帧、跨系统标识（射线命中回传的就是它）。 */
interface Body {
    key: number;
    node: Node;
    body: any;
    /** 等效体积半径，唤醒邻居时估计影响范围用。 */
    radius: number;
    removed: boolean;
    /** 上一步与当前步的位姿，渲染时按 alpha 插值。 */
    prevP: Vec3; prevQ: Quat;
    curP: Vec3; curQ: Quat;
}

export class JoltWorld {
    private J!: JoltAPI;
    private jolt: any;
    private phys: any;
    private bi: any;
    private ready = false;

    private bodies: Body[] = [];
    private byId = new Map<number, Body>();
    private statics: any[] = [];
    private nextKey = 1;

    /** 复用的临时对象：每步给几十个刚体读位姿，现场 new 会把 GC 压力做进帧时里。 */
    private tmpP = v3();
    private tmpQ = new Quat();

    /** wasm 是否已就绪。未就绪时 step/spawn 全部安全空转，调用方无需等待。 */
    get isReady(): boolean { return this.ready; }

    /**
     * 加载 wasm 并建世界。重复调用复用同一次加载。
     * @param gravity 重力加速度（负值向下）
     */
    async init(gravity: number): Promise<void> {
        if (this.ready) return;
        this.J = await loadJolt();
        const J = this.J;

        const settings = new J.JoltSettings();
        // 上限按最坏情况给：56 件 + 干扰物 + 围栏静态体，留足余量。
        settings.mMaxBodies = 1024;
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
        this.phys.SetGravity(new J.Vec3(0, gravity, 0));

        // 求解迭代与休眠：这几个数就是「堆稳不稳、多久停」的主旋钮。数值抄自 lab 里
        // 胜出的那组配置，改之前请先在 lab/poc-b-jolt 复现，别直接在正式工程里试。
        const ps = this.phys.GetPhysicsSettings();
        ps.mNumVelocitySteps = 12;   // 默认 10；密堆下多两轮明显减少互推
        ps.mNumPositionSteps = 3;    // 默认 2；用来压穿透
        ps.mTimeBeforeSleep = 0.35;  // 默认 0.5；本玩法希望更快落定
        ps.mPointVelocitySleepThreshold = 0.15;
        ps.mSpeculativeContactDistance = 0.02;
        this.phys.SetPhysicsSettings(ps);

        this.ready = true;
    }

    // ---------- 静态几何（地板与围栏） ----------

    /**
     * 一块静态盒。yawDeg 给圆容器的切向环段用（矩形墙传 0）。
     * @param size 全尺寸（不是半尺寸），与 Cocos 的 BoxCollider.size 同口径
     */
    addStaticBox(pos: Vec3, size: Vec3, yawDeg: number,
        friction: number, restitution: number) {
        if (!this.ready) return;
        const J = this.J;
        const shape = new J.BoxShape(new J.Vec3(size.x / 2, size.y / 2, size.z / 2), 0.01);
        const q = new Quat();
        Quat.fromEuler(q, 0, yawDeg, 0);
        const bcs = new J.BodyCreationSettings(
            shape, new J.RVec3(pos.x, pos.y, pos.z), new J.Quat(q.x, q.y, q.z, q.w),
            J.EMotionType_Static, LAYER_STATIC);
        bcs.mFriction = friction;
        bcs.mRestitution = restitution;
        const body = this.bi.CreateBody(bcs);
        this.bi.AddBody(body.GetID(), J.EActivation_DontActivate);
        J.destroy(bcs);
        this.statics.push(body);
    }

    /** 清掉全部静态体（换肤重建容器时用）。动态件不受影响。 */
    clearStatics() {
        if (!this.ready) return;
        for (const b of this.statics) {
            this.bi.RemoveBody(b.GetID());
            this.bi.DestroyBody(b.GetID());
        }
        this.statics.length = 0;
    }

    // ---------- 动态物件 ----------

    /**
     * 投放一件。节点从此由物理驱动——**调用方不要再写它的 position/rotation**。
     * @returns 该件的 key；射线拾取与移除都用它
     */
    spawn(node: Node, opt: BodyOptions): number {
        if (!this.ready) return -1;
        const J = this.J;

        let shape: any;
        let radius: number;
        if (opt.shape.kind === 'hull' && opt.shape.points.length >= 12) {
            const chs = new J.ConvexHullShapeSettings();
            const pts = chs.mPoints;
            const p = opt.shape.points;
            for (let i = 0; i < p.length; i += 3) {
                pts.push_back(new J.Vec3(p[i], p[i + 1], p[i + 2]));
            }
            // 凸半径给 1cm：完全为 0 会让 GJK 在薄片上退化，接触法线跳变正是抖动来源。
            chs.mMaxConvexRadius = 0.01;
            shape = chs.Create().Get();
            J.destroy(chs);
            radius = hullRadius(opt.shape.points);
        } else if (opt.shape.kind === 'cylinder') {
            shape = new J.CylinderShape(
                Math.max(0.01, opt.shape.halfHeight), Math.max(0.01, opt.shape.radius), 0.01);
            radius = Math.cbrt(opt.shape.radius * opt.shape.radius * opt.shape.halfHeight);
        } else {
            const h = opt.shape.kind === 'box' ? opt.shape.half : v3(0.1, 0.1, 0.1);
            shape = new J.BoxShape(new J.Vec3(h.x, h.y, h.z), 0.01);
            radius = Math.cbrt(h.x * h.y * h.z);
        }

        const key = this.nextKey++;
        const bcs = new J.BodyCreationSettings(
            shape,
            new J.RVec3(opt.position.x, opt.position.y, opt.position.z),
            new J.Quat(opt.rotation.x, opt.rotation.y, opt.rotation.z, opt.rotation.w),
            J.EMotionType_Dynamic, LAYER_MOVING);
        // 射线命中只拿得到 BodyID，靠 UserData 反查回我们的 key。
        // 不要改成往 body 对象上挂 JS 属性——那是 wasm 的包装对象，重新取一次就没了。
        bcs.mUserData = key;
        bcs.mFriction = opt.friction;
        bcs.mRestitution = opt.restitution;
        bcs.mLinearDamping = opt.linearDamping;
        bcs.mAngularDamping = opt.angularDamping;
        bcs.mAllowSleeping = true;
        // LinearCast = Jolt 的连续碰撞。薄片高速下落时不开必穿地板。
        bcs.mMotionQuality = opt.useCCD ? J.EMotionQuality_LinearCast : J.EMotionQuality_Discrete;
        // 只覆盖质量、保留形状算出的惯性张量：直接给惯性容易把薄片调成陀螺。
        bcs.mOverrideMassProperties = J.EOverrideMassProperties_CalculateInertia;
        bcs.mMassPropertiesOverride.mMass = opt.mass;
        // 内边去除：凸包拼成的堆，物件滑过相邻件接缝时会被"虚拟棱"绊一下，
        // 这正是"落定后突然抽一下"的常见来源。Jolt 有专门开关，默认开。
        bcs.mEnhancedInternalEdgeRemoval = true;

        const body = this.bi.CreateBody(bcs);
        this.bi.AddBody(body.GetID(), J.EActivation_Activate);
        J.destroy(bcs);

        body.SetLinearVelocity(new J.Vec3(
            opt.linearVelocity.x, opt.linearVelocity.y, opt.linearVelocity.z));
        body.SetAngularVelocity(new J.Vec3(
            opt.angularVelocity.x, opt.angularVelocity.y, opt.angularVelocity.z));

        const entry: Body = {
            key, node, body, radius, removed: false,
            prevP: opt.position.clone(), prevQ: opt.rotation.clone(),
            curP: opt.position.clone(), curQ: opt.rotation.clone(),
        };
        this.bodies.push(entry);
        this.byId.set(key, entry);
        return key;
    }

    /**
     * 摘掉一件（玩家点走 / 道具吸走）。会唤醒周围一圈——Jolt 不会因为邻居消失自动
     * 唤醒已休眠的物理岛，不唤醒就会看到"抽了底下那块，上面整堆纹丝不动"。
     */
    remove(key: number) {
        const it = this.byId.get(key);
        if (!it || it.removed || !this.ready) return;
        const J = this.J;

        const box = it.body.GetWorldSpaceBounds();
        const min = box.mMin, max = box.mMax;
        const grow = 0.25;
        const wake = new J.AABox(
            new J.Vec3(min.GetX() - grow, min.GetY() - grow, min.GetZ() - grow),
            new J.Vec3(max.GetX() + grow, max.GetY() + grow, max.GetZ() + grow));

        this.bi.RemoveBody(it.body.GetID());
        this.bi.DestroyBody(it.body.GetID());
        it.removed = true;
        this.byId.delete(key);

        this.bi.ActivateBodiesInAABox(wake, new J.BroadPhaseLayerFilter(), new J.ObjectLayerFilter());
        J.destroy(wake);
    }

    /** 清空全部动态件（重开一关）。 */
    clearBodies() {
        if (!this.ready) return;
        for (const it of this.bodies) {
            if (it.removed) continue;
            this.bi.RemoveBody(it.body.GetID());
            this.bi.DestroyBody(it.body.GetID());
            it.removed = true;
        }
        this.bodies.length = 0;
        this.byId.clear();
    }

    /**
     * 把一件瞬移到新位姿并重新激活。
     *
     * 这是**唯一**允许脚本改写动态刚体位置的口子，只服务于「打乱」道具——那本来就是
     * 一次超自然的重新发牌，不是物理过程。除此之外任何"把件拉回墙内""贴住堆顶"之类的
     * 位置修正都不许走这里：正式工程历史上的 constrainVisualInside 就是那么长出来的，
     * 结果是物理与脚本互相打架、堆永远静不下来。
     */
    teleport(key: number, pos: Vec3, rot: Quat, linVel: Vec3) {
        const it = this.byId.get(key);
        if (!it || it.removed || !this.ready) return;
        const J = this.J;
        this.bi.SetPositionAndRotation(
            it.body.GetID(),
            new J.RVec3(pos.x, pos.y, pos.z),
            new J.Quat(rot.x, rot.y, rot.z, rot.w),
            J.EActivation_Activate);
        it.body.SetLinearVelocity(new J.Vec3(linVel.x, linVel.y, linVel.z));
        it.body.SetAngularVelocity(new J.Vec3(0, 0, 0));
        // 插值缓存一并重置，否则这一帧渲染会从旧位置"拉丝"到新位置。
        Vec3.copy(it.curP, pos); Quat.copy(it.curQ, rot);
        Vec3.copy(it.prevP, pos); Quat.copy(it.prevQ, rot);
    }

    /** 唤醒一点周围的物件（道具打乱、摘件后的局部塌落补刀）。 */
    wakeAround(center: Vec3, radius: number) {
        if (!this.ready) return;
        const J = this.J;
        const wake = new J.AABox(
            new J.Vec3(center.x - radius, center.y - radius, center.z - radius),
            new J.Vec3(center.x + radius, center.y + radius, center.z + radius));
        this.bi.ActivateBodiesInAABox(wake, new J.BroadPhaseLayerFilter(), new J.ObjectLayerFilter());
        J.destroy(wake);
    }

    // ---------- 步进与同步 ----------

    /**
     * 固定步长步进一次。调用方负责累加器与固定步循环（见 GameManager.update）。
     * 步进前会存一份旧位姿，供 {@link syncNodes} 插值。
     */
    step(dt: number) {
        if (!this.ready) return;
        for (const it of this.bodies) {
            if (it.removed) continue;
            Vec3.copy(it.prevP, it.curP);
            Quat.copy(it.prevQ, it.curQ);
        }
        this.jolt.Step(dt, 1);
        for (const it of this.bodies) {
            if (it.removed) continue;
            const p = it.body.GetPosition();
            const q = it.body.GetRotation();
            it.curP.set(p.GetX(), p.GetY(), p.GetZ());
            it.curQ.set(q.GetX(), q.GetY(), q.GetZ(), q.GetW());
        }
    }

    /**
     * 把物理位姿写进节点，按 alpha 在上一步与当前步之间插值。
     *
     * 插值不是锦上添花：固定 1/120 步长配 60Hz 渲染会产生 2:1 的采样混叠，不插值就是
     * 逐帧抖——本工程为这个坑付过一次代价（见 goose-jitter-debugging 那次排查）。
     */
    syncNodes(alpha: number) {
        if (!this.ready) return;
        const a = Math.max(0, Math.min(1, alpha));
        for (const it of this.bodies) {
            if (it.removed || !it.node.isValid) continue;
            Vec3.lerp(this.tmpP, it.prevP, it.curP, a);
            Quat.slerp(this.tmpQ, it.prevQ, it.curQ, a);
            it.node.setWorldPosition(this.tmpP);
            it.node.setWorldRotation(this.tmpQ);
        }
    }

    // ---------- 查询 ----------

    /**
     * 射线拾取，返回命中件的 key（无命中返回 -1）。取代 PhysicsSystem.raycast。
     * 只打动态层——围栏和地板不该被点到。
     */
    raycast(ray: geometry.Ray, maxDistance = 1000): number {
        if (!this.ready) return -1;
        const J = this.J;
        const from = new J.RVec3(ray.o.x, ray.o.y, ray.o.z);
        const dir = new J.Vec3(ray.d.x * maxDistance, ray.d.y * maxDistance, ray.d.z * maxDistance);
        const rc = new J.RRayCast(from, dir);
        const collector = new J.CastRayClosestHitCollisionCollector();
        // 只收动态层：围栏、地板都在静态层，玩家点不到。
        const bpFilter = new J.DefaultBroadPhaseLayerFilter(
            this.jolt.GetObjectVsBroadPhaseLayerFilter(), LAYER_MOVING);
        const objFilter = new J.DefaultObjectLayerFilter(
            this.jolt.GetObjectLayerPairFilter(), LAYER_MOVING);
        this.phys.GetNarrowPhaseQuery().CastRay(
            rc, new J.RayCastSettings(), collector, bpFilter, objFilter, new J.BodyFilter(), new J.ShapeFilter());

        let key = -1;
        if (collector.HadHit()) {
            // UserData 就是 spawn 时写进去的 key（见 bcs.mUserData）。
            key = this.bi.GetUserData(collector.mHit.mBodyID) || -1;
        }
        J.destroy(collector);
        J.destroy(rc);
        return key;
    }

    /** 该件是否已被 Jolt 判为休眠。只读，玩法层不该据此改写物理。 */
    isAsleep(key: number): boolean {
        const it = this.byId.get(key);
        return !it || it.removed ? true : !it.body.IsActive();
    }

    /** 当前世界位置（读物理状态，不是插值后的渲染位姿）。 */
    getPosition(key: number, out: Vec3): boolean {
        const it = this.byId.get(key);
        if (!it || it.removed) return false;
        Vec3.copy(out, it.curP);
        return true;
    }

    /** 仍在场的动态件数量（不含已摘掉的）。 */
    get liveCount(): number {
        let n = 0;
        for (const it of this.bodies) if (!it.removed) n++;
        return n;
    }
}

// ---------- 几何工具 ----------

/**
 * 从节点下的所有 Mesh 抽出凸包点集（root 局部坐标，已按 scale 缩放）。
 *
 * 全量顶点（几千个）直接喂给凸包构造器纯属浪费——凸包只由外壳顶点决定。按空间方向
 * 分格取每格最外的一个点：压到约 100 个点，又保证各方向的极值点不会被抽掉
 * （随机抽稀会把尖端抽没，凸包就缩水了）。这套抽稀与 lab/poc-b-jolt 里逐行一致，
 * 换句话说正式工程与实验场用的是同一个凸包，实验结论才迁得过来。
 *
 * @param center 视觉包围盒中心（局部），点集会减掉它以对齐刚体质心
 * @param scale  实例化时的统一缩放
 */
export function extractHullPoints(root: Node, center: Vec3, scale: number): Float32Array {
    root.updateWorldTransform();
    const invRoot = new Mat4();
    const meshToRoot = new Mat4();
    Mat4.invert(invRoot, root.worldMatrix);

    const buckets = new Map<number, { d: number; x: number; y: number; z: number }>();
    const p = v3();

    for (const mr of root.getComponentsInChildren(MeshRenderer)) {
        const mesh: Mesh | null = mr.mesh;
        if (!mesh) continue;
        Mat4.multiply(meshToRoot, invRoot, mr.node.worldMatrix);
        for (let sub = 0; sub < mesh.struct.primitives.length; sub++) {
            const pos = mesh.readAttribute(sub, gfx.AttributeName.ATTR_POSITION);
            if (!pos) continue;
            for (let i = 0; i + 2 < pos.length; i += 3) {
                p.set(pos[i] as number, pos[i + 1] as number, pos[i + 2] as number);
                Vec3.transformMat4(p, p, meshToRoot);
                const x = (p.x - center.x) * scale;
                const y = (p.y - center.y) * scale;
                const z = (p.z - center.z) * scale;
                const d = Math.hypot(x, y, z);
                if (d < 1e-6) continue;
                const theta = Math.atan2(z, x);                              // -π..π
                const phi = Math.acos(Math.max(-1, Math.min(1, y / d)));     // 0..π
                const key = Math.floor((theta + Math.PI) / (2 * Math.PI) * 12) * 12
                    + Math.floor(phi / Math.PI * 12);
                const cur = buckets.get(key);
                if (!cur || d > cur.d) buckets.set(key, { d, x, y, z });
            }
        }
    }

    const arr = new Float32Array(buckets.size * 3);
    let k = 0;
    buckets.forEach(b => { arr[k++] = b.x; arr[k++] = b.y; arr[k++] = b.z; });
    return arr;
}

/** 点集的等效体积半径，用于估计唤醒范围。 */
function hullRadius(points: Float32Array): number {
    let mx = 0, my = 0, mz = 0;
    for (let i = 0; i + 2 < points.length; i += 3) {
        mx = Math.max(mx, Math.abs(points[i]));
        my = Math.max(my, Math.abs(points[i + 1]));
        mz = Math.max(mz, Math.abs(points[i + 2]));
    }
    return Math.cbrt(Math.max(1e-4, mx * my * mz));
}
