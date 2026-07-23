import {
    Node, Scene, Camera, Canvas, Label, Layers, Color, UITransform, Sprite, SpriteFrame, Texture2D,
    NodeEventType, Widget, view, screen, Graphics, UIOpacity, Font, resources,
    tween, v3, Vec3, Tween,
} from 'cc';
import { SKINS } from './SceneSkin';

export type PropKind = 'remove' | 'magnet' | 'shuffle';

type HorizontalAlign = { left?: number; right?: number; centerX?: boolean };

type TrayIconLayout = { offsetX: number; offsetY: number; contentW: number; contentH: number };

/**
 * 图标 PNG 都是 192×192，但 GLB 导出时模型在透明画布中的位置并不一致。
 * 这里记录实际非透明像素包围盒相对画布中心的偏移与尺寸，让“视觉内容”而不是 PNG 画布居中。
 * offsetY 使用图片坐标（向下为正），应用到 Cocos 节点时会反向换算。
 */
const TRAY_ICON_LAYOUT: Record<string, TrayIconLayout> = {
    baicai: { offsetX: 7, offsetY: 1.5, contentW: 103, contentH: 104 },
    banzhi: { offsetX: -0.5, offsetY: -0.5, contentW: 118, contentH: 108 },
    bracelet: { offsetX: -0.5, offsetY: -0.5, contentW: 118, contentH: 72 },
    goose: { offsetX: -10.5, offsetY: 12.5, contentW: 94, contentH: 102 },
    hulu: { offsetX: -0.5, offsetY: 0.5, contentW: 82, contentH: 118 },
    mile: { offsetX: -2, offsetY: 4.5, contentW: 109, contentH: 116 },
    pingankou: { offsetX: -0.5, offsetY: -0.5, contentW: 118, contentH: 66 },
    pixiu: { offsetX: -5.5, offsetY: 5, contentW: 122, contentH: 119 },
    tongqian: { offsetX: -0.5, offsetY: -0.5, contentW: 118, contentH: 66 },
    yuzhuo: { offsetX: -0.5, offsetY: -0.5, contentW: 118, contentH: 68 },
};

/**
 * 参考竞品重制的 HUD：顶部暂停/计时、轻量进度条、底部桃木控制台、
 * 三个立体黄色道具按钮。图标使用 Font Awesome Free，避免文字/emoji 占位。
 */
export class HudUI {
    timerLabel!: Label;
    progressLabel!: Label;
    msgLabel!: Label;
    subMsgLabel!: Label;

    private uiCam!: Camera;
    private canvasUT!: UITransform;
    private canvasNode!: Node;
    private contentRoot!: Node;
    private contentUT!: UITransform;
    private uiScale = 1;
    private progressFill!: UITransform;
    private trayDangerGlow!: Node;
    private trayDangerOpacity!: UIOpacity;
    private pauseIcon!: Label;
    private static readonly PROGRESS_W = 252;
    private static readonly TRAY_BOTTOM = 126;
    private static readonly TRAY_CENTER_Y = 169;
    private static readonly SLOT_STEP = 88;
    private propBadge: Record<PropKind, Label> = {} as Record<PropKind, Label>;
    private propOpacity: Record<PropKind, UIOpacity> = {} as Record<PropKind, UIOpacity>;
    private iconLabels: Label[] = [];
    private iconFont: Font | null = null;
    private levelLabel!: Label;
    private dailyLabel!: Label;
    private resultRoot: Node | null = null;
    private capturedModels = new Map<Node, number>();
    private capturedIcons = new Map<Node, Node>();
    private skinRoot: Node | null = null;
    private onSelectSkin?: (id: string) => void;
    private getSkinId?: () => string;
    private onSkinPanelToggle?: (open: boolean) => void;

