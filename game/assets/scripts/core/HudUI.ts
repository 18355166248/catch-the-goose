import {
    Node, Scene, Camera, Canvas, Label, Layers, Color, UITransform, Sprite, SpriteFrame, Texture2D,
    NodeEventType, Widget, view, screen, Graphics, UIOpacity, resources,
    tween, v3, Vec3, Tween,
} from 'cc';
import { SKINS } from './SceneSkin';

export type PropKind = 'remove' | 'magnet' | 'shuffle';

/** UI 矢量图标种类（不依赖字体，见 HudUI.drawGlyph）。 */
type IconKind = PropKind | 'pause' | 'play' | 'palette' | 'star';

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
 * 三个立体黄色道具按钮。图标用 Graphics 矢量绘制（见 drawGlyph），不依赖字体。
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
    private pauseIcon!: Graphics;
    /** 道具栏总开关（关闭则完全隐藏道具 UI）。 */
    private static readonly SHOW_PROPS = true;
    private static readonly PROGRESS_W = 252;
    private static readonly TRAY_BOTTOM = 126;
    private static readonly TRAY_CENTER_Y = 169;
    private static readonly SLOT_STEP = 88;
    private propBadge: Record<PropKind, Label> = {} as Record<PropKind, Label>;
    private propOpacity: Record<PropKind, UIOpacity> = {} as Record<PropKind, UIOpacity>;
    private levelLabel!: Label;
    private dailyLabel!: Label;
    private scoreLabel!: Label;
    /** 七个槽位面板，按下标索引（同类将满时闪框用）。 */
    private slotNodes: Node[] = [];
    /** 连击牌：牌身 / 透明度 / 文案 / 倒计条，见 setCombo。 */
    private comboPill!: Node;
    private comboPillOpacity!: UIOpacity;
    private comboLabel!: Label;
    private comboBar!: Node;
    private comboShown = false;
    private toastRoot: Node | null = null;
    /** 计时牌节点：进入读秒时整体脉冲，制造紧迫感。 */
    private timerPanel!: Node;
    private timerUrgent = false;
    private resultRoot: Node | null = null;
    private pauseRoot: Node | null = null;
    private homeRoot: Node | null = null;
    private hintRoot: Node | null = null;
    private comboPopRoot: Node | null = null;
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

        // 左上暂停键。与道具键同一套立体面，只是配色走暖棕。
        const pause = this.makeDockButton(66, 66, 20, new Color(214, 152, 96),
            { top: 24 }, { left: 24 }, () => onPause?.(), 4);
        this.pauseIcon = this.drawIcon(pause.face, 'pause', 32, cream, 0, 0);

        // \u6362\u80a4\u952e\uff1a\u6682\u505c\u952e\u6b63\u4e0b\u65b9\uff0c\u540c\u6b3e\u68d5\u8272\u8f6f\u7cd6\u8d28\u611f\uff0c\u8c03\u8272\u76d8\u56fe\u6807\u3002
        if (this.onSelectSkin) {
            const skin = this.makeDockButton(66, 66, 20, new Color(214, 152, 96),
                { top: 100 }, { left: 24 }, () => this.toggleSkinPanel(), 4);
            this.drawIcon(skin.face, 'palette', 32, cream, 0, 0);
        }

        // 计时牌和细进度条，缩小存在感，把视觉主舞台让给 3D 容器。
        const timerShadow = this.makePanel(166, 58, 27, new Color(32, 20, 16, 180), { top: 25 }, 0);
        timerShadow.setPosition(0, -5, 0);
        const timerPanel = this.makePanel(160, 54, 25, new Color(62, 36, 24, 232), { top: 22 }, 0,
            new Color(168, 108, 57), 3);
        this.timerPanel = timerPanel;
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
        // 星级刻度：50% / 70% 两道浅色竖线，让玩家随时看清离下一颗星还差多少。
        const tickNode = new Node('progressTicks');
        tickNode.layer = Layers.Enum.UI_2D;
        tickNode.setParent(progPanel);
        const tg = tickNode.addComponent(Graphics);
        tg.strokeColor = new Color(255, 244, 214, 175);
        tg.lineWidth = 2;
        for (const p of [0.5, 0.7]) {
            const x = -W / 2 + 4 + (W - 8) * p;
            tg.moveTo(x, -7);
            tg.lineTo(x, 7);
        }
        tg.stroke();
        this.progressLabel = this.addLabel(progPanel, '0%', 17, cream, 0, 0, true);

        // 得分牌：与进度条同一行，贴在它左侧的空白带里（不与左上两枚圆键重叠）。
        const scorePanel = this.makePanel(130, 30, 15, new Color(45, 29, 21, 205), { top: 85 }, 0,
            new Color(118, 78, 46), 2, { left: 96 });
        this.scoreLabel = this.addLabel(scorePanel, '得分 0', 19, new Color(255, 220, 87), 0, 0, true);

        // 连击牌：贴在得分牌正下方，倍率 + 一条走完即断连的倒计条。
        // 连击是本作唯一的加分放大器，此前只在飘字里闪一下就没了，
        // 玩家既不知道自己正连着，也不知道还剩多久——等于把核心爽点藏起来了。
        this.comboPill = this.makePanel(130, 26, 13, new Color(84, 34, 18, 226), { top: 120 }, 0,
            new Color(255, 146, 62), 2, { left: 96 });
        this.comboPillOpacity = this.comboPill.addComponent(UIOpacity);
        this.comboPillOpacity.opacity = 0;
        this.comboLabel = this.addLabel(this.comboPill, '连击 ×2', 15, new Color(255, 214, 76), 0, 3, true);
        const comboBar = new Node('comboBar');
        comboBar.layer = Layers.Enum.UI_2D;
        comboBar.setParent(this.comboPill);
        comboBar.addComponent(UITransform).setAnchorPoint(0, 0.5);
        comboBar.setPosition(-59, -9, 0);
        const cbg = comboBar.addComponent(Graphics);
        cbg.fillColor = new Color(255, 146, 62, 255);
        cbg.roundRect(0, -2, 118, 4, 2);
        cbg.fill();
        this.comboBar = comboBar;

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
            const slot = this.makePanelChild(trayPanel, 78, 64, 14, new Color(196, 195, 191),
                (i - 3) * HudUI.SLOT_STEP, 0, new Color(255, 255, 255, 235), 3);
            this.addSlotLight(slot);
            this.slotNodes.push(slot);
        }

        // 道具栏默认隐藏（见 SHOW_PROPS）；将来接微信激励视频变现时再打开。
        if (HudUI.SHOW_PROPS) {
        // 底部桃木控制台，覆盖整宽并保留圆润顶沿。
        this.makePanel(760, 128, 28, new Color(116, 65, 43, 215), { bottom: -18 }, 0);
        this.makePanel(752, 120, 25, new Color(221, 150, 105, 245), { bottom: -12 }, 0,
            new Color(255, 215, 164), 4);

        // 图标颜色改用「在黄面上压得住」的深色调：原先的亮绿/亮蓝/品红与 #FFCA30
        // 明度太接近，远看只剩一团糊掉的色块，认不出画的是什么。
        const defs: Array<{
            kind: PropKind; text: string; color: Color; align: HorizontalAlign;
        }> = [
            { kind: 'remove', text: '移出', color: new Color(24, 132, 60), align: { left: 24 } },
            { kind: 'magnet', text: '凑齐', color: new Color(198, 52, 44), align: { centerX: true } },
            { kind: 'shuffle', text: '打乱', color: new Color(84, 62, 198), align: { right: 24 } },
        ];

        defs.forEach(({ kind, text, color, align }) => {
            const { face } = this.makeDockButton(184, 80, 20, new Color(255, 202, 48),
                { bottom: 20 }, align, () => onProp(kind));
            this.propOpacity[kind] = face.addComponent(UIOpacity);
            this.drawIcon(face, kind, 40, color, 0, 11);
            this.addLabel(face, text, 22, warmBrown, 0, -25, true);

            // 角标改成暖红圆牌：灰底白字看着像「已禁用」，可它表达的是「你还有几个」，
            // 是条正向信息。数量为 0 时再由 setPropCount 转成灰调。
            const badge = this.makePanelChild(face, 38, 38, 19, new Color(228, 74, 58), 78, 33,
                new Color(255, 240, 214), 4);
            this.propBadge[kind] = this.addLabel(badge, '0', 17, new Color(255, 255, 255), 0, 0, true);
        });
        } // if SHOW_PROPS

    }

    setLevel(n: number) {
        this.levelLabel.string = `第 ${n} 关`;
    }

    setDaily(left: number) {
        this.dailyLabel.string = `今日 ${left}/3`;
        this.dailyLabel.color = left > 0 ? new Color(233, 200, 156) : new Color(240, 120, 96);
    }

    /**
     * 3D 相机的屏幕坐标 → HudContent 内容坐标。
     *
     * 入参来自 camera.worldToScreen，单位是**帧缓冲物理像素**（dpr=2 的手机上是 780×1690）；
     * 而 HUD 这一层跑在 Canvas 的**逻辑像素**坐标系里（view.getVisibleSize()，390×845），
     * uiScale 也是按逻辑尺寸算出来的。所以必须先按两者之比降到逻辑像素再换算。
     *
     * 早先这里直接拿 screen.windowSize 当中心去减，等于把物理像素的偏移量当逻辑量用，
     * dpr=2 时整体放大一倍：提示环、拾取爆点、大鹅气泡、飞入槽位的起点全落到空地上。
     * dpr=1 时两套尺寸相等，所以在电脑浏览器上一直看不出问题。
     */
    private screenToContent(screenPos: Vec3): Vec3 {
        const win = screen.windowSize;
        const vis = view.getVisibleSize();
        const lx = win.width ? screenPos.x * vis.width / win.width : screenPos.x;
        const ly = win.height ? screenPos.y * vis.height / win.height : screenPos.y;
        return v3(
            (lx - vis.width / 2) / this.uiScale,
            (ly - vis.height / 2) / this.uiScale,
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

    /**
     * 胜利庆祝：屏幕上半区错开时间连撒几束金色粒子。
     * 通关此前只有一个弹窗弹出来，画面上没有任何"成了"的反馈。
     */
    winCelebrate() {
        const top = this.contentUT.height / 2;
        for (let i = 0; i < 8; i++) {
            const pos = v3((Math.random() - 0.5) * 600, top * (0.12 + Math.random() * 0.52), 0);
            const gold = i % 2 === 0;
            // 借一个空节点做定时器：粒子本身生命周期很短，必须错开撒才有"连绵"感。
            const timer = new Node('celebrate');
            timer.layer = Layers.Enum.UI_2D;
            timer.setParent(this.contentRoot);
            tween(timer).delay(i * 0.11).call(() => {
                this.burstAt(pos, gold ? new Color(255, 205, 64, 255) : new Color(255, 246, 200, 255),
                    12, 92, 8);
                timer.destroy();
            }).start();
        }
    }

    /** 三消时在对应槽位上的金色爆点。 */
    matchBurst(node: Node) {
        const icon = this.capturedIcons.get(node);
        if (!icon?.isValid) return;
        this.burstAt(icon.position.clone(), new Color(255, 205, 64, 255), 10, 64, 7);
    }

    /** 得分刷新：数字换新的同时弹一下，让加分被看见。 */
    setScore(score: number) {
        this.scoreLabel.string = `得分 ${score}`;
        const n = this.scoreLabel.node;
        Tween.stopAllByTarget(n);
        n.setScale(1, 1, 1);
        tween(n)
            .to(0.09, { scale: v3(1.2, 1.2, 1) }, { easing: 'quadOut' })
            .to(0.15, { scale: v3(1, 1, 1) }, { easing: 'backOut' })
            .start();
    }

    /**
     * 连击牌刷新（每帧调用）：combo ≥ 2 时亮牌，倒计条按 remain（0~1）收缩，走完即隐。
     * 只在显隐切换时做动画，中间帧仅改条长和文案，避免每帧 new Tween。
     */
    setCombo(combo: number, remain: number) {
        const show = combo >= 2 && remain > 0;
        if (show !== this.comboShown) {
            this.comboShown = show;
            Tween.stopAllByTarget(this.comboPillOpacity);
            tween(this.comboPillOpacity).to(show ? 0.1 : 0.2, { opacity: show ? 255 : 0 }).start();
            if (show) {
                Tween.stopAllByTarget(this.comboPill);
                this.comboPill.setScale(0.6, 0.6, 1);
                tween(this.comboPill).to(0.18, { scale: v3(1, 1, 1) }, { easing: 'backOut' }).start();
            }
        }
        if (!show) return;
        this.comboLabel.string = `连击 ×${combo}`;
        this.comboBar.setScale(Math.max(0, Math.min(1, remain)), 1, 1);
    }

    /**
     * 槽内已攒到同类 2 件时闪一下这两格。
     * 「还差一个就消了」是这类玩法最强的推进动力，但七格里两枚小图标很容易被漏看。
     */
    markNearMatch(indices: number[]) {
        for (const i of indices) {
            const slot = this.slotNodes[i];
            if (!slot?.isValid) continue;
            const ring = new Node('nearMatch');
            ring.layer = Layers.Enum.UI_2D;
            ring.setParent(slot);
            ring.setPosition(0, 0, 3);
            const g = ring.addComponent(Graphics);
            g.lineWidth = 5;
            g.strokeColor = new Color(255, 201, 40, 255);
            g.roundRect(-39, -32, 78, 64, 14);
            g.stroke();
            const op = ring.addComponent(UIOpacity);
            tween(op)
                .repeat(2, tween(op).to(0.3, { opacity: 70 }).to(0.22, { opacity: 255 }))
                .to(0.2, { opacity: 0 })
                .call(() => ring.destroy())
                .start();
        }
    }

    /** 收集区上方的一句轻提示（残局提醒等）：不带遮罩、不打断操作，自己淡出。 */
    toast(text: string) {
        if (this.toastRoot?.isValid) this.toastRoot.destroy();
        const root = new Node('toast');
        this.toastRoot = root;
        root.layer = Layers.Enum.UI_2D;
        root.setParent(this.contentRoot);
        root.setPosition(0, -this.contentUT.height / 2 + 336, 3);
        const op = root.addComponent(UIOpacity);

        const bar = this.makePanelChild(root, 520, 60, 22, new Color(46, 25, 14, 232), 0, 0,
            new Color(214, 106, 48), 3);
        this.addLabel(bar, text, 23, new Color(255, 226, 176), 0, 0, true);

        root.setScale(0.85, 0.85, 1);
        tween(root).to(0.18, { scale: v3(1, 1, 1) }, { easing: 'backOut' }).start();
        tween(op).delay(1.9).to(0.4, { opacity: 0 }).call(() => root.destroy()).start();
    }

    /**
     * 三消得分飘字：收集区正上方弹出 "+N"，连击 ≥2 时再补一行 "连击 ×N"。
     * 位置固定在槽位上方，与消除爆点同处一个视线焦点，不用来回找。
     */
    comboPop(combo: number, gain: number) {
        // 上一条还没飘完就来了新的（道具连消时常见）→ 直接替换，不叠字。
        if (this.comboPopRoot?.isValid) this.comboPopRoot.destroy();
        const root = new Node('comboPop');
        this.comboPopRoot = root;
        root.layer = Layers.Enum.UI_2D;
        root.setParent(this.contentRoot);
        root.setPosition(0, -this.contentUT.height / 2 + 262, 2);
        const op = root.addComponent(UIOpacity);

        // 缩放弹跳挂在子节点上，与根节点的上浮位移互不干扰。
        const inner = new Node('inner');
        inner.layer = Layers.Enum.UI_2D;
        inner.setParent(root);
        this.addLabel(inner, `+${gain}`, combo >= 2 ? 46 : 38, new Color(255, 214, 76), 0, 0, true);
        if (combo >= 2) {
            this.addLabel(inner, `连击 ×${combo}`, 26, new Color(255, 146, 62), 0, -38, true);
        }

        inner.setScale(0.5, 0.5, 1);
        tween(inner)
            .to(0.16, { scale: v3(1.12, 1.12, 1) }, { easing: 'backOut' })
            .to(0.1, { scale: v3(1, 1, 1) })
            .start();
        tween(root).delay(0.2).by(0.75, { position: v3(0, 78, 0) }, { easing: 'quadOut' }).start();
        tween(op).delay(0.55).to(0.42, { opacity: 0 }).start();
        tween(root).delay(1.05).call(() => root.destroy()).start();
    }

    // ---------- 提示与吉祥物 ----------

    /**
     * 在给定的屏幕坐标上打一组呼吸光环（玩家发呆时指出一组可消的物件）。
     * 只画 2D 环、不碰 3D 物件本身，避免动到已冻结的刚体。
     */
    showHint(screenPositions: Vec3[]) {
        this.clearHint();
        if (screenPositions.length === 0) return;
        const root = new Node('hint');
        root.layer = Layers.Enum.UI_2D;
        root.setParent(this.contentRoot);
        this.hintRoot = root;
        for (const sp of screenPositions) {
            const n = new Node('ring');
            n.layer = Layers.Enum.UI_2D;
            n.setParent(root);
            n.setPosition(this.screenToContent(sp));
            const g = n.addComponent(Graphics);
            g.lineWidth = 6;
            g.strokeColor = new Color(255, 238, 150, 255);
            g.circle(0, 0, 36);
            g.stroke();
            const op = n.addComponent(UIOpacity);
            tween(n).repeat(3, tween(n)
                .set({ scale: v3(0.75, 0.75, 1) })
                .to(0.62, { scale: v3(1.3, 1.3, 1) }, { easing: 'quadOut' })).start();
            tween(op).repeat(3, tween(op)
                .set({ opacity: 255 })
                .to(0.62, { opacity: 0 })).start();
        }
        tween(root).delay(1.95).call(() => this.clearHint()).start();
    }

    clearHint() {
        if (this.hintRoot?.isValid) this.hintRoot.destroy();
        this.hintRoot = null;
    }

    /**
     * 拾到大鹅时在拾取点弹一句吉祥物台词。
     * 游戏叫《抓住大鹅》，鹅是吉祥物也是最稀有的目标，抓到它该有点动静。
     */
    speechPop(screenPos: Vec3, text: string) {
        const root = new Node('speech');
        root.layer = Layers.Enum.UI_2D;
        root.setParent(this.contentRoot);
        root.setPosition(this.screenToContent(screenPos));
        const op = root.addComponent(UIOpacity);

        const bubble = this.makePanelChild(root, 112, 56, 20, new Color(255, 250, 232), 0, 46,
            new Color(196, 130, 64), 4);
        this.addLabel(bubble, text, 30, new Color(232, 122, 24), 0, 0, true);

        bubble.setScale(0.2, 0.2, 1);
        tween(bubble)
            .to(0.18, { scale: v3(1.15, 1.15, 1) }, { easing: 'backOut' })
            .to(0.1, { scale: v3(1, 1, 1) })
            .start();
        tween(root).delay(0.3).by(0.6, { position: v3(0, 52, 0) }, { easing: 'quadOut' }).start();
        tween(op).delay(0.6).to(0.35, { opacity: 0 }).start();
        tween(root).delay(1.0).call(() => root.destroy()).start();
    }

    /**
     * 轻晃某个道具按钮（当前一组都凑不齐时指向「移出」）。
     * 只是抖一下，不弹窗打断操作。
     */
    nudgeProp(kind: PropKind) {
        if (!HudUI.SHOW_PROPS) return;
        const btn = this.propOpacity[kind]?.node;
        if (!btn?.isValid) return;
        Tween.stopAllByTarget(btn);
        btn.setScale(1, 1, 1);
        tween(btn).repeat(3, tween(btn)
            .to(0.16, { scale: v3(1.12, 1.12, 1) }, { easing: 'quadOut' })
            .to(0.16, { scale: v3(1, 1, 1) }, { easing: 'quadIn' })).start();
    }

    /** 进入/退出读秒紧张态：计时数字转红并让整块牌子呼吸。 */
    setTimeUrgent(on: boolean) {
        if (on === this.timerUrgent) return;
        this.timerUrgent = on;
        this.timerLabel.color = on ? new Color(255, 106, 86) : new Color(255, 220, 87);
        Tween.stopAllByTarget(this.timerPanel);
        this.timerPanel.setScale(1, 1, 1);
        if (!on) return;
        tween(this.timerPanel)
            .repeatForever(tween(this.timerPanel)
                .to(0.4, { scale: v3(1.1, 1.1, 1) }, { easing: 'sineOut' })
                .to(0.4, { scale: v3(1, 1, 1) }, { easing: 'sineIn' }))
            .start();
    }

    // ---------- 弹窗骨架 ----------

    /**
     * 模态弹窗骨架：铺满屏幕、吞掉触摸的遮罩 + 缩放淡入的根节点。
     * onMaskTap 传入时点遮罩空白处触发（用于可点外关闭的面板）；不传即纯吞触摸。
     */
    private makeModal(name: string, onMaskTap?: () => void): Node {
        const root = new Node(name);
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
        mask.on(NodeEventType.TOUCH_END, () => onMaskTap?.());

        root.setScale(0.7, 0.7, 1);
        const op = root.addComponent(UIOpacity);
        op.opacity = 0;
        tween(root).to(0.26, { scale: v3(1, 1, 1) }, { easing: 'backOut' }).start();
        tween(op).to(0.2, { opacity: 255 }).start();
        return root;
    }

    /**
     * 关闭弹窗：缩小淡出后销毁，避免面板"啪"地消失。
     * 调用方在调用后立刻把自己那个引用置空——淡出中的旧节点不该再被当成当前面板。
     */
    private dismissModal(root: Node | null) {
        if (!root?.isValid) return;
        Tween.stopAllByTarget(root);
        const op = root.getComponent(UIOpacity);
        if (op) tween(op).to(0.13, { opacity: 0 }).start();
        tween(root)
            .to(0.14, { scale: v3(0.86, 0.86, 1) }, { easing: 'quadIn' })
            .call(() => root.destroy())
            .start();
    }

    /**
     * 弹窗里的卡通立体按钮：投影 + 立体面 + 按下压进投影。
     * 结构与 makeDockButton 一致（hit 定位 / face 承载视觉），只是这里用绝对坐标而非 Widget。
     */
    private makeButton(parent: Node, text: string, w: number, h: number, x: number, y: number,
        fill: Color, onTap: () => void, fontSize = 27): { node: Node; label: Label } {
        const sink = 6;
        const hit = new Node('btn');
        hit.layer = Layers.Enum.UI_2D;
        hit.setParent(parent);
        hit.setPosition(x, y, 0);
        hit.addComponent(UITransform).setContentSize(w, h);

        const shadow = new Node('shadow');
        shadow.layer = Layers.Enum.UI_2D;
        shadow.setParent(hit);
        shadow.setPosition(0, -sink - 2, 0);
        const sg = shadow.addComponent(Graphics);
        sg.fillColor = HudUI.darken(fill, 0.62);
        sg.roundRect(-w / 2, -h / 2, w, h, 20);
        sg.fill();

        const face = new Node('face');
        face.layer = Layers.Enum.UI_2D;
        face.setParent(hit);
        face.addComponent(UITransform).setContentSize(w, h);
        HudUI.paintFace(face.addComponent(Graphics), w, h, 20, fill);

        // 文字跟着面一起下沉，否则按下时字会浮在按钮上方。
        const label = this.addLabel(face, text, fontSize, HudUI.darken(fill, 0.68), 0, 0, true);
        label.outlineColor = HudUI.lighten(fill, 0.55);
        this.bindPress(hit, face, onTap, sink);
        return { node: hit, label };
    }

    /** 轻量通知弹窗(每日次数用尽等):标题 + 正文 + 单按钮。 */
    showNotice(title: string, body: string, actionText: string, onAction: () => void) {
        this.hideResult();
        const root = this.makeModal('resultRoot');
        this.resultRoot = root;

        this.makePanelChild(root, 520, 340, 34, new Color(52, 27, 15, 235), 0, -8);
        const panel = this.makePanelChild(root, 508, 330, 30, new Color(255, 244, 214), 0, 0,
            new Color(196, 130, 64), 6);
        this.addLabel(panel, title, 40, new Color(240, 150, 26), 0, 96, true);
        const bodyLabel = this.addLabel(panel, body, 24, new Color(102, 57, 28), 0, 10, true);
        bodyLabel.horizontalAlign = Label.HorizontalAlign.CENTER;

        this.makeButton(panel, actionText, 258, 80, 0, -92, new Color(255, 207, 55), onAction, 28);
    }

    // ---------- 首页 / 暂停菜单 ----------

    /**
     * 开局首页：进入即停在这里，玩家点「开始挑战」才扣次数、倒物件。
     * 一上来就哗啦倒一堆物件，新玩家不知道在干嘛；这一屏交代场景、关卡、玩法和成绩。
     */
    showHome(opts: {
        themeName: string; levelText: string; ruleText: string; warnText?: string;
        dailyText: string; bestText: string; onStart: () => void;
    }) {
        this.hideHome();
        const root = this.makeModal('homeRoot');
        this.homeRoot = root;

        const W = 560, H = 520;
        this.makePanelChild(root, W + 12, H + 12, 36, new Color(52, 27, 15, 235), 0, -8);
        const panel = this.makePanelChild(root, W, H, 32, new Color(255, 244, 214), 0, 0,
            new Color(196, 130, 64), 6);

        this.addLabel(panel, '抓住大鹅', 58, new Color(240, 150, 26), 0, H / 2 - 72, true);
        this.addLabel(panel, `今日场景 · ${opts.themeName}`, 24, new Color(158, 122, 82), 0, H / 2 - 126, true);

        // 关卡横幅：把「今天打第几关」做成视觉焦点，而不是混在文字里。
        const banner = this.makePanelChild(panel, 380, 64, 18, new Color(250, 232, 196), 0, 62,
            new Color(214, 172, 104), 4);
        this.addLabel(banner, opts.levelText, 30, new Color(102, 57, 28), 0, 0, true);

        const rule = this.addLabel(panel, opts.ruleText, 21, new Color(122, 88, 54), 0, -8, false);
        rule.horizontalAlign = Label.HorizontalAlign.CENTER;
        rule.overflow = Label.Overflow.RESIZE_HEIGHT;
        rule.node.getComponent(UITransform)?.setContentSize(452, 60);

        // 本关特有的注意事项（如第 2 关起混入的石头），没有就不占位。
        if (opts.warnText) {
            this.addLabel(panel, opts.warnText, 19, new Color(214, 106, 48), 0, -56, true);
        }

        this.makeButton(panel, '开始挑战', 300, 88, 0, -118, new Color(255, 207, 55), () => {
            this.hideHome();
            opts.onStart();
        }, 32);

        this.addLabel(panel, opts.dailyText, 19, new Color(158, 122, 82), -112, -196, true);
        this.addLabel(panel, opts.bestText, 19, new Color(158, 122, 82), 112, -196, true);
    }

    hideHome() {
        this.dismissModal(this.homeRoot);
        this.homeRoot = null;
    }

    /** 暂停菜单：继续 / 重开本关 / 音效开关。取代原先只有一个「暂停」字的空转状态。 */
    showPauseMenu(opts: {
        soundOn: boolean; onResume: () => void; onRestart: () => void; onToggleSound: () => boolean;
    }) {
        this.hidePauseMenu();
        const root = this.makeModal('pauseRoot', () => opts.onResume());
        this.pauseRoot = root;

        const W = 500, H = 430;
        this.makePanelChild(root, W + 12, H + 12, 34, new Color(52, 27, 15, 235), 0, -8);
        const panel = this.makePanelChild(root, W, H, 30, new Color(255, 244, 214), 0, 0,
            new Color(196, 130, 64), 6);
        this.addLabel(panel, '暂 停', 46, new Color(240, 150, 26), 0, H / 2 - 58, true);

        const soundText = (on: boolean) => `音效  ${on ? '开' : '关'}`;
        this.makeButton(panel, '继续游戏', 320, 84, 0, 58, new Color(126, 217, 87), () => opts.onResume(), 30);
        this.makeButton(panel, '重开本关', 320, 80, 0, -42, new Color(255, 207, 55), () => opts.onRestart());
        const sound = this.makeButton(panel, soundText(opts.soundOn), 320, 72, 0, -136,
            new Color(226, 208, 180), () => {
                sound.label.string = soundText(opts.onToggleSound());
            }, 25);
    }

    hidePauseMenu() {
        this.dismissModal(this.pauseRoot);
        this.pauseRoot = null;
    }

    /**
     * 结算弹窗:遮罩 + 面板 + 三星逐颗弹出 + 行动按钮。
     * 星星用 Graphics 矢量五角星,未获得的显示为灰色底星。
     */
    showResult(opts: {
        win: boolean; stars: number; progress: number; score: number;
        rewardCount: number; actionText: string; onAction: () => void;
        subtitle?: string; bestText?: string; newRecord?: boolean;
        timeBonus?: number; rescueText?: string; onRescue?: () => void;
    }) {
        this.hideResult();
        // 遮罩吞掉触摸,防止点到底下的 3D 区或道具按钮。
        const root = this.makeModal('resultRoot');
        this.resultRoot = root;

        this.makePanelChild(root, 560, 500, 34, new Color(52, 27, 15, 235), 0, -10);
        const panel = this.makePanelChild(root, 548, 490, 30, new Color(255, 244, 214), 0, 0,
            new Color(196, 130, 64), 6);

        const titleColor = opts.win ? new Color(240, 150, 26) : new Color(112, 120, 132);
        this.addLabel(panel, opts.win ? '胜 利 !' : '差一点…', 52, titleColor, 0, 182, true);
        // 失败时把原因写清楚（槽位已满 / 时间到），玩家才知道下一局该改什么。
        if (opts.subtitle) {
            this.addLabel(panel, opts.subtitle, 20, new Color(150, 116, 78), 0, 140, true);
        }

        // 三颗星:底星常驻,获得的金星延迟逐颗弹出。
        for (let i = 0; i < 3; i++) {
            const x = (i - 1) * 108;
            const y = i === 1 ? 96 : 76;
            this.drawIcon(panel, 'star', 66, new Color(205, 198, 182), x, y);
            if (i < opts.stars) {
                const star = this.drawIcon(panel, 'star', 66, new Color(255, 201, 40), x, y);
                star.node.setScale(0, 0, 1);
                tween(star.node)
                    .delay(0.35 + i * 0.28)
                    .to(0.3, { scale: v3(1.25, 1.25, 1) }, { easing: 'backOut' })
                    .to(0.12, { scale: v3(1, 1, 1) })
                    .start();
            }
        }

        // 成绩区逐行下排：胜利局的完成度必然是 100%，写出来纯属占位，
        // 把那一行让给「时间奖励」这类真正有信息量的内容。
        let y = opts.win ? 16 : 8;
        if (!opts.win) {
            this.addLabel(panel, `完成度 ${opts.progress}%`, 28, new Color(102, 57, 28), 0, y, true);
            y -= 42;
        }
        // 得分是本局的主成绩,字号压过完成度,并做一次数字滚动强调。
        const scoreShown = this.addLabel(panel, '得分 0', 36, new Color(240, 150, 26), 0, y, true);
        this.countUpScore(scoreShown, opts.score);
        y -= 42;
        if (opts.timeBonus) {
            this.addLabel(panel, `含时间奖励 +${opts.timeBonus}`, 21, new Color(214, 106, 48), 0, y, true);
            y -= 32;
        }
        if (opts.rewardCount > 0) {
            this.addLabel(panel, `获得 ${opts.rewardCount} 件道具奖励`, 23, new Color(52, 148, 68), 0, y, true);
            y -= 30;
        }
        if (opts.bestText) {
            this.addLabel(panel, opts.bestText, 20, new Color(158, 122, 82), 0, y, true);
        }
        if (opts.newRecord) {
            // 斜贴在星星右上角的"新纪录"角标。
            const badge = this.addLabel(panel, '新纪录!', 26, new Color(255, 82, 62), 168, 122, true);
            badge.node.setRotationFromEuler(0, 0, -14);
            badge.node.setScale(0, 0, 1);
            tween(badge.node)
                .delay(1.2)
                .to(0.24, { scale: v3(1.2, 1.2, 1) }, { easing: 'backOut' })
                .to(0.1, { scale: v3(1, 1, 1) })
                .start();
        }

        // 成绩文字最低到 y=-112；按钮顶边 -132 起，保留呼吸区，
        // 阴影底边距弹窗底部 29px，不会被面板裁切。
        if (opts.rescueText && opts.onRescue) {
            // 救场是主行动(绿),重试退居右侧。
            this.makeButton(panel, opts.rescueText, 246, 80, -128, -172, new Color(126, 217, 87), opts.onRescue);
            this.makeButton(panel, opts.actionText, 230, 80, 128, -172, new Color(255, 207, 55), opts.onAction);
        } else {
            this.makeButton(panel, opts.actionText, 258, 80, 0, -172, new Color(255, 207, 55), opts.onAction);
        }
    }

    /** 结算得分滚动:从 0 跳到最终分,让「这局打了多少」有个被读出来的过程。 */
    private countUpScore(label: Label, target: number) {
        if (target <= 0) { label.string = '得分 0'; return; }
        const steps = 18;
        for (let i = 1; i <= steps; i++) {
            tween(label.node)
                .delay(0.3 + i * 0.035)
                .call(() => {
                    if (!label.node.isValid) return;
                    label.string = `得分 ${Math.round(target * (i / steps))}`;
                })
                .start();
        }
    }

    hideResult() {
        this.dismissModal(this.resultRoot);
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
        this.dismissModal(this.skinRoot);
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
        // 遮罩点空白处关闭，同时吞掉触摸不穿透到 3D 拾取区。
        const root = this.makeModal('skinRoot', () => this.closeSkinPanel());
        this.skinRoot = root;

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
            // 名称 + 状态。四字皮肤名（翡翠青玉）在 25 号字下会顶到左侧色条，缩一号并右移让开。
            this.addLabel(card, skin.name, 23, new Color(102, 57, 28), 38, 20, true);
            this.addLabel(card, selected ? '使用中' : '点击切换', 16,
                selected ? new Color(52, 148, 68) : new Color(158, 122, 82), 38, -22, true);

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
        this.makeButton(panel, '完成', 194, 62, 0, -panelH / 2 + 34, new Color(255, 207, 55),
            () => this.closeSkinPanel(), 26);
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
        iconNode.setPosition(this.screenToContent(screenPos));
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
        if (!HudUI.SHOW_PROPS) return;
        const usable = count > 0;
        // 角标标清剩余次数；0 次时数字转红 + 按钮明显置灰，直观表达「不可用 / 需获取」。
        this.propBadge[kind].string = `${count}`;
        this.propBadge[kind].color = usable ? new Color(255, 255, 255) : new Color(255, 120, 96);
        this.propOpacity[kind].opacity = usable ? 255 : 120;
    }

    setPaused(paused: boolean) {
        HudUI.drawGlyph(this.pauseIcon, paused ? 'play' : 'pause', 31, new Color(255, 247, 218));
    }

    // ---------- 卡通立体按钮 ----------

    private static readonly WHITE = new Color(255, 255, 255);
    private static readonly BLACK = new Color(0, 0, 0);

    /** 两色插值。按钮的高光/暗部/描边全部由基色推出，保证一颗按钮的各层同源不脏。 */
    private static mix(a: Color, b: Color, t: number): Color {
        return new Color(
            Math.round(a.r + (b.r - a.r) * t),
            Math.round(a.g + (b.g - a.g) * t),
            Math.round(a.b + (b.b - a.b) * t),
            a.a,
        );
    }

    private static lighten(c: Color, t: number): Color { return HudUI.mix(c, HudUI.WHITE, t); }
    private static darken(c: Color, t: number): Color { return HudUI.mix(c, HudUI.BLACK, t); }

    /**
     * 画一张卡通立体按钮面：底色 + 底部暗带 + 顶部高光 + 深色描边。
     * Graphics 没有渐变，只能用三层同源纯色叠出体积感——这是这套纯代码 UI
     * 唯一能做出“厚度”的办法，也是此前所有按钮看着像一块贴纸的原因。
     */
    private static paintFace(g: Graphics, w: number, h: number, r: number, fill: Color) {
        g.clear();
        const hw = w / 2, hh = h / 2;
        // 1) 整块底色
        g.fillColor = fill;
        g.roundRect(-hw, -hh, w, h, r);
        g.fill();
        // 2) 底部暗带：按钮下沿的厚度，让面看起来是压在投影上的。
        //    只做薄薄一条：道具键的文字就压在这一带上，暗带一厚一深，字立刻糊成一团。
        const bandH = Math.max(5, h * 0.15);
        g.fillColor = HudUI.darken(fill, 0.14);
        g.roundRect(-hw + 4, -hh + 4, w - 8, bandH, Math.min(r * 0.6, bandH / 2));
        g.fill();
        // 3) 顶部高光：略窄一圈的受光面
        const glossH = Math.max(6, h * 0.38);
        g.fillColor = HudUI.lighten(fill, 0.45);
        g.roundRect(-hw + 7, hh - glossH - 5, w - 14, glossH, Math.min(r * 0.7, glossH / 2));
        g.fill();
        // 4) 深色描边：卡通风必须的一圈轮廓
        g.lineWidth = Math.max(3, Math.min(w, h) * 0.06);
        g.strokeColor = HudUI.darken(fill, 0.45);
        g.roundRect(-hw, -hh, w, h, r);
        g.stroke();
    }

    /**
     * 按下反馈：按钮面往自己的投影里压下去，松手弹回。
     * 只缩放的话手感像“图片被捏了一下”；位移 + 缩放才读得出“按进去了”。
     * face 必须是不受 Widget 摆布的节点（Widget 每帧改写位置，位移会被顶掉）。
     */
    private bindPress(hit: Node, face: Node, onTap: () => void, sink: number) {
        const restore = () => {
            Tween.stopAllByTarget(face);
            tween(face)
                .to(0.12, { position: v3(0, 0, 0), scale: v3(1, 1, 1) }, { easing: 'backOut' })
                .start();
        };
        hit.on(NodeEventType.TOUCH_START, () => {
            Tween.stopAllByTarget(face);
            tween(face).to(0.06, { position: v3(0, -sink, 0), scale: v3(0.97, 0.97, 1) }).start();
        });
        hit.on(NodeEventType.TOUCH_END, () => { restore(); onTap(); });
        hit.on(NodeEventType.TOUCH_CANCEL, restore);
    }

    /**
     * 屏幕上固定位置的立体按钮（道具栏、左上角功能键）。
     * 外层只做 Widget 定位与触摸命中，内层 face 承载可动的按钮面 —— 分层是必须的，
     * 因为 Widget 的 ALWAYS 模式每帧重写外层位置，直接对外层做位移动画会被抹掉。
     * 返回 face 供调用方挂图标、文字与角标。
     */
    private makeDockButton(w: number, h: number, r: number, fill: Color,
        align: { top?: number; bottom?: number; centerY?: number }, halign: HorizontalAlign,
        onTap: () => void, sink = 5): { hit: Node; face: Node } {
        const hit = this.makePanel(w, h, r, new Color(0, 0, 0, 0), align, 0, undefined, 0, halign);

        // 投影不跟着按：它是按钮落在台面上的影子，面压下去时影子才显得是“陷进去”。
        const shadow = new Node('shadow');
        shadow.layer = Layers.Enum.UI_2D;
        shadow.setParent(hit);
        shadow.setPosition(0, -sink - 2, 0);
        const sg = shadow.addComponent(Graphics);
        sg.fillColor = HudUI.darken(fill, 0.62);
        sg.roundRect(-w / 2, -h / 2, w, h, r);
        sg.fill();

        const face = new Node('face');
        face.layer = Layers.Enum.UI_2D;
        face.setParent(hit);
        face.addComponent(UITransform).setContentSize(w, h);
        HudUI.paintFace(face.addComponent(Graphics), w, h, r, fill);

        this.bindPress(hit, face, onTap, sink);
        return { hit, face };
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

    /**
     * 槽内柔光：叠加数层半透明暖白圆，中心最亮向边缘衰减，模拟顶部聚光。
     * 光斑略偏上，物品图标随后置于其上，靠对比把偏暗的模型缩略图“提亮”。
     */
    private addSlotLight(slot: Node): void {
        const n = new Node('slotLight');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(slot);
        n.setPosition(0, 5, 0);
        const g = n.addComponent(Graphics);
        const radii = [32, 25, 19, 13];
        for (const r of radii) {
            g.fillColor = new Color(255, 253, 244, 42);
            g.circle(0, 0, r);
            g.fill();
        }
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

    private drawIcon(parent: Node, kind: IconKind, size: number, color: Color, x = 0, y = 0): Graphics {
        const n = new Node('icon');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(parent);
        n.setPosition(x, y, 0);
        const g = n.addComponent(Graphics);
        HudUI.drawGlyph(g, kind, size, color);
        return g;
    }

    /**
     * 用 Graphics 矢量绘制 UI 图标，取代 Font Awesome 图标字体。
     * 微信小游戏 canvas 对字体私有区(PUA)字形不渲染，字体图标在真机会整片消失，矢量则 100% 可靠。
     * 每个图标只用一次 fill 或一次 stroke（单色），与本文件既有 Graphics 用法一致，避免多色路径叠加。
     */
    private static drawGlyph(g: Graphics, kind: IconKind, size: number, color: Color): void {
        g.clear();
        const s = size;
        g.fillColor = color;
        g.strokeColor = color;
        switch (kind) {
            case 'pause': {
                const bw = s * 0.16, bh = s * 0.58, gap = s * 0.13;
                g.roundRect(-gap - bw, -bh / 2, bw, bh, bw * 0.4);
                g.roundRect(gap, -bh / 2, bw, bh, bw * 0.4);
                g.fill();
                break;
            }
            case 'play': {
                const r = s * 0.4;
                g.moveTo(-r * 0.72, r * 0.92);
                g.lineTo(-r * 0.72, -r * 0.92);
                g.lineTo(r, 0);
                g.close();
                g.fill();
                break;
            }
            case 'palette': {
                // 单色描边：盘身大圈 + 拇指孔 + 三个颜料点，读作调色盘。
                g.lineWidth = Math.max(2, s * 0.07);
                g.circle(0, 0, s * 0.4);
                g.circle(s * 0.13, -s * 0.15, s * 0.1);
                g.circle(-s * 0.16, s * 0.1, s * 0.055);
                g.circle(s * 0.02, s * 0.2, s * 0.055);
                g.circle(s * 0.19, s * 0.05, s * 0.055);
                g.stroke();
                break;
            }
            case 'remove': {
                // 向上顶出的箭头（把物件移出槽）。
                g.moveTo(0, s * 0.5);
                g.lineTo(-s * 0.33, s * 0.06);
                g.lineTo(s * 0.33, s * 0.06);
                g.close();
                g.roundRect(-s * 0.11, -s * 0.45, s * 0.22, s * 0.52, s * 0.05);
                g.fill();
                break;
            }
            case 'magnet': {
                // U 形马蹄磁铁（开口朝上）。
                const aw = s * 0.27, top = s * 0.36;
                g.lineWidth = s * 0.19;
                g.moveTo(-aw, top);
                g.lineTo(-aw, 0);
                g.arc(0, 0, aw, Math.PI, Math.PI * 2, false);
                g.lineTo(aw, top);
                g.stroke();
                break;
            }
            case 'shuffle': {
                // 两条交叉箭头。
                g.lineWidth = s * 0.1;
                const R = s * 0.4, H = s * 0.26, a = s * 0.18;
                g.moveTo(-R, -H); g.lineTo(R, H);
                g.moveTo(-R, H); g.lineTo(R, -H);
                g.moveTo(R, H); g.lineTo(R - a, H);
                g.moveTo(R, H); g.lineTo(R, H - a);
                g.moveTo(R, -H); g.lineTo(R - a, -H);
                g.moveTo(R, -H); g.lineTo(R, -H + a);
                g.stroke();
                break;
            }
            case 'star': {
                const R = s * 0.5, r = R * 0.44;
                for (let i = 0; i < 10; i++) {
                    const ang = Math.PI / 2 + i * Math.PI / 5;
                    const rad = i % 2 === 0 ? R : r;
                    if (i === 0) g.moveTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
                    else g.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
                }
                g.close();
                g.fill();
                break;
            }
        }
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
