import {
    Node, Scene, Camera, Canvas, Label, Layers, Color, UITransform,
    NodeEventType, view, v3,
} from 'cc';

/**
 * 纯代码构建的临时 HUD（M2 占位版，后续换美术 UI）。
 * 结构：Canvas（自动对齐屏幕）+ 正交 UICamera + 若干 Label。
 * 非 Component 的普通类，由 GameManager 创建持有。
 */
export class HudUI {
    timerLabel!: Label;
    progressLabel!: Label;
    msgLabel!: Label;
    subMsgLabel!: Label;

    constructor(scene: Scene, onProp: (kind: 'remove' | 'magnet' | 'shuffle') => void) {
        const canvasNode = new Node('HudCanvas');
        canvasNode.layer = Layers.Enum.UI_2D;
        canvasNode.setParent(scene);
        canvasNode.addComponent(UITransform);
        const canvas = canvasNode.addComponent(Canvas);

        const camNode = new Node('UICamera');
        camNode.layer = Layers.Enum.UI_2D;
        camNode.setParent(canvasNode);
        camNode.setPosition(0, 0, 1000);
        const uiCam = camNode.addComponent(Camera);
        uiCam.projection = Camera.ProjectionType.ORTHO;
        uiCam.orthoHeight = view.getVisibleSize().height / 2;
        uiCam.near = 1;
        uiCam.far = 2000;
        uiCam.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
        uiCam.visibility = Layers.Enum.UI_2D;
        uiCam.priority = 10; // 在主相机之后渲染（叠加在上层）
        canvas.cameraComponent = uiCam;

        const { width: W, height: H } = view.getVisibleSize();
        const gold = new Color(255, 215, 90);
        const white = new Color(240, 240, 235);

        this.timerLabel = this.makeLabel(canvasNode, '0:00', 0, H / 2 - 50, 40, gold);
        this.progressLabel = this.makeLabel(canvasNode, '完成度 0%', 0, H / 2 - 100, 28, white);
        this.msgLabel = this.makeLabel(canvasNode, '', 0, 60, 56, gold);
        this.subMsgLabel = this.makeLabel(canvasNode, '', 0, 0, 26, white);

        // 三个道具按钮（临时文字按钮）
        const names: Array<['remove' | 'magnet' | 'shuffle', string]> = [
            ['remove', '「移出」'], ['magnet', '「凑齐」'], ['shuffle', '「打乱」'],
        ];
        names.forEach(([kind, text], i) => {
            this.makeLabel(canvasNode, text, (i - 1) * 200, -H / 2 + 50, 34,
                new Color(140, 220, 130), () => onProp(kind));
        });
    }

    private makeLabel(parent: Node, text: string, x: number, y: number, size: number,
        color: Color, onTap?: () => void): Label {
        const n = new Node('lbl_' + text);
        n.layer = Layers.Enum.UI_2D;
        n.setParent(parent);
        n.setPosition(v3(x, y, 0));
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = size;
        l.lineHeight = size * 1.3;
        l.color = color;
        if (onTap) n.on(NodeEventType.TOUCH_END, onTap);
        return l;
    }
}