    constructor(scene: Scene, onProp: (kind: PropKind) => void, onPause?: () => void,
        onSelectSkin?: (id: string) => void, getSkinId?: () => string,
        onSkinPanelToggle?: (open: boolean) => void) {
        this.onSelectSkin = onSelectSkin;
        this.getSkinId = getSkinId;
        this.onSkinPanelToggle = onSkinPanelToggle;
        const canvasNode = new Node('HudCanvas');
        this.canvasNode = canvasNode;
        canvasNode.layer = Layers.Enum.UI_2D;
        canvasNode.setParent(scene);
        this.canvasUT = canvasNode.addComponent(UITransform);
        const canvas = canvasNode.addComponent(Canvas);

        const camNode = new Node('UICamera');
        camNode.layer = Layers.Enum.UI_2D;
        camNode.setParent(canvasNode);
        camNode.setPosition(0, 0, 1000);
        this.uiCam = camNode.addComponent(Camera);
        this.uiCam.projection = Camera.ProjectionType.ORTHO;
        this.uiCam.near = 1;
        this.uiCam.far = 2000;
        this.uiCam.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
        this.uiCam.visibility = Layers.Enum.UI_2D;
        this.uiCam.priority = 10;
        canvas.cameraComponent = this.uiCam;

        // 以 720 宽的美术坐标继续排版，再整体缩放到手机可视宽度。
        // 这样 390px 手机不会裁掉七格收集区和左右道具按钮，同时保留现有视觉比例。
        this.contentRoot = new Node('HudContent');
        this.contentRoot.layer = Layers.Enum.UI_2D;
        this.contentRoot.setParent(canvasNode);
        this.contentUT = this.contentRoot.addComponent(UITransform);
        this.contentUT.setContentSize(720, 1280);

        const cream = new Color(255, 247, 218);
        const warmBrown = new Color(102, 57, 28);
        const darkBrown = new Color(73, 39, 24);

        // 左上暂停键：棕色软糖质感，与参考图一致。
        this.makePanel(70, 70, 20, new Color(92, 52, 31, 210), { top: 27 }, 0,
            undefined, 0, { left: 23 });
        const pauseBtn = this.makePanel(64, 64, 18, new Color(215, 158, 105), { top: 22 }, 0,
            new Color(124, 75, 42), 4, { left: 26 });
        this.pauseIcon = this.addIcon(pauseBtn, '\uf04c', 31, cream, 0, 0);
        pauseBtn.on(NodeEventType.TOUCH_END, () => onPause?.());

        // \u6362\u80a4\u952e\uff1a\u6682\u505c\u952e\u6b63\u4e0b\u65b9\uff0c\u540c\u6b3e\u68d5\u8272\u8f6f\u7cd6\u8d28\u611f\uff0c\u8c03\u8272\u76d8\u56fe\u6807\u3002
        if (this.onSelectSkin) {
            this.makePanel(70, 70, 20, new Color(92, 52, 31, 210), { top: 105 }, 0,
                undefined, 0, { left: 23 });
            const skinBtn = this.makePanel(64, 64, 18, new Color(215, 158, 105), { top: 100 }, 0,
                new Color(124, 75, 42), 4, { left: 26 });
            this.addIcon(skinBtn, '\uf53f', 28, cream, 0, 0);
            skinBtn.on(NodeEventType.TOUCH_START, () => {
                tween(skinBtn).stop();
                tween(skinBtn).to(0.07, { scale: v3(0.95, 0.95, 1) }).start();
            });
            const releaseSkin = () => tween(skinBtn).to(0.09, { scale: v3(1, 1, 1) }, { easing: 'backOut' }).start();
            skinBtn.on(NodeEventType.TOUCH_END, () => { releaseSkin(); this.toggleSkinPanel(); });
            skinBtn.on(NodeEventType.TOUCH_CANCEL, releaseSkin);
        }

        // 计时牌和细进度条，缩小存在感，把视觉主舞台让给 3D 容器。
        const timerShadow = this.makePanel(166, 58, 27, new Color(32, 20, 16, 180), { top: 25 }, 0);
        timerShadow.setPosition(0, -5, 0);
        const timerPanel = this.makePanel(160, 54, 25, new Color(62, 36, 24, 232), { top: 22 }, 0,
            new Color(168, 108, 57), 3);
        this.timerLabel = this.addLabel(timerPanel, '0:00', 34, new Color(255, 220, 87), 0, 0, true);

        // 右上关卡标牌,与左上暂停键对称。
        const levelPanel = this.makePanel(112, 52, 16, new Color(62, 36, 24, 232), { top: 28 }, 0,
            new Color(168, 108, 57), 3, { right: 23 });
        this.levelLabel = this.addLabel(levelPanel, '第 1 关', 24, cream, 0, 0, true);
        // 关卡标牌下的每日剩余次数。
        this.dailyLabel = this.addLabel(levelPanel, '今日 3/3', 16, new Color(233, 200, 156), 0, -42, true);

        const W = HudUI.PROGRESS_W;
        const progPanel = this.makePanel(W, 24, 12, new Color(45, 29, 21, 205), { top: 88 }, 0,
            new Color(118, 78, 46), 2);
        const fillNode = new Node('progressFill');
        fillNode.layer = Layers.Enum.UI_2D;
        fillNode.setParent(progPanel);
        this.progressFill = fillNode.addComponent(UITransform);
        this.progressFill.setAnchorPoint(0, 0.5);
        fillNode.setPosition(-W / 2 + 4, 0, 0);
        const fg = fillNode.addComponent(Graphics);
        fg.fillColor = new Color(106, 205, 75, 255);
        fg.roundRect(0, -8, W - 8, 16, 8);
        fg.fill();
        fillNode.setScale(0, 1);
        this.progressLabel = this.addLabel(progPanel, '0%', 17, cream, 0, 0, true);

        // 结算文案。
        this.msgLabel = this.makeFloatingLabel('', 48, new Color(255, 221, 91), { centerY: 92 });
        this.subMsgLabel = this.makeFloatingLabel('', 25, cream, { centerY: 30 });

        // 收集区是固定屏幕坐标的 2D HUD，不再跟随 3D 相机产生透视变形。
        // 模型稍后放入独立 UI_2D 三维层，仍保留真实 Mesh 和旋转，而不是截图/图标替代。
        // 5 格起显示的危险边缘放在槽位底层，不覆盖模型图标，也不增加额外文案干扰。
        this.trayDangerGlow = this.makePanel(682, 102, 24, new Color(244, 91, 48, 235),
            { bottom: HudUI.TRAY_BOTTOM - 11 }, 0);
        this.trayDangerOpacity = this.trayDangerGlow.addComponent(UIOpacity);
        this.trayDangerOpacity.opacity = 0;
        this.makePanel(670, 90, 20, new Color(77, 70, 66, 220), { bottom: HudUI.TRAY_BOTTOM - 5 }, 0);
        const trayPanel = this.makePanel(654, 82, 18, new Color(244, 242, 235),
            { bottom: HudUI.TRAY_BOTTOM }, 0, new Color(151, 146, 140), 4);
        for (let i = 0; i < 7; i++) {
            this.makePanelChild(trayPanel, 78, 64, 14, new Color(177, 177, 174),
                (i - 3) * HudUI.SLOT_STEP, 0, new Color(255, 255, 255, 230), 3);
        }

        // 底部桃木控制台，覆盖整宽并保留圆润顶沿。
        this.makePanel(760, 128, 28, new Color(116, 65, 43, 215), { bottom: -18 }, 0);
        this.makePanel(752, 120, 25, new Color(221, 150, 105, 245), { bottom: -12 }, 0,
            new Color(255, 215, 164), 4);

        const defs: Array<{
            kind: PropKind; text: string; icon: string; color: Color; align: HorizontalAlign;
        }> = [
            { kind: 'remove', text: '移出', icon: '\uf0e2', color: new Color(48, 214, 33), align: { left: 24 } },
            { kind: 'magnet', text: '凑齐', icon: '\uf076', color: new Color(39, 151, 239), align: { centerX: true } },
            { kind: 'shuffle', text: '打乱', icon: '\uf863', color: new Color(205, 82, 237), align: { right: 24 } },
        ];

        defs.forEach(({ kind, text, icon, color, align }) => {
            // 深色投影 + 黄色面板形成参考图中的卡通立体按钮。
            this.makePanel(188, 86, 20, new Color(104, 61, 25, 230), { bottom: 9 }, 0,
                undefined, 0, align).setPosition(0, -5, 0);
            const btn = this.makePanel(184, 80, 18, new Color(255, 207, 55), { bottom: 17 }, 0,
                new Color(171, 118, 29), 5, align);
            this.propOpacity[kind] = btn.addComponent(UIOpacity);
            this.addIcon(btn, icon, 38, color, 0, 12);
            this.addLabel(btn, text, 22, warmBrown, 0, -24, true);

            const badgeShadow = this.makePanelChild(btn, 40, 40, 20, new Color(79, 72, 65), 78, 38);
            badgeShadow.setPosition(78, 36, 0);
            const badge = this.makePanelChild(btn, 36, 36, 18, new Color(112, 110, 105), 78, 39,
                new Color(246, 242, 225), 4);
            this.propBadge[kind] = this.addLabel(badge, '+3', 15, new Color(255, 255, 255), 0, 0, true);

            btn.on(NodeEventType.TOUCH_START, () => {
                tween(btn).stop();
                tween(btn).to(0.07, { scale: v3(0.95, 0.95, 1) }).start();
            });
            const release = () => tween(btn).to(0.09, { scale: v3(1, 1, 1) }, { easing: 'backOut' }).start();
            btn.on(NodeEventType.TOUCH_END, () => { release(); onProp(kind); });
            btn.on(NodeEventType.TOUCH_CANCEL, release);
        });

        // Cocos 异步导入开源图标字体；导入完成前标签为空白但不会显示伪图标。
        resources.load('fonts/fa-solid-900', Font, (err, font) => {
            if (err || !font) {
                console.warn('[HudUI] Font Awesome 字体加载失败', err);
                return;
            }
            this.iconFont = font;
            for (const label of this.iconLabels) label.font = font;
        });
    }

