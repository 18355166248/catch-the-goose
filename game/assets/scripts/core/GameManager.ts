import {
    _decorator, Component, Node, Camera, Label, instantiate,
    RigidBody, BoxCollider, Collider, CylinderCollider, EAxisDirection, MeshRenderer,
    PhysicsSystem, input, Input, EventTouch, tween, Tween, v3, Vec3, Quat, Mat4, geometry, screen,
    Layers, PhysicsMaterial, Color,
} from 'cc';
import { DebugViz } from './DebugViz';
import { LEVELS, LevelDef, getActiveTheme, DISTRACTOR_ID } from './LevelConfig';
import { SceneSkin, getSkin, DEFAULT_SKIN_ID } from './SceneSkin';
import { ContainerBoundary, BoundaryDef } from './ContainerBoundary';
import { SlotTray, TRAY_CAPACITY } from './SlotTray';
import { ItemTag } from './ItemTag';
import { PrefabCache } from './PrefabCache';
import { PilePatrol } from './PilePatrol';
import { SaveData, BestRecord } from './SaveData';
import { HudUI, PropKind } from './HudUI';
import { SceneBackground } from './SceneBackground';
import { AudioMan } from './AudioMan';

const { ccclass, property } = _decorator;

/** 判负原因。'无解' = 盒中剩余物件配不出任何一组三消，继续点也只是等超时。 */
type LoseReason = '' | '槽位已满' | '时间到' | '无解';

/**
 * M1 核心玩法总控。
 * 场景要求（编辑器内手动搭）：
 * - Main Camera：position (0, 9, 9)，rotation (-45, 0, 0)，挂到 cam 属性
 * - Directional Light：默认即可
 * - 空节点 GameRoot：挂本脚本
 * - Canvas 下三个 Label：progressLabel / timerLabel / msgLabel（可选，不挂也能跑，信息走 console）
 * 模型放 assets/resources/models/*.glb
 */
@ccclass('GameManager')
export class GameManager extends Component {
    @property(Camera) cam: Camera = null!;
    @property(Label) progressLabel: Label | null = null;
    @property(Label) timerLabel: Label | null = null;
    @property(Label) msgLabel: Label | null = null;

    /** 关卡序号（0 起） */
    @property levelIndex = 0;

    private tray = new SlotTray();
    private level!: LevelDef;
    private timeLeft = 0;
    private totalCount = 0;
    private removedCount = 0;
    private playing = false;
    private paused = false;
    /** 选皮面板打开前的暂停状态，关闭时原样恢复（不覆盖玩家的手动暂停）。 */
    private overlayPrevPaused = false;
    private prefabs = new PrefabCache();
    private hud: HudUI | null = null;
    private background: SceneBackground | null = null;
    private audio: AudioMan | null = null;
    private pileMaterial!: PhysicsMaterial;
    /** 存档键与读写容错集中在 SaveData；这里只保留业务默认值。 */
    private static readonly DAILY_FREE = 3;
    /** 当前场景皮肤 id。所有 3D 容器/背景视觉从此皮肤取色。 */
    private skinId = DEFAULT_SKIN_ID;
    /** 场景视觉 + 隐形围栏的容器节点，换肤时整体销毁重建（物件在 this.node 上，不受影响）。 */
    private sceneRoot: Node | null = null;
    /** 每关每轮只能救一次,防止无限续命。 */
    private rescueUsed = false;
    private loseReason: LoseReason = '';
    private dailyLeft = GameManager.DAILY_FREE;
    /** 判负缓冲和自动吸取期间锁住手动输入，保证槽位状态原子化。 */
    private interactionLocked = false;
    /** 各关历史最佳:{ [levelIndex]: { stars, progress, score } } */
    private best: Record<number, BestRecord> = {};
    /** 本局是否已经提示过石头。石头是唯一「拿了就亏」的物件,但只提示一次,别唠叨。 */
    private rockWarned = false;

    // ===== 得分与连击 =====
    /** 本局得分。每次三消入账,连击越长单次入账越多。 */
    private score = 0;
    /** 当前连击数(连续三消,中断即归零)。 */
    private combo = 0;
    /** 上次三消的时刻(秒),用于判断是否还在连击窗口内。 */
    private lastMatchAt = -99;
    /** 单次三消基础分。 */
    private static readonly SCORE_BASE = 100;
    /** 连击窗口(秒):在此窗口内再次三消即累加连击。 */
    private static readonly COMBO_WINDOW = 4.5;
    /** 连击倍率上限,防止后期一路滚雪球。 */
    private static readonly COMBO_MAX_MULT = 5;
    /** 胜利时每剩 1 秒折算的奖励分。让「快速通关」比「压哨通关」值钱,三星局之间也分得出高下。 */
    private static readonly TIME_BONUS_PER_SEC = 2;

    // ===== 提示与紧迫感 =====
    /** 距上次有效操作的时间(秒);超过 HINT_IDLE 自动亮一组可消提示。 */
    private idleTime = 0;
    /** 发呆多久后给提示(秒)。 */
    private static readonly HINT_IDLE = 6;
    /** 剩余时间低于此值(秒)进入读秒紧张态。 */
    private static readonly URGENT_SEC = 15;

    /**
     * 手机屏幕内的真实物理盒边界。
     * 正交相机在 390×844 下横向约可见 ±1.96；左右内壁为 ±1.35，
     * 与可见木框内沿对齐，并给密集堆叠留出足够空间，避免刚体长期互相挤压。
     * Z 方向与可见木盒的后沿(-2.38)和前沿(0.63)对齐。
     */
    private static readonly FENCE_HALF_X = 1.35;
    private static readonly FENCE_CENTER_Z = -0.88;
    private static readonly FENCE_HALF_Z = 1.42;
    /**
     * 调试开关：把隐形围栏 / 地板顶面 / boundary 形状渲成半透明盒叠在容器上，
     * 用来对齐物理容纳与视觉容器（穿模排查）。发布前保持 false。
     */
    private static readonly DEBUG_FENCE = false;
    /** 模型外轮廓允许占用的最终可见范围（不是节点中心范围）。 */
    private static readonly VISIBLE_HALF_X = 1.70;
    private static readonly VISIBLE_MIN_Z = -2.25;
    private static readonly VISIBLE_MAX_Z = 0.48;
    /**
     * 当前容器边界。buildBox 时按皮肤重建：矩形容器用默认边界（与上面常量一字不差），
     * 圆锅/圆碗等在皮肤里声明 boundary 即整体切换。围栏、逃逸、视觉兜底、投放全走它。
     */
    private boundary: ContainerBoundary = GameManager.makeBoundary(undefined);
    /** 堆内巡检/沉降/逃逸回收 + 视觉外轮廓兜底。边界随换肤重建时同步给它。 */
    private patrol = new PilePatrol(this.boundary);
    private settleToken = 0;
    /** 本关物件基准缩放:少件关卡放大物件,保证盒子饱满、目标好点。 */
    private itemScale = 0.46;

