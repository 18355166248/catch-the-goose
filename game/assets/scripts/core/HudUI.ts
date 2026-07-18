import {
    Node, Scene, Camera, Canvas, Label, Layers, Color, UITransform,
    NodeEventType, Widget, view, Graphics, UIOpacity,
} from 'cc';

export type PropKind = 'remove' | 'magnet' | 'shuffle';

/**
 * 纯代码构建的 HUD：Graphics 圆角面板 + Label。
 * 布局用 Widget 锚点；UI 相机 orthoHeight 由 GameManager 每帧调 sync() 跟随画布。
 */
export class HudUI {
    timerLabel!: Label;
    progressLabel!: Label;
    msgLabel!: Label;
    subMsgLabel!: Label;

    private uiCam!: Camera;
    private canvasUT!: UITransform;
    private canvasNode!: Node;
    private progressFill!: UITransform;
    private static readonly PROGRESS_W = 300;
    private propBadge: Record<PropKind, Label> = {} as Record<PropKind, Label>;
    private propOpacity: Record<PropKind, UIOpacity> = {} as Record<PropKind, UIOpacity>;

    constructor(scene: Scene, onProp: (kind: PropKind) => void) {
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

        const gold = new Color(255, 216, 98);
        const cream = new Color(250, 244, 230);
        const brown = new Color(96, 62, 24);

        // 顶部计时徽章
        const timerPanel = this.makePanel(180, 62, 30, new Color(30, 20, 12, 190), { top: 24 }, 0);
        this.timerLabel = this.addLabel(timerPanel, '0:00', 38, gold);

        // 进度条（含文字）
        const W = HudUI.PROGRESS_W;
        const progPanel = this.makePanel(W, 30, 14, new Color(30, 20, 12, 190), { top: 100 }, 0);
        const fillNode = new Node('fill');
        fillNode.layer = Layers.Enum.UI_2D;
        fillNode.setParent(progPanel);
        this.progressFill = fillNode.addComponent(UITransform);
        this.progressFill.setAnchorPoint(0, 0.5);
        fillNode.setPosition(-W / 2 + 4, 0, 0);
        const fg = fillNode.addComponent(Graphics);
        fg.fillColor = new Color(126, 204, 90, 255);
        fg.roundRect(0, -11, W - 8, 22, 10);
        fg.fill();
        fillNode.setScale(0, 1);
        this.progressLabel = this.addLabel(progPanel, '0%', 20, cream);

        // 中央结算文案（带底板，平时隐藏由文字为空实现）
        this.msgLabel = this.makeFloatingLabel('', 52, gold, { centerY: 70 });
        this.subMsgLabel = this.makeFloatingLabel('', 26, cream, { centerY: 6 });

        // 底部道具按钮（黄色圆角 + 次数角标）
        // 左/中/右锚点对齐，任意宽高比都不出界
        const defs: Array<[PropKind, string, { left?: number; right?: number; centerX?: boolean }]> = [
            ['remove', '移出', { left: 22 }],
            ['magnet', '凑齐', { centerX: true }],
            ['shuffle', '打乱', { right: 22 }],
        ];
        defs.forEach(([kind, text, ha]) => {
            const btn = this.makePanel(150, 86, 20, new Color(245, 197, 66, 255), { bottom: 30 }, 0,
                new Color(178, 128, 36, 255), 5, ha);
            this.addLabel(btn, text, 32, brown);
            this.propOpacity[kind] = btn.addComponent(UIOpacity);
            // 次数角标
            const badge = this.makePanelChild(btn, 44, 44, 22, new Color(226, 80, 62, 255), 62, 32);
            this.propBadge[kind] = this.addLabel(badge, 'x3', 22, new Color(255, 255, 255));
            btn.on(NodeEventType.TOUCH_END, () => onProp(kind));
        });
    }

    sync() {
        const s = view.getVisibleSize();
        const px = view.getCanvasSize();
        if (s.height <= 0 || px.height <= 0) return;
        // 正交相机横向视野 = 高度 × 画布像素宽高比，画布逻辑宽必须按它算，
        // 否则左右锚点/偏移与真实屏幕边缘对不上
        const w = s.height * (px.width / px.height);
        if (Math.abs(this.canvasUT.height - s.height) > 0.5 || Math.abs(this.canvasUT.width - w) > 0.5) {
            this.canvasUT.setContentSize(w, s.height);
        }
        if (Math.abs(this.uiCam.orthoHeight - s.height / 2) > 0.5) {
            this.uiCam.orthoHeight = s.height / 2;
        }
    }

    setProgress(pct: number) {
        this.progressLabel.string = `${pct}%`;
        this.progressFill.node.setScale(Math.max(0, Math.min(1, pct / 100)), 1);
    }

    setPropCount(kind: PropKind, _text: string, count: number) {
        this.propBadge[kind].string = `x${count}`;
        this.propOpacity[kind].opacity = count > 0 ? 255 : 110;
    }

    // ---------- 构件工厂 ----------

    /** 圆角面板（挂 Widget 对齐到画布） */
    private makePanel(w: number, h: number, r: number, fill: Color,
        align: { top?: number; bottom?: number; centerY?: number }, offsetX: number,
        stroke?: Color, strokeW = 0,
        halign?: { left?: number; right?: number; centerX?: boolean }): Node {
        const n = new Node('panel');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(this.canvasNode);
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

    /** 面板内的子面板（相对父面板中心定位） */
    private makePanelChild(parent: Node, w: number, h: number, r: number, fill: Color, x: number, y: number): Node {
        const n = new Node('sub');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(parent);
        n.addComponent(UITransform).setContentSize(w, h);
        n.setPosition(x, y, 0);
        const g = n.addComponent(Graphics);
        g.fillColor = fill;
        g.roundRect(-w / 2, -h / 2, w, h, r);
        g.fill();
        return n;
    }

    private addLabel(parent: Node, text: string, size: number, color: Color): Label {
        const n = new Node('lbl');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(parent);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = size;
        l.lineHeight = size * 1.25;
        l.color = color;
        return l;
    }

    private makeFloatingLabel(text: string, size: number, color: Color,
        align: { top?: number; bottom?: number; centerY?: number }): Label {
        const n = new Node('float');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(this.canvasNode);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = size;
        l.lineHeight = size * 1.3;
        l.color = color;
        l.enableOutline = true;
        l.outlineColor = new Color(40, 24, 10, 255);
        l.outlineWidth = 3;
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