    setLevel(n: number) {
        this.levelLabel.string = `第 ${n} 关`;
    }

    setDaily(left: number) {
        this.dailyLabel.string = `今日 ${left}/3`;
        this.dailyLabel.color = left > 0 ? new Color(233, 200, 156) : new Color(240, 120, 96);
    }

    /** 屏幕坐标(px) → HudContent 内容坐标。 */
    private screenToContent(screenPos: Vec3): Vec3 {
        const px = screen.windowSize;
        return v3(
            (screenPos.x - px.width / 2) / this.uiScale,
            (screenPos.y - px.height / 2) / this.uiScale,
            1,
        );
    }

    /** 通用粒子爆点:count 个小圆从中心飞散渐隐 + 一个扩散圆环。 */
    private burstAt(pos: Vec3, color: Color, count: number, radius: number, dotR: number) {
        const root = new Node('burst');
        root.layer = Layers.Enum.UI_2D;
        root.setParent(this.contentRoot);
        root.setPosition(pos);

        const ring = new Node('ring');
        ring.layer = Layers.Enum.UI_2D;
        ring.setParent(root);
        const rg = ring.addComponent(Graphics);
        rg.lineWidth = 5;
        rg.strokeColor = new Color(color.r, color.g, color.b, 210);
        rg.circle(0, 0, radius * 0.4);
        rg.stroke();
        const ringOp = ring.addComponent(UIOpacity);
        tween(ring).to(0.3, { scale: v3(2.4, 2.4, 1) }, { easing: 'quadOut' }).start();
        tween(ringOp).to(0.3, { opacity: 0 }).start();

        for (let i = 0; i < count; i++) {
            const dot = new Node('dot');
            dot.layer = Layers.Enum.UI_2D;
            dot.setParent(root);
            const g = dot.addComponent(Graphics);
            g.fillColor = color;
            g.circle(0, 0, dotR * (0.7 + Math.random() * 0.6));
            g.fill();
            const ang = (i / count) * Math.PI * 2 + Math.random() * 0.5;
            const dist = radius * (0.75 + Math.random() * 0.5);
            const op = dot.addComponent(UIOpacity);
            tween(dot)
                .to(0.32 + Math.random() * 0.12, {
                    position: v3(Math.cos(ang) * dist, Math.sin(ang) * dist, 0),
                    scale: v3(0.3, 0.3, 1),
                }, { easing: 'quadOut' })
                .start();
            tween(op).delay(0.12).to(0.26, { opacity: 0 }).start();
        }
        // 粒子生命周期极短,统一 0.6s 后销毁根节点。
        tween(root).delay(0.6).call(() => root.destroy()).start();
    }

