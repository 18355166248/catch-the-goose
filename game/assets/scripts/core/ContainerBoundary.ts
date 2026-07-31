import { v3, Vec3 } from 'cc';

/**
 * 通用容器边界（承载物边界）。
 *
 * 目的：不同场景的容器造型不同——篮 / 盒 / 柜是矩形，锅 / 碗 / 圆筐 / 煎盘是圆形。
 * 但“物品绝不能离开承载物”这条规则对所有造型都成立。历史代码把矩形边界硬编码
 * 在四处（物理围栏、巡检逃逸、视觉外轮廓兜底、投放种子），换成圆容器就会漏。
 *
 * 这里把边界抽象成一个 {@link BoundaryShape}，由四个环节统一调用：
 *   1. buildWallSpecs —— 物理围栏（矩形 4 面 / 圆形环段），第一道硬阻挡；
 *   2. isEscaped      —— 巡检逃逸判定（质心越界或掉出底面）；
 *   3. respawn        —— 逃逸回收落点（容器中心偏上重新倒入）；
 *   4. clampAabb      —— 视觉外轮廓兜底（把渲染 AABB 拉回形状内）。
 * 再加投放/打乱的铺点 seedPoint + 底面积 usableArea，件的大小与落点都随容器自适应。
 *
 * 新增一种造型只需在此实现对应分支，四个环节自动生效——这就是“通用边界”。
 */

/** 承载物在 XZ 平面上的可容纳区域（Y 向上）。以后要长条 / 椭圆再加 kind 即可。 */
export type BoundaryShape =
    | { kind: 'rect'; cx: number; cz: number; halfX: number; halfZ: number }
    | { kind: 'circle'; cx: number; cz: number; radius: number };

/** 一段隐形围栏的描述，交给 GameManager 变成 BoxCollider。yawDeg 用于圆环切向段。 */
export interface WallSpec {
    name: string;
    pos: Vec3;
    size: Vec3;
    yawDeg: number;
}

/**
 * 一个容器的完整边界定义。
 * wall  = 物理围栏（约束刚体质心），通常紧贴可见容器内壁；
 * clamp = 视觉外轮廓兜底（约束渲染 AABB），可比 wall 略大，作最后一道防漏。
 * 两者拆开是因为高瘦物件质心在墙内、渲染网格仍可能探出一点，需要各自的尺度。
 */
export interface BoundaryDef {
    wall: BoundaryShape;
    clamp: BoundaryShape;
    /**
     * 竖向剖面：世界 y → 该高度处容器的**内壁半径**。只对圆容器有意义，省略即竖直墙。
     *
     * 为什么需要它：碗是上宽下窄的曲面，而围栏历来是一根固定半径的竖直圆柱。
     * 实测 bowl_jade（缩放后碗沿 y=1.43）的内半径是
     *   y=0.09 → 0.87 ／ 0.27 → 1.30 ／ 0.54 → 1.50 ／ 0.81 → 1.63 ／ 1.34 → 1.87
     * 而围栏一律按 1.65 算 —— 碗底那一圈整整宽出 0.78，物件在低处能直接站到碗壁
     * 外面去，正是"物件穿出碗壁"的根因。给了剖面后围栏改为逐层收窄，贴合真实内壁。
     *
     * 约定：按 y 升序；最低一段向下延伸到围栏底，最高一段向上延伸到围栏顶。
     */
    profile?: { y: number; radius: number }[];
}

export class ContainerBoundary {
    readonly wall: BoundaryShape;
    readonly clamp: BoundaryShape;
    readonly profile?: { y: number; radius: number }[];

    constructor(def: BoundaryDef) {
        this.wall = def.wall;
        this.clamp = def.clamp;
        this.profile = def.profile;
    }

    get centerX(): number { return this.wall.cx; }
    get centerZ(): number { return this.wall.cz; }

    /**
     * 形状内的均匀铺点：把两个 [0,1) 的低差异样本映射到「墙内收 inset」的区域里。
     *
     * 这是「铺满筐底」与「堆成一根柱子」的分界。历史实现是极坐标小圆盘，
     * 矩形容器的四角永远撒不到点，物件只能往中间摞——2.70×2.84 的筐底配上
     * 半径 0.72 的种子盘，24 件就能叠到 y=4.7（筐沿 ~1.0）。
     * 矩形分支直接线性映射（四角也能落到），圆形分支的半径必须过 sqrt，
     * 否则面积不等概率、点全挤在圆心。
     */
    seedPoint(u1: number, u2: number, inset: number): { x: number; z: number } {
        const s = this.wall;
        if (s.kind === 'rect') {
            const hx = Math.max(0.05, s.halfX - inset);
            const hz = Math.max(0.05, s.halfZ - inset);
            return { x: s.cx + (u1 * 2 - 1) * hx, z: s.cz + (u2 * 2 - 1) * hz };
        }
        const r = Math.max(0.05, s.radius - inset) * Math.sqrt(u1);
        const a = u2 * Math.PI * 2;
        return { x: s.cx + Math.cos(a) * r, z: s.cz + Math.sin(a) * r };
    }

