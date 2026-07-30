/**
 * 关卡与场景配置。
 *
 * 设计：一个「场景主题」= 一套皮肤（SceneSkin）+ 一族物件（family）。
 * 每天按日期轮播一个主题（全服同一天同场景，天然可上好友榜）。
 * 当天固定 3 关阶梯，物件从该主题的 family 派生：
 *   第 1 关·送温暖(4 种) → 第 2 关·正常(6 种) → 第 3 关·地狱(9 种)。
 * 物件颜色对比逐关降低（先纯色强对比，再引入同色系靠形状区分），配合密度/时限收紧难度。
 */

export interface LevelDef {
    /** 参与本关的物件 id（对应 resources/models/ 下的 glb 文件名） */
    items: string[];
    /** 每种物件的组数（1 组 = 3 个） */
    groupsPerItem: number;
    /** 时限（秒） */
    timeSec: number;
    /** 初始条件种子：同一关重试保持物件顺序、投放点、旋转和初速度一致 */
    seed: number;
    /**
     * 障碍物（石头）数量。默认 0。石头可拾取、占 1 格但无法三消（≤2 个永远配不齐），
     * 不计入胜利判定 → 误拿即长期占格，只能靠「移出」道具清掉，制造真实残局/爆槽风险。
     */
    distractors?: number;
}

/** 障碍物 id（对应 resources/models/rock.glb）；跨主题通用，不属于任何物件族。 */
export const DISTRACTOR_ID = 'rock';

/** 场景主题：皮肤 + 物件族。family 顺序即难度引入顺序（前 4 个为强对比上手件）。 */
export interface Theme {
    id: string;
    /** 显示名 */
    name: string;
    /** 对应 SceneSkin.id（决定背景与置物容器外观） */
    skinId: string;
    /**
     * 物件族（该场景专属模型 id）。至少 9 种以喂满第 3 关。
     * 排序讲究：slice(0,4) 必须颜色两两分明；后段可引入同色系提升辨识难度。
     */
    family: string[];
}

/**
 * 全部场景主题。追加一个主题即自动进入每日轮播，无需改玩法层。
 * 池塘农场/甜品店待模型就绪后按同结构继续追加。
 */
export const THEMES: Theme[] = [
    {
        id: 'fruit', name: '水果摊', skinId: 'redwood',
        // slice(0,4)=红/黄/紫/橙 四色分明；后段草莓(红)柠檬(黄)与前段同色系，靠形状区分。
        family: ['apple', 'banana', 'grape', 'orange',
                 'strawberry', 'lemon', 'pear', 'cherry', 'goose'],
    },
    {
        id: 'antique', name: '古玩铺', skinId: 'jade',
        /**
         * 古玩件天生同色——13 件候选里 7 件的色相都挤在 132~151° 的翡翠绿，
         * 所以这一族靠「明度 + 形状」拉开，而不是靠色相：
         *   slice(0,4) 金(45°) / 紫(273°) / 浅绿高明度(94°) / 深绿兽形(151°) 仍两两分明；
         *   第 5~6 件各自与前段同色系但形状迥异（薄圆片 vs 元宝堆、尖锥 vs 兽形）；
         *   后段同色系再加码，压轴放吉祥物大鹅。
         * 刻意排除三件：
         *   pingankou 与干扰物 rock 同为无彩灰（饱和度 0.02 / 0.01），只差明度，堆里易误拿；
         *   （jingling 曾是另一个候选，但属宝可梦商标件，已从仓库删除，见 CREDITS.md。）
         *   baicai 的网格是一堆互不相连的叶片碎片（5000 面却有 8633 顶点），没有共享边可塌，
         *   减面只能整片删三角形、直接穿洞，而原版本身也只是团碎绿片、从来没成形——
         *   减不了也救不回，已连模型带图标一并删除。它原先占 slice(0,4) 的浅绿高明度位，
         *   现由 yuzhuo（浅绿玉镯）从后段提上来补位，四色分明的设计不变。
         * 因此本族只有 8 件：第 3 关 pick(9) 实际取满 8 种 × 2 组 = 48 件（原 54 件）。
         * 若要补回第 9 件，从 assets/models-pool/ 提候选（mile / yushi / banzhi）。
         */
        family: ['yuanbao', 'bracelet', 'yuzhuo', 'pixiu',
                 'tongqian', 'baoshi', 'hulu', 'goose'],
    },
];

/** 按日期取模选当天主题（UTC 天数；全服一致）。 */
export function activeThemeIndex(): number {
    const day = Math.floor(Date.now() / 86400000);
    return ((day % THEMES.length) + THEMES.length) % THEMES.length;
}

export function getActiveTheme(): Theme {
    return THEMES[activeThemeIndex()];
}

/**
 * 从物件族派生 3 关阶梯。
 * 密度递增（24→36→54 件）而单关总时限递减，单位物件时间从 ~11s 压到 ~4.4s，
 * 形成「送温暖 → 正常 → 地狱」的陡峭曲线。
 */
export function buildLevels(family: string[]): LevelDef[] {
    const pick = (n: number) => family.slice(0, Math.min(n, family.length));
    return [
        // 第 1 关·送温暖：4 种强对比 × 3 组 = 36 件 / 255s（~7.1s/件），教学关不添堵（无障碍物）
        // 3 组而非 2 组是**观感**要求：24 件铺不满 2.70×2.84 的筐底（实测筐内覆盖率仅
        // 46%，薄薄一层、露出大半藤编），而件的大小已按容器反解、不能再靠放大来凑
        // （放大到能填满时单件宽达筐宽的 37%，读作"几个大球"）。36 件覆盖率 53%、
        // 堆顶中位 1.38 仍在筐内。种类仍是 4 种，每件仍有 7 秒余量，难度基本不变。
        { items: pick(4), groupsPerItem: 3, timeSec: 255, seed: 104729 },
        // 第 2 关·正常：6 种 × 2 组 = 36 件 / 200s（~5.6s/件），引入同色系 + 1 块石头
        { items: pick(6), groupsPerItem: 2, timeSec: 200, seed: 130363, distractors: 1 },
        // 第 3 关·地狱：9 种 × 2 组 = 54 件 / 165s（~3.1s/件），手速+决策双压 + 2 块石头
        { items: pick(9), groupsPerItem: 2, timeSec: 165, seed: 155921, distractors: 2 },
    ];
}

/** 当天的 3 关（模块加载时按当天主题定；一局游戏时长内日期不变，无需热更）。 */
export const LEVELS: LevelDef[] = buildLevels(getActiveTheme().family);

/** 校验：每关物件总数必须是 3 的倍数（groupsPerItem 保证了这一点，这里防御性再查一遍） */
export function validateLevel(def: LevelDef): boolean {
    return (def.items.length * def.groupsPerItem * 3) % 3 === 0
        && Number.isInteger(def.seed) && def.seed > 0;
}