    /** 拾取瞬间的轻量白色爆点(3D 世界屏幕坐标)。 */
    pickBurst(screenPos: Vec3) {
        this.burstAt(this.screenToContent(screenPos), new Color(255, 246, 200, 255), 6, 44, 5);
    }

    /** 三消时在对应槽位上的金色爆点。 */
    matchBurst(node: Node) {
        const icon = this.capturedIcons.get(node);
        if (!icon?.isValid) return;
        this.burstAt(icon.position.clone(), new Color(255, 205, 64, 255), 10, 64, 7);
    }

    /** 轻量通知弹窗(每日次数用尽等):标题 + 正文 + 单按钮。 */
    showNotice(title: string, body: string, actionText: string, onAction: () => void) {
        this.hideResult();
        const root = new Node('resultRoot');
        this.resultRoot = root;
        root.layer = Layers.Enum.UI_2D;
        root.setParent(this.contentRoot);

        const mask = new Node('mask');
        mask.layer = Layers.Enum.UI_2D;
        mask.setParent(root);
        mask.addComponent(UITransform).setContentSize(2400, 3200);
        const mg = mask.addComponent(Graphics);
        mg.fillColor = new Color(20, 12, 8, 165);
        mg.rect(-1200, -1600, 2400, 3200);
        mg.fill();
        mask.on(NodeEventType.TOUCH_END, () => { /* 吞掉 */ });

        this.makePanelChild(root, 520, 340, 34, new Color(52, 27, 15, 235), 0, -8);
        const panel = this.makePanelChild(root, 508, 330, 30, new Color(255, 244, 214), 0, 0,
            new Color(196, 130, 64), 6);
        this.addLabel(panel, title, 40, new Color(240, 150, 26), 0, 96, true);
        const bodyLabel = this.addLabel(panel, body, 24, new Color(102, 57, 28), 0, 10, true);
        bodyLabel.horizontalAlign = Label.HorizontalAlign.CENTER;

        const btnShadow = this.makePanelChild(panel, 264, 84, 22, new Color(104, 61, 25, 235), 0, -96);
        btnShadow.setPosition(0, -100, 0);
        const btn = this.makePanelChild(panel, 258, 80, 20, new Color(255, 207, 55), 0, -92,
            new Color(171, 118, 29), 5);
        this.addLabel(btn, actionText, 28, new Color(102, 57, 28), 0, 0, true);
        btn.on(NodeEventType.TOUCH_END, () => onAction());

        root.setScale(0.7, 0.7, 1);
        const op = root.addComponent(UIOpacity);
        op.opacity = 0;
        tween(root).to(0.28, { scale: v3(1, 1, 1) }, { easing: 'backOut' }).start();
        tween(op).to(0.2, { opacity: 255 }).start();
    }

