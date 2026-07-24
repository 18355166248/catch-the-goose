import { Node, RigidBody, MeshRenderer, v3, Vec3 } from 'cc';
import { ItemTag } from './ItemTag';
import { ContainerBoundary } from './ContainerBoundary';

/**
 * 堆内物件的巡检 / 冻结 / 逃逸回收（从 GameManager.update 抽出的高频物理收尾）。
 *
 * 每约 0.15s 跑一遍 {@link tick}，冻结判据只有**两条**（早先的 6 套重叠启发式已精简）：
 *   - 条 1 整堆静定：全体运动强度都降到 {@link PILE_CALM} 以下 → 整堆一次冻死；
 *   - 条 2 逐件静止：单件连续 {@link STILL_TICKS} 拍都困在锚点 {@link STILL_RADIUS} 小 blob 内 → 冻死。
 *     锚点振幅法同时覆盖真静止与"被夹缝原地振荡"（都不挪窝），真在下落/滚动的会跑出 blob 不误冻。
 *   抓不到的极端边角，由 GameManager 的 0.9s 硬冻定时器（SPAWN_FREEZE_DELAY）兜底保证必冻。
 *   另有：逃逸回收（质心穿墙 → 就地拉回墙内）、视觉外轮廓兜底、限速。
 *
 * 与 {@link ContainerBoundary} 强耦合：逃逸、回收落点、视觉 clamp 全走边界。换肤重建容器时
 * GameManager 调 {@link setBoundary} 换上新边界。{@link constrainVisualInside} 也在这里，
 * 因为它同样以 boundary 为唯一裁剪依据；GameManager 的 schedulePileSettle / settleNearRemoved
 * 通过本类实例复用它。
 */
export class PilePatrol {
    /**
     * 整堆静定阈值:当**所有**动态物件的运动强度 eff 都低于此值(没有任何一件还在真正下落/滚动,
     * 只剩接触求解的原地高频微颤),立刻整堆冻结,而不是干等 schedulePileSettle 的固定定时器。
     * 这消除了"落定后到强制冻结之间那 1~2s 的明显抖动窗口"。
     * 调小 = 更晚锁(要更彻底静止,残留抖动久);调大 = 更早锁但可能掐掉尚在缓慢滚定的物件。
     * —— 精简后的两条冻结判据之一(条 1:整堆一起冻)。
     */
    private static readonly PILE_CALM = 0.35;
    /**
     * 逐件冻结判据(条 2)的锚点 blob 半径(米):物件停在锚点周围 STILL_RADIUS 的小球内
     * 就算"没挪窝"。连续 STILL_TICKS 拍都困在 blob 内即冻结。
     * 关键:用**振幅**(离锚点多远)而非**逐周期净位移**——夹缝里"每拍抖 6mm+、整体却
     * 不离开原地"的残余微颤,逐周期净位移抓不住(会一直重置计数、干等定时器兜底,那 0.9s
     * 里就一直轻颤),但它始终困在 blob 内 → 锚点法能提前锁死。1.5cm 足以罩住接触微颤,
     * 又远小于真实滚动/下落一拍走过的距离(那会跑出 blob、重置锚点,不误冻)。
     * 这一条取代了旧的 微颤即锁 / 逐周期钉住 / 打转 / 慢摇振幅 / 逐件慢冻 共 5 套重叠启发式。
     */
    private static readonly STILL_RADIUS = 0.015;
    private static readonly STILL_TICKS = 3;

    private boundary: ContainerBoundary;
    private patrolTimer = 0;

    constructor(boundary: ContainerBoundary) {
        this.boundary = boundary;
    }

    /** 换肤重建容器后更新边界；巡检、逃逸、视觉兜底随之切换到新形状。 */
    setBoundary(boundary: ContainerBoundary) {
        this.boundary = boundary;
    }

