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
 * 再加投放/打乱的种子盘缩放 seedScale，小容器自动收窄。
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
}

/** 形状内切半径：矩形取较短半边，圆形即半径。用于种子盘缩放。 */
function innerRadius(s: BoundaryShape): number {
    return s.kind === 'rect' ? Math.min(s.halfX, s.halfZ) : s.radius;
}

export class ContainerBoundary {
    readonly wall: BoundaryShape;
    readonly clamp: BoundaryShape;

    /** 默认矩形对应的内切半径，用来把其它容器的种子盘按比例收窄。 */
    private static readonly REF_INNER = 1.35;

    constructor(def: BoundaryDef) {
        this.wall = def.wall;
        this.clamp = def.clamp;
    }

    get centerX(): number { return this.wall.cx; }
    get centerZ(): number { return this.wall.cz; }

    /** 投放/打乱种子盘缩放：默认矩形为 1，更小的容器自动收窄避免一开局就溢出。 */
    seedScale(): number {
        return Math.min(1, innerRadius(this.wall) / ContainerBoundary.REF_INNER);
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
        // 圆壁：N 段薄墙沿半径 (radius + WT/2) 均布，内壁恰好落在 radius 上。
        // 段长 = 弧长 × 重叠系数，宁可相邻重叠也不留缝（缝会漏物件）。
        // 段数随半径自适应：半径越大越多段，逼近真圆——减小"多边形外凸"(内壁弦
        // 在段间凸出真圆之外，物件可被顶到弦外)与段间楔出缝。下限 28 保底。
        const N = Math.max(28, Math.ceil(s.radius * 22));
        const ringR = s.radius + WT / 2;
        // 重叠系数按**内壁**(半径 s.radius)处的弧长算，保证连内壁接缝都相互重叠、
        // 不给小件留缝；旧版按 ringR(外圈)算，内壁处重叠偏小仍可能被薄片钻缝。
        const segLen = (2 * Math.PI * s.radius / N) * 1.8;
        const specs: WallSpec[] = [];
        for (let i = 0; i < N; i++) {
            const theta = (i / N) * Math.PI * 2;
            const cos = Math.cos(theta);
            const sin = Math.sin(theta);
            specs.push({
                name: `fenceRing${i}`,
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