    /**
     * 结算弹窗:遮罩 + 面板 + 三星逐颗弹出 + 行动按钮。
     * 星星用 Font Awesome 实心星,未获得的显示为灰色底星。
     */
    showResult(opts: {
        win: boolean; stars: number; progress: number;
        rewardCount: number; actionText: string; onAction: () => void;
        bestText?: string; newRecord?: boolean;
        rescueText?: string; onRescue?: () => void;
    }) {
        this.hideResult();
        const root = new Node('resultRoot');
        this.resultRoot = root;
        root.layer = Layers.Enum.UI_2D;
        root.setParent(this.contentRoot);

        // 全屏遮罩:吞掉触摸,防止点到底下的 3D 区或道具按钮。
        const mask = new Node('mask');
        mask.layer = Layers.Enum.UI_2D;
        mask.setParent(root);
        mask.addComponent(UITransform).setContentSize(2400, 3200);
        const mg = mask.addComponent(Graphics);
        mg.fillColor = new Color(20, 12, 8, 165);
        mg.rect(-1200, -1600, 2400, 3200);
        mg.fill();
        mask.on(NodeEventType.TOUCH_END, () => { /* 吞掉 */ });

        const panelShadow = this.makePanelChild(root, 560, 470, 34, new Color(52, 27, 15, 235), 0, -10);
        void panelShadow;
        const panel = this.makePanelChild(root, 548, 460, 30, new Color(255, 244, 214), 0, 0,
            new Color(196, 130, 64), 6);

        const titleColor = opts.win ? new Color(240, 150, 26) : new Color(112, 120, 132);
        this.addLabel(panel, opts.win ? '胜 利 !' : '差一点…', 52, titleColor, 0, 158, true);

        // 三颗星:底星常驻,获得的金星延迟逐颗弹出。
        for (let i = 0; i < 3; i++) {
            const x = (i - 1) * 108;
            const y = i === 1 ? 78 : 58;
            const base = this.addIcon(panel, '', 66, new Color(205, 198, 182), x, y);
            base.outlineColor = new Color(160, 152, 138, 200);
            if (i < opts.stars) {
                const star = this.addIcon(panel, '', 66, new Color(255, 201, 40), x, y);
                star.outlineColor = new Color(196, 130, 30, 255);
                star.node.setScale(0, 0, 1);
                tween(star.node)
                    .delay(0.35 + i * 0.28)
                    .to(0.3, { scale: v3(1.25, 1.25, 1) }, { easing: 'backOut' })
                    .to(0.12, { scale: v3(1, 1, 1) })
                    .start();
            }
        }

        this.addLabel(panel, `完成度 ${opts.progress}%`, 30, new Color(102, 57, 28), 0, -14, true);
        if (opts.rewardCount > 0) {
            this.addLabel(panel, `获得 ${opts.rewardCount} 件道具奖励`, 24, new Color(52, 148, 68), 0, -54, true);
        }
        if (opts.bestText) {
            this.addLabel(panel, opts.bestText, 20, new Color(158, 122, 82), 0, -86, true);
        }
        if (opts.newRecord) {
            // 斜贴在星星右上角的"新纪录"角标。
            const badge = this.addLabel(panel, '新纪录!', 26, new Color(255, 82, 62), 168, 128, true);
            badge.node.setRotationFromEuler(0, 0, -14);
            badge.node.setScale(0, 0, 1);
            tween(badge.node)
                .delay(1.2)
                .to(0.24, { scale: v3(1.2, 1.2, 1) }, { easing: 'backOut' })
                .to(0.1, { scale: v3(1, 1, 1) })
                .start();
        }

        const mkBtn = (text: string, fill: Color, x: number, w: number, cb: () => void) => {
            // 成绩文字最低可到 y=-98；按钮顶边从 -116 开始，保留 18px 呼吸区，
            // 同时阴影底边仍距弹窗底部 24px，不会被面板裁切。
            const shadow = this.makePanelChild(panel, w + 6, 84, 22, new Color(104, 61, 25, 235), x, -160);
            shadow.setPosition(x, -164, 0);
            const b = this.makePanelChild(panel, w, 80, 20, fill, x, -156,
                new Color(171, 118, 29), 5);
            this.addLabel(b, text, 27, new Color(102, 57, 28), 0, 0, true);
            b.on(NodeEventType.TOUCH_START, () => {
                tween(b).to(0.07, { scale: v3(0.94, 0.94, 1) }).start();
            });
            b.on(NodeEventType.TOUCH_END, () => {
                tween(b).to(0.08, { scale: v3(1, 1, 1) }).start();
                cb();
            });
        };
        if (opts.rescueText && opts.onRescue) {
            // 救场是主行动(绿),重试退居右侧。
            mkBtn(opts.rescueText, new Color(126, 217, 87), -128, 246, opts.onRescue);
            mkBtn(opts.actionText, new Color(255, 207, 55), 128, 230, opts.onAction);
        } else {
            mkBtn(opts.actionText, new Color(255, 207, 55), 0, 258, opts.onAction);
        }

        // 弹窗整体入场:从 0.7 缩放弹开。
        root.setScale(0.7, 0.7, 1);
        const op = root.addComponent(UIOpacity);
        op.opacity = 0;
        tween(root).to(0.28, { scale: v3(1, 1, 1) }, { easing: 'backOut' }).start();
        tween(op).to(0.2, { opacity: 255 }).start();
    }

    hideResult() {
        if (this.resultRoot?.isValid) this.resultRoot.destroy();
        this.resultRoot = null;
    }

    // ---------- 选皮面板 ----------

    private toggleSkinPanel() {
        if (this.skinRoot?.isValid) { this.closeSkinPanel(); return; }
        this.onSkinPanelToggle?.(true);
        this.renderSkinPanel();
    }