    /**
     * 一个巡检周期（约 0.15s 触发一次）。frameDt 由调用方裁剪过（切后台不会累积）。
     * root 下所有 ItemTag 为处理对象。
     */
    tick(root: Node, frameDt: number) {
        // 逃逸回收 + 限速：物理墙是第一层保护，短周期巡检是高速/低帧率下的兜底。
        this.patrolTimer += frameDt;
        if (this.patrolTimer <= 0.15) return;
        this.patrolTimer = 0;
        // 中心点巡检只处理真正穿墙；可见外轮廓由 constrainVisualInside 单独保护。
        // 不再在墙内反复“拉回”，否则密集刚体会被持续重新唤醒并产生抖动。
        // 逃逸判定交给当前边界（矩形/圆形通用），巡检本身不再假设容器是矩形。
        const vel = v3();
        const ang = v3();
        // 第一遍：收集所有仍为动态的物件及其运动强度，供邻域安静判断。
        const dyn: { t: ItemTag; rb: RigidBody; speed: number; eff: number }[] = [];
        for (const t of root.getComponentsInChildren(ItemTag)) {
            if (t.picked || !t.node.isValid) continue;
            const rb = t.node.getComponent(RigidBody);
            // 已锁定的运动学物件不会越界，也不再做位置/速度修正，确保绝对静止。
            if (!rb?.enabled || rb.type === RigidBody.Type.KINEMATIC) continue;
            rb.getLinearVelocity(vel);
            rb.getAngularVelocity(ang);
            const speed = vel.length();
            // 纯旋转抖动线速度很小，运动强度把角速度也计入。
            dyn.push({ t, rb, speed, eff: speed + ang.length() * 0.25 });
        }

        const freeze = (t: ItemTag, rb: RigidBody) => {
            this.constrainVisualInside(t.node);
            try { rb.clearState(); } catch { /* 忽略 */ }
            rb.setLinearVelocity(v3());
            rb.setAngularVelocity(v3());
            rb.type = RigidBody.Type.KINEMATIC;
        };

        // 整堆静定:没有任何一件还在真正下落/滚动(全体 eff 都降到微颤级)→ 整堆立即冻结。
        // 直击"落定到强制冻结之间那 1~2s 抖动窗口"——一静即锁,而非死等定时器。
        // 只要还有一件在真运动就跳过(maxEff 高),不会误冻正在下落的堆。
        if (dyn.length > 0) {
            let maxEff = 0;
            for (const it of dyn) maxEff = Math.max(maxEff, it.eff);
            if (maxEff < PilePatrol.PILE_CALM) {
                for (const it of dyn) freeze(it.t, it.rb);
                return;
            }
        }

        for (const it of dyn) {
            const { t, rb, speed, eff } = it;
            // 两段阻尼:下落/翻滚用低阻尼保真实,进入低速沉降段切高阻尼(0.85/0.98)快速耗能,
            // 让残余微颤能量更快耗尽、振幅更快收进锚点 blob,使冻结判据更早触发。
            if (eff < 0.35 && rb.linearDamping < 0.3) {
                rb.linearDamping = 0.85;
                rb.angularDamping = 0.98;
            }
            const p = t.node.worldPosition;
            if (this.boundary.isEscaped(p.x, p.z, p.y)) {
                // 逃逸回收:不再瞬移到 2.2 高空重砸(那一下"飞出去又从天而降"非常穿帮)。
                // 水平越界 → 就地沿法向拉回墙内、保持当前高度,并归零外向速度,近乎无感;
                // 掉出底面(y<0,厚地板下极少发生) → 抬到台面稍上方轻放,而非高空重砸。
                const below = p.y < 0;
                const cp = this.boundary.clampPointToWall(p.x, p.z, 0.12);
                t.node.setWorldPosition(cp.x, below ? 0.3 : p.y, cp.z);
                try { rb.clearState(); } catch { /* 忽略 */ }
                rb.linearDamping = 0.06;
                rb.angularDamping = 0.3;
                rb.setLinearVelocity(v3(0, below ? -0.3 : 0, 0));
                rb.setAngularVelocity(v3());
                t.stillTicks = 0;
                t.anchorY = -99;
                continue;
            }

            // 条 2 —— 逐件冻结的**唯一**判据(锚点振幅法):物件仍困在锚点 STILL_RADIUS 的
            // 小 blob 内 → 累加;连续 STILL_TICKS 拍(≈0.45s)都没跑出 blob = 停在原地,冻结。
            // 用离锚点的距离(振幅)而非逐周期净位移,才能逮住"每拍抖几毫米、整体却不挪窝"
            // 的夹缝残余微颤(旧 rattle/慢摇要治的病态);真在下落/滚动会跑出 blob、重置锚点
            // 与计数,不会误冻。不需要 busyNeighbor 守卫:邻居砸它时它会跑出 blob 自然不冻。
            // 抓不到的极端边角交给 GameManager 的 0.9s 硬冻兜底。
            const ax = p.x - t.anchorX, ay = p.y - t.anchorY, az = p.z - t.anchorZ;
            if (ax * ax + ay * ay + az * az < PilePatrol.STILL_RADIUS * PilePatrol.STILL_RADIUS) {
                if (++t.stillTicks >= PilePatrol.STILL_TICKS) {
                    freeze(t, rb);
                    continue;
                }
            } else {
                t.anchorX = p.x; t.anchorY = p.y; t.anchorZ = p.z;
                t.stillTicks = 0;
            }

            // 高速下落阶段不做视觉外轮廓硬修正——半空中横向"吸附"正是抖动来源之一；
            // 围栏负责物理包含，视觉修正只在低速滚动/停靠阶段兜底，且单次修正
            // 距离设上限,避免大幅瞬移读作"闪跳"。
            if (speed < 2.0) {
                const visualCorrected = this.constrainVisualInside(t.node, 0.03);
                if (visualCorrected) {
                    rb.getLinearVelocity(vel);
                    rb.setLinearVelocity(v3(0, Math.min(vel.y, 0), 0));
                    rb.setAngularVelocity(v3());
                }
            }
            // 限速只拦截物理爆弹级的极端速度；阈值必须高于自由落体末速，
            // 否则每 0.15s 掐一次下落速度，摔落节奏会明显失真。
            if (speed > 12) {
                rb.getLinearVelocity(vel);
                vel.multiplyScalar(12 / speed);
                rb.setLinearVelocity(vel);
            }
        }
    }