    // ===== 堆叠投放旋钮(具名化,便于后续调参) =====
    /**
     * 目标堆叠层数——**整套堆形参数里唯一需要凭观感调的旋钮**。
     *
     * 1 = 恰好铺满筐底一层、件不重叠;2 = 铺满两层。件的大小由它连同件数和筐底面积
     * 反解(见 spawnItems),所以每一关落定后的"满度"一致,难度只由件数与种类体现。
     *
     * 旧实现是反过来的:先拍一个基准缩放,再按 cbrt(66/N) 补偿件数。指数就是错的——
     * 要填满的是**面积**,缩放该随 1/sqrt(N) 走而不是 1/cbrt(N);且基准值定得过大,
     * 第 1 关单件外接盒宽 1.16、筐内宽才 2.70,一层只放得下两三件,24 件必然摞成
     * 四五层的塔(实测堆顶 y 到 5.16,筐沿约 1.0),只有十来件露在外面。
     *
     * 1.9 → 2.6:件的观感尺寸不够,单件外接盒只有筐内宽的 30%,读作"薄薄一层小豆子"。
     * 提到 2.6 后件宽占 35%(itemScale 0.624 → 0.730),读作"一堆水果"。
     *
     * 注意这条**不能靠 PILE_ITEM_MAX 放宽来实现**:反解值本身就只有 0.624
     * (= sqrt(1.9 × 7.67 / 36) / 1.02),闸门抬到 0.72/0.82/0.92 件都不再长,
     * 大小是这个公式定的,不是闸门定的。
     *
     * 代价是**堆形从平铺变成小丘**,这是面积账上躲不掉的:件占地 (0.73×1.02)²=0.554,
     * 36 件共需 19.9 = 筐底面积的 2.6 倍,必然堆 2.6 层。「件大 × 件多 × 平铺」
     * 三者不可兼得(筐底面积固定),而加件数会按同一公式把件重新缩小。
     * 实测第 1 关 y 中位 0.89 → 1.66,筐沿约 1.0。要更满只能加件数并同步再提层数。
     * 更高的档实测会失控:3.4 层 y 最高 4.46、越界 4 件;4.4 层越界 13 件。
     *
     * (旧注释称"覆盖率到 1.9 层就饱和在 55%、放大件盖不住更多筐底"——那个饱和
     * 其实是投放高度 4.2 造成的假象:件从 9m/s 砸下互相架桥,堆往上长而不往外铺,
     * 放大件只是把更高的堆堆得更高。根因已修,见 PILE_SPAWN_Y。)
     */
    private static readonly PILE_TARGET_LAYERS = 2.6;
    /**
     * 缩放兜底区间。MAX 是**观感闸门**,不是防溢出:件数少的关卡反解会要求很大的件
     * (第 1 关 24 件要 0.76,外接盒宽 1.00 = 筐内宽的 37%),满是满了,但一眼看去是
     * "几个大球摞着"而不是"一堆水果",而且 24 件里有一半被埋着点不到。
     * 0.62 → 0.80:0.62 那档是配 PILE_TARGET_LAYERS=1.9 定的,层数提到 2.6 后
     * 反解值涨到 0.730(第 3 关 0.585),旧闸门会把它削回去、白改。抬到 0.80 留出余量,
     * 同时仍拦住"件数极少的关卡反解出巨件"这个原本要防的情况。
     */
    private static readonly PILE_ITEM_MIN = 0.30;
    private static readonly PILE_ITEM_MAX = 0.80;
    /** 单件外接盒宽 ÷ itemScale。实测五档缩放下比值稳定在 1.24~1.31,取中值。
     *  用来定铺点内缩量(inset),保证外接盒不越过筐壁。 */
    private static readonly PILE_ITEM_WIDTH_K = 1.28;
    /**
     * 单件**实际占地**宽 ÷ itemScale:碰撞盒尺度,决定一层塞得下几件。
     *
     * 比外接盒宽(1.28)小,因为外接盒是轴对齐外框,件随机朝向时外框比件本身胖约四分之一。
     * 注意别拿"俯视像素占地"来标定这个值——那个数(约 0.70)算的是**可见轮廓**,
     * 而挡住彼此的是碰撞盒;按可见轮廓算会把每层容量高估一倍多,堆照样长成柱子。
     */
    private static readonly PILE_ITEM_SPAN_K = 1.02;
    /** 一层的堆积效率:方格铺满是 1,实际有间隙与朝向差异,取 0.85。调大 = 每层塞更多件、堆更矮更挤。 */
    private static readonly PILE_PACK = 0.85;
    /** 每往上一层,铺点区域向内收这么多。给堆一个自然坡度,也防上层件顺着筐壁滑出。
     *  0.18 → 0.10:件放大后层数变多,每层收 0.18 累起来把堆收成尖丘。
     *  实测(2.6 层)0.18/0.10/0.04 → 件位平均展开半径 0.73/0.75/0.80、y 中位
     *  1.66/1.76/1.36,越界都是 2~3 件没变差。取 0.10 折中:改善展开又保留坡度语义。 */
    private static readonly PILE_LAYER_INSET = 0.10;
    /**
     * 投放高度(件的出生 y,另加 idx%5 的 0.22 阶梯错开)。
     *
     * **这是"堆积效果不行"的真正旋钮**,原先硬编码 4.2 埋在 spawnItems 里。
     * 4.2 的问题不在观感而在物理:低阻尼(0.06)下自由落体到 y=0 的落地速度约 9m/s,
     * 单件下落耗时 0.93s,而投放间隔只有 0.05s —— **空中长期有约 18 件同时在飞**。
     * 它们边落边互撞,把已铺好的层撞散、彼此架桥,于是 pileSeedPoint 精心算出的
     * 1.9 层落定后变成实际约 5 层:实测第 1 关 y 中位 1.91、最高 3.03,而碗沿只有
     * 1.43 —— 一半件堆在碗沿之上,俯视投影缩在中间,这正是"覆盖率 55% 封顶"的来源
     * (堆往上长而不往外铺,不是筐底填不满)。件是被"砸"进去的,不是"放"进去的。
     *
     * 压到容器沿略上方:落差只剩零点几,件贴着堆顶落定,空中同时在飞的件数随下落
     * 时间平方根下降。观感上仍是从容器上方倒入(沿口以上即可),但不再需要"抬到
     * 可视区外"——那点戏剧性换来的是整堆失控。
     *
     * 取 2.6 而不是更低:实测(古玩铺第 1 关 36 件,玉碗沿 y=1.43)
     *   4.2 → y 最低 1.55 / 中位 2.95 / 最高 3.96  整堆悬在碗上方,一件都没进碗
     *   2.6 → y 最低 0.20 / 中位 0.84 / 最高 1.58  铺满碗底,堆顶微冒沿口
     *   2.0 → y 最低 0.05 / 中位 0.85 / 最高 1.79
     *   1.6 → y 最低 0.04 / 中位 0.77 / 最高 1.93
     * 比 2.0/1.6 反而更矮更实:2.6 落下的那点动能正好把件挤进缝隙压平,
     * 再低则件几乎在堆顶生成、直接架上去。存在最优区间,2.6 在里面。
     */
    private static readonly PILE_SPAWN_Y = 2.6;
    /** 逐件投放间隔(秒/件):越小灌入越快、总时长越短,但同时在场刚体更多、穿插更深。
     *  0.03→0.05:同帧在场的动态刚体更少,求解器有余量把相邻件分开,少锁死互插。 */
    private static readonly SPAWN_INTERVAL = 0.05;
    /** 兜底强制冻结延迟(末件投放后再等这么久整堆硬冻)。巡检自锁通常早已完成,这里只兜底。 */
    private static readonly SETTLE_BACKSTOP = 1.0;
    /**
     * 逐件定时硬冻:每件 spawn 后经过此时长(落体~0.6s + 短沉降)即无条件冻成 KINEMATIC。
     * 关键:高频挤压抖动在 0.15s 巡检下会混叠、检测抓不住,而"到点直接冻"不依赖检测——
     * 无论它抖得多凶,到点即锁。每件各自计时 → 早落的物件不必陪着整堆抖一整个投放期。
     * 调大 = 给沉降更多时间(更可能落到位,但抖动窗口更长);调小 = 更早锁死(抖动窗口更短)。
     */
    private static readonly SPAWN_FREEZE_DELAY = 0.9;
    /** 出生缩放弹大("从小变大"):spawn 时缩放起始比例(相对目标),越小弹得越夸张。 */
    private static readonly SPAWN_POP_FROM = 0.3;
    /** 弹大时长(秒)。必须显著短于落体时间(~0.6s),保证长大发生在无接触的自由下落段,不推挤邻居。 */
    private static readonly SPAWN_POP_TIME = 0.15;
    /**
     * 圆形/环形物件:用圆柱碰撞体而非方盒。方盒的四个空角埋在堆里会被邻居深插 → 求解器狂弹 →
     * 高速抖(尤以手串等环形最明显)。圆柱无角、贴合圆盘轮廓,密堆时接触干净、抖动大减。
     * 非圆形物件(鹅/佛像/葫芦等)仍用方盒。
     */
    private static readonly ROUND_ITEMS = new Set(['banzhi', 'bracelet', 'pingankou', 'tongqian', 'yuzhuo']);
    /** 只服务于初始堆叠的确定性随机流，不受巡逻、道具等运行时随机行为干扰。 */
    private levelRandomState = 1;

    onLoad() {
        this.pileMaterial = new PhysicsMaterial();
        // 高摩擦 + 少量回弹：落地有一下轻微弹跳的"实感"，又不会弹得到处乱滚。
        this.pileMaterial.setValues(1.25, 0.9, 0.9, 0.08);
        // 模板场景可能保存过倾斜的物理重力；这里强制为世界竖直方向，
        // 否则物件落地后会持续滑向篮子后侧，看起来像堆叠算法失效。
        PhysicsSystem.instance.gravity = v3(0, -12, 0);
        // 小物件 + 薄片需要更密的物理步进；CCD 负责线性高速运动，子步负责接触堆叠和旋转。
        // 步长必须是 60Hz 渲染帧的整数分之一：1/90 会让每帧交替推进 1/2 个物理步，
        // 引擎不做状态插值，运动中的物件屏幕位移逐帧交替 1 倍/2 倍，
        // 表现为堆叠沉降阶段全体物件毫米级高频颤动。1/120 = 每帧恰好 2 步。
        PhysicsSystem.instance.maxSubSteps = 8;
        PhysicsSystem.instance.fixedTimeStep = 1 / 120;
        PhysicsSystem.instance.sleepThreshold = 0.15;
        // 皮肤要在建盒之前定好。每天固定一个场景：皮肤跟随当天主题（getActiveTheme），
        // 不再由玩家自选决定「场景身份」；HUD 换肤面板仅作背景微调，不改物件族。
        this.skinId = getSkin(getActiveTheme().skinId).id;
        this.buildBox();
        input.on(Input.EventType.TOUCH_START, this.onTouch, this);
    }

    onDestroy() {
        input.off(Input.EventType.TOUCH_START, this.onTouch, this);
    }

    async start() {
        if (!this.cam) {
            this.cam = this.node.scene.getComponentInChildren(Camera)!;
            console.log('[GameManager] cam 属性未接线，自动使用场景相机');
        }
        console.log('[GameManager] 相机 world=', this.cam?.node.worldPosition.toString());
        // 全屏 2D 背景垫在最底层：主相机改为只清深度并叠在背景之上（priority 高于背景相机）。
        // 只画 DEFAULT 层，杜绝把 UI_3D 背景 Sprite 或 UI_2D 的 HUD 一起画进 3D 视图。
        this.background = new SceneBackground(this.node.scene);
        const initSkin = this.currentSkin();
        this.background.setBackdrop(initSkin.backdropTex, initSkin.backdrop);
        if (this.cam) {
            this.cam.visibility = Layers.Enum.DEFAULT;
            this.cam.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
            this.cam.priority = 1;
            console.log('[GameManager] 相机 visibility=', this.cam.visibility.toString(2));
        }
        this.forceLayer(this.node);
        // HUD（纯代码占位版）
        this.hud = new HudUI(this.node.scene, kind => this.useProp(kind), () => this.togglePause(),
            id => this.applySkin(id), () => this.skinId, open => this.setOverlayPause(open),
            () => this.toggleSound());
        this.timerLabel = this.hud.timerLabel;
        this.progressLabel = this.hud.progressLabel;
        this.msgLabel = this.hud.msgLabel;
        this.audio = new AudioMan(this.node.scene);
        // AudioMan 晚于 HUD 建，声音键先按静音画；这里用存档里的真实状态补一次。
        this.hud.setSoundOn(this.audio.soundOn);
        this.loadProps();
        this.grantDailyPropGift();
        // 关卡进度本地存储:上次通到第几关,这次直接从那关开始。
        const savedLevel = SaveData.getLevel();
        if (savedLevel !== null) {
            this.levelIndex = Math.max(0, Math.min(savedLevel, LEVELS.length - 1));
        }
        this.level = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
        this.timeLeft = this.level.timeSec;
        this.hud.setLevel(this.levelIndex + 1);
        this.loadDaily();
        this.loadBest();
        // 首页期间计时牌先显示本关时限，别停在 0:00。
        this.updateHud();
        // 开局停在首页：交代今天的场景、关卡与玩法，玩家点「开始挑战」才扣次数、倒物件。
        this.showHome();
        // 首屏加载页到此撤除：首页已经画完且可点。物件模型不在这一步加载——
        // 它们等玩家点「开始挑战」才按关卡拉取（startInitialRound），不该拖长首屏。
        (globalThis as any).__gooseBoot?.done();
    }

    /** 首页：今日场景 + 本关信息 + 玩法一句话 + 成绩，点开始才真正入局。 */
    private showHome() {
        const count = this.level.items.length * this.level.groupsPerItem * 3;
        const best = this.best[this.levelIndex];
        this.hud?.showHome({
            themeName: getActiveTheme().name,
            levelText: `第 ${this.levelIndex + 1} 关 · ${count} 件 · ${GameManager.clock(this.level.timeSec)}`,
            // 计分规则此前从没说过：连击是唯一的加分放大器，剩余时间也折算成分，
            // 玩家不知道就只会慢慢挪，体验完全是另一个游戏。
            ruleText: '点相同的物件收进底部 7 格，凑齐 3 个消除\n塞满或超时失败；连消翻倍、剩余时间也计分',
            // 第 2 关起混入石头，此前玩家只能自己踩坑才知道它凑不成三个。
            warnText: this.level.distractors
                ? `本关混了 ${this.level.distractors} 块石头：凑不成三个，误拿会一直占格`
                : '',
            dailyText: `今日剩余 ${this.dailyLeft}/${GameManager.DAILY_FREE}`,
            bestText: best
                ? `最佳 ${'★'.repeat(best.stars) || '—'} ${best.score ?? 0} 分`
                : '本关暂无成绩',
            onStart: () => void this.beginRound(),
        });
    }