    private closeSkinPanel() {
        const wasOpen = !!this.skinRoot?.isValid;
        if (this.skinRoot?.isValid) this.skinRoot.destroy();
        this.skinRoot = null;
        if (wasOpen) this.onSkinPanelToggle?.(false);
    }

    /**
     * 皮肤选择弹窗：遮罩 + 2×3 皮肤卡片网格 + 完成键。点卡片即时换肤并刷新高亮。
     * 只重建视觉、不改变“打开”状态，因此切皮刷新时不会误触发暂停开关。
     */
    private renderSkinPanel() {
        if (this.skinRoot?.isValid) this.skinRoot.destroy();
        const current = this.getSkinId?.() ?? SKINS[0].id;
        const root = new Node('skinRoot');
        this.skinRoot = root;
        root.layer = Layers.Enum.UI_2D;
        root.setParent(this.contentRoot);

        // 全屏遮罩：点空白处关闭，同时吞掉触摸不穿透到 3D 拾取区。
        const mask = new Node('mask');
        mask.layer = Layers.Enum.UI_2D;
        mask.setParent(root);
        mask.addComponent(UITransform).setContentSize(2400, 3200);
        const mg = mask.addComponent(Graphics);
        mg.fillColor = new Color(20, 12, 8, 165);
        mg.rect(-1200, -1600, 2400, 3200);
        mg.fill();
        mask.on(NodeEventType.TOUCH_END, () => this.closeSkinPanel());

        const panelW = 548;
        const panelH = 560;
        this.makePanelChild(root, panelW + 12, panelH + 12, 34, new Color(52, 27, 15, 235), 0, -8);
        const panel = this.makePanelChild(root, panelW, panelH, 30, new Color(255, 244, 214), 0, 0,
            new Color(196, 130, 64), 6);
        this.addLabel(panel, '选择皮肤', 38, new Color(240, 150, 26), 0, panelH / 2 - 44, true);

        const cellW = 232, cellH = 118, stepX = 252, stepY = 136, firstRowY = 138;
        SKINS.forEach((skin, i) => {
            const col = i % 2;
            const row = Math.floor(i / 2);
            const x = (col - 0.5) * stepX;
            const y = firstRowY - row * stepY;
            const selected = skin.id === current;

            // 卡片：选中态描金加粗。
            const card = this.makePanelChild(panel, cellW, cellH, 18, new Color(250, 238, 210), x, y,
                selected ? new Color(240, 150, 26) : new Color(198, 168, 120), selected ? 6 : 3);
            // 左侧两条皮肤主色预览。
            this.makePanelChild(card, 54, 84, 12, skin.swatch[0], -71, 0, new Color(255, 255, 255, 120), 2);
            this.makePanelChild(card, 26, 84, 8, skin.swatch[1], -31, 0);
            // 名称 + 状态。
            this.addLabel(card, skin.name, 25, new Color(102, 57, 28), 34, 20, true);
            this.addLabel(card, selected ? '使用中' : '点击切换', 16,
                selected ? new Color(52, 148, 68) : new Color(158, 122, 82), 34, -22, true);

            card.on(NodeEventType.TOUCH_START, () => {
                tween(card).stop();
                tween(card).to(0.06, { scale: v3(0.96, 0.96, 1) }).start();
            });
            const releaseCard = () => tween(card).to(0.08, { scale: v3(1, 1, 1) }, { easing: 'backOut' }).start();
            card.on(NodeEventType.TOUCH_END, () => {
                releaseCard();
                if (skin.id === current) return;
                this.onSelectSkin?.(skin.id);
                // 只刷新视觉高亮，保持面板打开与暂停状态。
                this.renderSkinPanel();
            });
            card.on(NodeEventType.TOUCH_CANCEL, releaseCard);
        });

        // 完成键。
        const closeShadow = this.makePanelChild(panel, 200, 66, 20, new Color(104, 61, 25, 235), 0, -panelH / 2 + 30);
        closeShadow.setPosition(0, -panelH / 2 + 26, 0);
        const closeBtn = this.makePanelChild(panel, 194, 62, 18, new Color(255, 207, 55), 0, -panelH / 2 + 34,
            new Color(171, 118, 29), 5);
        this.addLabel(closeBtn, '完成', 26, new Color(102, 57, 28), 0, 0, true);
        closeBtn.on(NodeEventType.TOUCH_END, () => this.closeSkinPanel());

        root.setScale(0.7, 0.7, 1);
        const op = root.addComponent(UIOpacity);
        op.opacity = 0;
        tween(root).to(0.24, { scale: v3(1, 1, 1) }, { easing: 'backOut' }).start();
        tween(op).to(0.18, { opacity: 255 }).start();
    }