    /**
     * 用所有 Mesh 的实时世界包围盒约束可见外轮廓，而不是只检查 Prefab 根节点。
     * 返回 true 表示本帧做过位置修正，调用方会同步清除横向速度，防止下一物理步再次冲出。
     * maxStep 限制单次修正距离:巡逻高频调用时用小步长,读作"贴墙滑回"而非瞬移。
     */
    constrainVisualInside(root: Node, maxStep = Infinity): boolean {
        root.updateWorldTransform();
        const min = v3(Infinity, Infinity, Infinity);
        const max = v3(-Infinity, -Infinity, -Infinity);
        const corner = v3();
        const point = v3();
        let hasBounds = false;

        for (const renderer of root.getComponentsInChildren(MeshRenderer)) {
            const meshMin = renderer.mesh?.struct.minPosition;
            const meshMax = renderer.mesh?.struct.maxPosition;
            if (!meshMin || !meshMax) continue;
            for (let mask = 0; mask < 8; mask++) {
                corner.set(
                    mask & 1 ? meshMax.x : meshMin.x,
                    mask & 2 ? meshMax.y : meshMin.y,
                    mask & 4 ? meshMax.z : meshMin.z,
                );
                Vec3.transformMat4(point, corner, renderer.node.worldMatrix);
                Vec3.min(min, min, point);
                Vec3.max(max, max, point);
                hasBounds = true;
            }
        }
        if (!hasBounds) return false;

        // 把渲染 AABB 拉回当前边界的 clamp 形状内（矩形/圆形通用）；
        // 位移都小于 2cm（浮点噪声级）时返回 null，避免边界附近来回抖。
        const res = this.boundary.clampAabb(min.x, max.x, min.z, max.z);
        if (!res) return false;
        let dx = res.dx;
        let dz = res.dz;
        dx = Math.max(-maxStep, Math.min(maxStep, dx));
        dz = Math.max(-maxStep, Math.min(maxStep, dz));

        const p = root.worldPosition;
        root.setWorldPosition(p.x + dx, p.y, p.z + dz);
        root.updateWorldTransform();
        return true;
    }
}
