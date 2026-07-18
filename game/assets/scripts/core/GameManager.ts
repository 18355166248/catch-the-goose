import {
    _decorator, Component, Node, Camera, Label, Prefab, resources, instantiate,
    RigidBody, BoxCollider, MeshRenderer, Material, primitives, utils,
    PhysicsSystem, input, Input, EventTouch, tween, Tween, v3, Vec3, Quat, Color, geometry,
    assetManager, EffectAsset, Layers, view, Texture2D, sys,
} from 'cc';
import { LEVELS, LevelDef } from './LevelConfig';
import { SlotTray, TRAY_CAPACITY } from './SlotTray';
import { ItemTag } from './ItemTag';
import { MODEL_PREFAB_UUID } from './ModelManifest';
import { HudUI, PropKind } from './HudUI';

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
    private prefabs = new Map<string, Prefab>();
    private hud: HudUI | null = null;

    // 盒子尺寸
    private static readonly BOX_SIZE = 5;
    private static readonly WALL_H = 1.6;

    // 槽位世界坐标（一排 7 个，位于盒子前方靠近相机处）
    private slotPos(i: number): Vec3 {
        return v3(-2.4 + i * 0.8, 0.4, 3.8);
    }

    onLoad() {
        // 低帧率环境下防物理隧穿（大 dt 单步积分会让物件穿墙）
        PhysicsSystem.instance.maxSubSteps = 4;
        PhysicsSystem.instance.fixedTimeStep = 1 / 60;
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
        this.hud = new HudUI(this.node.scene, kind => this.useProp(kind));
        this.timerLabel = this.hud.timerLabel;
        this.progressLabel = this.hud.progressLabel;
        this.msgLabel = this.hud.msgLabel;
        this.loadProps();
        this.level = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
        this.timeLeft = this.level.timeSec;
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
        if (!this.playing) return;
        // 逃逸回收：物件被挤出盒外或停在墙顶时，抓回盒内重新掉落
        this.patrolTimer += dt;
        if (this.patrolTimer > 2) {
            this.patrolTimer = 0;
            const lim = GameManager.BOX_SIZE / 2 - 0.2;
            for (const t of this.node.getComponentsInChildren(ItemTag)) {
                if (t.picked || !t.node.isValid) continue;
                const p = t.node.worldPosition;
                // 横向越过内壁（含停在墙顶）或掉穿地板才算逃逸；倾倒中的高空物件不误伤
                const escaped = Math.abs(p.x) > lim || Math.abs(p.z) > lim || p.y < -0.6;
                if (escaped) {
                    t.node.setWorldPosition((Math.random() - 0.5) * 2, 2.5, (Math.random() - 0.5) * 2);
                    const rb = t.node.getComponent(RigidBody);
                    try { rb?.clearState(); } catch { /* 忽略 */ }
                }
            }
        }
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) {
            this.timeLeft = 0;
            this.gameOver(false, '时间到');
        }
        this.updateHud();
    }

    // ---------- 场景搭建 ----------

    private buildBox() {
        const S = GameManager.BOX_SIZE, H = GameManager.WALL_H, T = 0.3;
        const wood = this.makeMat(new Color(235, 230, 225), 'wood_dark');
        const woodFloor = this.makeMat(new Color(235, 230, 225), 'wood_floor');
        // 地板 + 四壁（静态刚体）。碰撞体比可见墙高一倍多，物件再蹦也翻不出去
        const wallColl = (w: number, l: number) => v3(w, H * 3, l);
        const wallCenter = v3(0, H, 0);
        this.makeStaticBox('floor', v3(0, -T / 2, 0), v3(S + T * 2, T, S + T * 2), woodFloor);
        this.makeStaticBox('wallN', v3(0, H / 2, -S / 2 - T / 2), v3(S + T * 2, H, T), wood, wallColl(S + T * 2, T), wallCenter);
        this.makeStaticBox('wallS', v3(0, H / 2, S / 2 + T / 2), v3(S + T * 2, H, T), wood, wallColl(S + T * 2, T), wallCenter);
        this.makeStaticBox('wallW', v3(-S / 2 - T / 2, H / 2, 0), v3(T, H, S), wood, wallColl(T, S), wallCenter);
        this.makeStaticBox('wallE', v3(S / 2 + T / 2, H / 2, 0), v3(T, H, S), wood, wallColl(T, S), wallCenter);

        // 大背景木板（铺满视野，替代纯色清屏底）
        const bg = this.makeMat(new Color(120, 112, 105), 'wood_dark');
        this.makeVisualBox('backdrop', v3(0, -0.6, 0), v3(40, 0.1, 40), bg);

        // 槽位垫片（纯视觉，无碰撞）
        const pad = this.makeMat(new Color(240, 235, 225), 'pad_ivory');
        for (let i = 0; i < TRAY_CAPACITY; i++) {
            const p = this.slotPos(i);
            this.makeVisualBox(`slotPad${i}`, v3(p.x, 0.02, p.z), v3(0.72, 0.04, 0.72), pad);
        }
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

    private makeMat(color: Color, texture?: string): Material | null {
        // 不同版本 builtin effect 注册名有差异，逐个候选找可用的
        const candidates = ['builtin-unlit', 'unlit', 'builtin-standard', 'standard'];
        const effectName = candidates.find(n => EffectAsset.get(n));
        if (!effectName) {
            console.warn('[GameManager] 未找到可用 builtin effect，盒子将使用默认材质');
            return null;
        }
        const mat = new Material();
        // 贴图需要在初始化时开宏，否则 setProperty 了也不参与着色
        const defines = texture
            ? (effectName.includes('unlit') ? { USE_TEXTURE: true } : { USE_ALBEDO_MAP: true })
            : {};
        mat.initialize({ effectName, defines });
        for (const prop of ['mainColor', 'albedo']) {
            try { mat.setProperty(prop, color); break; } catch { /* 换下一个属性名 */ }
        }
        if (texture) {
            resources.load(`textures/${texture}/texture`, Texture2D, (err, tex) => {
                if (err || !tex || mat.passes.length === 0) return;
                for (const prop of ['mainTexture', 'albedoMap']) {
                    try { mat.setProperty(prop, tex); break; } catch { /* 换下一个属性名 */ }
                }
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
        const S = GameManager.BOX_SIZE;
        this.totalCount = 0;
        for (const id of this.level.items) {
            const prefab = this.prefabs.get(id);
            if (!prefab) continue;
            const count = this.level.groupsPerItem * 3;
            for (let i = 0; i < count; i++) {
                this.totalCount++;
                // 分批倾倒：一次性全下会互相挤爆并隧穿薄墙
                const delay = this.totalCount * 0.06;
                this.scheduleOnce(() => {
                    const n = instantiate(prefab);
                    n.setParent(this.node);
                    this.forceLayer(n);
                    n.setPosition(
                        (Math.random() - 0.5) * (S - 2.2),
                        2 + Math.random() * 1.5,
                        (Math.random() - 0.5) * (S - 2.2),
                    );
                    const q = new Quat();
                    Quat.fromEuler(q, Math.random() * 360, Math.random() * 360, Math.random() * 360);
                    n.setRotation(q);
                    n.setScale(0.9, 0.9, 0.9);

                    const tag = n.addComponent(ItemTag);
                    tag.id = id;
                    const rb = n.addComponent(RigidBody);
                    rb.mass = 1;
                    rb.angularDamping = 0.3;
                    rb.linearDamping = 0.15;
                    const col = n.addComponent(BoxCollider);
                    col.size = v3(0.7, 0.7, 0.7);
                }, delay);
            }
        }
        console.log(`[GameManager] 关卡 ${this.levelIndex + 1}：生成 ${this.totalCount} 个物件`);
    }

    // ---------- 拾取与三消 ----------

    private onTouch(e: EventTouch) {
        if (!this.playing || !this.cam) return;
        const p = e.getLocation();
        if (p.y < view.getCanvasSize().height * 0.12) return; // 底部道具按钮区，不穿透拾取
        const ray = new geometry.Ray();
        this.cam.screenPointToRay(p.x, p.y, ray);
        if (!PhysicsSystem.instance.raycastClosest(ray)) return;
        const hit = PhysicsSystem.instance.raycastClosestResult.collider.node;
        const tag = hit.getComponent(ItemTag);
        if (!tag || tag.picked) return;
        this.pick(hit, tag);
    }

    private pick(node: Node, tag: ItemTag) {
        tag.picked = true;
        // 物理组件失效，交给 Tween 接管
        node.getComponent(RigidBody)!.enabled = false;
        node.getComponent(BoxCollider)!.enabled = false;

        const { matched, full, index } = this.tray.add(tag.id, node);
        this.reflowTray();

        // 新拾取的物件飞向它的插入槽位（即使即将消除，也先飞到位再消，视觉才连贯）
        tween(node)
            .to(0.3, { worldPosition: this.slotPos(index), scale: v3(0.55, 0.55, 0.55) }, { easing: 'quadOut' })
            .start();
        tween(node).to(0.3, { rotation: Quat.IDENTITY }).start();

        if (matched) {
            // 飞入动画结束后再消除
            this.scheduleOnce(() => {
                for (const e of matched) {
                    Tween.stopAllByTarget(e.node);
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
        if (!this.playing) return;
        if (this.propCounts[kind] <= 0) return;
        let used = false;
        if (kind === 'remove') used = this.propRemove();
        else if (kind === 'magnet') used = this.propMagnet();
        else used = this.propShuffle();
        if (used) {
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
            Tween.stopAllByTarget(e.node);
            tag.picked = false;
            e.node.setWorldPosition(
                (Math.random() - 0.5) * 3, 3 + i * 0.8, (Math.random() - 0.5) * 3);
            e.node.setScale(0.9, 0.9, 0.9);
            e.node.getComponent(RigidBody)!.enabled = true;
            e.node.getComponent(BoxCollider)!.enabled = true;
        });
        this.reflowTray();
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
        const S = GameManager.BOX_SIZE;
        const boxItems = this.node.getComponentsInChildren(ItemTag).filter(t => !t.picked && t.node.isValid);
        if (boxItems.length === 0) return false;
        for (const t of boxItems) {
            t.node.setWorldPosition(
                (Math.random() - 0.5) * (S - 1.5),
                2.5 + Math.random() * 3,
                (Math.random() - 0.5) * (S - 1.5));
            const q = new Quat();
            Quat.fromEuler(q, Math.random() * 360, Math.random() * 360, Math.random() * 360);
            t.node.setRotation(q);
            const rb = t.node.getComponent(RigidBody)!;
            try { rb.clearState(); } catch { /* 部分版本无此方法，忽略 */ }
        }
        return true;
    }

    /** 槽中所有物件按当前顺序补位（含飞入中的） */
    private reflowTray() {
        this.tray.entries.forEach((e, i) => {
            tween(e.node)
                .to(0.3, { worldPosition: this.slotPos(i) }, { easing: 'quadOut' })
                .start();
            tween(e.node)
                .to(0.3, { rotation: Quat.IDENTITY })
                .start();
        });
    }

    // ---------- 结算与 HUD ----------

    private get progress(): number {
        return this.totalCount === 0 ? 0 : Math.round((this.removedCount / this.totalCount) * 100);
    }

    private gameOver(win: boolean, reason: string) {
        if (!this.playing) return;
        this.playing = false;
        const stars = this.progress >= 100 ? 3 : this.progress >= 70 ? 2 : this.progress >= 50 ? 1 : 0;
        // 星级奖励：一星+移出、二星再+凑齐、三星再+打乱
        if (stars >= 1) this.propCounts.remove++;
        if (stars >= 2) this.propCounts.magnet++;
        if (stars >= 3) this.propCounts.shuffle++;
        if (stars > 0) this.saveProps();
        const msg = win
            ? `胜利！${'★'.repeat(Math.max(1, stars))} 完成度 ${this.progress}%`
            : `失败（${reason}）完成度 ${this.progress}%`;
        if (this.msgLabel) this.msgLabel.string = msg;
        console.log(`[GameManager] ${msg}`);
        // 1 秒后允许点击任意处重开本关（原地重置，不重载场景——
        // loadScene 重载后自定义管线的主相机会停止渲染，规避之）
        this.scheduleOnce(() => {
            if (this.hud) {
                this.hud.subMsgLabel.string = (stars > 0 ? `获得 ${stars} 件道具奖励，` : '') + '点击任意处重新挑战';
            }
            input.once(Input.EventType.TOUCH_START, () => this.resetLevel());
        }, 1);
    }

    /** 原地重开本关 */
    private resetLevel() {
        for (const t of this.node.getComponentsInChildren(ItemTag)) {
            if (t.node.isValid) t.node.destroy();
        }
        this.tray.clear();
        this.removedCount = 0;
        this.timeLeft = this.level.timeSec;
        if (this.msgLabel) this.msgLabel.string = '';
        if (this.hud) this.hud.subMsgLabel.string = '';
        this.spawnItems();
        this.playing = true;
        this.updateHud();
    }

    private updateHud() {
        if (this.progressLabel) this.progressLabel.string = `完成度 ${this.progress}%`;
        if (this.timerLabel) {
            const m = Math.floor(this.timeLeft / 60);
            const s = Math.floor(this.timeLeft % 60);
            this.timerLabel.string = `${m}:${s.toString().padStart(2, '0')}`;
        }
    }
}