    sync() {
        const s = view.getVisibleSize();
        if (s.width <= 0 || s.height <= 0) return;
        // HUD 使用 720x1280 安全画布。竖屏仍按宽度适配；横屏额外受高度约束，
        // 避免收集槽和道具栏占满半屏、遮住需要观察和点击的 3D 物件堆。
        const nextScale = Math.min(1, s.width / 720, s.height / 1280);
        let resized = false;
        if (Math.abs(this.canvasUT.height - s.height) > 0.5 || Math.abs(this.canvasUT.width - s.width) > 0.5) {
            this.canvasUT.setContentSize(s.width, s.height);
            resized = true;
        }
        if (Math.abs(this.uiCam.orthoHeight - s.height / 2) > 0.5) {
            this.uiCam.orthoHeight = s.height / 2;
        }
        if (Math.abs(this.uiScale - nextScale) > 0.001) {
            this.uiScale = nextScale;
            this.contentRoot.setScale(nextScale, nextScale, 1);
            resized = true;
        }
        // 横屏只缩放并居中完整的竖版操作带，不把左右 Widget 推到屏幕边缘。
        // 侧边空间保留为背景，核心信息、槽位和道具始终围绕 3D 木盒分布。
        const contentW = 720;
        const contentH = s.height / this.uiScale;
        if (Math.abs(this.contentUT.width - contentW) > 0.5 || Math.abs(this.contentUT.height - contentH) > 0.5) {
            this.contentUT.setContentSize(contentW, contentH);
            resized = true;
        }
        if (resized) {
            // Cocos Web 的降级编译不会正确展开 Map spread，使用 forEach 避免被转成 [].concat(map)。
            this.capturedModels.forEach((index, node) => {
                if (!node.isValid) this.capturedModels.delete(node);
                else {
                    const icon = this.capturedIcons.get(node);
                    if (icon?.isValid) icon.setPosition(this.slotIconPosition(index));
                }
            });
        }
    }

    /** 把 3D 模型的真实渲染缩略图飞入固定 2D 槽，避免手机多相机合成差异。 */
    captureModel(node: Node, screenPos: Vec3, index: number) {
        const canvasPx = screen.windowSize;
        const iconNode = new Node(`tray-${node.name}`);
        iconNode.layer = Layers.Enum.UI_2D;
        iconNode.setParent(this.contentRoot);
        iconNode.addComponent(UITransform).setContentSize(78, 64);

        // Sprite 放在独立子节点上：父节点始终是槽位中心，子节点只负责修正素材透明边距。
        const visualNode = new Node('visual');
        visualNode.layer = Layers.Enum.UI_2D;
        visualNode.setParent(iconNode);
        const visualUT = visualNode.addComponent(UITransform);
        const sprite = visualNode.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        iconNode.setPosition(
            (screenPos.x - canvasPx.width / 2) / this.uiScale,
            (screenPos.y - canvasPx.height / 2) / this.uiScale,
            1,
        );
        iconNode.setScale(0.18, 0.18, 1);
        resources.load(`icons/${node.name}/texture`, Texture2D, (err, texture) => {
            if (!err && texture && iconNode.isValid) {
                const frame = new SpriteFrame();
                frame.texture = texture;
                sprite.spriteFrame = frame;

                const layout = TRAY_ICON_LAYOUT[node.name]
                    ?? { offsetX: 0, offsetY: 0, contentW: 150, contentH: 150 };
                // 每件物品的非透明内容等比装进 62×52 的安全区，避免宽扁模型或高模型碰到槽边。
                const fit = Math.min(62 / layout.contentW, 52 / layout.contentH);
                visualUT.setContentSize(texture.width * fit, texture.height * fit);
                visualNode.setPosition(-layout.offsetX * fit, layout.offsetY * fit, 0);
            }
        });
        node.active = false;
        this.capturedModels.set(node, index);
        this.capturedIcons.set(node, iconNode);
        tween(iconNode)
            .to(0.32, {
                position: this.slotIconPosition(index),
                scale: v3(1, 1, 1),
            }, { easing: 'quadOut' })
            .start();
    }

    moveModelToSlot(node: Node, index: number) {
        const icon = this.capturedIcons.get(node);
        if (!node.isValid || !icon?.isValid) return;
        this.capturedModels.set(node, index);
        tween(icon).to(0.22, { position: this.slotIconPosition(index) }, { easing: 'quadOut' }).start();
    }

    releaseModel(node: Node) {
        this.capturedModels.delete(node);
        const icon = this.capturedIcons.get(node);
        this.capturedIcons.delete(node);
        if (icon?.isValid) {
            Tween.stopAllByTarget(icon);
            tween(icon).to(0.14, { scale: v3(0.08, 0.08, 1) }, { easing: 'backIn' })
                .call(() => icon.destroy()).start();
        }
    }

    clearCapturedModels() {
        this.capturedModels.clear();
        for (const icon of this.capturedIcons.values()) if (icon.isValid) icon.destroy();
        this.capturedIcons.clear();
    }

    private slotIconPosition(index: number): Vec3 {
        return v3(
            (index - 3) * HudUI.SLOT_STEP,
            -this.contentUT.height / 2 + HudUI.TRAY_CENTER_Y,
            1,
        );
    }

    setProgress(pct: number) {
        this.progressLabel.string = `${pct}%`;
        this.progressFill.node.setScale(Math.max(0, Math.min(1, pct / 100)), 1);
    }

