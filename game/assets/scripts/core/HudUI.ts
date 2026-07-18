import {
    Node, Scene, Camera, Canvas, Label, Layers, Color, UITransform,
    NodeEventType, Widget, view,
} from 'cc';

export type PropKind = 'remove' | 'magnet' | 'shuffle';

/**
 * 纯代码构建的临时 HUD（占位版，后续换美术 UI）。
 * 布局用 Widget 锚点（构建时刻的 visibleSize 不可靠，屏幕适配是异步完成的），
 * UI 相机 orthoHeight 由 GameManager 每帧调 sync() 跟随画布高度。
 */
export class HudUI {
    timerLabel!: Label;
    progressLabel!: Label;
    msgLabel!: Label;
    subMsgLabel!: Label;
    propLabels: Record<PropKind, Label> = {} as Record<PropKind, Label>;

    private uiCam!: Camera;
    private canvasUT!: UITransform;

    constructor(scene: Scene, onProp: (kind: PropKind) => void) {
        const canvasNode = new Node('HudCanvas');
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

        const gold = new Color(255, 215, 90);
        const white = new Color(240, 240, 235);
        const green = new Color(140, 220, 130);

        this.timerLabel = this.makeLabel(canvasNode, '0:00', 40, { top: 30 }, 0, gold);
        this.progressLabel = this.makeLabel(canvasNode, '完成度 0%', 26, { top: 90 }, 0, white);
        this.msgLabel = this.makeLabel(canvasNode, '', 52, { centerY: 60 }, 0, gold);
        this.subMsgLabel = this.makeLabel(canvasNode, '', 26, { centerY: 0 }, 0, white);

        const defs: Array<[PropKind, string]> = [['remove', '移出'], ['magnet', '凑齐'], ['shuffle', '打乱']];
        defs.forEach(([kind, text], i) => {
            this.propLabels[kind] = this.makeLabel(canvasNode, `「${text}」`, 30,
                { bottom: 40 }, (i - 1) * 190, green, () => onProp(kind));
        });
    }

    /** GameManager 每帧调用：画布尺寸与 UI 相机高度跟随可视区（屏幕适配异步生效，取一次不可靠） */
    sync() {
        const s = view.getVisibleSize();
        if (s.height <= 0) return;
        if (Math.abs(this.canvasUT.height - s.height) > 0.5 || Math.abs(this.canvasUT.width - s.width) > 0.5) {
            this.canvasUT.setContentSize(s.width, s.height);
        }
        if (Math.abs(this.uiCam.orthoHeight - s.height / 2) > 0.5) {
            this.uiCam.orthoHeight = s.height / 2;
        }
    }

    /** 道具按钮文案（含剩余次数），count 为 0 置灰 */
    setPropCount(kind: PropKind, text: string, count: number) {
        const l = this.propLabels[kind];
        l.string = `「${text} x${count}」`;
        l.color = count > 0 ? new Color(140, 220, 130) : new Color(120, 120, 120);
    }

    private makeLabel(parent: Node, text: string, size: number,
        align: { top?: number; bottom?: number; centerY?: number },
        offsetX: number, color: Color, onTap?: () => void): Label {
        const n = new Node('lbl_' + (text || 'msg'));
        n.layer = Layers.Enum.UI_2D;
        n.setParent(parent);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = size;
        l.lineHeight = size * 1.3;
        l.color = color;

        const w = n.addComponent(Widget);
        w.alignMode = Widget.AlignMode.ALWAYS;
        w.isAlignHorizontalCenter = true;
        w.horizontalCenter = offsetX;
        if (align.top !== undefined) { w.isAlignTop = true; w.top = align.top; }
        else if (align.bottom !== undefined) { w.isAlignBottom = true; w.bottom = align.bottom; }
        else { w.isAlignVerticalCenter = true; w.verticalCenter = align.centerY ?? 0; }

        if (onTap) n.on(NodeEventType.TOUCH_END, onTap);
        return l;
    }
}
