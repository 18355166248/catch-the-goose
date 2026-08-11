import {
    Node, Layers, Label, Color, UITransform, Graphics, tween, v3, Font,
    resources, SpriteFrame, Sprite, Texture2D,
} from 'cc';
import { NodeEventType } from 'cc';

/**
 * 页面的绘制原语：面板、文字、卡片、按钮。
 *
 * 存在的理由是「后面会有很多页面」——每个页面各画各的，配色和圆角很快就会飘。
 * 这里把工程既有的视觉语言固定成一组动词，新页面只调用、不自创。
 *
 * 配色取自 HudUI 里已在用的那套，不是新设计：
 *   奶油面 255,244,214 ／ 金描边 196,130,64 ／ 标题橙 240,150,26
 *   文字棕 102,57,28 ／ 弱化棕 158,122,82 ／ 强调金 255,207,55
 */
export const UIColors = {
    cream: new Color(255, 244, 214),
    creamCard: new Color(250, 238, 210),
    creamLocked: new Color(238, 226, 202),
    gold: new Color(240, 150, 26),
    goldFill: new Color(255, 207, 55),
    edge: new Color(196, 130, 64),
    edgeSoft: new Color(198, 168, 120),
    text: new Color(102, 57, 28),
    textSoft: new Color(158, 122, 82),
    textLocked: new Color(176, 156, 128),
    green: new Color(52, 148, 68),
    starOff: new Color(224, 203, 160),
    parchment: new Color(244, 224, 174),
    mapGreen: new Color(86, 137, 73),
    mapBlue: new Color(83, 167, 178),
    wood: new Color(96, 52, 27),
} as const;

export class UIKit {
    /**
     * 资源图的统一加载入口。页面先搭好结构，图片异步回来后再出现；加载失败保留页面底色，
     * 不让一个美术资源 404 把首次启动卡成空白页。
     */
    static image(parent: Node, resourcePath: string, w: number, h: number,
        x: number, y: number, opacity = 255): Node {
        const n = new Node('image');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(parent);
        n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(w, h);
        resources.load(resourcePath, Texture2D, (err, texture) => {
            if (err || !n.isValid || !texture) return;
            // 工程图片统一按 Texture2D 导入（没有 SpriteFrame 子资源），页面层在运行时包装。
            const frame = new SpriteFrame();
            frame.texture = texture;
            const sprite = n.addComponent(Sprite);
            // Sprite 默认以 RAW 模式接收首张纹理，会把节点偷偷改回图片原始像素尺寸；
            // 先切 CUSTOM、赋帧后再恢复设计尺寸，才能让 853px 稿件严格落在 720 美术宽度上。
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = frame;
            n.getComponent(UITransform)?.setContentSize(w, h);
            sprite.color = new Color(255, 255, 255, opacity);
        });
        return n;
    }

    /**
     * 透明点击区只负责交互，不再用临时色块破坏设计稿切图。
     * 视觉资产与触控热区分离后，后续替换贴图不会影响路由和业务回调。
     */
    static hitArea(parent: Node, w: number, h: number, x: number, y: number,
        onTap: () => void): Node {
        const n = new Node('hitArea');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(parent);
        n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(w, h);
        n.on(NodeEventType.TOUCH_END, onTap);
        return n;
    }

    /** 圆角矩形。所有面板与卡片的底座。 */
    static panel(parent: Node, w: number, h: number, r: number, fill: Color,
        x: number, y: number, stroke?: Color, strokeW = 0): Node {
        const n = new Node('panel');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(parent);
        n.addComponent(UITransform).setContentSize(w, h);
        n.setPosition(x, y, 0);
        const g = n.addComponent(Graphics);
        const rr = Math.min(r, w / 2, h / 2);
        g.roundRect(-w / 2, -h / 2, w, h, rr);
        g.fillColor = fill;
        g.fill();
        if (stroke && strokeW > 0) {
            g.lineWidth = strokeW;
            g.strokeColor = stroke;
            g.stroke();
        }
        return n;
    }

    /**
     * 文字。
     *
     * anchorLeft 是必要的：Label 默认以自身中心为锚点，长短不一的文字左边缘对不齐，
     * 长文本还会溢出卡片（踩过：难度行的「N 种」挂到框外）。
     */
    static label(parent: Node, text: string, size: number, color: Color,
        x: number, y: number, anchorLeft = false): Label {
        const n = new Node('lbl');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(parent);
        n.setPosition(x, y, 0);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = size;
        l.lineHeight = size * 1.25;
        l.color = color;
        l.overflow = Label.Overflow.NONE;
        if (anchorLeft) {
            l.horizontalAlign = Label.HorizontalAlign.LEFT;
            n.getComponent(UITransform)?.setAnchorPoint(0, 0.5);
        }
        return l;
    }

