import {
    _decorator, Component, Node, Camera, Label, instantiate,
    RigidBody, BoxCollider, Collider, CylinderCollider, EAxisDirection, MeshRenderer,
    PhysicsSystem, input, Input, EventTouch, tween, Tween, v3, Vec3, Quat, Mat4, geometry, screen,
    Layers, PhysicsMaterial, Color,
} from 'cc';
import { DebugViz } from './DebugViz';
import { LEVELS, LevelDef } from './LevelConfig';
import { SceneSkin, getSkin, DEFAULT_SKIN_ID } from './SceneSkin';
import { ContainerBoundary, BoundaryDef } from './ContainerBoundary';
import { SlotTray, TRAY_CAPACITY } from './SlotTray';
import { ItemTag } from './ItemTag';
import { PrefabCache } from './PrefabCache';
import { PilePatrol } from './PilePatrol';
import { SaveData } from './SaveData';
import { HudUI, PropKind } from './HudUI';
import { SceneBackground } from './SceneBackground';
import { AudioMan } from './AudioMan';

const { ccclass, property } = _decorator;

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
    private loseReason: '槽位已满' | '时间到' | '' = '';
    private dailyLeft = GameManager.DAILY_FREE;
    /** 判负缓冲和自动吸取期间锁住手动输入，保证槽位状态原子化。 */
    private interactionLocked = false;
    /** 各关历史最佳:{ [levelIndex]: { stars, progress } } */
    private best: Record<number, { stars: number; progress: number }> = {};

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
    /** 基准物件缩放(对应满关 66 件)。调大 = 模型整体更大更饱满。 */
    private static readonly PILE_ITEM_BASE = 0.65;
    /** 少件关卡放大后的上限,防止超出容器。与 BASE 同向调。 */
    private static readonly PILE_ITEM_MAX = 0.78;
    /** 投放盘扩张半径系数:越小物件越往中心落、越易相互穿插。
     *  0.58→0.72:向外铺开,降低中央堆叠的初始深插——这是穿插与落定抖动的共同根源。 */
    private static readonly PILE_SPREAD = 0.72;
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
        // 皮肤要在建盒之前定好：getSkin 对未知/损坏 id 回落默认皮肤。
        this.skinId = getSkin(SaveData.getSkin()).id;
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
            id => this.applySkin(id), () => this.skinId, open => this.setOverlayPause(open));
        this.timerLabel = this.hud.timerLabel;
        this.progressLabel = this.hud.progressLabel;
        this.msgLabel = this.hud.msgLabel;
        this.audio = new AudioMan(this.node.scene);
        this.loadProps();
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
        // 次数耗尽时不能靠刷新页面免费开新局；MVP 用立即成功的广告占位补一次。
        if (this.dailyLeft <= 0) {
            this.hud.showNotice('今日次数用完', '每天可免费挑战 3 次\n看段广告补充 1 次吧',
                '看广告 +1', () => {
                    this.dailyLeft++;
                    this.saveDaily();
                    this.hud?.hideResult();
                    void this.startInitialRound();
                });
            return;
        }
        await this.startInitialRound();
    }

    /** 首次进入关卡的统一入口：确认有次数后再扣减、加载和生成。 */
    private async startInitialRound() {
        this.consumeDaily();
        await this.prefabs.loadAll(this.level.items);
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

    /** 记录本关成绩,返回是否刷新纪录。 */
    private recordBest(lvl: number, stars: number, progress: number): boolean {
        const prev = this.best[lvl];
        const better = !prev || progress > prev.progress
            || (progress === prev.progress && stars > prev.stars);
        if (better) {
            this.best[lvl] = { stars, progress };
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
        this.updateHud();
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
        this.totalCount = queue.length;
        // 66 件对应 BASE;件数减少按体积等比放大,上限 MAX 防止超出容器。
        this.itemScale = Math.min(GameManager.PILE_ITEM_MAX,
            GameManager.PILE_ITEM_BASE * Math.cbrt(66 / Math.max(1, queue.length)));

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
                const angle = idx * 2.399963 + (this.levelRandom() - 0.5) * 0.3;
                // 半径随投放进度连续扩大：视觉上仍是从中心长出一堆，
                // 但后续物件会自然填满篮底，不会永远压在后半区。
                // 种子盘按容器内切半径缩放：矩形为 1（行为不变），更小的圆容器自动收窄。
                const radius = (0.1 + Math.sqrt(index / Math.max(1, queue.length - 1)) * GameManager.PILE_SPREAD)
                    * this.boundary.seedScale();
                // 生成点抬到可视区外的高处：物件是"倒进来"的，而不是在画面里凭空出现。
                n.setPosition(
                    this.boundary.centerX + Math.cos(angle) * radius + (this.levelRandom() - 0.5) * 0.12,
                    4.2 + (idx % 5) * 0.22,
                    this.boundary.centerZ + 0.1
                        + Math.sin(angle) * radius * 0.72
                        + (this.levelRandom() - 0.5) * 0.08,
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
    private settleNearRemoved(center: Vec3) {
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
        if (p.y < screen.windowSize.height * 0.2) return; // 2D 收集区 + 道具栏，不穿透拾取
        const tag = this.hitTestAt(p.x, p.y);
        if (tag) this.pick(tag.node, tag);
    }

    /**
     * 双通道命中检测（供 onTouch 与自动化测试共用）：
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
        const removedPos = node.worldPosition.clone();
        const screenPos = v3();
        this.cam.worldToScreen(node.worldPosition, screenPos);
        // 物理组件失效，交给 Tween 接管
        node.getComponent(RigidBody)!.enabled = false;
        node.getComponent(Collider)!.enabled = false;

        const { matched, full, index } = this.tray.add(tag.id, node);
        this.audio?.play(tag.id === 'goose' ? 'honk' : 'pick');
        this.hud?.pickBurst(screenPos);
        this.hud?.captureModel(node, screenPos, index);
        this.reflowTray();
        this.settleNearRemoved(removedPos);
        this.scheduleOnce(() => this.audio?.play('drop', 0.5), 0.3);

        if (matched) {
            // 飞入动画结束后再消除
            this.scheduleOnce(() => {
                this.audio?.play('match');
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
                this.reflowTray();
                this.updateHud();
                if (this.removedCount >= this.totalCount) this.gameOver(true, '全部消除！');
            }, 0.35);
        } else if (full) {
            // 数据层已经满 7 格，立即锁住输入；否则 0.4s 动画窗口内的连点会塞入第 8 格。
            this.interactionLocked = true;
            this.scheduleOnce(() => this.gameOver(false, '槽位已满'), 0.4);
        }
    }

    // ---------- 道具 ----------

    private propCounts: Record<PropKind, number> = { remove: 3, magnet: 3, shuffle: 3 };
    private static readonly PROP_NAMES: Record<PropKind, string> = { remove: '移出', magnet: '凑齐', shuffle: '打乱' };

    private loadProps() {
        this.propCounts = { ...this.propCounts, ...SaveData.getProps({}) };
        this.refreshPropHud();
    }

    private saveProps() {
        SaveData.setProps(this.propCounts);
        this.refreshPropHud();
    }

    private refreshPropHud() {
        if (!this.hud) return;
        for (const k of ['remove', 'magnet', 'shuffle'] as PropKind[]) {
            this.hud.setPropCount(k, GameManager.PROP_NAMES[k], this.propCounts[k]);
        }
    }

    useProp(kind: PropKind) {
        if (!this.playing || this.paused || this.interactionLocked) return;
        if (this.propCounts[kind] <= 0) return;
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
        this.scheduleOnce(() => { this.interactionLocked = false; }, picks.length * 0.18 + 0.4);
        return true;
    }

    /** 打乱：盒中剩余物件重新抛起洗一遍 */
    private propShuffle(): boolean {
        const boxItems = this.node.getComponentsInChildren(ItemTag).filter(t => !t.picked && t.node.isValid);
        if (boxItems.length === 0) return false;
        this.shuffleInPlace(boxItems);
        for (const [i, t] of boxItems.entries()) {
            // 重洗也沿用中央灌入，保证容器变化后仍自然向边缘摊开。种子盘随边界缩放。
            const angle = (i + 1) * 2.399963;
            const radius = (0.1 + Math.sqrt(i / Math.max(1, boxItems.length - 1)) * GameManager.PILE_SPREAD)
                * this.boundary.seedScale();
            t.node.setWorldPosition(
                this.boundary.centerX + Math.cos(angle) * radius + (Math.random() - 0.5) * 0.1,
                1.55 + (i % 6) * 0.1,
                this.boundary.centerZ + 0.1
                    + Math.sin(angle) * radius * 0.72
                    + (Math.random() - 0.5) * 0.06);
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

    private gameOver(win: boolean, reason: string) {
        if (!this.playing) return;
        this.playing = false;
        this.interactionLocked = false;
        this.paused = false;
        this.hud?.setPaused(false);
        this.loseReason = win ? '' : (reason === '槽位已满' ? '槽位已满' : '时间到');
        this.audio?.play(win ? 'win' : 'lose');
        const stars = this.progress >= 100 ? 3 : this.progress >= 70 ? 2 : this.progress >= 50 ? 1 : 0;
        // 星级奖励：一星+移出、二星再+凑齐、三星再+打乱
        if (stars >= 1) this.propCounts.remove++;
        if (stars >= 2) this.propCounts.magnet++;
        if (stars >= 3) this.propCounts.shuffle++;
        if (stars > 0) this.saveProps();
        console.log(`[GameManager] ${win ? '胜利' : `失败（${reason}）`} 完成度 ${this.progress}%`);

        const finishedLevel = this.levelIndex;
        const newRecord = this.recordBest(finishedLevel, stars, this.progress);
        const prevBest = this.best[finishedLevel];

        // 胜利推进关卡并持久化；最后一关通关后停在最后一关反复挑战。
        const wasLast = this.levelIndex >= LEVELS.length - 1;
        if (win && !wasLast) {
            this.levelIndex++;
            SaveData.setLevel(this.levelIndex);
        }
        const actionText = win ? (wasLast ? '再来一局' : '下一关') : '再试一次';
        // 失败且本轮未救过 → 提供一次救场：槽满退 3 件 / 超时加 60 秒。
        const canRescue = !win && !this.rescueUsed
            && (this.loseReason === '时间到' || this.tray.count >= 3);
        // 给消除动画/星星心理预期留 0.6 秒再弹结算。
        // 原地重置而不重载场景——loadScene 后自定义管线的主相机会停止渲染。
        this.scheduleOnce(() => {
            this.hud?.showResult({
                win, stars, progress: this.progress, rewardCount: stars, actionText,
                bestText: prevBest ? `历史最佳 ${'★'.repeat(prevBest.stars) || '—'} ${prevBest.progress}%` : '',
                newRecord,
                rescueText: canRescue
                    ? (this.loseReason === '槽位已满' ? '救一下:退回 3 件' : '救一下:+60 秒') : '',
                onRescue: canRescue ? () => this.rescue() : undefined,
                onAction: () => this.resetLevel(),
            });
        }, 0.6);
    }

    /**
     * 失败救场(每轮一次)。MVP 直接生效;接入微信后此入口改为激励视频回调。
     * 槽满:槽头 3 件退回堆里腾出空间;超时:加 60 秒。
     */
    private rescue() {
        if (this.rescueUsed || this.playing) return;
        this.rescueUsed = true;
        this.interactionLocked = false;
        this.hud?.hideResult();
        this.audio?.play('prop');
        if (this.loseReason === '槽位已满') {
            const back = this.tray.takeFront(3);
            this.returnItemsToPile(back);
        } else {
            this.timeLeft += 60;
        }
        this.playing = true;
        this.updateHud();
    }

    /** 原地开始 levelIndex 指向的关卡（重试当前关或进入下一关） */
    private async resetLevel() {
        // 每日次数门:用完先弹补充入口(MVP 直接 +1;接微信后换激励视频回调)。
        if (this.dailyLeft <= 0) {
            this.hud?.showNotice('今日次数用完', '每天可免费挑战 3 次\n看段广告补充 1 次吧',
                '看广告 +1', () => {
                    this.dailyLeft++;
                    this.saveDaily();
                    this.resetLevel();
                });
            return;
        }
        this.consumeDaily();
        this.rescueUsed = false;
        this.loseReason = '';
        this.interactionLocked = false;
        this.hud?.hideResult();
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
        await this.prefabs.loadAll(this.level.items);
        this.spawnItems();
        this.paused = false;
        this.hud?.setPaused(false);
        this.playing = true;
        this.updateHud();
    }

    private togglePause() {
        if (!this.playing) return;
        this.paused = !this.paused;
        this.hud?.setPaused(this.paused);
        if (this.msgLabel) this.msgLabel.string = this.paused ? '暂停' : '';
        if (this.hud) this.hud.subMsgLabel.string = this.paused ? '点击左上角继续' : '';
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
