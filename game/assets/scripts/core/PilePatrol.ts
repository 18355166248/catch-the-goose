import { Node, RigidBody, MeshRenderer, v3, Vec3 } from 'cc';
import { ItemTag } from './ItemTag';
import { ContainerBoundary } from './ContainerBoundary';

/**
 * 堆内物件的巡检 / 沉降 / 逃逸回收（从 GameManager.update 抽出的高频物理启发式）。
 *
 * 每约 0.15s 跑一遍 {@link tick}：
 *   - 逃逸回收：质心穿墙的物件按当前边界重新倒入；
 *   - 抖动 / 慢摇 / 原地振荡检测：判定为“已经停在那了”的物件直接切 KINEMATIC 锁死，消除接触抖动；
 *   - 逐件冻结：连续低速且邻域安静时冻结；
 *   - 视觉外轮廓兜底 + 限速。
 *
 * 与 {@link ContainerBoundary} 强耦合：逃逸、回收落点、视觉 clamp 全走边界。换肤重建容器时
 * GameManager 调 {@link setBoundary} 换上新边界。{@link constrainVisualInside} 也一并搬到这里，
 * 因为它同样以 boundary 为唯一裁剪依据；GameManager 的 schedulePileSettle / settleNearRemoved
 * 通过本类实例复用它。逻辑与原 update 内联版本一字不差，仅移动位置。
 */
