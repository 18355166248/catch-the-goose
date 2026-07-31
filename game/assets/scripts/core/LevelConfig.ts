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
    /**
     * 是否在堆底藏一只**金鹅**（彩蛋）。默认 false。
     *
     * 它不参与三消、不计入胜利判定、点到也不占暂存格——直接消失并即时给奖励。
     * 这三条是设计上的硬要求：金鹅只有一只，若进了槽就永远配不齐，
     * 彩蛋反而变成占格惩罚，玩家学会的会是"别碰那只鹅"。
     *
     * 投放时插在队列最前 → 落在堆的最底层，要挖开上面的件才见得到，
     * 这正是"藏"的含义。第 1 关是教学关，不放。
     */
    goldenGoose?: boolean;
    /**
     * 初始**冰封**的件数。默认 0。冰封件点不动，要靠完成三消逐个化开。
     *
     * 两条硬性约束保证它**不可能造成死局**（否则就是把随机挫败塞给玩家）：
     *   1. 每种物件最多冰封 1 个 —— 任何一组都至少留 2 个可拿，不会整组锁死；
     *   2. checkDeadlock 发现无解时优先把冰层全化开，而不是判负（见 GameManager）。
     * 石头与金鹅不参与冰封：前者本来就是负担，后者是奖励，冻上都只会添堵。
     */
    frozen?: number;
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
         * 古玩件天生同色（多数挤在 132~151° 的翡翠绿），所以这一族靠「明度 + 形状」
         * 拉开，而不是靠色相：
         *   slice(0,4) 金薄片(铜钱) / 紫珠环(手串) / 浅绿多面体(宝石) / 深绿葫芦
         *     —— 四者颜色两两分明，且形状分属盘、环、晶、瓶，俯视轮廓也互不相似；
         *   第 5~6 件是同色系的两个环（玉镯纯浅绿、扳指绿环带金内圈），靠内圈区分；
         *   压轴放吉祥物大鹅。
         *
         * 删过四件，都是**模型本身不合格**，不是配色问题：
         *   pingankou 与干扰物 rock 同为无彩灰（饱和度 0.02 / 0.01），只差明度，堆里易误拿；
         *   （jingling 曾是另一个候选，但属宝可梦商标件，已从仓库删除，见 CREDITS.md。）
         *   baicai 的网格是互不相连的叶片碎片（5000 面却有 8633 顶点），减面必穿洞，原版
         *     本身也只是团碎绿片；
         *   pixiu 与 yuanbao 同属那批 Tripo 低质产物：貔貅俯视是一团深绿碎块、看不出是兽，
         *     元宝其实是「盛着金块的托盘」、换任何角度都不像元宝。
         *   候选池里的 yushi / mile 与 pixiu 同批，一样糊，补不了位；只有 banzhi（扳指）
         *     干净，提上来补一个，所以是删二补一。
         *
         * 因此本族 7 件：第 3 关 pick(9) 实际取满 7 种 × 2 组 = 42 件。
         * 要再扩就得有新模型进来——池子里已经没有能用的了。
         */
        family: ['tongqian', 'bracelet', 'baoshi', 'hulu',
                 'yuzhuo', 'banzhi', 'goose'],
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
        { items: pick(6), groupsPerItem: 2, timeSec: 200, seed: 130363, distractors: 1,
          goldenGoose: true, frozen: 3 },
        // 第 3 关·地狱：9 种 × 2 组 = 54 件 / 165s（~3.1s/件），手速+决策双压 + 2 块石头
        { items: pick(9), groupsPerItem: 2, timeSec: 165, seed: 155921, distractors: 2,
          goldenGoose: true, frozen: 5 },
    ];
}

/** 当天的 3 关（模块加载时按当天主题定；一局游戏时长内日期不变，无需热更）。 */
export const LEVELS: LevelDef[] = buildLevels(getActiveTheme().family);

/** 校验：每关物件总数必须是 3 的倍数（groupsPerItem 保证了这一点，这里防御性再查一遍） */
export function validateLevel(def: LevelDef): boolean {
    return (def.items.length * def.groupsPerItem * 3) % 3 === 0
        && Number.isInteger(def.seed) && def.seed > 0;
}