    static title(parent: Node, text: string, x: number, y: number) {
        return UIKit.label(parent, text, 62, UIColors.gold, x, y);
    }

    static caption(parent: Node, text: string, x: number, y: number) {
        return UIKit.label(parent, text, 21, UIColors.textSoft, x, y);
    }

    /** 分区小标题（「选择场景」这类）。 */
    static section(parent: Node, text: string, x: number, y: number) {
        return UIKit.label(parent, text, 22, UIColors.textSoft, x, y, true);
    }

    static footer(parent: Node, text: string, x: number, y: number) {
        return UIKit.label(parent, text, 20, UIColors.textSoft, x, y);
    }

    /** 可选卡片。selected 描金加粗，locked 压暗且不描边。 */
    static card(parent: Node, w: number, h: number, x: number, y: number,
        selected: boolean, unlocked = true): Node {
        const fill = unlocked ? UIColors.creamCard : UIColors.creamLocked;
        return UIKit.panel(parent, w, h, 20, fill, x, y,
            selected ? UIColors.gold : UIColors.edgeSoft, selected ? 6 : 3);
    }

    /** 场景卡左侧的两条主色预览。 */
    static swatch(card: Node, a: Color, b: Color, x: number) {
        UIKit.panel(card, 48, 66, 12, a, x, 0, new Color(255, 255, 255, 120), 2);
        UIKit.panel(card, 24, 66, 8, b, x + 40, 0);
    }

    static cardTitle(card: Node, text: string, x: number) {
        return UIKit.label(card, text, 26, UIColors.text, x, 18, true);
    }

    static cardNote(card: Node, text: string, color: Color, x: number) {
        return UIKit.label(card, text, 18, color, x, -18, true);
    }

    static rowTitle(card: Node, text: string, x: number, y: number, unlocked: boolean) {
        return UIKit.label(card, text, 27, unlocked ? UIColors.text : UIColors.textLocked, x, y, true);
    }

    static rowNote(card: Node, text: string, x: number, y: number) {
        return UIKit.label(card, text, 18, UIColors.textSoft, x, y, true);
    }

    /** 三颗星：亮星 = 已达成。同时兼作解锁指示（全灰 = 没通关过）。 */
    static stars(card: Node, filled: number, x: number, y = 0, size = 26, gap = 32) {
        for (let i = 0; i < 3; i++) {
            UIKit.label(card, '★', size,
                i < filled ? UIColors.gold : UIColors.starOff, x + i * gap, y);
        }
    }

    /** 主按钮：下沉阴影 + 按压回弹，与工程既有按钮同款手感。 */
    static primaryButton(parent: Node, text: string, x: number, y: number, onTap: () => void): Node {
        const hit = new Node('btn');
        hit.layer = Layers.Enum.UI_2D;
        hit.setParent(parent);
        hit.setPosition(x, y, 0);
        const w = 360, h = 96;
        hit.addComponent(UITransform).setContentSize(w, h);
        UIKit.panel(hit, w, h, 24, UIColors.edge, 0, -6);
        const face = UIKit.panel(hit, w, h, 24, UIColors.goldFill, 0, 0, UIColors.edge, 5);
        UIKit.label(face, text, 36, UIColors.text, 0, 0);
        UIKit.tap(hit, onTap);
        return hit;
    }

    /** 小型圆键，供整页导航使用；不借用游玩 HUD，避免页面之间互相持有节点。 */
    static roundButton(parent: Node, text: string, x: number, y: number, onTap: () => void): Node {
        const hit = UIKit.panel(parent, 64, 64, 32, UIColors.cream, x, y, UIColors.edge, 4);
        UIKit.label(hit, text, 27, UIColors.text, 0, 1);
        UIKit.tap(hit, onTap);
        return hit;
    }

    /** 按下缩一点、松手弹回。所有可点元素共用，保证手感一致。 */
    static tap(node: Node, onTap: () => void) {
        node.on(NodeEventType.TOUCH_START, () => {
            tween(node).stop();
            tween(node).to(0.06, { scale: v3(0.96, 0.96, 1) }).start();
        });
        node.on(NodeEventType.TOUCH_END, () => {
            tween(node).to(0.08, { scale: v3(1, 1, 1) }, { easing: 'backOut' }).start();
            onTap();
        });
        node.on(NodeEventType.TOUCH_CANCEL, () => {
            tween(node).to(0.08, { scale: v3(1, 1, 1) }, { easing: 'backOut' }).start();
        });
    }
}

void Font;