export class PilePatrol {
    /**
     * 静止微颤冻结阈值:约 0.6~0.75s 内空间振幅小于此值(米)即判定"已钉在原位",直接冻结。
     * 调小 = 更严格(要几乎完全不动才冻,残留微颤时间略长);调大 = 更早冻但可能掐掉真实微沉降。
     */
    private static readonly PIN_AMP = 0.02;
    /**
     * 逐周期"钉住"判据:单个巡检周期(0.15s)内净位移小于此值(米)记一次,连续 PIN_TICKS 次即冻结。
     * 比 PIN_AMP 的 0.75s 窗口更快(约 0.45s)逮住微颤,缩短落定后的残留抖动时间。
     * 微颤的逐周期净位移≈0,真实滚动/滑动会超过它而清零计数,不会误冻。
     */
    private static readonly PIN_STEP = 0.000;
    private static readonly PIN_TICKS = 3;
    /**
     * 整堆静定阈值:当**所有**动态物件的运动强度 eff 都低于此值(没有任何一件还在真正下落/滚动,
     * 只剩接触求解的原地高频微颤),立刻整堆冻结,而不是干等 schedulePileSettle 的固定定时器。
     * 这消除了"落定后到强制冻结之间那 1~2s 的明显抖动窗口"。
     * 调小 = 更晚锁(要更彻底静止,残留抖动久);调大 = 更早锁但可能掐掉尚在缓慢滚定的物件。
     */
    private static readonly PILE_CALM = 0.35;
    /**
     * 微颤即锁:一件的 eff 已降到微颤级(< PILE_CALM)且本周期净位移小于此值(米)——
     * 即"低速 + 不平移",是微颤的专属特征——单个巡检周期即冻,不等 2 拍、不等整堆钉子户。
     * 这是压掉"暂停前几百毫秒残留抖动"的关键:已静下来的物件各自立刻锁死,不再陪跑。
     * 真在滚入位(净位移大)或半空下落(eff 高)的物件都不会被误锁。
     */
    private static readonly SETTLE_STEP = 0.01;

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
            // 两段阻尼:下落/翻滚用低阻尼保真实,进入低速沉降段切高阻尼快速耗能。
            // 阻尼加狠(0.85/0.98)让残余微颤能量更快耗尽、振幅塌到 PIN_AMP 以下,
            // 使冻结判据更早触发,缩短落定后的残留抖动。
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
                t.slowTicks = 0;
                t.rattleTicks = 0;
                t.pinTicks = 0;
                t.lastPY = -99;
                t.trail.length = 0;
                t.effWin.length = 0;
                continue;
            }

            // 剧烈抖动检测：净位移远小于速度对应的预期路径 = 原地往复振荡
            // (被不可动邻居夹住后求解器来回弹)。真实滚动/下落的净位移与速度
            // 成正比,不会触发;振荡则大部分路程被来回抵消。连续 3 个周期
            // (≈0.45s)即认定为打转，掐掉速度直接锁死——它本来就"停"在那了。
            const moved = Math.hypot(p.x - t.lastPX, p.y - t.lastPY, p.z - t.lastPZ);
            t.lastPX = p.x; t.lastPY = p.y; t.lastPZ = p.z;
            // 微颤即锁(单周期,逐件,不等整堆):运动强度已降到微颤级 + 本周期几乎没平移
            // = 已静下来只在原地颤 → 立刻冻结。这是压掉"暂停前几百毫秒残留抖动"的关键。
            // 半空下落 eff 高、真滚入位 moved 大,都不满足,不会误锁。
            if (eff < PilePatrol.PILE_CALM && moved < PilePatrol.SETTLE_STEP) {
                freeze(t, rb);
                continue;
            }
            // 逐周期钉住:净位移连续多周期都极小 = 已停在原位、只是在高频颤,直接冻结。
            // 无视速度、绕开 busyNeighbor,比 0.75s 的 amp 窗口更快逮住微颤(约 0.45s)。
            if (moved < PilePatrol.PIN_STEP) {
                if (++t.pinTicks >= PilePatrol.PIN_TICKS) {
                    freeze(t, rb);
                    continue;
                }
            } else {
                t.pinTicks = 0;
            }
            // 阈值 0.08 与慢冻结阈值 0.07 首尾相接,不给"低强度持续震颤"留缝隙。
            const expectedPath = eff * 0.15;
            if (eff > 0.08 && moved < expectedPath * 0.45) {
                if (++t.rattleTicks >= 2) {
                    freeze(t, rb);
                    continue;
                }
            } else {
                t.rattleTicks = 0;
            }

            // 慢摇检测:0.75s 轨迹窗口内走了不少路程、却几乎回到原地 =
            // 接触求解持续注入能量的往复摇摆(圆环落定前的典型病态)。
            // 真实滚动的净位移与路程同量级,不会触发。
            t.trail.push(p.x, p.y, p.z);
            if (t.trail.length > 15) t.trail.splice(0, 3);
            t.effWin.push(eff);
            if (t.effWin.length > 5) t.effWin.shift();
            if (t.trail.length === 15) {
                let path = 0;
                let cx = 0, cy = 0, cz = 0;
                for (let i = 0; i < 15; i += 3) {
                    cx += t.trail[i]; cy += t.trail[i + 1]; cz += t.trail[i + 2];
                    if (i >= 3) {
                        path += Math.hypot(
                            t.trail[i] - t.trail[i - 3],
                            t.trail[i + 1] - t.trail[i - 2],
                            t.trail[i + 2] - t.trail[i - 1],
                        );
                    }
                }
                cx /= 5; cy /= 5; cz /= 5;
                // 振幅 = 相对轨迹质心的最大偏移。真实滚动路径伸展、振幅与路程同量级;
                // 原地(或缓慢漂移中)的振荡路程长、振幅小。用振幅而非净位移,
                // 才能抓住"边漂移边抖"的病态。
                let amp = 0;
                for (let i = 0; i < 15; i += 3) {
                    amp = Math.max(amp, Math.hypot(
                        t.trail[i] - cx, t.trail[i + 1] - cy, t.trail[i + 2] - cz));
                }
                // 平均运动强度不受 0.15s 采样对高频振荡的路径混叠影响:
                // 持续有速度、振幅却极小,同样判定为原地振荡。
                const avgEff = t.effWin.reduce((a, b) => a + b, 0) / t.effWin.length;
                // 静止微颤专治(“已落定却一直抖”):约 0.6~0.75s 内位置始终困在 2cm 的
                // 小 blob 里(空间振幅极小)= 实际没移动,只是接触求解在原地高频颤。
                // 无视瞬时速度直接冻结——闭合速度死区 [0.07,0.09],并绕开 busyNeighbor 死锁
                // (一片物件同时微颤时,逐件冻结会因邻居都在抖而互相卡住,永不冻结)。
                // 已钉在原位的物件冻结不会推挤邻居,安全。
                if (amp < PilePatrol.PIN_AMP
                    || ((path > 0.038 || avgEff > 0.09) && amp < Math.max(0.025, path * 0.3))) {
                    freeze(t, rb);
                    continue;
                }
            }

            // 逐件冻结：连续两个巡逻周期(≈0.3s)近乎静止，且邻域也安静才锁死。
            // 若正上方/旁边还有运动中的物件，先不冻——运动学刚体质量无限大，
            // 冻在与邻居微穿插的位置会把邻居猛推出去，表现为突发的剧烈弹跳。
            if (eff < 0.07) {
                if (++t.slowTicks >= 2) {
                    const busyNeighbor = dyn.some(o => {
                        if (o.t === t || o.eff < 0.15) return false;
                        const q = o.t.node.worldPosition;
                        const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z;
                        return dx * dx + dy * dy + dz * dz < 0.6 * 0.6;
                    });
                    if (!busyNeighbor) {
                        freeze(t, rb);
                        continue;
                    }
                }
            } else {
                t.slowTicks = 0;
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