    /** 墙内收 inset 后的可用底面积。投放侧用它估「一层放得下几件」。 */
    usableArea(inset: number): number {
        const s = this.wall;
        if (s.kind === 'rect') {
            return Math.max(0.01, (s.halfX - inset) * 2) * Math.max(0.01, (s.halfZ - inset) * 2);
        }
        // 注意这里**故意**用 wall.radius 而不是剖面里碗底那个小半径。
        // 碗底真实面积只有 π×0.95²=2.84，按它反解件会缩到 0.615，件太小；
        // 而设计上允许"装不下就往碗口上堆"，堆到碗沿附近时可用面积本就接近碗口，
        // 1.65 正落在碗底 0.95 与碗沿 1.84 之间，作为整堆的代表值比两端都合适。
        const r = Math.max(0.01, s.radius - inset);
        return Math.PI * r * r;
    }

    /**
     * 物理围栏墙段。矩形 = 前后左右 4 面厚墙；圆形 = 一圈相互重叠的切向薄墙近似圆壁。
     * @param height 墙高（竖向覆盖）
     * @param y      墙体中心 Y
     * @param thickness 墙厚（沿法向），下探到台面以下杜绝隧穿
     */
    buildWallSpecs(height: number, y: number, thickness: number): WallSpec[] {
        const s = this.wall;
        const WT = thickness;
        if (s.kind === 'rect') {
            const spanX = s.halfX * 2 + WT * 2;
            return [
                { name: 'fenceN', pos: v3(s.cx, y, s.cz - s.halfZ - WT / 2), size: v3(spanX, height, WT), yawDeg: 0 },
                { name: 'fenceS', pos: v3(s.cx, y, s.cz + s.halfZ + WT / 2), size: v3(spanX, height, WT), yawDeg: 0 },
                { name: 'fenceW', pos: v3(s.cx - s.halfX - WT / 2, y, s.cz), size: v3(WT, height, s.halfZ * 2), yawDeg: 0 },
                { name: 'fenceE', pos: v3(s.cx + s.halfX + WT / 2, y, s.cz), size: v3(WT, height, s.halfZ * 2), yawDeg: 0 },
            ];
        }
        // 有剖面 → 逐层生成收窄的环墙（碗这类曲面容器）。每层只覆盖自己那段高度，
        // 半径取该段的内壁值，堆起来就近似出碗的斜壁。
        if (this.profile && this.profile.length) {
            const prof = this.profile;
            const yBot = y - height / 2, yTop = y + height / 2;
            const out: WallSpec[] = [];
            for (let k = 0; k < prof.length; k++) {
                const segBot = k === 0 ? yBot : prof[k].y;
                const segTop = k === prof.length - 1 ? yTop : prof[k + 1].y;
                const segH = segTop - segBot;
                if (segH <= 0) continue;
                out.push(...this.ringSpecs(prof[k].radius, segH, segBot + segH / 2, WT, `L${k}`));
            }
            return out;
        }
        // 圆壁：N 段薄墙沿半径 (radius + WT/2) 均布，内壁恰好落在 radius 上。
        // 段长 = 弧长 × 重叠系数，宁可相邻重叠也不留缝（缝会漏物件）。
        // 段数随半径自适应：半径越大越多段，逼近真圆——减小"多边形外凸"(内壁弦
        // 在段间凸出真圆之外，物件可被顶到弦外)与段间楔出缝。下限 28 保底。
        return this.ringSpecs(s.radius, height, y, WT, '');
    }

    /** 一圈切向环段。抽出来给分层剖面复用（每层半径不同）。 */
    private ringSpecs(radius: number, height: number, y: number, WT: number,
        tag: string): WallSpec[] {
        const s = this.wall as { cx: number; cz: number };
        const N = Math.max(28, Math.ceil(radius * 22));
        const ringR = radius + WT / 2;
        // 重叠系数按**内壁**(半径 s.radius)处的弧长算，保证连内壁接缝都相互重叠、
        // 不给小件留缝；旧版按 ringR(外圈)算，内壁处重叠偏小仍可能被薄片钻缝。
        const segLen = (2 * Math.PI * radius / N) * 1.8;
        const specs: WallSpec[] = [];
        for (let i = 0; i < N; i++) {
            const theta = (i / N) * Math.PI * 2;
            const cos = Math.cos(theta);
            const sin = Math.sin(theta);
            specs.push({
                name: `fenceRing${tag}_${i}`,
                pos: v3(s.cx + cos * ringR, y, s.cz + sin * ringR),
                // 盒体 length(局部 X) 对齐切向，depth(局部 Z) 沿半径向内。
                // 绕 Y 旋转 φ 时局部 X→(cosφ,0,-sinφ)，令其等于切向(-sinθ,cosθ) 解得 φ=-(θ+90°)。
                size: v3(segLen, height, WT),
                yawDeg: -(theta * 180 / Math.PI + 90),
            });
        }
        return specs;
    }

