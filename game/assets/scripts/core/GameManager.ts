import {
    _decorator, Component, Node, Camera, Label, Prefab, resources, instantiate,
    RigidBody, BoxCollider, MeshRenderer, Material, primitives, utils,
    PhysicsSystem, input, Input, EventTouch, tween, Tween, v3, Vec3, Quat, Mat4, Color, geometry, screen,
    assetManager, EffectAsset, Layers, Texture2D, sys, PhysicsMaterial,
} from 'cc';
import { LEVELS, LevelDef } from './LevelConfig';
import { SlotTray, TRAY_CAPACITY } from './SlotTray';
import { ItemTag } from './ItemTag';
import { MODEL_PREFAB_UUID } from './ModelManifest';
import { HudUI, PropKind } from './HudUI';
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
    private prefabs = new Map<string, Prefab>();
    private hud: HudUI | null = null;
    private audio: AudioMan | null = null;
    private pileMaterial!: PhysicsMaterial;
    private static readonly LEVEL_STORE = 'goose_level_v1';

    /**
     * 手机屏幕内的真实物理盒边界。
     * 正交相机在 390×844 下横向约可见 ±1.96；左右内壁为 ±1.35，
     * 与可见木框内沿对齐，并给密集堆叠留出足够空间，避免刚体长期互相挤压。
     * Z 方向与可见木盒的后沿(-2.38)和前沿(0.63)对齐。
     */
    private static readonly FENCE_HALF_X = 1.35;
    private static readonly FENCE_CENTER_Z = -0.88;
    private static readonly FENCE_HALF_Z = 1.42;
    /** 模型外轮廓允许占用的最终可见范围（不是节点中心范围）。 */
    private static readonly VISIBLE_HALF_X = 1.70;
    private static readonly VISIBLE_MIN_Z = -2.25;
    private static readonly VISIBLE_MAX_Z = 0.48;
    private settleToken = 0;
    /** 本关物件基准缩放:少件关卡放大物件,保证盒子饱满、目标好点。 */
    private itemScale = 0.46;

    onLoad() {
        this.pileMaterial = new PhysicsMaterial();
        // 高摩擦、低回弹：物件落下后互相咬住形成稳定堆，而不是像冰块一样摊成一层。
        this.pileMaterial.setValues(1.25, 0.9, 0.9, 0.01);
        // 模板场景可能保存过倾斜的物理重力；这里强制为世界竖直方向，
        // 否则物件落地后会持续滑向篮子后侧，看起来像堆叠算法失效。
        PhysicsSystem.instance.gravity = v3(0, -12, 0);
        // 小物件 + 薄片需要更密的物理步进；CCD 负责线性高速运动，子步负责接触堆叠和旋转。
        PhysicsSystem.instance.maxSubSteps = 6;
        PhysicsSystem.instance.fixedTimeStep = 1 / 90;
        PhysicsSystem.instance.sleepThreshold = 0.15;
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
        // 相机可见性必须包含 DEFAULT 层，否则代码创建的节点全部不渲染
        if (this.cam) {
            this.cam.visibility |= Layers.Enum.DEFAULT;
            console.log('[GameManager] 相机 visibility=', this.cam.visibility.toString(2));
        }
        this.forceLayer(this.node);
        // HUD（纯代码占位版）
        this.hud = new HudUI(this.node.scene, kind => this.useProp(kind), () => this.togglePause());
        this.timerLabel = this.hud.timerLabel;
        this.progressLabel = this.hud.progressLabel;
        this.msgLabel = this.hud.msgLabel;
        this.audio = new AudioMan(this.node.scene);
        this.loadProps();
        // 关卡进度本地存储:上次通到第几关,这次直接从那关开始。
        try {
            const saved = parseInt(sys.localStorage.getItem(GameManager.LEVEL_STORE) ?? '', 10);
            if (!isNaN(saved)) this.levelIndex = Math.max(0, Math.min(saved, LEVELS.length - 1));
        } catch { /* 存储不可用则从配置默认关开始 */ }
        this.level = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
        this.timeLeft = this.level.timeSec;
        this.hud.setLevel(this.levelIndex + 1);
        await this.loadPrefabs(this.level.items);
        this.spawnItems();
        this.playing = true;
        this.updateHud();
    }

    /** 递归把节点树全部放进 DEFAULT 渲染层（代码创建的节点 layer 可能为 0 → 任何相机都不画） */
    private forceLayer(n: Node) {
        n.layer = Layers.Enum.DEFAULT;
        for (const c of n.children) this.forceLayer(c);
    }

    private patrolTimer = 0;

    update(dt: number) {
        this.hud?.sync();
        if (!this.playing || this.paused) return;
        // 手机切后台/浏览器标签页恢复时可能一次传入数百秒 dt；游戏计时应近似暂停，
        // 不能因为系统挂起而瞬间耗尽。物理仍由 fixedTimeStep + maxSubSteps 独立求解。
        const frameDt = Math.min(dt, 0.1);
        // 逃逸回收 + 限速：物理墙是第一层保护，短周期巡检是高速/低帧率下的兜底。
        this.patrolTimer += frameDt;
        if (this.patrolTimer > 0.15) {
            this.patrolTimer = 0;
            // 中心点巡检只处理真正穿墙；可见外轮廓由 constrainVisualInside 单独保护。
            // 不再在墙内反复“拉回”，否则密集刚体会被持续重新唤醒并产生抖动。
            const limX = GameManager.FENCE_HALF_X + 0.15;
            const minZ = GameManager.FENCE_CENTER_Z - GameManager.FENCE_HALF_Z - 0.15;
            const maxZ = GameManager.FENCE_CENTER_Z + GameManager.FENCE_HALF_Z + 0.15;
            const vel = v3();
            for (const t of this.node.getComponentsInChildren(ItemTag)) {
                if (t.picked || !t.node.isValid) continue;
                const body = t.node.getComponent(RigidBody);
                // 已锁定的运动学物件不会越界，也不再做位置/速度修正，确保绝对静止。
                if (body?.type === RigidBody.Type.KINEMATIC) continue;
                // GLB 的根节点、视觉网格和碰撞体不一定同中心；直接约束真实网格外轮廓，
                // 避免“节点没越界、模型已经露出屏幕”的情况。
                const visualCorrected = this.constrainVisualInside(t.node);
                const p = t.node.worldPosition;
                const escaped = Math.abs(p.x) > limX || p.z < minZ || p.z > maxZ || p.y < -0.05;
                if (escaped) {
                    t.node.setWorldPosition(
                        (Math.random() - 0.5) * 1.4,
                        1.8,
                        GameManager.FENCE_CENTER_Z + (Math.random() - 0.5) * 1.2,
                    );
                    const rb = t.node.getComponent(RigidBody);
                    try { rb?.clearState(); } catch { /* 忽略 */ }
                    rb?.setLinearVelocity(v3(0, -0.2, 0));
                    rb?.setAngularVelocity(v3());
                    continue;
                }
                if (visualCorrected) {
                    const rb = t.node.getComponent(RigidBody);
                    if (rb?.enabled) {
                        rb.getLinearVelocity(vel);
                        rb.setLinearVelocity(v3(0, Math.min(vel.y, 0), 0));
                        rb.setAngularVelocity(v3());
                    }
                }
                // 限速：物理爆弹产生的极端速度是隧穿与飞出的源头
                const rb = t.node.getComponent(RigidBody);
                if (rb && rb.enabled) {
                    rb.getLinearVelocity(vel);
                    const sp = vel.length();
                    if (sp > 4.5) {
                        vel.multiplyScalar(4.5 / sp);
                        rb.setLinearVelocity(vel);
                    }
                }
            }
        }
        this.timeLeft -= frameDt;
        if (this.timeLeft <= 0) {
            this.timeLeft = 0;
            this.gameOver(false, '时间到');
        }
        this.updateHud();
    }

    // ---------- 场景搭建 ----------

    private buildBox() {
        // 深红木展示篮：底板、厚框、内沿和格栅都是真 3D，接近参考图的动态容器感。
        const floorMat = this.makeMat(new Color(93, 45, 33), 'wood_floor');
        const frameMat = this.makeMat(new Color(72, 28, 22), 'wood_dark');
        const rimMat = this.makeMat(new Color(137, 72, 48), 'wood_floor');
        const goldMat = this.makeMat(new Color(205, 151, 62));
        const shadowMat = this.makeMat(new Color(39, 18, 17));

        // 碰撞地基顶面保持 y=0，厚地基继续防止高速物件穿底。
        // 视觉底板可以按容器造型裁短，但物理底板必须始终居中覆盖整个围栏；
        // 两者拆开，避免换容器外观时意外把碰撞地面一起平移。
        this.makeInvisibleWall('basketFloorCollider', v3(0, -2.25, -0.88), v3(4.1, 4.5, 4.15));
        this.makeVisualBox('basketFloor', v3(0, -0.25, -0.92), v3(3.48, 0.5, 3.35), floorMat);
        this.makeVisualBox('basketShadow', v3(0, -0.64, -0.86), v3(3.94, 0.34, 4.0), shadowMat);
        this.makeVisualBox('basketBase', v3(0, -0.48, -0.88), v3(4.08, 0.26, 3.78), frameMat);

        // 可见围框：后框更高、前框更低，既有容器深度又不遮挡点击。
        this.makeVisualBox('rimBackOuter', v3(0, 0.46, -2.62), v3(4.04, 1.1, 0.36), frameMat);
        this.makeVisualBox('rimBackInner', v3(0, 0.42, -2.38), v3(3.52, 0.72, 0.18), rimMat);
        this.makeVisualBox('rimLeftOuter', v3(-1.88, 0.38, -0.92), v3(0.36, 0.94, 3.55), frameMat);
        this.makeVisualBox('rimRightOuter', v3(1.88, 0.38, -0.92), v3(0.36, 0.94, 3.55), frameMat);
        this.makeVisualBox('rimLeftInner', v3(-1.62, 0.28, -0.92), v3(0.16, 0.58, 3.25), rimMat);
        this.makeVisualBox('rimRightInner', v3(1.62, 0.28, -0.92), v3(0.16, 0.58, 3.25), rimMat);
        this.makeVisualBox('rimFrontOuter', v3(0, 0.08, 0.82), v3(4.04, 0.34, 0.36), frameMat);
        this.makeVisualBox('rimFrontHighlight', v3(0, 0.22, 0.63), v3(3.52, 0.1, 0.12), rimMat);

        // 底部纵向木格栅提供与参考菜篮相同的空间层次，但保留完整碰撞底板。
        for (let i = -2; i <= 2; i++) {
            this.makeVisualBox(`floorSlat${i}`, v3(i * 0.58, 0.018, -0.92), v3(0.13, 0.05, 3.05), rimMat);
        }
        // 金色铰链/角件让容器更像独立可动的展示盒。
        this.makeVisualBox('hingeLeft', v3(-1.89, 0.42, -1.15), v3(0.08, 0.62, 0.22), goldMat);
        this.makeVisualBox('hingeRight', v3(1.89, 0.42, -1.15), v3(0.08, 0.62, 0.22), goldMat);

        // 隐形围栏（只有碰撞体，无渲染）：厚 1.2、下探到台面以下，杜绝高速隧穿和底缝钻出
        // 矩形内壁严格贴合手机画面中的可见木盒，前后不再留出“看不见但能滚入”的区域。
        const WH = 7, WT = 1.2, WY = WH / 2 - 1; // 竖向覆盖 -1 ~ 6
        const FX = GameManager.FENCE_HALF_X;
        const FZ = GameManager.FENCE_HALF_Z;
        const CZ = GameManager.FENCE_CENTER_Z;
        this.makeInvisibleWall('fenceN', v3(0, WY, CZ - FZ - WT / 2), v3(FX * 2 + WT * 2, WH, WT));
        this.makeInvisibleWall('fenceS', v3(0, WY, CZ + FZ + WT / 2), v3(FX * 2 + WT * 2, WH, WT));
        this.makeInvisibleWall('fenceW', v3(-FX - WT / 2, WY, CZ), v3(WT, WH, FZ * 2));
        this.makeInvisibleWall('fenceE', v3(FX + WT / 2, WY, CZ), v3(WT, WH, FZ * 2));

        // 大背景板 + 外框，模拟参考图中玻璃柜/木柜环境。
        const bg = this.makeMat(new Color(255, 255, 255), 'backdrop', false);
        this.makeVisualBox('backdrop', v3(0, -0.92, -2), v3(44, 0.1, 44), bg);
        this.makeVisualBox('cabinetLeft', v3(-3.25, -0.46, -0.2), v3(0.34, 0.32, 12), frameMat);
        this.makeVisualBox('cabinetRight', v3(3.25, -0.46, -0.2), v3(0.34, 0.32, 12), frameMat);

        // 七格收集区属于屏幕 HUD，由 HudUI 负责；世界空间只保留可替换的 3D 容器。
    }

    /** 只有物理没有外观的围栏 */
    private makeInvisibleWall(name: string, pos: Vec3, size: Vec3) {
        const n = new Node(name);
        n.setParent(this.node);
        n.setPosition(pos);
        const rb = n.addComponent(RigidBody);
        rb.type = RigidBody.Type.STATIC;
        const col = n.addComponent(BoxCollider);
        col.size = size;
        col.sharedMaterial = this.pileMaterial;
    }

    /** 只有外观没有物理的盒子（槽位垫片等） */
    private makeVisualBox(name: string, pos: Vec3, size: Vec3, mat: Material | null) {
        const n = new Node(name);
        n.setParent(this.node);
        n.setPosition(pos);
        const mr = n.addComponent(MeshRenderer);
        mr.mesh = utils.MeshUtils.createMesh(primitives.box({ width: size.x, height: size.y, length: size.z }));
        if (mat && mat.passes.length > 0) mr.material = mat;
    }

    /**
     * 创建材质。lit=true 用 standard（受光照/能接收阴影层次），否则 unlit。
     * 注意：unlit 与 standard 的颜色/贴图属性名不同，且 setProperty 传错名只警告不抛错，
     * 必须按 effect 精确选择属性名。
     */
    private makeMat(color: Color, texture?: string, lit = true): Material | null {
        const order = lit
            ? ['builtin-standard', 'standard', 'builtin-unlit', 'unlit']
            : ['builtin-unlit', 'unlit', 'builtin-standard', 'standard'];
        const effectName = order.find(n => EffectAsset.get(n));
        if (!effectName) {
            console.warn('[GameManager] 未找到可用 builtin effect');
            return null;
        }
        const isUnlit = effectName.includes('unlit');
        const defines = texture ? (isUnlit ? { USE_TEXTURE: true } : { USE_ALBEDO_MAP: true }) : {};
        const mat = new Material();
        mat.initialize({ effectName, defines });
        try { mat.setProperty(isUnlit ? 'mainColor' : 'albedo', color); } catch { /* 属性名不符则用默认色 */ }
        if (!isUnlit) {
            try { mat.setProperty('roughness', 0.85); } catch { /* 可选参数 */ }
        }
        if (texture) {
            resources.load(`textures/${texture}/texture`, Texture2D, (err, tex) => {
                if (err || !tex || mat.passes.length === 0) return;
                try { mat.setProperty(isUnlit ? 'mainTexture' : 'albedoMap', tex); } catch { /* 忽略 */ }
            });
        }
        return mat;
    }

    private makeStaticBox(name: string, pos: Vec3, size: Vec3, mat: Material | null,
        collSize?: Vec3, collCenter?: Vec3) {
        const n = new Node(name);
        n.setParent(this.node);
        n.setPosition(pos);
        const mr = n.addComponent(MeshRenderer);
        mr.mesh = utils.MeshUtils.createMesh(primitives.box({ width: size.x, height: size.y, length: size.z }));
        if (mat && mat.passes.length > 0) mr.material = mat;
        const rb = n.addComponent(RigidBody);
        rb.type = RigidBody.Type.STATIC;
        const col = n.addComponent(BoxCollider);
        col.size = collSize ?? size;
        if (collCenter) col.center = collCenter;
    }

    // ---------- 物件加载与生成 ----------

    /** glb 是容器资源，Prefab 子资源路径随导入设置不同而不同，逐一尝试 */
    private loadOnePrefab(id: string): Promise<Prefab | null> {
        const candidates = [
            `models/${id}/${id}`,   // glb 容器内的同名 prefab 子资源
            `models/${id}`,         // 直接按路径
        ];
        return new Promise((resolve) => {
            const tryAt = (i: number) => {
                if (i >= candidates.length) {
                    // 路径都不行 → 按 meta 里的 uuid 直载（ModelManifest 自动生成）
                    const uuid = MODEL_PREFAB_UUID[id];
                    if (!uuid) {
                        console.error(`[GameManager] 加载模型失败：${id}（路径已试 ${candidates.join(' | ')}，且无 uuid 记录）`);
                        resolve(null);
                        return;
                    }
                    assetManager.loadAny({ uuid }, (err: Error | null, prefab: Prefab) => {
                        if (err || !prefab) {
                            console.error(`[GameManager] 加载模型失败：${id}（路径与 uuid 均失败）`, err);
                            resolve(null);
                        } else {
                            console.log(`[GameManager] 模型 ${id} 通过 uuid 加载成功`);
                            resolve(prefab);
                        }
                    });
                    return;
                }
                resources.load(candidates[i], Prefab, (err, prefab) => {
                    if (err || !prefab) { tryAt(i + 1); return; }
                    console.log(`[GameManager] 模型 ${id} 加载成功，路径：${candidates[i]}`);
                    resolve(prefab);
                });
            };
            tryAt(0);
        });
    }

    private loadPrefabs(ids: string[]): Promise<void> {
        return Promise.all(ids.map(async id => {
            const prefab = await this.loadOnePrefab(id);
            if (prefab) this.prefabs.set(id, prefab);
        })).then(() => {});
    }

    private spawnItems() {
        const queue: string[] = [];
        for (const id of this.level.items) {
            const prefab = this.prefabs.get(id);
            if (!prefab) continue;
            const count = this.level.groupsPerItem * 3;
            for (let i = 0; i < count; i++) queue.push(id);
        }
        this.shuffleInPlace(queue);
        this.totalCount = queue.length;
        // 66 件对应 0.46;件数减少按体积等比放大,上限 0.64 防止超出容器。
        this.itemScale = Math.min(0.64, 0.46 * Math.cbrt(66 / Math.max(1, queue.length)));

        queue.forEach((id, index) => {
            const prefab = this.prefabs.get(id)!;
            const idx = index + 1;
            // 参考录屏约 2.5~3 秒灌满容器；逐件投放保留真实碰撞过程，
            // 同时避免同一帧生成几十个刚体导致求解器爆开。
            const delay = idx * 0.048;
            this.scheduleOnce(() => {
                const n = instantiate(prefab);
                n.setParent(this.node);
                this.forceLayer(n);
                // 从篮筐中央上方连续落下：先堆中心，再由真实碰撞向四周摊开。
                // 低差异圆盘采样避免完全同轴，也不会像黄金螺旋预铺那样显得人工整齐。
                const angle = idx * 2.399963 + (Math.random() - 0.5) * 0.3;
                // 半径随投放进度连续扩大：视觉上仍是从中心长出一堆，
                // 但后续物件会自然填满篮底，不会永远压在后半区。
                const radius = 0.1 + Math.sqrt(index / Math.max(1, queue.length - 1)) * 0.58;
                n.setPosition(
                    Math.cos(angle) * radius + (Math.random() - 0.5) * 0.12,
                    1.55 + (idx % 5) * 0.1,
                    GameManager.FENCE_CENTER_Z + 0.1
                        + Math.sin(angle) * radius * 0.72
                        + (Math.random() - 0.5) * 0.08,
                );
                // 参考录屏中单件约为篮宽的 1/6；66 件时形成紧凑但不过高的堆。
                const scale = this.itemScale + (idx % 4) * 0.012;
                n.setScale(scale, scale, scale);

                const tag = n.addComponent(ItemTag);
                tag.id = id;
                const rb = n.addComponent(RigidBody);
                rb.mass = 0.85 + (idx % 3) * 0.1;
                rb.angularDamping = 0.97;
                rb.linearDamping = 0.92;
                rb.sleepThreshold = 0.15;
                rb.useCCD = true;
                const col = n.addComponent(BoxCollider);
                col.sharedMaterial = this.pileMaterial;
                this.centerVisualAndFitCollider(n, col);
                this.setNaturalRotation(n, id);
                rb.setLinearVelocity(v3(
                    (Math.random() - 0.5) * 0.12,
                    -0.25,
                    (Math.random() - 0.5) * 0.12,
                ));
                rb.setAngularVelocity(v3(
                    (Math.random() - 0.5) * 0.35,
                    (Math.random() - 0.5) * 0.35,
                    (Math.random() - 0.5) * 0.35,
                ));
                // 物件投平面阴影
                for (const mr of n.getComponentsInChildren(MeshRenderer)) {
                    mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.ON;
                }
            }, delay);
        });
        // 最后一件落下后再给物理约 0.9 秒自然沉降，然后锁定整堆。
        // 这既保留初始化滚动过程，也杜绝接触求解误差造成的无限微抖。
        this.schedulePileSettle(queue.length * 0.048 + 0.9);
        console.log(`[GameManager] 关卡 ${this.levelIndex + 1}：生成 ${this.totalCount} 个物件`);
    }

    /**
     * GLB 场景根节点经常保留 DCC 中的平移（部分模型偏移超过 2 个世界单位）。
     * 旧实现把碰撞盒固定放在 Prefab 根节点，视觉模型却在旁边，物理上没有真正包住模型。
     * 这里读取所有 Mesh 的局部包围盒，统一把视觉内容移回根节点中心，再按真实尺寸生成碰撞盒。
     */
    private centerVisualAndFitCollider(root: Node, collider: BoxCollider) {
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
            // 资源尚未提供 bounds 时使用保守盒，仍比原先 0.75³ 更不容易露出模型。
            collider.size = v3(1.05, 1.05, 1.05);
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

        // 4% 安全余量防视觉表面相交；比旧版 12% 更贴合，避免高密度时出现明显悬空。
        // 薄片仍至少 0.20，配合 CCD 避免单步跨越。
        collider.size = v3(
            Math.max(0.20, (max.x - min.x) * 1.04),
            Math.max(0.20, (max.y - min.y) * 1.04),
            Math.max(0.20, (max.z - min.z) * 1.04),
        );
        collider.center = v3();
    }

    /**
     * 用所有 Mesh 的实时世界包围盒约束可见外轮廓，而不是只检查 Prefab 根节点。
     * 返回 true 表示本帧做过位置修正，调用方会同步清除横向速度，防止下一物理步再次冲出。
     */
    private constrainVisualInside(root: Node): boolean {
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

        let dx = 0;
        let dz = 0;
        if (min.x < -GameManager.VISIBLE_HALF_X) dx = -GameManager.VISIBLE_HALF_X - min.x;
        if (max.x + dx > GameManager.VISIBLE_HALF_X) dx += GameManager.VISIBLE_HALF_X - (max.x + dx);
        if (min.z < GameManager.VISIBLE_MIN_Z) dz = GameManager.VISIBLE_MIN_Z - min.z;
        if (max.z + dz > GameManager.VISIBLE_MAX_Z) dz += GameManager.VISIBLE_MAX_Z - (max.z + dz);
        // 2cm 以下的误差不修正，避免边界附近因浮点噪声来回移动。
        if (Math.abs(dx) < 0.02 && Math.abs(dz) < 0.02) return false;

        const p = root.worldPosition;
        root.setWorldPosition(p.x + dx, p.y, p.z + dz);
        root.updateWorldTransform();
        return true;
    }

    /** 延迟冻结当前堆；token 防止重开、连续拾取时旧定时器误冻新一轮运动。 */
    private schedulePileSettle(delay: number) {
        const token = ++this.settleToken;
        this.scheduleOnce(() => {
            if (token !== this.settleToken || !this.playing || this.paused) return;
            for (const t of this.node.getComponentsInChildren(ItemTag)) {
                if (t.picked || !t.node.isValid) continue;
                this.constrainVisualInside(t.node);
                const rb = t.node.getComponent(RigidBody);
                if (!rb?.enabled) continue;
                rb.clearState();
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
                    this.constrainVisualInside(n);
                    rb.clearState();
                })
                .start();
        }
    }

    /** 限制初始倾斜，避免钱币/玉环直立后高速翻滚造成旋转穿透。 */
    private setNaturalRotation(node: Node, id: string) {
        const flat = id === 'banzhi' || id === 'bracelet' || id === 'pingankou'
            || id === 'tongqian' || id === 'yupai' || id === 'yuzhuo';
        const tilt = flat ? 20 : 32;
        const q = new Quat();
        Quat.fromEuler(
            q,
            (Math.random() - 0.5) * tilt * 2,
            Math.random() * 360,
            (Math.random() - 0.5) * tilt * 2,
        );
        node.setRotation(q);
    }

    private shuffleInPlace<T>(items: T[]) {
        for (let i = items.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [items[i], items[j]] = [items[j], items[i]];
        }
    }

    // ---------- 拾取与三消 ----------

    private onTouch(e: EventTouch) {
        if (!this.playing || this.paused || !this.cam) return;
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
        node.getComponent(BoxCollider)!.enabled = false;

        const { matched, full, index } = this.tray.add(tag.id, node);
        this.audio?.play(tag.id === 'goose' ? 'honk' : 'pick');
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
            this.scheduleOnce(() => this.gameOver(false, '槽位已满'), 0.4);
        }
    }

    // ---------- 道具 ----------

    private static readonly PROP_STORE = 'goose_props_v1';
    private propCounts: Record<PropKind, number> = { remove: 3, magnet: 3, shuffle: 3 };
    private static readonly PROP_NAMES: Record<PropKind, string> = { remove: '移出', magnet: '凑齐', shuffle: '打乱' };

    private loadProps() {
        try {
            const raw = sys.localStorage.getItem(GameManager.PROP_STORE);
            if (raw) this.propCounts = { ...this.propCounts, ...JSON.parse(raw) };
        } catch { /* 损坏则用默认 */ }
        this.refreshPropHud();
    }

    private saveProps() {
        try { sys.localStorage.setItem(GameManager.PROP_STORE, JSON.stringify(this.propCounts)); } catch { /* 存储不可用则仅内存 */ }
        this.refreshPropHud();
    }

    private refreshPropHud() {
        if (!this.hud) return;
        for (const k of ['remove', 'magnet', 'shuffle'] as PropKind[]) {
            this.hud.setPropCount(k, GameManager.PROP_NAMES[k], this.propCounts[k]);
        }
    }

    useProp(kind: PropKind) {
        if (!this.playing || this.paused) return;
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
        back.forEach((e, i) => {
            const tag = e.node.getComponent(ItemTag)!;
            this.hud?.releaseModel(e.node);
            e.node.setParent(this.node);
            this.forceLayer(e.node);
            e.node.active = true;
            tag.picked = false;
            e.node.setWorldPosition(
                (Math.random() - 0.5) * 1.2,
                1.3 + i * 0.5,
                GameManager.FENCE_CENTER_Z + (Math.random() - 0.5) * 1.1,
            );
            e.node.setScale(this.itemScale, this.itemScale, this.itemScale);
            this.setNaturalRotation(e.node, tag.id);
            const rb = e.node.getComponent(RigidBody)!;
            rb.type = RigidBody.Type.DYNAMIC;
            rb.enabled = true;
            rb.wakeUp();
            e.node.getComponent(BoxCollider)!.enabled = true;
        });
        this.reflowTray();
        this.schedulePileSettle(2.2);
        return true;
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
        picks.forEach((t, i) => this.scheduleOnce(() => {
            if (this.playing && t.node.isValid && !t.picked) this.pick(t.node, t);
        }, i * 0.18));
        return true;
    }

    /** 打乱：盒中剩余物件重新抛起洗一遍 */
    private propShuffle(): boolean {
        const boxItems = this.node.getComponentsInChildren(ItemTag).filter(t => !t.picked && t.node.isValid);
        if (boxItems.length === 0) return false;
        this.shuffleInPlace(boxItems);
        for (const [i, t] of boxItems.entries()) {
            // 重洗也沿用中央灌入，保证容器变化后仍自然向边缘摊开。
            const angle = (i + 1) * 2.399963;
            const radius = 0.1 + Math.sqrt(i / Math.max(1, boxItems.length - 1)) * 0.58;
            t.node.setWorldPosition(
                Math.cos(angle) * radius + (Math.random() - 0.5) * 0.1,
                1.55 + (i % 6) * 0.1,
                GameManager.FENCE_CENTER_Z + 0.1
                    + Math.sin(angle) * radius * 0.72
                    + (Math.random() - 0.5) * 0.06);
            this.setNaturalRotation(t.node, t.id);
            const rb = t.node.getComponent(RigidBody)!;
            rb.type = RigidBody.Type.DYNAMIC;
            try { rb.clearState(); } catch { /* 部分版本无此方法，忽略 */ }
            rb.wakeUp();
            rb.setLinearVelocity(v3((Math.random() - 0.5) * 0.4, -0.2, (Math.random() - 0.5) * 0.4));
        }
        this.schedulePileSettle(2.8);
        return true;
    }

    /** 槽中所有物件按当前顺序补位（含飞入中的） */
    private reflowTray() {
        this.tray.entries.forEach((e, i) => {
            this.hud?.moveModelToSlot(e.node, i);
        });
    }

    // ---------- 结算与 HUD ----------

    private get progress(): number {
        return this.totalCount === 0 ? 0 : Math.round((this.removedCount / this.totalCount) * 100);
    }

    private gameOver(win: boolean, reason: string) {
        if (!this.playing) return;
        this.playing = false;
        this.paused = false;
        this.hud?.setPaused(false);
        this.audio?.play(win ? 'win' : 'lose');
        const stars = this.progress >= 100 ? 3 : this.progress >= 70 ? 2 : this.progress >= 50 ? 1 : 0;
        // 星级奖励：一星+移出、二星再+凑齐、三星再+打乱
        if (stars >= 1) this.propCounts.remove++;
        if (stars >= 2) this.propCounts.magnet++;
        if (stars >= 3) this.propCounts.shuffle++;
        if (stars > 0) this.saveProps();
        console.log(`[GameManager] ${win ? '胜利' : `失败（${reason}）`} 完成度 ${this.progress}%`);

        // 胜利推进关卡并持久化；最后一关通关后停在最后一关反复挑战。
        const wasLast = this.levelIndex >= LEVELS.length - 1;
        if (win && !wasLast) {
            this.levelIndex++;
            try { sys.localStorage.setItem(GameManager.LEVEL_STORE, String(this.levelIndex)); } catch { /* 忽略 */ }
        }
        const actionText = win ? (wasLast ? '再来一局' : '下一关') : '再试一次';
        // 给消除动画/星星心理预期留 0.6 秒再弹结算。
        // 原地重置而不重载场景——loadScene 后自定义管线的主相机会停止渲染。
        this.scheduleOnce(() => {
            this.hud?.showResult({
                win, stars, progress: this.progress, rewardCount: stars, actionText,
                onAction: () => this.resetLevel(),
            });
        }, 0.6);
    }

    /** 原地开始 levelIndex 指向的关卡（重试当前关或进入下一关） */
    private async resetLevel() {
        this.hud?.hideResult();
        for (const e of this.tray.entries) {
            if (e.node.isValid) e.node.destroy();
        }
        for (const t of this.node.getComponentsInChildren(ItemTag)) {
            if (t.node.isValid) t.node.destroy();
        }
        this.tray.clear();
        this.hud?.clearCapturedModels();
        this.removedCount = 0;
        this.level = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
        this.timeLeft = this.level.timeSec;
        this.hud?.setLevel(this.levelIndex + 1);
        if (this.msgLabel) this.msgLabel.string = '';
        if (this.hud) this.hud.subMsgLabel.string = '';
        // 进入新关卡时可能出现首次使用的物件种类,补加载对应 Prefab。
        await this.loadPrefabs(this.level.items.filter(id => !this.prefabs.has(id)));
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
