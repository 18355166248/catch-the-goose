import { Node, RigidBody, MeshRenderer, v3, Vec3 } from 'cc';
import { ItemTag } from './ItemTag';
import { ContainerBoundary } from './ContainerBoundary';

/**
 * 堆内物件的巡检 / 冻结 / 逃逸回收（从 GameManager.update 抽出的高频物理收尾）。
 *
 * 每约 0.15s 跑一遍 {@link tick}，冻结判据只有**两条**（早先的 6 套重叠启发式已精简）：
 *   - 条 1 整堆静定：全体运动强度都降到 {@link PILE_CALM} 以下 → 整堆一次冻死；
 *   - 条 2 逐件静止：单件连续 {@link STILL_TICKS} 个周期净位移 < {@link STILL_STEP} → 冻死。
 *     这一条同时覆盖真静止与"被夹缝原地振荡"（两者净位移都极小），真在下落/滚动的不误冻。
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
     * 逐件冻结判据(条 2)的净位移阈值:单个巡检周期(0.15s)内净位移小于此值(米)记一次,
     * 连续 STILL_TICKS 次即判定"已停在原位"直接冻结。0.006m/周期 ≈ 4cm/s——真在下落/
     * 滚动的物件远超它、清零计数不会误冻;真静止或被夹缝原地振荡的物件净位移都极小 → 收敛。
     * 这一条取代了旧的 微颤即锁 / 逐周期钉住 / 打转 / 慢摇振幅 / 逐件慢冻 共 5 套重叠启发式。
     */
    private static readonly STILL_STEP = 0.006;
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
            // 让残余微颤能量更快耗尽、净位移更快塌到 STILL_STEP 以下,使冻结判据更早触发。
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
                t.lastPY = -99;
                continue;
            }

            // 条 2 —— 逐件冻结的**唯一**判据:本周期净位移极小,连续 STILL_TICKS 个周期
            // (≈0.45s)成立即判定"已停在原位"直接冻结。这一条同时覆盖了旧的
            // 微颤即锁 / 逐周期钉住 / 打转 / 慢摇振幅 / 逐件慢冻 五套重叠启发式:
            //   · 真静止 → 净位移≈0,收敛;
            //   · 被夹缝原地振荡(旧 rattle/慢摇要抓的病态)→ 净位移同样极小,一并收敛;
            //   · 真在下落/滚动 → 净位移远超阈值,清零计数不会误冻。
            // 不再需要 busyNeighbor 守卫:只有物件自身连续静止才冻,邻居在砸它时接触
            // 会让净位移超阈、自然不冻。抓不到的极端边角交给 GameManager 的 0.9s 硬冻兜底。
            const moved = Math.hypot(p.x - t.lastPX, p.y - t.lastPY, p.z - t.lastPZ);
            t.lastPX = p.x; t.lastPY = p.y; t.lastPZ = p.z;
            if (moved < PilePatrol.STILL_STEP) {
                if (++t.stillTicks >= PilePatrol.STILL_TICKS) {
                    freeze(t, rb);
                    continue;
                }
            } else {
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