    /** 巡检逃逸判定：质心越过围栏 + 余量，或掉出底面。true = 已逃逸需回收。 */
    isEscaped(x: number, z: number, y: number, margin = 0.15, yFloor = -0.05): boolean {
        if (y < yFloor) return true;
        const s = this.wall;
        if (s.kind === 'rect') {
            return Math.abs(x - s.cx) > s.halfX + margin
                || z < s.cz - s.halfZ - margin
                || z > s.cz + s.halfZ + margin;
        }
        return Math.hypot(x - s.cx, z - s.cz) > s.radius + margin;
    }

    /** 逃逸回收落点：容器中心附近（矩形取内区，圆形取内盘），配合 y 抬高重新倒入。 */
    respawn(rand: () => number): { x: number; z: number } {
        const s = this.wall;
        if (s.kind === 'rect') {
            // 系数 1.04 / 0.85 使默认矩形复刻历史落点范围（±1.4 / ±1.2）。
            return {
                x: s.cx + (rand() - 0.5) * s.halfX * 1.04,
                z: s.cz + (rand() - 0.5) * s.halfZ * 0.85,
            };
        }
        const a = rand() * Math.PI * 2;
        const r = rand() * s.radius * 0.5;
        return { x: s.cx + Math.cos(a) * r, z: s.cz + Math.sin(a) * r };
    }

    /**
     * 把一个越界点沿最近法向拉回墙内 inset 距离处（矩形夹取 / 圆形径向收回）。
     * 逃逸回收用：就地拉回而非瞬移到高空重砸——玩家几乎察觉不到，也不会看到穿帮的
     * “飞出去又从天而降”。已在墙内的点原样返回。
     */
    clampPointToWall(x: number, z: number, inset = 0.1): { x: number; z: number } {
        const s = this.wall;
        if (s.kind === 'rect') {
            const hx = Math.max(0, s.halfX - inset);
            const hz = Math.max(0, s.halfZ - inset);
            return {
                x: Math.min(s.cx + hx, Math.max(s.cx - hx, x)),
                z: Math.min(s.cz + hz, Math.max(s.cz - hz, z)),
            };
        }
        const dx = x - s.cx, dz = z - s.cz;
        const d = Math.hypot(dx, dz);
        const r = Math.max(0, s.radius - inset);
        if (d <= r || d < 1e-6) return { x, z };
        const k = r / d;
        return { x: s.cx + dx * k, z: s.cz + dz * k };
    }

    /**
     * 视觉外轮廓兜底：给定物件渲染 AABB 在 XZ 的范围，返回需要的最小平移把它拉回 clamp 形状内；
     * 位移都小于 2cm（浮点噪声级）则返回 null 表示无需修正。
     */
    clampAabb(minX: number, maxX: number, minZ: number, maxZ: number): { dx: number; dz: number } | null {
        const s = this.clamp;
        if (s.kind === 'rect') {
            const loX = s.cx - s.halfX, hiX = s.cx + s.halfX;
            const loZ = s.cz - s.halfZ, hiZ = s.cz + s.halfZ;
            let dx = 0, dz = 0;
            if (minX < loX) dx = loX - minX;
            if (maxX + dx > hiX) dx += hiX - (maxX + dx);
            if (minZ < loZ) dz = loZ - minZ;
            if (maxZ + dz > hiZ) dz += hiZ - (maxZ + dz);
            if (Math.abs(dx) < 0.02 && Math.abs(dz) < 0.02) return null;
            return { dx, dz };
        }
        // 圆形：把整盒沿“盒心→圆心”径向推回。对 AABB 四个角分别解“落到半径上所需的最小内移量”，
        // 取最大者作为平移量——单步即可把最外角精确收进圆内。
        // （旧版只按单个最远角的方向推，盒心贴过圆心的轴线时会带进横向分量，令另一角甩出约 10cm。）
        const bx = (minX + maxX) / 2 - s.cx;
        const bz = (minZ + maxZ) / 2 - s.cz;
        const hx = (maxX - minX) / 2;
        const hz = (maxZ - minZ) / 2;
        const R = s.radius;
        const d = Math.hypot(bx, bz);
        // 盒心几乎压在圆心：无从确定推向。此时若仍有角越界，只能是容器半径配得比物件还小
        // （皮肤配置问题），平移救不了，交回上层不处理。
        if (d < 1e-4) return null;
        const ux = bx / d, uz = bz / d;
        let t = 0;
        for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) {
                const cx = bx + sx * hx;
                const cz = bz + sz * hz;
                const c2 = cx * cx + cz * cz;
                if (c2 <= R * R) continue; // 该角本就在圆内
                const proj = cx * ux + cz * uz;
                const disc = proj * proj - (c2 - R * R);
                if (disc < 0) continue; // 该角在此方向上永不入圆（物件比容器还宽），跳过
                t = Math.max(t, proj - Math.sqrt(disc)); // 该角落到半径所需的最小内移
            }
        }
        if (t <= 0) return null;
        const dx = -t * ux, dz = -t * uz;
        if (Math.abs(dx) < 0.02 && Math.abs(dz) < 0.02) return null;
        return { dx, dz };
    }
}