    /** 5/6/7 格逐级增强橙红边缘，并在每次进入危险状态时轻微脉冲一次。 */
    setTrayCount(count: number) {
        const danger = Math.max(0, Math.min(3, count - 4));
        this.trayDangerOpacity.opacity = [0, 95, 175, 235][danger];
        Tween.stopAllByTarget(this.trayDangerGlow);
        this.trayDangerGlow.setScale(1, 1, 1);
        if (danger > 0) {
            tween(this.trayDangerGlow)
                .to(0.11, { scale: v3(1.025, 1.08, 1) }, { easing: 'quadOut' })
                .to(0.18, { scale: v3(1, 1, 1) }, { easing: 'sineOut' })
                .start();
        }
    }

    setPropCount(kind: PropKind, _text: string, count: number) {
        this.propBadge[kind].string = `+${count}`;
        this.propOpacity[kind].opacity = count > 0 ? 255 : 110;
    }

    setPaused(paused: boolean) {
        this.pauseIcon.string = paused ? '\uf04b' : '\uf04c';
    }

    private makePanel(w: number, h: number, r: number, fill: Color,
        align: { top?: number; bottom?: number; centerY?: number }, offsetX: number,
        stroke?: Color, strokeW = 0, halign?: HorizontalAlign): Node {
        const n = new Node('panel');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(this.contentRoot);
        n.addComponent(UITransform).setContentSize(w, h);
        const g = n.addComponent(Graphics);
        g.fillColor = fill;
        g.roundRect(-w / 2, -h / 2, w, h, r);
        g.fill();
        if (stroke && strokeW > 0) {
            g.lineWidth = strokeW;
            g.strokeColor = stroke;
            g.roundRect(-w / 2, -h / 2, w, h, r);
            g.stroke();
        }
        const wd = n.addComponent(Widget);
        wd.alignMode = Widget.AlignMode.ALWAYS;
        if (halign?.left !== undefined) { wd.isAlignLeft = true; wd.left = halign.left; }
        else if (halign?.right !== undefined) { wd.isAlignRight = true; wd.right = halign.right; }
        else { wd.isAlignHorizontalCenter = true; wd.horizontalCenter = offsetX; }
        if (align.top !== undefined) { wd.isAlignTop = true; wd.top = align.top; }
        else if (align.bottom !== undefined) { wd.isAlignBottom = true; wd.bottom = align.bottom; }
        else { wd.isAlignVerticalCenter = true; wd.verticalCenter = align.centerY ?? 0; }
        return n;
    }

    private makePanelChild(parent: Node, w: number, h: number, r: number, fill: Color,
        x: number, y: number, stroke?: Color, strokeW = 0): Node {
        const n = new Node('sub');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(parent);
        n.addComponent(UITransform).setContentSize(w, h);
        n.setPosition(x, y, 0);
        const g = n.addComponent(Graphics);
        g.fillColor = fill;
        g.roundRect(-w / 2, -h / 2, w, h, r);
        g.fill();
        if (stroke && strokeW > 0) {
            g.strokeColor = stroke;
            g.lineWidth = strokeW;
            g.roundRect(-w / 2, -h / 2, w, h, r);
            g.stroke();
        }
        return n;
    }

    private addLabel(parent: Node, text: string, size: number, color: Color,
        x = 0, y = 0, outline = false): Label {
        const n = new Node('lbl');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(parent);
        n.setPosition(x, y, 0);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = size;
        l.lineHeight = size * 1.2;
        l.color = color;
        if (outline) {
            l.enableOutline = true;
            l.outlineColor = new Color(83, 47, 27, 230);
            l.outlineWidth = Math.max(1, Math.round(size * 0.06));
        }
        return l;
    }

    private addIcon(parent: Node, text: string, size: number, color: Color, x = 0, y = 0): Label {
        const label = this.addLabel(parent, text, size, color, x, y, true);
        label.outlineColor = new Color(73, 51, 47, 230);
        label.outlineWidth = 3;
        if (this.iconFont) label.font = this.iconFont;
        else this.iconLabels.push(label);
        return label;
    }

    private makeFloatingLabel(text: string, size: number, color: Color,
        align: { top?: number; bottom?: number; centerY?: number }): Label {
        const n = new Node('float');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(this.contentRoot);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = size;
        l.lineHeight = size * 1.3;
        l.color = color;
        l.enableOutline = true;
        l.outlineColor = new Color(40, 24, 10, 255);
        l.outlineWidth = 4;
        const wd = n.addComponent(Widget);
        wd.alignMode = Widget.AlignMode.ALWAYS;
        wd.isAlignHorizontalCenter = true;
        wd.horizontalCenter = 0;
        if (align.top !== undefined) { wd.isAlignTop = true; wd.top = align.top; }
        else if (align.bottom !== undefined) { wd.isAlignBottom = true; wd.bottom = align.bottom; }
        else { wd.isAlignVerticalCenter = true; wd.verticalCenter = align.centerY ?? 0; }
        return l;
    }
}