    /** 秒数 → m:ss。 */
    private static clock(sec: number): string {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    /**
     * 每日次数门：有次数返回 true；没有则弹补充入口，玩家确认后重跑 next。
     * H5 无激励视频，这里是无门槛续次——次数只当节奏提示，不当付费墙。
     * 此入口的位置为将来接广告预留：届时只需把 onAction 换成广告回调。
     */
    private ensureDaily(next: () => void): boolean {
        if (this.dailyLeft > 0) return true;
        this.hud?.showNotice('今日次数用完', '每天可免费挑战 3 次\n想接着玩就再续一次吧',
            '再续一次', () => {
                this.dailyLeft++;
                this.saveDaily();
                this.hud?.hideResult();
                next();
            });
        return false;
    }

    /** 从首页进入本关：过次数门 → 生成物件 → 新手首局直接亮一次提示。 */
    private async beginRound() {
        if (!this.ensureDaily(() => void this.beginRound())) return;
        // BGM 起播点必须挂在用户手势上（点「开始挑战」），否则被浏览器自动播放策略拦掉。
        // 声音默认关闭，所以这里通常什么都不会响，直到玩家在暂停菜单里打开。
        this.audio?.startBgm();
        await this.startInitialRound();
        if (SaveData.taught()) return;
        // 第一次玩：等堆叠落定后主动指一组可消的物件，比任何文字都直观。
        SaveData.markTaught();
        this.scheduleOnce(() => this.showHint(), 2.2);
    }

    /** 本关需加载的 prefab id：物件族 +（本关有障碍物时）石头。 */
    private levelPrefabIds(): string[] {
        return this.level.distractors ? [...this.level.items, DISTRACTOR_ID] : this.level.items;
    }

    /** 首次进入关卡的统一入口：确认有次数后再扣减、加载和生成。 */
    private async startInitialRound() {
        this.consumeDaily();
        await this.prefabs.loadAll(this.levelPrefabIds());
        this.spawnItems();
        this.playing = true;
        this.updateHud();
    }

    // ---------- 每日次数 / 最好成绩 ----------

    private loadDaily() {
        this.dailyLeft = SaveData.getDaily(GameManager.DAILY_FREE);
        this.hud?.setDaily(this.dailyLeft);
    }

    private saveDaily() {
        SaveData.setDaily(this.dailyLeft);
        this.hud?.setDaily(this.dailyLeft);
    }

    private consumeDaily() {
        this.dailyLeft = Math.max(0, this.dailyLeft - 1);
        this.saveDaily();
    }

    private loadBest() {
        this.best = SaveData.getBest();
    }

    /**
     * 记录本关成绩,返回是否刷新纪录。
     * 以得分为首要排序：得分包含完成度（每消一组必得分）又区分连击水平，比单看完成度更细。
     */
    private recordBest(lvl: number, stars: number, progress: number, score: number): boolean {
        const prev = this.best[lvl];
        const prevScore = prev?.score ?? 0;
        const better = !prev || score > prevScore
            || (score === prevScore && progress > prev.progress);
        if (better) {
            this.best[lvl] = { stars, progress, score };
            SaveData.setBest(this.best);
        }
        return better && !!prev; // 首次成绩不算"刷新纪录"
    }

    /** 递归把节点树全部放进 DEFAULT 渲染层（代码创建的节点 layer 可能为 0 → 任何相机都不画） */
    private forceLayer(n: Node) {
        n.layer = Layers.Enum.DEFAULT;
        for (const c of n.children) this.forceLayer(c);
    }

    update(dt: number) {
        this.background?.sync();
        this.hud?.sync();
        if (!this.playing || this.paused) return;
        // 手机切后台/浏览器标签页恢复时可能一次传入数百秒 dt；游戏计时应近似暂停，
        // 不能因为系统挂起而瞬间耗尽。物理仍由 fixedTimeStep + maxSubSteps 独立求解。
        const frameDt = Math.min(dt, 0.1);
        // 堆内巡检/沉降/逃逸回收全在 PilePatrol，内部自带 0.15s 周期节流。
        this.patrol.tick(this.node, frameDt);
        this.timeLeft -= frameDt;
        if (this.timeLeft <= 0) {
            this.timeLeft = 0;
            this.gameOver(false, '时间到');
        }
        // 发呆到点就指一组可消的物件：卡在"看不出还能点什么"是这类玩法最常见的弃局原因。
        this.idleTime += frameDt;
        if (this.idleTime >= GameManager.HINT_IDLE) {
            this.idleTime = 0;
            this.showHint();
        }
        this.hud?.setTimeUrgent(this.timeLeft <= GameManager.URGENT_SEC);
        this.updateCombo();
        this.updateHud();
    }

    /** 把连击窗口的剩余比例喂给 HUD 的连击牌；窗口走完即断连。 */
    private updateCombo() {
        if (this.combo <= 0) { this.hud?.setCombo(0, 0); return; }
        const elapsed = performance.now() / 1000 - this.lastMatchAt;
        const remain = 1 - elapsed / GameManager.COMBO_WINDOW;
        if (remain <= 0) this.combo = 0;
        this.hud?.setCombo(this.combo, Math.max(0, remain));
    }

    // ---------- 提示 ----------

    /**
     * 找一组"现在点下去就能消"的物件：优先补齐槽内已有的类别（步数最少），
     * 其次退回盒中任意凑得出 3 个的类别。石头不参与（它永远配不齐）。
     */
    private findHintGroup(): Node[] {
        const boxItems = this.node.getComponentsInChildren(ItemTag)
            .filter(t => !t.picked && t.node.isValid && t.id !== DISTRACTOR_ID);
        const availOf = (id: string) => boxItems.filter(t => t.id === id).length;
        const free = TRAY_CAPACITY - this.tray.count;

        let target: { id: string; need: number } | null = null;
        for (const [id, have] of this.tray.countById()) {
            const need = 3 - have;
            if (need <= 0 || need > free || availOf(id) < need) continue;
            if (!target || need < target.need) target = { id, need };
        }
        if (!target && free >= 3) {
            const id = boxItems.find(t => availOf(t.id) >= 3)?.id;
            if (id) target = { id, need: 3 };
        }
        if (!target) return [];
        // 越靠上的越容易点到，优先指这些。
        return boxItems.filter(t => t.id === target!.id)
            .sort((a, b) => b.node.worldPosition.y - a.node.worldPosition.y)
            .slice(0, target.need)
            .map(t => t.node);
    }

    /** 把提示组的世界坐标换成屏幕坐标交给 HUD 画呼吸光环（不碰 3D 物件本身）。 */
    private showHint() {
        if (!this.playing || this.paused || !this.cam) return;
        const nodes = this.findHintGroup();
        if (nodes.length === 0) {
            // 一组都凑不齐 = 槽位余量不够，指一下「移出」，别让玩家干瞪眼等超时。
            if (this.tray.count > 0) this.hud?.nudgeProp('remove');
            return;
        }
        const sp = v3();
        this.hud?.showHint(nodes.map(n => {
            this.cam.worldToScreen(n.worldPosition, sp);
            return sp.clone();
        }));
    }

    /**
     * 残局判定：把槽位余量和盒中存量算在一起，已经配不出任何一组三消。
     * 此前这种局面只能靠玩家自己发现，然后要么把七格填满、要么干等倒计时归零——
     * 两种结局都让人觉得是游戏卡住了，而不是自己输了。
     */
    private checkDeadlock() {
        if (!this.playing || this.paused || this.interactionLocked) return;
        if (this.removedCount >= this.totalCount) return;
        if (this.findHintGroup().length > 0) return;
        // 还有「移出」道具 = 这是解得开的残局，指一下就够，不替玩家判负。
        if (this.propCounts.remove > 0) {
            this.hud?.nudgeProp('remove');
            this.hud?.toast('没有能凑齐的组合了，用「移出」腾格');
            return;
        }
        this.gameOver(false, '无解');
    }

    /** 槽内该类物件刚好攒到 2 件 → 闪一下这两格（重算下标，避免连点后指错格）。 */
    private flashNearMatch(id: string) {
        const idx: number[] = [];
        this.tray.entries.forEach((e, i) => { if (e.id === id) idx.push(i); });
        if (idx.length === 2) this.hud?.markNearMatch(idx);
    }

    // ---------- 场景搭建 ----------

    /** 当前皮肤配置。 */
    private currentSkin(): SceneSkin {
        return getSkin(this.skinId);
    }

    /**
     * 换肤：持久化选择并原地重建场景视觉 + 围栏。物件在 this.node 上、与 sceneRoot 平级，
     * 不受重建影响；围栏几何各皮肤一致，重建后物件贴靠关系不变。
     */
    applySkin(id: string) {
        if (id === this.skinId && this.sceneRoot?.isValid) return;
        this.skinId = getSkin(id).id;
        SaveData.setSkin(this.skinId);
        if (this.sceneRoot?.isValid) this.sceneRoot.destroy();
        this.sceneRoot = null;
        this.buildBox();
        const skin = this.currentSkin();
        this.background?.setBackdrop(skin.backdropTex, skin.backdrop);
        this.audio?.play('prop');
    }

    /**
     * 由皮肤的边界声明构造容器边界；未声明则回落到默认矩形（与本类常量一字不差，
     * 保证现有 6 套矩形皮肤的围栏 / 逃逸 / 视觉兜底行为完全不变）。
     */
    private static makeBoundary(def: BoundaryDef | undefined): ContainerBoundary {
        if (def) return new ContainerBoundary(def);
        return new ContainerBoundary({
            wall: {
                kind: 'rect', cx: 0,
                cz: GameManager.FENCE_CENTER_Z,
                halfX: GameManager.FENCE_HALF_X,
                halfZ: GameManager.FENCE_HALF_Z,
            },
            clamp: {
                kind: 'rect', cx: 0,
                cz: (GameManager.VISIBLE_MIN_Z + GameManager.VISIBLE_MAX_Z) / 2,
                halfX: GameManager.VISIBLE_HALF_X,
                halfZ: (GameManager.VISIBLE_MAX_Z - GameManager.VISIBLE_MIN_Z) / 2,
            },
        });
    }

    private buildBox() {
        // 容器视觉与围栏统一挂在可重建的 SceneRoot 下，换肤时整体替换。
        const root = new Node('SceneRoot');
        root.setParent(this.node);
        this.sceneRoot = root;

        const skin = this.currentSkin();
        // 边界随皮肤重建：矩形皮肤得到与常量一字不差的默认边界；圆锅/圆碗皮肤声明
        // boundary 后，围栏 / 逃逸 / 视觉兜底 / 投放种子全部按该形状生效，物品不出界。
        this.boundary = GameManager.makeBoundary(skin.boundary);
        this.patrol.setBoundary(this.boundary);

        // 碰撞地基顶面保持 y=0，厚地基防止高速物件穿底。
        // 物理底板始终居中覆盖整个围栏，与视觉完全解耦。
        this.makeInvisibleWall('basketFloorCollider', v3(0, -2.25, -0.88), v3(4.1, 4.5, 4.15));

        // 隐形围栏（只有碰撞体，无渲染）：厚 1.2、下探到台面以下，杜绝高速隧穿和底缝钻出。
        // 墙段由当前边界生成——矩形出 4 面厚墙（与旧硬编码等价），圆形出一圈切向环段。
        const WH = 7, WT = 1.2, WY = WH / 2 - 1; // 竖向覆盖 -1 ~ 6
        const wallSpecs = this.boundary.buildWallSpecs(WH, WY, WT);
        for (const w of wallSpecs) {
            this.makeInvisibleWall(w.name, w.pos, w.size, w.yawDeg);
        }

        // 调试：把物理容纳画出来叠在容器上，用于对齐视觉容器、排查穿模。
        if (GameManager.DEBUG_FENCE) {
            // 围栏墙段：青色半透明，直接勾出 boundary 的 XZ 形状（矩形 4 面 / 圆形环段）。
            for (const w of wallSpecs) {
                DebugViz.box(root, `dbg_${w.name}`, w.pos, w.size, w.yawDeg, new Color(0, 200, 255, 70));
            }
            // 物理静止面（地板顶面 y=0，始终是那块矩形底板）：物件实际停靠的高度。
            // 薄黄片，用来比对容器可见内底是否与之齐平（不齐 = 悬空或陷底穿模）。
            DebugViz.box(root, 'dbg_restPlane',
                v3(0, 0, -0.88), v3(4.1, 0.02, 4.15),
                0, new Color(255, 220, 0, 80));
        }

        // 背景改由 SceneBackground 的全屏 2D Sprite 承接（skin.backdrop/backdropTex），
        // 这里不再铺 3D 大地板与柜框——正交相机下那块 44×44 平面只框得住中心纯色区，
        // 会把整屏背景图四周的装饰全裁掉，正是之前"背景完全不对"的根因。

        // 代码新建的节点 layer 可能为 0（任何相机都不画）；运行时换肤走这里，
        // start() 的整树 forceLayer 不会再触发，必须自己把新场景放进 DEFAULT 渲染层。
        this.forceLayer(root);

        // 方案 B：中央置物筐用 3D 模型。异步加载后摆到容器中央、按开口缩放定位。
        // 捕获当前 root，加载期间若又换肤（root 被销毁）则丢弃结果。
        if (skin.containerModel) this.loadContainerModel(skin.containerModel, root);

        // 七格收集区属于屏幕 HUD，由 HudUI 负责；世界空间只保留可替换的 3D 容器。
    }

    /** 置物筐外观：目标水平占地（世界单位，整宽），略大于物件散布范围（±VISIBLE_HALF_X）。 */
    private static readonly CONTAINER_SPAN = 4.0;
    /** 置物筐底部相对台面(y=0)的落点：负值让筐壁从台面下升起，内底约与物件停靠面齐平。 */
    private static readonly CONTAINER_BOTTOM_Y = -0.35;

    /**
     * 加载并摆放中央 3D 置物筐（skin.containerModel）。
     * 纯外观：不挂刚体/碰撞，物理仍由隐形围栏约束。摆放：水平居中于 boundary 中心，
     * 按最大水平边缩放到 CONTAINER_SPAN，底部坐到 CONTAINER_BOTTOM_Y。
     * 缩放/落点最终需按截图微调这两个常量。
     */
    private async loadContainerModel(id: string, root: Node) {
        const prefab = await PrefabCache.loadOne(id);
        // 加载期间换肤：root 已被销毁或已不是当前 sceneRoot，丢弃。
        if (!prefab || !root.isValid || root !== this.sceneRoot) return;

        const n = instantiate(prefab);
        n.setParent(root);
        n.setScale(1, 1, 1);
        n.setPosition(0, 0, 0);
        this.forceLayer(n);
        n.updateWorldTransform();

        // 量原始局部包围盒（未缩放），据此求居中缩放与落点。
        const b = this.measureLocalAabb(n);
        if (!b) { console.warn(`[GameManager] 置物筐 ${id} 无网格包围盒，按原样摆放`); return; }
        const w = b.max.x - b.min.x, d = b.max.z - b.min.z, h = b.max.y - b.min.y;
        const s = GameManager.CONTAINER_SPAN / Math.max(w, d, 1e-3);
        n.setScale(s, s, s);

        // 缩放后，把模型自身中心平移到 boundary 中心，底部坐到 CONTAINER_BOTTOM_Y。
        const cx = (b.min.x + b.max.x) * 0.5, cz = (b.min.z + b.max.z) * 0.5;
        n.setPosition(
            this.boundary.centerX - cx * s,
            GameManager.CONTAINER_BOTTOM_Y - b.min.y * s,
            this.boundary.centerZ - cz * s,
        );

        // 容器是环境陈设：不投阴影（避免自遮挡怪影），只接收物件阴影。
        for (const mr of n.getComponentsInChildren(MeshRenderer)) {
            mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
        }
        console.log(`[GameManager] 置物筐 ${id} 就位：原始尺寸 w=${w.toFixed(2)} d=${d.toFixed(2)} h=${h.toFixed(2)}，缩放=${s.toFixed(3)}`);
    }

    /** 量节点下所有 Mesh 的局部包围盒（root 局部空间）。无网格返回 null。 */
    private measureLocalAabb(root: Node): { min: Vec3; max: Vec3 } | null {
        root.updateWorldTransform();
        const min = v3(Infinity, Infinity, Infinity);
        const max = v3(-Infinity, -Infinity, -Infinity);
        const invRoot = new Mat4();
        const meshToRoot = new Mat4();
        const corner = v3(), point = v3();
        Mat4.invert(invRoot, root.worldMatrix);
        let has = false;
        for (const renderer of root.getComponentsInChildren(MeshRenderer)) {
            const mn = renderer.mesh?.struct.minPosition, mx = renderer.mesh?.struct.maxPosition;
            if (!mn || !mx) continue;
            Mat4.multiply(meshToRoot, invRoot, renderer.node.worldMatrix);
            for (let mask = 0; mask < 8; mask++) {
                corner.set(mask & 1 ? mx.x : mn.x, mask & 2 ? mx.y : mn.y, mask & 4 ? mx.z : mn.z);
                Vec3.transformMat4(point, corner, meshToRoot);
                Vec3.min(min, min, point);
                Vec3.max(max, max, point);
                has = true;
            }
        }
        return has ? { min, max } : null;
    }

    /** 只有物理没有外观的围栏；yawDeg 用于圆容器的切向环段（矩形墙传 0）。 */
    private makeInvisibleWall(name: string, pos: Vec3, size: Vec3, yawDeg = 0) {
        const n = new Node(name);
        n.setParent(this.sceneRoot ?? this.node);
        n.setPosition(pos);
        if (yawDeg) n.setRotationFromEuler(0, yawDeg, 0);
        const rb = n.addComponent(RigidBody);
        rb.type = RigidBody.Type.STATIC;
        const col = n.addComponent(BoxCollider);
        col.size = size;
        col.sharedMaterial = this.pileMaterial;
    }

    // ---------- 物件加载与生成 ----------

    /** 整数散列 → [0,1)。给铺点做确定性抖动：同一 index 永远同一个值，
     *  所以投放与「打乱」两条路径互不干扰，也不吃 levelRandom 的调用顺序。 */
    private static hash01(n: number): number {
        let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
        h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }

    private static gcd(a: number, b: number): number {
        while (b) { const t = a % b; a = b; b = t; }
        return a;
    }

    /**
     * 投放落点（投放与"打乱"共用，两处必须同形，否则打乱一次堆形就变了）。
     *
     * 历史实现是「极坐标小圆盘 + 半径随进度扩大」，两个毛病叠在一起：
     * 盘是圆的而筐底是方的（四角撒不到点）、盘还只有半径 0.72 而筐内半宽 1.35。
     * 结果所有件都往中间同一小片地方落，而每件 spawn 后 0.9s 就硬冻、来不及滚开，
     * 于是必然长成一根柱子——实测第 1 关 24 件顶到 y=4.65、第 3 关 56 件顶到 y=5.53
     * （筐沿 y≈1.0），筐的外圈整整一圈是空的。
     * 正交俯视相机下高度不改变投影大小，柱子在截图上和摊平的堆长得一样，
     * 只有读 y 坐标才看得出来。**改这个函数务必同时量 y 分布与筐内像素覆盖率。**
     *
     * 现在按「一层一层铺」：先按单件占地算出一层放得下几件，同层的点按分格抖动
     * 铺满整个容器形状（矩形连四角都铺到），下一层错半格、并向内收 PILE_LAYER_INSET
     * 形成自然坡度。件数少就只铺一层，多了自然叠高。
     *
     * 层内用「分格 + 格内抖动」而不是低差异序列：一层只有十来个点，Halton 那种
     * 序列在这个量级上仍会留下整片空斑（实测第 2 关有一块 1791 采样格的裸底）；
     * 分格采样对固定点数给出硬保证——每格必有一点，空斑不可能大过一格。
     */
    private pileSeedPoint(index: number): { x: number; z: number } {
        // 内缩按外接盒（别让件探出筐壁），层容量按实际占地（别把层数算多了）。
        const w = this.itemScale * GameManager.PILE_ITEM_WIDTH_K;
        const span = this.itemScale * GameManager.PILE_ITEM_SPAN_K;
        const perLayer = Math.max(4, Math.floor(
            this.boundary.usableArea(0) / (span * span) * GameManager.PILE_PACK));
        const layer = Math.floor(index / perLayer);
        const j = index % perLayer;

        // 网格按容器长宽比开方，格子尽量接近正方形（细长格会让件排成行列）。
        const s = this.boundary.wall;
        const aspect = s.kind === 'rect' ? s.halfX / Math.max(0.01, s.halfZ) : 1;
        const cols = Math.max(1, Math.round(Math.sqrt(perLayer * aspect)));
        const rows = Math.max(1, Math.ceil(perLayer / cols));
        // 格子数常比点数多，多出来的空格必须**散开**：按与格数互质的步长跳着取，
        // 否则空格永远集中在最后一行，那一侧就固定裸着一条。
        const cells = rows * cols;
        let stride = Math.max(1, Math.round(cells * 0.618));
        while (GameManager.gcd(stride, cells) !== 1) stride++;
        const cell = (j * stride + layer * 3) % cells;
        // 上层整体错半格：件落进下层的凹处（砌砖式），既不叠成柱，也少悬空。
        const half = layer % 2 ? 0.5 : 0;
        const u1 = ((cell % cols) + 0.15 + 0.7 * GameManager.hash01(index * 2 + 1) + half) / cols;
        const u2 = (Math.floor(cell / cols) + 0.15 + 0.7 * GameManager.hash01(index * 2 + 2)) / rows;
        return this.boundary.seedPoint(u1 % 1, u2 % 1,
            w * 0.5 + layer * GameManager.PILE_LAYER_INSET);
    }

    private spawnItems() {
        this.levelRandomState = this.level.seed >>> 0 || 1;
        const queue: string[] = [];
        for (const id of this.level.items) {
            const prefab = this.prefabs.get(id);
            if (!prefab) continue;
            const count = this.level.groupsPerItem * 3;
            for (let i = 0; i < count; i++) queue.push(id);
        }
        this.shuffleInPlace(queue, () => this.levelRandom());
        // 胜利判定只算正常物件：石头无法三消，不能计入 totalCount，否则 removedCount 永远追不上。
        this.totalCount = queue.length;
        // 混入障碍物（石头）：一起投放但不计胜利。≤2 个永不配齐 → 占格残局风险。
        // push 后整队再洗一次，让石头散落堆中而非全压在最外圈。
        const nRock = this.level.distractors ?? 0;
        if (nRock > 0 && this.prefabs.get(DISTRACTOR_ID)) {
            for (let i = 0; i < nRock; i++) queue.push(DISTRACTOR_ID);
            this.shuffleInPlace(queue, () => this.levelRandom());
        }
        // 件的大小由「铺满筐底 PILE_TARGET_LAYERS 层」反解：N 件均分筐底面积，
        // 每件分到 area/N × 层数，开方即占地宽，除以占地宽系数得缩放。
        // 于是换容器（圆碗 vs 方筐）、改件数都不用再手调缩放，满度自动一致。
        this.itemScale = Math.min(GameManager.PILE_ITEM_MAX, Math.max(GameManager.PILE_ITEM_MIN,
            Math.sqrt(GameManager.PILE_TARGET_LAYERS * this.boundary.usableArea(0)
                / Math.max(1, queue.length)) / GameManager.PILE_ITEM_SPAN_K));

        queue.forEach((id, index) => {
            const prefab = this.prefabs.get(id)!;
            const idx = index + 1;
            // 逐件投放保留真实碰撞过程，同时避免同一帧生成几十个刚体导致求解器爆开。
            const delay = idx * GameManager.SPAWN_INTERVAL;
            this.scheduleOnce(() => {
                const n = instantiate(prefab);
                n.setParent(this.node);
                this.forceLayer(n);
                // 从篮筐中央上方连续落下：先堆中心，再由真实碰撞向四周摊开。
                // 低差异圆盘采样避免完全同轴，也不会像黄金螺旋预铺那样显得人工整齐。
                // 落点按容器形状分层铺满（见 pileSeedPoint），不再是中央小圆盘。
                const seed = this.pileSeedPoint(index);
                // 生成点在容器沿略上方（见 PILE_SPAWN_Y）：件贴着堆顶落定而不是从高处砸下。
                n.setPosition(
                    seed.x + (this.levelRandom() - 0.5) * 0.12,
                    GameManager.PILE_SPAWN_Y + (idx % 5) * 0.22,
                    seed.z + (this.levelRandom() - 0.5) * 0.08,
                );
                // 参考录屏中单件约为篮宽的 1/6；66 件时形成紧凑但不过高的堆。
                const scale = this.itemScale + (idx % 4) * 0.012;
                // 出生缩放弹大("从小变大"):先设小,下方在自由下落头 SPAWN_POP_TIME 内 tween 到满。
                const from = scale * GameManager.SPAWN_POP_FROM;
                n.setScale(from, from, from);

                const tag = n.addComponent(ItemTag);
                tag.id = id;
                const rb = n.addComponent(RigidBody);
                rb.mass = 0.85 + (idx % 3) * 0.1;
                // 低阻尼 = 真实自由落体。旧值 0.92/0.97 像掉进糖浆，
                // 下落绵软且落地后长时间蠕动，是"摔落不真实"的直接原因。
                rb.angularDamping = 0.3;
                rb.linearDamping = 0.06;
                rb.sleepThreshold = 0.15;
                rb.useCCD = true;
                // 圆形/环形物件用圆柱碰撞体(消除方角互插导致的高速抖),其余用方盒。
                const col: Collider = GameManager.ROUND_ITEMS.has(id)
                    ? n.addComponent(CylinderCollider)
                    : n.addComponent(BoxCollider);
                col.sharedMaterial = this.pileMaterial;
                this.centerVisualAndFitCollider(n, col);
                this.setNaturalRotation(n, id, () => this.levelRandom());
                rb.setLinearVelocity(v3(
                    (this.levelRandom() - 0.5) * 0.2,
                    -2.6,
                    (this.levelRandom() - 0.5) * 0.2,
                ));
                // 薄片(铜钱/玉环/平安扣等)只给绕竖轴的自转(改朝向、仍拍平落),
                // 大幅收窄横轴翻滚——否则它们在半空翻立起来边缘着地、圆柱立着打滚,
                // 是这类物件抖动/蹭墙/堆乱的主因。非薄片保留全向翻滚的自然感。
                const tumble = GameManager.ROUND_ITEMS.has(id) ? 0.25 : 1.2;
                rb.setAngularVelocity(v3(
                    (this.levelRandom() - 0.5) * tumble,
                    (this.levelRandom() - 0.5) * 1.2,
                    (this.levelRandom() - 0.5) * tumble,
                ));
                // 弹大动画:趁下落无接触段从 from 长到满(backOut 带轻微过冲更弹)。
                // 碰撞体随节点缩放同步长大,但全程在半空、无接触,不会推挤邻居。
                tween(n).to(GameManager.SPAWN_POP_TIME, { scale: v3(scale, scale, scale) },
                    { easing: 'backOut' }).start();
                // 物件投平面阴影
                for (const mr of n.getComponentsInChildren(MeshRenderer)) {
                    mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.ON;
                }
                // 逐件定时硬冻:落定所需时间后无条件锁死,不依赖检测(高频挤压抖检测抓不住)。
                this.scheduleOnce(() => this.hardFreezeItem(n), GameManager.SPAWN_FREEZE_DELAY);
            }, delay);
        });
        // 最后一件落下(高处下落约 0.6s)后再给物理一段自然沉降,然后锁定整堆。
        // 巡逻里的逐件冻结通常早已把大部分物件锁死,这里只是兜底。
        this.schedulePileSettle(queue.length * GameManager.SPAWN_INTERVAL + GameManager.SETTLE_BACKSTOP);
        console.log(`[GameManager] 关卡 ${this.levelIndex + 1}：生成 ${this.totalCount} 个物件，seed=${this.level.seed}`);
    }

    /**
     * GLB 场景根节点经常保留 DCC 中的平移（部分模型偏移超过 2 个世界单位）。
     * 旧实现把碰撞盒固定放在 Prefab 根节点，视觉模型却在旁边，物理上没有真正包住模型。
     * 这里读取所有 Mesh 的局部包围盒，统一把视觉内容移回根节点中心，再按真实尺寸生成碰撞盒。
     */
    private centerVisualAndFitCollider(root: Node, collider: Collider) {
        // 刚实例化并 setPosition/setScale 的节点，worldMatrix 可能仍是上一帧缓存。
        // 若直接求 bounds，会把“生成落点”误算进模型自身偏移，再次平移视觉子树，
        // 结果就是碰撞体分散在篮底、所有可见模型却挤到同一侧，看起来严重穿模。
        root.updateWorldTransform();
        const renderers = root.getComponentsInChildren(MeshRenderer);
        const min = v3(Infinity, Infinity, Infinity);
        const max = v3(-Infinity, -Infinity, -Infinity);
        const invRoot = new Mat4();
        const meshToRoot = new Mat4();
        const corner = v3();
        const point = v3();

        Mat4.invert(invRoot, root.worldMatrix);
        let hasBounds = false;
        for (const renderer of renderers) {
            const meshMin = renderer.mesh?.struct.minPosition;
            const meshMax = renderer.mesh?.struct.maxPosition;
            if (!meshMin || !meshMax) continue;
            Mat4.multiply(meshToRoot, invRoot, renderer.node.worldMatrix);
            for (let mask = 0; mask < 8; mask++) {
                corner.set(
                    mask & 1 ? meshMax.x : meshMin.x,
                    mask & 2 ? meshMax.y : meshMin.y,
                    mask & 4 ? meshMax.z : meshMin.z,
                );
                Vec3.transformMat4(point, corner, meshToRoot);
                Vec3.min(min, min, point);
                Vec3.max(max, max, point);
                hasBounds = true;
            }
        }

        if (!hasBounds) {
            // 资源尚未提供 bounds 时使用保守尺寸，仍比原先 0.75³ 更不容易露出模型。
            this.fitColliderDims(collider, 1.05, 1.05, 1.05);
            collider.center = v3();
            return;
        }

        const center = v3(
            (min.x + max.x) * 0.5,
            (min.y + max.y) * 0.5,
            (min.z + max.z) * 0.5,
        );
        // GLB prefab 的根通常只是容器，整体平移其一级子树即可保留模型内部结构。
        for (const child of root.children) {
            child.setPosition(
                child.position.x - center.x,
                child.position.y - center.y,
                child.position.z - center.z,
            );
        }
        root.updateWorldTransform();

        this.fitColliderDims(collider, max.x - min.x, max.y - min.y, max.z - min.z);
        collider.center = v3();
    }

    /**
     * 按包围盒三轴尺寸设定碰撞体。
     * 方盒:直接用尺寸(4% 安全余量防表面相交,薄片至少 0.20 配合 CCD 防单步穿越)。
     * 圆柱:自动挑**最薄的轴**为圆柱轴向(圆盘法线,自适应各模型网格朝向),另两轴较大半长为半径。
     */
    private fitColliderDims(collider: Collider, ex: number, ey: number, ez: number) {
        if (collider instanceof CylinderCollider) {
            let axis: EAxisDirection;
            let radius: number;
            let height: number;
            if (ey <= ex && ey <= ez) { axis = EAxisDirection.Y_AXIS; radius = Math.max(ex, ez) / 2; height = ey; }
            else if (ex <= ey && ex <= ez) { axis = EAxisDirection.X_AXIS; radius = Math.max(ey, ez) / 2; height = ex; }
            else { axis = EAxisDirection.Z_AXIS; radius = Math.max(ex, ey) / 2; height = ez; }
            collider.direction = axis;
            // 圆柱已贴合圆盘,余量取小(2%);高度贴合薄片厚度,下限防退化。
            // 高度下限 0.12→0.05:一枚 ~2cm 厚铜钱曾被撑成 12cm,堆叠悬空/松散。
            // 薄片的单步穿越由 CCD 兜底,不再靠加厚碰撞体防穿。
            collider.radius = Math.max(0.1, radius * 1.02);
            collider.height = Math.max(0.05, height * 1.02);
        } else if (collider instanceof BoxCollider) {
            // 膨胀 4%→2% + 下限 0.20→0.08:碰撞体更贴合网格,消除"件件撑开的空隙"观感。
            collider.size = v3(
                Math.max(0.08, ex * 1.02),
                Math.max(0.08, ey * 1.02),
                Math.max(0.08, ez * 1.02),
            );
        }
    }

    /**
     * 单件无条件硬冻(逐件定时器回调)。不看速度/检测:高频挤压抖动检测抓不住,到点直接锁。
     * 已被拾取/已销毁/已是运动学的跳过。冻前把视觉外轮廓拉回边界内。
     */
    private hardFreezeItem(n: Node) {
        if (!n.isValid || !this.playing) return;
        const tag = n.getComponent(ItemTag);
        if (!tag || tag.picked) return;
        const rb = n.getComponent(RigidBody);
        if (!rb?.enabled || rb.type === RigidBody.Type.KINEMATIC) return;
        this.patrol.constrainVisualInside(n, 0.03);
        try { rb.clearState(); } catch { /* 忽略 */ }
        rb.setLinearVelocity(v3());
        rb.setAngularVelocity(v3());
        rb.type = RigidBody.Type.KINEMATIC;
    }

    /** 延迟冻结当前堆；token 防止重开、连续拾取时旧定时器误冻新一轮运动。 */
    private schedulePileSettle(delay: number) {
        const token = ++this.settleToken;
        this.scheduleOnce(() => {
            if (token !== this.settleToken || !this.playing || this.paused) return;
            for (const t of this.node.getComponentsInChildren(ItemTag)) {
                if (t.picked || !t.node.isValid) continue;
                // 单步限幅矫正:与逐件 freeze 一致,避免此刻大幅瞬移读作"最后一跳"。
                this.patrol.constrainVisualInside(t.node, 0.03);
                const rb = t.node.getComponent(RigidBody);
                if (!rb?.enabled) continue;
                // 必须显式归零线/角速度再切 KINEMATIC:clearState() 只清力与冲量累积,
                // 不清当前速度。带残余速度的物件被一次性锁死,最后一物理步与锁死帧
                // 之间会有位置突变——这正是电脑端"整堆最后啪地颤一下"的来源。
                rb.clearState();
                rb.setLinearVelocity(v3());
                rb.setAngularVelocity(v3());
                // Bullet 中相互重叠的动态刚体即使 sleep 也可能被接触求解重新唤醒。
                // 切为运动学刚体后仍保留 Collider/射线拾取，但不会再被重力或邻居推动。
                rb.type = RigidBody.Type.KINEMATIC;
            }
        }, delay);
    }

    /**
     * 只让被拿走物件正上方、确实可能失去支撑的 1~2 件做一次微小沉降。
     * 这里不用重新启用动态物理：密集堆中一个动态刚体会把接触链逐层唤醒，表现为整堆抖动。
     * 三段式位移模拟“下落 → 轻微接触回弹 → 停稳”，既保留重量感，也保证远处物件绝对静止。
     */
    private settleNearRemoved(center: Vec3): Set<Node> {
        const handled = new Set<Node>();
        const candidates = this.node.getComponentsInChildren(ItemTag)
            .filter(t => !t.picked && t.node.isValid)
            .map(t => {
                const p = t.node.worldPosition;
                const dx = p.x - center.x;
                const dy = p.y - center.y;
                const dz = p.z - center.z;
                const horizontal2 = dx * dx + dz * dz;
                return { t, dy, horizontal2, score: horizontal2 + dy * dy * 0.18 };
            })
            // 只处理移除点上方的支撑关系；同层和下层物件不应跟着晃。
            .filter(v => v.dy > 0.035 && v.dy < 0.9 && v.horizontal2 < 0.62 * 0.62)
            .sort((a, b) => a.score - b.score)
            .slice(0, 2);

        for (const [index, candidate] of candidates.entries()) {
            const n = candidate.t.node;
            const rb = n.getComponent(RigidBody);
            if (!rb?.enabled) continue;

            // 该件正下方若仍被别的物件顶着(近距离、略低),说明它并没真正失去支撑——
            // 强行下沉 + 固定倾斜正是"动画假"的来源(玩家看到凭空抽搐)。此时直接跳过。
            const cp = n.worldPosition.clone();
            const stillSupported = this.node.getComponentsInChildren(ItemTag).some(o => {
                if (o === candidate.t || o.picked || !o.node.isValid) return false;
                const q = o.node.worldPosition;
                const dyBelow = cp.y - q.y;               // 正 = o 在下方
                if (dyBelow < 0.02 || dyBelow > 0.6) return false;
                const dxh = q.x - cp.x, dzh = q.z - cp.z;
                return dxh * dxh + dzh * dzh < 0.28 * 0.28; // 正下方近距离 = 仍有支撑
            });
            if (stillSupported) continue;

            Tween.stopAllByTarget(n);
            handled.add(n);
            rb.clearState();
            rb.type = RigidBody.Type.KINEMATIC;

            const start = n.position.clone();
            // 离支撑中心越近，沉降稍明显；最大 6.5cm，第二件再减弱 20%。
            const proximity = 1 - Math.min(1, Math.sqrt(candidate.horizontal2) / 0.62);
            const fall = (0.035 + proximity * 0.03) * (index === 0 ? 1 : 0.8);
            const landed = start.clone();
            landed.y -= fall;
            const rebound = landed.clone();
            rebound.y += Math.min(0.012, fall * 0.22);

            // 很小的确定性倾斜让接触不显机械，又不会每次点击产生随机抽搐。
            const sign = (n.uuid.charCodeAt(n.uuid.length - 1) & 1) ? 1 : -1;
            const delta = new Quat();
            const settledRotation = new Quat();
            Quat.fromEuler(delta, sign * (0.7 + proximity * 0.7), 0, -sign * 0.55);
            Quat.multiply(settledRotation, n.rotation, delta);

            tween(n)
                .to(0.15, { position: landed, rotation: settledRotation }, { easing: 'quadIn' })
                .to(0.09, { position: rebound }, { easing: 'quadOut' })
                .to(0.12, { position: landed }, { easing: 'sineOut' })
                .call(() => {
                    if (!n.isValid || candidate.t.picked) return;
                    this.patrol.constrainVisualInside(n);
                    rb.clearState();
                })
                .start();
        }
        return handled;
    }

    /**
     * 拿走一件后，邻近几件跟着轻晃两下——纯装饰，不动物理。
     *
     * settleNearRemoved 只处理"真失去支撑"的 1~2 件，而它的 stillSupported 守卫
     * 在密堆里几乎恒为真（正下方 0.6 内有任何一件就跳过），于是绝大多数点击整堆纹丝不动，
     * 手感像在点一张贴图。这里补的是反馈而不是物理：附近几件做一次阻尼衰减的小幅摆动，
     * 幅度按距离衰减，最大位移 1.8cm、倾角 2°，0.28s 内收敛回原位。
     *
     * 全程 KINEMATIC + tween，不重新启用动态刚体——一旦有一件转回动态，
     * 接触链会被逐层唤醒，整堆抖起来（这正是 settleNearRemoved 当初绕开的坑）。
     */
    private jiggleAround(center: Vec3, exclude: Set<Node>) {
        // 取**最近 K 件**而不是固定半径内的所有件。堆的疏密会随关卡件数和投放参数变，
        // 固定半径下同一个数字在稀疏堆里只罩得住一件、在密堆里又会罩住一大片变成地震；
        // 取 K 近邻则密度无关。实测第 1 关最近邻中位距 0.54，硬上限 1.2 足够宽松。
        const K = 5, MAX_D = 1.2;
        const near: { t: ItemTag; d: number }[] = [];
        for (const t of this.node.getComponentsInChildren(ItemTag)) {
            if (t.picked || !t.node.isValid || exclude.has(t.node)) continue;
            const p = t.node.worldPosition;
            const dx = p.x - center.x, dy = p.y - center.y, dz = p.z - center.z;
            // 竖向差按 0.6 折算：上方压着的和同层挨着的都该有反应，隔了两层的不该。
            const d = Math.sqrt(dx * dx + dz * dz + dy * dy * 0.36);
            if (d > MAX_D) continue;
            near.push({ t, d });
        }
        near.sort((a, b) => a.d - b.d);
        const chosen = near.slice(0, K);
        // 幅度按"在这批近邻里排多远"归一，而不是按绝对距离——同样密度无关。
        // 系数留到 0.65 而不是 1，最远那件也还剩三成幅度，不至于白挑进来。
        const span = chosen.length ? chosen[chosen.length - 1].d || 1 : 1;

        for (const [i, { t, d }] of chosen.entries()) {
            const falloff = 1 - 0.65 * (d / span);
            const n = t.node;
            // 已在晃的：先停掉并退回钉住的静止位姿，否则第二次晃动会以偏移位为基准，
            // 连点几次堆就整体走形了。
            Tween.stopAllByTarget(n);
            if (t.restPos && t.restRot) {
                n.setPosition(t.restPos);
                n.setRotation(t.restRot);
            } else {
                t.restPos = n.position.clone();
                t.restRot = n.rotation.clone();
            }
            const rest = t.restPos!;
            const restRot = t.restRot!;

            // 方向取"背离被拿走那件"的水平法向：读作被让开的一下，而不是随机抽搐。
            const ox = n.position.x - center.x, oz = n.position.z - center.z;
            const len = Math.hypot(ox, oz) || 1;
            const amp = (0.009 + falloff * 0.013);
            const ux = (ox / len) * amp, uz = (oz / len) * amp;

            const swing = (k: number) => v3(rest.x + ux * k, rest.y - amp * 0.35 * Math.abs(k),
                rest.z + uz * k);
            // 绕水平轴的小倾角，符号按 uuid 定死：同一件每次晃的方向一致，不会看着乱抽。
            const sign = (n.uuid.charCodeAt(n.uuid.length - 1) & 1) ? 1 : -1;
            const tilt = (q: Quat, k: number) => {
                const d = new Quat();
                Quat.fromEuler(d, sign * 2.0 * falloff * k, 0, -sign * 1.4 * falloff * k);
                Quat.multiply(q, restRot, d);
                return q;
            };

            tween(n)
                // 错峰起振：同时起跳会读作整块地板在动
                .delay(i * 0.012)
                .to(0.08, { position: swing(1), rotation: tilt(new Quat(), 1) },
                    { easing: 'quadOut' })
                .to(0.09, { position: swing(-0.45), rotation: tilt(new Quat(), -0.45) },
                    { easing: 'sineInOut' })
                .to(0.11, { position: rest.clone(), rotation: restRot.clone() },
                    { easing: 'sineOut' })
                .call(() => {
                    if (!n.isValid) return;
                    // 钉回静止位姿并交还锚点：巡检那边靠 anchor 判静止，位姿变了要同步，
                    // 否则下一拍会以为它在动。
                    n.setPosition(rest);
                    n.setRotation(restRot);
                    t.restPos = null;
                    t.restRot = null;
                    const wp = n.worldPosition;
                    t.anchorX = wp.x; t.anchorY = wp.y; t.anchorZ = wp.z;
                })
                .start();
        }
    }

    /** 限制初始倾斜，避免钱币/玉环直立后高速翻滚造成旋转穿透。 */
    private setNaturalRotation(node: Node, id: string, random: () => number = Math.random) {
        const flat = id === 'banzhi' || id === 'bracelet' || id === 'pingankou'
            || id === 'tongqian' || id === 'yuzhuo';
        // 薄片起始更贴近水平(20°→12°):配合下落只保留竖轴自转,落下即拍平叠摞,
        // 不会立起来边缘着地。非薄片保持较大随机倾斜的自然感。
        const tilt = flat ? 12 : 32;
        const q = new Quat();
        Quat.fromEuler(
            q,
            (random() - 0.5) * tilt * 2,
            random() * 360,
            (random() - 0.5) * tilt * 2,
        );
        node.setRotation(q);
    }

    /** xorshift32：轻量、跨平台一致，足够生成可复现的关卡初始布局。 */
    private levelRandom(): number {
        let x = this.levelRandomState | 0;
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        this.levelRandomState = x >>> 0;
        return this.levelRandomState / 0x100000000;
    }

    private shuffleInPlace<T>(items: T[], random: () => number = Math.random) {
        for (let i = items.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [items[i], items[j]] = [items[j], items[i]];
        }
    }

    // ---------- 拾取与三消 ----------

    private onTouch(e: EventTouch) {
        if (!this.playing || this.paused || this.interactionLocked || !this.cam) return;
        const p = e.getLocation();
        // getLocation / screenPointToRay / worldToScreen 三者同为**帧缓冲物理像素**，
        // 所以这里的阈值也必须用物理像素的 screen.windowSize（不是 view.getVisibleSize()）。
        if (p.y < screen.windowSize.height * 0.2) return; // 2D 收集区 + 道具栏，不穿透拾取
        const tag = this.hitTestAt(p.x, p.y);
        if (tag) this.pick(tag.node, tag);
    }

    /**
     * 双通道命中检测（供 onTouch 与自动化测试共用）。入参为**帧缓冲物理像素**，
     * 与 EventTouch.getLocation / camera.worldToScreen 同一套坐标。
     * 1) 穿透式物理射线，全命中里取最近的可拾取物件（隐形围栏不遮挡）
     * 2) 射线漏检时按屏幕距离就近吸附（物理体和渲染体错位/物件极薄时的兜底）
     */
    hitTestAt(x: number, y: number): ItemTag | null {
        if (!this.cam) return null;
        const ray = new geometry.Ray();
        this.cam.screenPointToRay(x, y, ray);
        let bestTag: ItemTag | null = null;
        let bestDist = Infinity;
        if (PhysicsSystem.instance.raycast(ray)) {
            for (const r of PhysicsSystem.instance.raycastResults) {
                const tag = r.collider.node.getComponent(ItemTag);
                if (tag && !tag.picked && r.distance < bestDist) {
                    bestDist = r.distance;
                    bestTag = tag;
                }
            }
        }
        if (!bestTag) {
            const thresh = screen.windowSize.width * 0.06;
            let bestPx = thresh;
            const sp = v3();
            for (const t of this.node.getComponentsInChildren(ItemTag)) {
                if (t.picked || !t.node.isValid) continue;
                this.cam.worldToScreen(t.node.worldPosition, sp);
                const d = Math.hypot(sp.x - x, sp.y - y);
                if (d < bestPx) { bestPx = d; bestTag = t; }
            }
        }
        return bestTag;
    }

    private pick(node: Node, tag: ItemTag) {
        tag.picked = true;
        // 有操作就重新计发呆时长，并撤掉还亮着的提示环。
        this.idleTime = 0;
        this.hud?.clearHint();
        const removedPos = node.worldPosition.clone();
        const screenPos = v3();
        this.cam.worldToScreen(node.worldPosition, screenPos);
        // 物理组件失效，交给 Tween 接管
        node.getComponent(RigidBody)!.enabled = false;
        node.getComponent(Collider)!.enabled = false;

        const { matched, full, index } = this.tray.add(tag.id, node);
        this.audio?.play(tag.id === 'goose' ? 'honk' : 'pick');
        this.hud?.pickBurst(screenPos);
        // 抓到吉祥物大鹅时给一句台词——游戏叫《抓住大鹅》，它不该跟一颗苹果一个待遇。
        if (tag.id === 'goose') this.hud?.speechPop(screenPos, '嘎——!');
        // 石头永远凑不齐，拿一块就等于永久少一格。首页那行警告开局就翻篇了，
        // 真正踩坑的这一刻必须当场说清楚，否则玩家只会以为自己运气差。
        if (tag.id === DISTRACTOR_ID && !this.rockWarned) {
            this.rockWarned = true;
            this.hud?.toast('石头凑不成三个，会一直占着格子');
        }
        this.hud?.captureModel(node, screenPos, index);
        this.reflowTray();
        // 先让真失去支撑的 1~2 件沉降，剩下的邻居只做装饰性轻晃（别晃已在沉降的那几件）。
        this.jiggleAround(removedPos, this.settleNearRemoved(removedPos));
        this.scheduleOnce(() => this.audio?.play('drop', 0.5), 0.3);

        if (matched) {
            // 飞入动画结束后再消除
            this.scheduleOnce(() => {
                for (const e of matched) {
                    Tween.stopAllByTarget(e.node);
                    this.hud?.matchBurst(e.node);
                    this.hud?.releaseModel(e.node);
                    tween(e.node)
                        .to(0.2, { scale: v3(0.05, 0.05, 0.05) }, { easing: 'backIn' })
                        .call(() => e.node.destroy())
                        .start();
                }
                this.removedCount += 3;
                this.addMatchScore();
                // 音量随连击递增：引擎的 playOneShot 不支持变调，用响度给「连着消」一个听得见的正反馈。
                // 放在 addMatchScore 之后，this.combo 才是这一次消除后的连击数。
                this.audio?.play('match', Math.min(1, 0.72 + this.combo * 0.07));
                this.reflowTray();
                this.updateHud();
                if (this.removedCount >= this.totalCount) {
                    this.gameOver(true, '全部消除！');
                    return;
                }
                this.checkDeadlock();
            }, 0.35);
        } else if (full) {
            // 数据层已经满 7 格，立即锁住输入；否则 0.4s 动画窗口内的连点会塞入第 8 格。
            this.interactionLocked = true;
            this.scheduleOnce(() => this.gameOver(false, '槽位已满'), 0.4);
        } else {
            // 图标飞完再闪那两格，否则玩家看到的是空框在亮。
            if ((this.tray.countById().get(tag.id) ?? 0) === 2) {
                this.scheduleOnce(() => this.flashNearMatch(tag.id), 0.3);
            }
            this.checkDeadlock();
        }
    }

    /**
     * 三消结算得分：连击窗口内连续消除叠加倍率（上限 COMBO_MAX_MULT），
     * 断了就从 1 倍重来。奖励"看准了连着消"，但不给额外时间，不动既定难度曲线。
     */
    private addMatchScore() {
        const now = performance.now() / 1000;
        this.combo = now - this.lastMatchAt <= GameManager.COMBO_WINDOW ? this.combo + 1 : 1;
        this.lastMatchAt = now;
        const gain = GameManager.SCORE_BASE * Math.min(this.combo, GameManager.COMBO_MAX_MULT);
        this.score += gain;
        this.hud?.setScore(this.score);
        this.hud?.comboPop(this.combo, gain);
    }

    // ---------- 道具 ----------

    // 道具默认 0，不再白送；改为靠获取途径累积（通关星级奖励 / 每日礼包 / 用尽补充，见 grantProps）。
    private propCounts: Record<PropKind, number> = { remove: 0, magnet: 0, shuffle: 0 };
    private static readonly PROP_NAMES: Record<PropKind, string> = { remove: '移出', magnet: '凑齐', shuffle: '打乱' };

    private loadProps() {
        this.propCounts = { ...this.propCounts, ...SaveData.getProps({}) };
        this.refreshPropHud();
    }

    private saveProps() {
        SaveData.setProps(this.propCounts);
        this.refreshPropHud();
    }

    /** 统一的道具发放入口：通关星级奖励、每日礼包、用尽补充都走这里。 */
    private grantProps(delta: Partial<Record<PropKind, number>>) {
        for (const k of ['remove', 'magnet', 'shuffle'] as PropKind[]) {
            this.propCounts[k] += delta[k] ?? 0;
        }
        this.saveProps();
    }

    /** 每日首次进入送一套道具（跨天重置）。 */
    private grantDailyPropGift() {
        if (SaveData.claimedPropGiftToday()) return;
        SaveData.markPropGift();
        this.grantProps({ remove: 1, magnet: 1, shuffle: 1 });
    }

    /**
     * 道具用尽时点击 → 无门槛补 1 个（H5 无激励视频，同 ensureDaily 的口径）。
     * 此入口的位置为将来接广告预留：届时只需把 onAction 换成广告回调。
     */
    private offerPropRefill(kind: PropKind) {
        if (this.paused) return;
        this.hud?.showNotice(`${GameManager.PROP_NAMES[kind]}用完了`, '补 1 个接着用吧',
            '补 1 个', () => {
                const delta: Partial<Record<PropKind, number>> = {};
                delta[kind] = 1;
                this.grantProps(delta);
                this.audio?.play('prop');
                this.hud?.hideResult();
            });
    }

    private refreshPropHud() {
        if (!this.hud) return;
        for (const k of ['remove', 'magnet', 'shuffle'] as PropKind[]) {
            this.hud.setPropCount(k, GameManager.PROP_NAMES[k], this.propCounts[k]);
        }
    }

    useProp(kind: PropKind) {
        if (!this.playing || this.paused || this.interactionLocked) return;
        this.idleTime = 0;
        this.hud?.clearHint();
        if (this.propCounts[kind] <= 0) { this.offerPropRefill(kind); return; }
        let used = false;
        if (kind === 'remove') used = this.propRemove();
        else if (kind === 'magnet') used = this.propMagnet();
        else used = this.propShuffle();
        if (used) {
            this.audio?.play(kind === 'shuffle' ? 'shuffle' : 'prop');
            this.propCounts[kind]--;
            this.saveProps();
        }
    }

    /** 移出：槽头 3 个物件放回盒子 */
    private propRemove(): boolean {
        const back = this.tray.takeFront(3);
        if (back.length === 0) return false;
        this.returnItemsToPile(back);
        return true;
    }

    /** 把若干槽内物件放回 3D 堆(道具"移出"与失败救场共用)。 */
    private returnItemsToPile(back: { id: string; node: Node }[]) {
        back.forEach((e, i) => {
            const tag = e.node.getComponent(ItemTag)!;
            this.hud?.releaseModel(e.node);
            e.node.setParent(this.node);
            this.forceLayer(e.node);
            e.node.active = true;
            tag.picked = false;
            tag.stillTicks = 0;
            tag.anchorY = -99;
            const rbBack = e.node.getComponent(RigidBody)!;
            rbBack.linearDamping = 0.06;
            rbBack.angularDamping = 0.3;
            // 落点走通用边界的回收点：矩形/圆形容器都能保证落在承载物内，逐件抬高错开。
            const rp = this.boundary.respawn(Math.random);
            e.node.setWorldPosition(rp.x, 1.3 + i * 0.5, rp.z);
            e.node.setScale(this.itemScale, this.itemScale, this.itemScale);
            this.setNaturalRotation(e.node, tag.id);
            const rb = e.node.getComponent(RigidBody)!;
            rb.type = RigidBody.Type.DYNAMIC;
            rb.enabled = true;
            rb.wakeUp();
            e.node.getComponent(Collider)!.enabled = true;
        });
        this.reflowTray();
        this.schedulePileSettle(GameManager.SETTLE_BACKSTOP);
    }

    /** 凑齐：自动吸取盒中物件补全一组三消（优先补槽内已有的类别） */
    private propMagnet(): boolean {
        const counts = this.tray.countById();
        const boxItems = this.node.getComponentsInChildren(ItemTag).filter(t => !t.picked && t.node.isValid);
        const availOf = (id: string) => boxItems.filter(t => t.id === id).length;

        let target: string | null = null;
        let bestHave = -1;
        for (const [id, have] of counts) {
            const need = 3 - have;
            if (need <= 0) continue;
            // 槽位余量必须装得下补齐所需数量（否则会触发爆满失败）
            if (availOf(id) >= need && this.tray.count + need <= TRAY_CAPACITY && have > bestHave) {
                bestHave = have;
                target = id;
            }
        }
        if (!target && this.tray.count + 3 <= TRAY_CAPACITY) {
            target = boxItems.find(t => availOf(t.id) >= 3)?.id ?? null;
        }
        if (!target) return false;

        const need = 3 - (counts.get(target) ?? 0);
        const picks = boxItems.filter(t => t.id === target).slice(0, need);
        // 自动吸取是一个完整事务，期间禁止手点或再次使用道具改变已校验过的槽位余量。
        this.interactionLocked = true;
        picks.forEach((t, i) => this.scheduleOnce(() => {
            if (this.playing && t.node.isValid && !t.picked) this.pick(t.node, t);
        }, i * 0.18));
        this.scheduleOnce(() => {
            this.interactionLocked = false;
            // 磁铁可能刚好吸走最后一组可消物件，事务解锁后补一次残局判定。
            this.checkDeadlock();
        }, picks.length * 0.18 + 0.4);
        return true;
    }

    /** 打乱：盒中剩余物件重新抛起洗一遍 */
    private propShuffle(): boolean {
        const boxItems = this.node.getComponentsInChildren(ItemTag).filter(t => !t.picked && t.node.isValid);
        if (boxItems.length === 0) return false;
        this.shuffleInPlace(boxItems);
        // 这里的投放高度 1.55 **故意低于**开局的 PILE_SPAWN_Y(2.6)，别去"对齐"两者：
        // 打乱是原地洗牌，容器里还堆着旧的一堆（顶约 1.2），件只需从旧堆顶略上方落下；
        // 2.6 那个值是为空容器算的，用在这儿就变成从高处砸。实测第 1 关打乱后堆顶 med：
        //   1.55 + i%6×0.1（现行，同帧）        1.71   ← 最好
        //   2.6  + i%5×0.22（逐件错开投放）      2.04   先重投的件落在没抬走的旧堆上垫高
        //   2.6  + layer×0.6（同帧、按层抬高）   2.65   落差更大，砸得更散
        // 同帧整队重置也是必需的——逐件会让容器迟迟清不空，就是上面第二行那个结果。
        for (const [i, t] of boxItems.entries()) {
            // 重洗与投放共用落点函数，打乱后堆形与开局同构（否则用一次道具堆就变样）。
            // 已消掉一些件时 boxItems 变少，层数自动跟着降，不会在半空留出悬着的上层。
            const seed = this.pileSeedPoint(i);
            t.node.setWorldPosition(
                seed.x + (Math.random() - 0.5) * 0.1,
                1.55 + (i % 6) * 0.1,
                seed.z + (Math.random() - 0.5) * 0.06);
            this.setNaturalRotation(t.node, t.id);
            t.stillTicks = 0;
            t.anchorY = -99;
            const rb = t.node.getComponent(RigidBody)!;
            rb.linearDamping = 0.06;
            rb.angularDamping = 0.3;
            rb.type = RigidBody.Type.DYNAMIC;
            try { rb.clearState(); } catch { /* 部分版本无此方法，忽略 */ }
            rb.wakeUp();
            rb.setLinearVelocity(v3((Math.random() - 0.5) * 0.4, -1.2, (Math.random() - 0.5) * 0.4));
        }
        this.schedulePileSettle(GameManager.SETTLE_BACKSTOP);
        return true;
    }

    /** 槽中所有物件按当前顺序补位（含飞入中的） */
    private reflowTray() {
        this.tray.entries.forEach((e, i) => {
            this.hud?.moveModelToSlot(e.node, i);
        });
        this.hud?.setTrayCount(this.tray.count);
    }

    // ---------- 结算与 HUD ----------

    private get progress(): number {
        return this.totalCount === 0 ? 0 : Math.round((this.removedCount / this.totalCount) * 100);
    }

    private gameOver(win: boolean, reason: LoseReason | '全部消除！') {
        if (!this.playing) return;
        this.playing = false;
        this.interactionLocked = false;
        this.paused = false;
        this.combo = 0;
        this.hud?.setCombo(0, 0);
        this.hud?.setPaused(false);
        this.hud?.hidePauseMenu();
        this.hud?.clearHint();
        this.hud?.setTimeUrgent(false);
        this.loseReason = win ? '' : reason as LoseReason;
        this.audio?.play(win ? 'win' : 'lose');
        // 通关此前只有一个弹窗弹出来，画面上没有任何「成了」的反馈；先撒金屑再结算。
        if (win) this.hud?.winCelebrate();
        // 剩余时间折成奖励分：结算面板会单列一行说明它的来源。
        const timeBonus = win ? Math.round(this.timeLeft) * GameManager.TIME_BONUS_PER_SEC : 0;
        if (timeBonus > 0) {
            this.score += timeBonus;
            this.hud?.setScore(this.score);
        }
        const stars = this.progress >= 100 ? 3 : this.progress >= 70 ? 2 : this.progress >= 50 ? 1 : 0;
        // 星级奖励：一星+移出、二星再+凑齐、三星再+打乱（走统一发放入口）
        const reward: Partial<Record<PropKind, number>> = {};
        if (stars >= 1) reward.remove = 1;
        if (stars >= 2) reward.magnet = 1;
        if (stars >= 3) reward.shuffle = 1;
        this.grantProps(reward);
        console.log(`[GameManager] ${win ? '胜利' : `失败（${reason}）`} 完成度 ${this.progress}%`);

        const finishedLevel = this.levelIndex;
        // 先取旧纪录再写入，否则展示的"历史最佳"会变成刚打完的这一局。
        const prevBest = this.best[finishedLevel];
        const newRecord = this.recordBest(finishedLevel, stars, this.progress, this.score);

        // 胜利推进关卡并持久化；最后一关通关后停在最后一关反复挑战。
        const wasLast = this.levelIndex >= LEVELS.length - 1;
        if (win && !wasLast) {
            this.levelIndex++;
            SaveData.setLevel(this.levelIndex);
        }
        const actionText = win ? (wasLast ? '再来一局' : '下一关') : '再试一次';
        // 失败且本轮未救过 → 提供一次救场：槽满/残局退 3 件、超时加 60 秒。
        const canRescue = !win && !this.rescueUsed
            && (this.loseReason === '时间到' || this.tray.count >= 3);
        const loseSubtitle: Record<Exclude<LoseReason, ''>, string> = {
            '槽位已满': '七格被塞满了',
            '时间到': '时间到了',
            '无解': '剩下的物件配不出三个了',
        };
        const subtitle = win || this.loseReason === '' ? '' : loseSubtitle[this.loseReason];
        // 给消除动画/星星心理预期留 0.6 秒再弹结算。
        // 原地重置而不重载场景——loadScene 后自定义管线的主相机会停止渲染。
        this.scheduleOnce(() => {
            this.hud?.showResult({
                win, stars, progress: this.progress, score: this.score, rewardCount: stars, actionText,
                subtitle,
                timeBonus,
                bestText: prevBest
                    ? `历史最佳 ${'★'.repeat(prevBest.stars) || '—'} ${prevBest.progress}% · ${prevBest.score ?? 0} 分`
                    : '',
                newRecord,
                rescueText: canRescue
                    ? (this.loseReason === '时间到' ? '救一下:+60 秒' : '救一下:退回 3 件') : '',
                onRescue: canRescue ? () => this.rescue() : undefined,
                onAction: () => this.resetLevel(),
            });
        }, 0.6);
    }

    /**
     * 失败救场(每轮一次)。H5 直接生效;此入口的位置为将来接广告预留。
     * 超时:加 60 秒;槽满/残局:槽头 3 件退回堆里腾出空间(残局加时救不了,只有腾格才有意义)。
     */
    private rescue() {
        if (this.rescueUsed || this.playing) return;
        this.rescueUsed = true;
        this.interactionLocked = false;
        this.hud?.hideResult();
        this.audio?.play('prop');
        if (this.loseReason === '时间到') {
            this.timeLeft += 60;
        } else {
            const back = this.tray.takeFront(3);
            this.returnItemsToPile(back);
        }
        this.playing = true;
        this.updateHud();
    }

    /** 原地开始 levelIndex 指向的关卡（重试当前关或进入下一关） */
    private async resetLevel() {
        if (!this.ensureDaily(() => void this.resetLevel())) return;
        this.consumeDaily();
        this.rescueUsed = false;
        this.loseReason = '';
        this.rockWarned = false;
        this.interactionLocked = false;
        this.hud?.hideResult();
        this.hud?.hidePauseMenu();
        this.hud?.clearHint();
        // 新一局重置得分与连击（历史最佳已在上一局结算时落盘）。
        this.score = 0;
        this.combo = 0;
        this.lastMatchAt = -99;
        this.idleTime = 0;
        this.hud?.setScore(0);
        for (const e of this.tray.entries) {
            if (e.node.isValid) e.node.destroy();
        }
        for (const t of this.node.getComponentsInChildren(ItemTag)) {
            if (t.node.isValid) t.node.destroy();
        }
        this.tray.clear();
        this.hud?.setTrayCount(0);
        this.hud?.clearCapturedModels();
        this.removedCount = 0;
        this.level = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
        this.timeLeft = this.level.timeSec;
        this.hud?.setLevel(this.levelIndex + 1);
        if (this.msgLabel) this.msgLabel.string = '';
        if (this.hud) this.hud.subMsgLabel.string = '';
        // 进入新关卡时可能出现首次使用的物件种类,补加载对应 Prefab。
        await this.prefabs.loadAll(this.levelPrefabIds());
        this.spawnItems();
        this.paused = false;
        this.hud?.setPaused(false);
        this.playing = true;
        this.updateHud();
    }

    /** 暂停键：打开带「继续 / 重开本关 / 音效开关」的菜单，而不是原地空转。 */
    private togglePause() {
        if (!this.playing) return;
        if (this.paused) { this.resumeFromPause(); return; }
        this.paused = true;
        this.hud?.setPaused(true);
        this.hud?.clearHint();
        this.hud?.showPauseMenu({
            soundOn: this.audio?.soundOn ?? true,
            onResume: () => this.resumeFromPause(),
            onRestart: () => {
                this.resumeFromPause();
                void this.resetLevel();
            },
            onToggleSound: () => this.toggleSound(),
        });
    }

    /** 声音开关的唯一入口：HUD 声音键和暂停菜单都走这里，图标才不会和实际状态脱节。 */
    private toggleSound(): boolean {
        const on = this.audio?.toggleSound() ?? false;
        this.hud?.setSoundOn(on);
        return on;
    }

    private resumeFromPause() {
        this.hud?.hidePauseMenu();
        this.paused = false;
        this.idleTime = 0;
        this.hud?.setPaused(false);
    }

    /**
     * 选皮面板期间挂起计时与物理巡检，关闭后恢复到打开前的状态。
     * 不动 HUD 暂停键图标/文案：面板有全屏遮罩，期间它们本就被盖住。
     */
    private setOverlayPause(open: boolean) {
        if (!this.playing) return;
        if (open) {
            this.overlayPrevPaused = this.paused;
            this.paused = true;
        } else {
            this.paused = this.overlayPrevPaused;
        }
    }

    private updateHud() {
        if (this.hud) this.hud.setProgress(this.progress);
        else if (this.progressLabel) this.progressLabel.string = `完成度 ${this.progress}%`;
        if (this.timerLabel) {
            const m = Math.floor(this.timeLeft / 60);
            const s = Math.floor(this.timeLeft % 60);
            this.timerLabel.string = `${m}:${s.toString().padStart(2, '0')}`;
        }
    }
}
