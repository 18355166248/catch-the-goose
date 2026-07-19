import {
    Node, Scene, Camera, Canvas, Label, Layers, Color, UITransform, Sprite, SpriteFrame, Texture2D,
    NodeEventType, Widget, view, screen, Graphics, UIOpacity, Font, resources,
    tween, v3, Vec3, Tween,
} from 'cc';

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
    yupai: { offsetX: -13, offsetY: 0.5, contentW: 137, contentH: 96 },
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
    private pauseIcon!: Label;
    private static readonly PROGRESS_W = 252;
    private static readonly TRAY_BOTTOM = 126;
    private static readonly TRAY_CENTER_Y = 169;
    private static readonly SLOT_STEP = 88;
    private propBadge: Record<PropKind, Label> = {} as Record<PropKind, Label>;
    private propOpacity: Record<PropKind, UIOpacity> = {} as Record<PropKind, UIOpacity>;
    private iconLabels: Label[] = [];
    private capturedModels = new Map<Node, number>();
    private capturedIcons = new Map<Node, Node>();

    constructor(scene: Scene, onProp: (kind: PropKind) => void, onPause?: () => void) {
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

        // 计时牌和细进度条，缩小存在感，把视觉主舞台让给 3D 容器。
        const timerShadow = this.makePanel(166, 58, 27, new Color(32, 20, 16, 180), { top: 25 }, 0);
        timerShadow.setPosition(0, -5, 0);
        const timerPanel = this.makePanel(160, 54, 25, new Color(62, 36, 24, 232), { top: 22 }, 0,
            new Color(168, 108, 57), 3);
        this.timerLabel = this.addLabel(timerPanel, '0:00', 34, new Color(255, 220, 87), 0, 0, true);

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
            for (const label of this.iconLabels) label.font = font;
        });
    }

    sync() {
        const s = view.getVisibleSize();
        if (s.width <= 0 || s.height <= 0) return;
        const nextScale = Math.min(1, s.width / 720);
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
        const contentW = s.width / this.uiScale;
        const contentH = s.height / this.uiScale;
        if (Math.abs(this.contentUT.width - contentW) > 0.5 || Math.abs(this.contentUT.height - contentH) > 0.5) {
            this.contentUT.setContentSize(contentW, contentH);
            resized = true;
        }
        if (resized) {
            for (const [node, index] of [...this.capturedModels]) {
                if (!node.isValid) this.capturedModels.delete(node);
                else {
                    const icon = this.capturedIcons.get(node);
                    if (icon?.isValid) icon.setPosition(this.slotIconPosition(index));
                }
            }
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
        this.iconLabels.push(label);
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
