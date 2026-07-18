import {
    _decorator, Component, Node, Camera, Label, Prefab, resources, instantiate,
    RigidBody, BoxCollider, MeshRenderer, Material, primitives, utils,
    PhysicsSystem, input, Input, EventTouch, tween, v3, Vec3, Quat, Color, geometry,
    assetManager, EffectAsset, Layers,
} from 'cc';
import { LEVELS, LevelDef } from './LevelConfig';
import { SlotTray } from './SlotTray';
import { ItemTag } from './ItemTag';
import { MODEL_PREFAB_UUID } from './ModelManifest';

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

    // 盒子尺寸
    private static readonly BOX_SIZE = 5;
    private static readonly WALL_H = 1.6;

    // 槽位世界坐标（一排 7 个，位于盒子前方靠近相机处）
    private slotPos(i: number): Vec3 {
        return v3(-2.4 + i * 0.8, 0.4, 3.8);
    }

    onLoad() {
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

    private debugTimer = 0;

    update(dt: number) {
        // 诊断：每 2 秒报告一次物件状态（定位"看不见"问题，稳定后移除）
        this.debugTimer += dt;
        if (this.debugTimer > 2) {
            this.debugTimer = 0;
            const items = this.node.getComponentsInChildren(ItemTag);
            const fallen = items.filter(t => t.node.worldPosition.y < -5).length;
            const first = items[0];
            console.log(`[诊断] 物件数=${items.length} 掉出世界=${fallen}`
                + (first ? ` 首个:${first.id} pos=${first.node.worldPosition.toString()} layer=${first.node.layer}` : ''));
        }
        if (!this.playing) return;
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
        const wood = this.makeMat(new Color(120, 72, 48));
        // 地板 + 四壁（静态刚体）
        this.makeStaticBox('floor', v3(0, -T / 2, 0), v3(S + T * 2, T, S + T * 2), wood);
        this.makeStaticBox('wallN', v3(0, H / 2, -S / 2 - T / 2), v3(S + T * 2, H, T), wood);
        this.makeStaticBox('wallS', v3(0, H / 2, S / 2 + T / 2), v3(S + T * 2, H, T), wood);
        this.makeStaticBox('wallW', v3(-S / 2 - T / 2, H / 2, 0), v3(T, H, S), wood);
        this.makeStaticBox('wallE', v3(S / 2 + T / 2, H / 2, 0), v3(T, H, S), wood);
    }

    private makeMat(color: Color): Material | null {
        // 不同版本 builtin effect 注册名有差异，逐个候选找可用的
        const candidates = ['builtin-unlit', 'unlit', 'builtin-standard', 'standard'];
        const effectName = candidates.find(n => EffectAsset.get(n));
        if (!effectName) {
            console.warn('[GameManager] 未找到可用 builtin effect，盒子将使用默认材质');
            return null;
        }
        const mat = new Material();
        mat.initialize({ effectName });
        for (const prop of ['mainColor', 'albedo']) {
            try { mat.setProperty(prop, color); break; } catch { /* 换下一个属性名 */ }
        }
        return mat;
    }

    private makeStaticBox(name: string, pos: Vec3, size: Vec3, mat: Material | null) {
        const n = new Node(name);
        n.setParent(this.node);
        n.setPosition(pos);
        const mr = n.addComponent(MeshRenderer);
        mr.mesh = utils.MeshUtils.createMesh(primitives.box({ width: size.x, height: size.y, length: size.z }));
        if (mat && mat.passes.length > 0) mr.material = mat;
        const rb = n.addComponent(RigidBody);
        rb.type = RigidBody.Type.STATIC;
        const col = n.addComponent(BoxCollider);
        col.size = size;
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
                const n = instantiate(prefab);
                n.setParent(this.node);
                this.forceLayer(n);
                // 盒子上方随机位置倾倒
                n.setPosition(
                    (Math.random() - 0.5) * (S - 1.5),
                    2.5 + Math.random() * 4,
                    (Math.random() - 0.5) * (S - 1.5),
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
                const col = n.addComponent(BoxCollider);
                col.size = v3(0.7, 0.7, 0.7);
                this.totalCount++;
            }
        }
        console.log(`[GameManager] 关卡 ${this.levelIndex + 1}：生成 ${this.totalCount} 个物件`);
    }

    // ---------- 拾取与三消 ----------

    private onTouch(e: EventTouch) {
        if (!this.playing || !this.cam) return;
        const p = e.getLocation();
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

        const { matched, full } = this.tray.add(tag.id, node);
        this.reflowTray();

        tween(node)
            .to(0.3, { scale: v3(0.55, 0.55, 0.55) }, { easing: 'quadOut' })
            .start();

        if (matched) {
            // 飞入动画结束后再消除
            this.scheduleOnce(() => {
                for (const e of matched) {
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
        const msg = win
            ? `胜利！★${'★'.repeat(Math.max(0, stars - 1))} 完成度 ${this.progress}%`
            : `失败（${reason}）完成度 ${this.progress}%`;
        if (this.msgLabel) this.msgLabel.string = msg;
        console.log(`[GameManager] ${msg}`);
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
