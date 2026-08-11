import {
    Node, Color, Layers, UITransform, NodeEventType, Mask, EventTouch, EventMouse, Label, Graphics,
} from 'cc';
import { Screen, ScreenViewport } from './UIRouter';
import { UIKit, UIColors } from './UIKit';

export interface MapChoice {
    id: string;
    name: string;
    tagline: string;
    routeX: number;
    selected: boolean;
    playable: boolean;
}

export interface HomeData {
    maps: MapChoice[];
    levels: { text: string; detail: string; stars: number; unlocked: boolean; selected: boolean }[];
    dailyText: string;
    bestText: string;
    soundOn: boolean;
    onPickMap: (id: string) => void;
    onPickLevel: (index: number) => void;
    onToggleSound: () => boolean;
    onStart: () => void;
}

const HEADER_H = 173;
const BASE_MAP_H = 912;
const EXTENSION_H = 1440;

/**
 * 挑战首页：顶部品牌、滚动地图、底部挑战控制台是三个独立区域。
 *
 * 关键约束：短屏只能压缩/裁切地图，摘要、难度、提示、开始按钮和次数必须作为一个
 * 完整控制台固定在可视底部。后续地图按两站一段向上追加，页面本身不需要改布局。
 */
export class HomeScreen implements Screen {
    readonly name = 'home';
    readonly artTop = 778.5;
    readonly dimWorld = true;

    private root: Node | null = null;
    private mapViewport: Node | null = null;
    private mapContent: Node | null = null;
    private controlDeck: Node | null = null;
    private deckBg: Node | null = null;
    private summaryFrame: Node | null = null;
    private summaryLabel: Label | null = null;
    private difficultyArt: Node | null = null;
    private difficultyHits: Node[] = [];
    private lockNote: Node | null = null;
    private ctaArt: Node | null = null;
    private ctaHit: Node | null = null;
    private footerLabel: Label | null = null;
    private soundStateArt: Node | null = null;

    private contentBottom = -BASE_MAP_H / 2;
    private contentTop = BASE_MAP_H / 2;
    private scrollY = 0;
    private minScroll = 0;
    private maxScroll = 0;
    private userScrolled = false;
    private mapDragging = false;
    private dragDistance = 0;
    private visibleBottom = -779.5;

    constructor(private data: HomeData) {}

    build(root: Node) {
        this.root = root;
        // 超高底色覆盖所有可见比例，宽屏两侧由路由层的暗木背景自然留空。
        UIKit.panel(root, 760, 3600, 0, new Color(71, 39, 23), 0, this.artTop - 1800);

        this.buildMapViewport(root);
        this.buildControlDeck(root);

        // 标题与右上控制固定在最上层，地图滚动不会把设置和声音带走。
        UIKit.image(root, 'textures/challenge-ui/header-reference/texture', 720, HEADER_H,
            0, this.artTop - HEADER_H / 2);
        UIKit.hitArea(root, 68, 76, 244, this.artTop - 62.5, () => this.showSettings());
        this.soundStateArt = this.buildSoundState(root);
        UIKit.hitArea(root, 76, 76, 310, this.artTop - 62.5, () => {
            this.data.soundOn = this.data.onToggleSound();
            this.drawSoundState();
            this.showSoundToast(this.data.soundOn);
        });

        // build 后立刻给一份标准竖屏布局；首个 sync 会用真实窗口尺寸覆盖它。
        this.layout({ topY: this.artTop, bottomY: -779.5, width: 720, height: 1558 });
    }

    /** 固定头尾，把剩余高度全部交给可裁切地图。 */
    layout(viewport: ScreenViewport) {
        this.visibleBottom = viewport.bottomY;
        // 控制台始终保留完整的信息层级；短屏只裁地图，不能再拿底部次数换空间。
        const deckH = this.clamp(500 + (viewport.height - 1100) * 0.04, 500, 530);
        const deckCenter = viewport.bottomY + deckH / 2;
        this.place(this.controlDeck, 720, deckH, 0, deckCenter);
        this.place(this.deckBg, 720, deckH, 0, 0);
        this.layoutDeck(deckH);

        const mapTop = viewport.topY - HEADER_H;
        // 木框顶边向地图压 8px，形成“地图插在控制台后面”的层次，同时不盖住地图节点。
        const mapBottom = viewport.bottomY + deckH - 8;
        const mapH = Math.max(360, mapTop - mapBottom);
        this.place(this.mapViewport, 720, mapH, 0, (mapTop + mapBottom) / 2);
        this.updateScrollBounds(mapH);
    }

    private buildMapViewport(root: Node) {
        const viewport = new Node('mapViewport');
        viewport.layer = Layers.Enum.UI_2D;
        viewport.setParent(root);
        viewport.addComponent(UITransform).setContentSize(720, BASE_MAP_H);
        viewport.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
        this.mapViewport = viewport;

        const content = new Node('mapScrollContent');
        content.layer = Layers.Enum.UI_2D;
        content.setParent(viewport);
        this.mapContent = content;

        const previewMaps = this.data.maps.slice(2);
        // 即使当前只有两张可玩地图，也保留一段向上的路线，让“旅程会继续”在画面上成立。
        const extensionCount = Math.max(1, Math.ceil(previewMaps.length / 2));
        for (let i = 0; i < extensionCount; i++) {
            UIKit.image(content, 'textures/challenge-ui/map-route-extension/texture',
                720, EXTENSION_H, 0, BASE_MAP_H / 2 + EXTENSION_H / 2 + i * EXTENSION_H);
        }

        const selectedMap = this.data.maps.find(m => m.selected);
        const body = selectedMap?.id === 'antique'
            ? 'textures/challenge-ui/map-antique-body/texture'
            : 'textures/challenge-ui/map-fruit-body/texture';
        UIKit.image(content, body, 720, BASE_MAP_H, 0, 0);

        // 首章的两站已经完整画进插画，只叠透明热区，避免额外图形破坏美术。
        const fruit = this.data.maps[0];
        const antique = this.data.maps[1];
        if (fruit?.playable) UIKit.hitArea(content, 250, 240, -124, -144,
            () => this.tapMap(fruit.id));
        if (antique?.playable) UIKit.hitArea(content, 250, 240, 146, 228,
            () => this.tapMap(antique.id));

        // 配置中第 3 站起自动落到扩展路线；模型未齐的站点以锁定节点预告。
        previewMaps.forEach((map, i) => {
            const y = BASE_MAP_H / 2 + 350 + i * 520;
            this.buildMapNode(content, map, map.routeX, y, i + 2);
        });

        this.contentTop = BASE_MAP_H / 2 + extensionCount * EXTENSION_H;
        this.contentBottom = -BASE_MAP_H / 2;
        content.addComponent(UITransform).setContentSize(720, this.contentTop - this.contentBottom);

        const onDragStart = () => {
            this.mapDragging = false;
            this.dragDistance = 0;
        };
        const onDragMove = (event: EventTouch) => {
            const delta = event.getUIDelta();
            this.dragDistance += Math.abs(delta.y);
            if (this.dragDistance > 8) this.mapDragging = true;
            this.userScrolled = true;
            this.scrollY = this.clamp(this.scrollY + delta.y, this.minScroll, this.maxScroll);
            this.mapContent?.setPosition(0, this.scrollY, 0);
        };
        const onDragEnd = () => { this.mapDragging = false; };

        // 地图内部有站点热区和多张 Sprite。使用捕获阶段监听，保证从插画或站点上起手都能拖动，
        // 不会因为子节点成为触摸目标而丢掉 MOVE；桌面端同时支持滚轮查看长地图。
        viewport.on(NodeEventType.TOUCH_START, onDragStart, this, true);
        viewport.on(NodeEventType.TOUCH_MOVE, onDragMove, this, true);
        viewport.on(NodeEventType.TOUCH_END, onDragEnd, this, true);
        viewport.on(NodeEventType.TOUCH_CANCEL, onDragEnd, this, true);
        viewport.on(NodeEventType.MOUSE_WHEEL, (event: EventMouse) => {
            const direction = Math.sign(event.getScrollY());
            if (!direction) return;
            this.userScrolled = true;
            this.scrollY = this.clamp(this.scrollY - direction * 96, this.minScroll, this.maxScroll);
            this.mapContent?.setPosition(0, this.scrollY, 0);
        }, this, true);
    }

    /** 顶部声音键直接呈现当前状态：开启只显示绿点，静音显示红色斜杠和红点。 */
    private buildSoundState(root: Node) {
        const state = new Node('homeSoundState');
        state.layer = Layers.Enum.UI_2D;
        state.setParent(root);
        state.setPosition(310, this.artTop - 62.5, 0);
        state.addComponent(UITransform).setContentSize(76, 76);
        state.addComponent(Graphics);
        this.soundStateArt = state;
        this.drawSoundState();
        return state;
    }

    private drawSoundState() {
        const graphics = this.soundStateArt?.getComponent(Graphics);
        if (!graphics) return;
        graphics.clear();

        if (this.data.soundOn) {
            graphics.fillColor = new Color(74, 157, 67);
        } else {
            // 先画浅色垫线再画红色斜杠，压在深色扬声器上仍然清楚。
            graphics.lineWidth = 11;
            graphics.strokeColor = new Color(255, 239, 196);
            graphics.moveTo(-17, 18);
            graphics.lineTo(19, -18);
            graphics.stroke();
            graphics.lineWidth = 7;
            graphics.strokeColor = new Color(181, 63, 43);
            graphics.moveTo(-17, 18);
            graphics.lineTo(19, -18);
            graphics.stroke();
            graphics.fillColor = new Color(190, 66, 45);
        }
        graphics.circle(25, -25, 8);
        graphics.fill();
        graphics.lineWidth = 3;
        graphics.strokeColor = new Color(255, 239, 196);
        graphics.stroke();
    }

    private buildControlDeck(root: Node) {
        const deck = new Node('challengeControlDeck');
        deck.layer = Layers.Enum.UI_2D;
        deck.setParent(root);
        deck.addComponent(UITransform).setContentSize(720, 430);
        this.controlDeck = deck;

        this.deckBg = UIKit.image(deck, 'textures/challenge-ui/control-deck-bg/texture',
            720, 430, 0, 0);
        this.summaryFrame = UIKit.image(deck, 'textures/challenge-ui/summary-frame-blank/texture',
            620, 78, 0, 166);

        const selectedLevel = this.data.levels.find(l => l.selected);
        const detail = selectedLevel?.detail.replace(/ · 石头 \d+/, '') ?? '';
        const compactDetail = detail.split(' · ').slice(1).join(' · ');
        this.summaryLabel = UIKit.label(deck,
            `${selectedLevel?.text ?? '标准'}挑战 · ${compactDetail}`,
            25, new Color(116, 73, 42), 0, 166);

        const selectedLevelIndex = Math.max(0, this.data.levels.findIndex(l => l.selected));
        const difficultyTextures = [
            'textures/challenge-ui/difficulty-easy-clean/texture',
            'textures/challenge-ui/difficulty-normal-clean/texture',
            'textures/challenge-ui/difficulty-master-clean/texture',
        ];
        this.difficultyArt = UIKit.image(deck,
            difficultyTextures[selectedLevelIndex] ?? difficultyTextures[0], 600, 170, 0, 70);

        const xs = [-220, 0, 220];
        this.data.levels.forEach((lv, i) => {
            const hit = UIKit.hitArea(deck, 176, 145, xs[i], 70, () => {
                if (!this.mapDragging && lv.unlocked) this.data.onPickLevel(i);
            });
            this.difficultyHits.push(hit);
        });

        // 提示文字不用再烘焙进带图标的切图，避免小屏缩放后图标和文案互相挤压。
        this.lockNote = UIKit.label(deck, '出发后地图与难度固定', 20,
            new Color(116, 73, 42), 0, -12).node;
        this.ctaArt = UIKit.image(deck, 'textures/challenge-ui/cta-button-clean/texture',
            520, 136, 0, -91);
        this.ctaHit = UIKit.hitArea(deck, 500, 112, 0, -91, this.data.onStart);

        this.footerLabel = UIKit.label(deck,
            `${this.data.dailyText}  ·  ${this.data.bestText}`,
            20, new Color(116, 73, 42), 0, -190);
    }

    private layoutDeck(deckH: number) {
        const s = this.clamp(deckH / 520, 0.96, 1.02);
        this.place(this.summaryFrame, 620 * s, 78 * s, 0, 205 * s);
        if (this.summaryLabel) {
            this.summaryLabel.fontSize = Math.round(25 * s);
            this.summaryLabel.lineHeight = Math.round(31 * s);
            this.summaryLabel.node.setPosition(0, 205 * s, 0);
        }
        this.place(this.difficultyArt, 600 * s, 170 * s, 0, 108 * s);
        const xs = [-220, 0, 220];
        this.difficultyHits.forEach((hit, i) => this.place(hit, 176 * s, 145 * s,
            xs[i] * s, 108 * s));
        this.place(this.lockNote, 340 * s, 48 * s, 0, -16 * s);
        this.place(this.ctaArt, 520 * s, 136 * s, 0, -112 * s);
        this.place(this.ctaHit, 500 * s, 112 * s, 0, -112 * s);
        if (this.footerLabel) {
            this.footerLabel.fontSize = Math.round(20 * s);
            this.footerLabel.lineHeight = Math.round(25 * s);
            this.footerLabel.node.setPosition(0, -187 * s, 0);
        }
    }

    /** 设置使用首页自己的浮层；卡片始终取当前可视范围中心，不受长地图滚动影响。 */
    private showSettings() {
        const root = this.root;
        if (!root) return;
        root.getChildByName('homeSettings')?.destroy();
        const overlay = new Node('homeSettings');
        overlay.layer = Layers.Enum.UI_2D;
        overlay.setParent(root);
        const overlayH = this.artTop - this.visibleBottom + 300;
        const centerY = (this.artTop + this.visibleBottom) / 2;
        overlay.addComponent(UITransform).setContentSize(720, overlayH);
        overlay.setPosition(0, centerY, 0);

        const mask = UIKit.panel(overlay, 720, overlayH, 0, new Color(20, 12, 8, 170), 0, 0);
        mask.on(NodeEventType.TOUCH_END, () => overlay.isValid && overlay.destroy());

        const card = UIKit.panel(overlay, 500, 360, 32, UIColors.cream, 0, 0,
            UIColors.edge, 6);
        UIKit.label(card, '设 置', 44, UIColors.gold, 0, 118);
        const sound = UIKit.panel(card, 360, 82, 22, new Color(238, 220, 188), 0, 28,
            UIColors.edgeSoft, 3);
        const soundLabel = UIKit.label(sound, `声音  ${this.data.soundOn ? '开' : '关'}`,
            28, UIColors.text, 0, 0);
        UIKit.tap(sound, () => {
            this.data.soundOn = this.data.onToggleSound();
            soundLabel.string = `声音  ${this.data.soundOn ? '开' : '关'}`;
            this.drawSoundState();
        });
        const close = UIKit.panel(card, 260, 72, 20, UIColors.goldFill, 0, -92,
            UIColors.edge, 4);
        UIKit.label(close, '关闭', 28, UIColors.text, 0, 0);
        UIKit.tap(close, () => overlay.isValid && overlay.destroy());
    }

    private showSoundToast(on: boolean) {
        const root = this.root;
        if (!root) return;
        root.getChildByName('soundToast')?.destroy();
        const toast = UIKit.panel(root, 250, 66, 24, new Color(48, 29, 18, 230),
            0, this.artTop - HEADER_H - 40, UIColors.edge, 3);
        toast.name = 'soundToast';
        UIKit.label(toast, on ? '声音已开启' : '声音已关闭', 24, UIColors.cream, 0, 0);
        setTimeout(() => toast.isValid && toast.destroy(), 1200);
    }

    private tapMap(id: string) {
        if (this.mapDragging || this.dragDistance > 8) return;
        this.data.onPickMap(id);
    }

    private updateScrollBounds(viewportH: number) {
        this.minScroll = viewportH / 2 - this.contentTop;
        this.maxScroll = -viewportH / 2 - this.contentBottom;
        if (this.minScroll > this.maxScroll) {
            const middle = (this.minScroll + this.maxScroll) / 2;
            this.minScroll = middle;
            this.maxScroll = middle;
        }
        if (!this.userScrolled) {
            const selected = this.data.maps.find(m => m.selected)?.id;
            // 水果篮靠下、古玩铺靠上；只在首进/重建时对准当前站，之后尊重玩家滚动位置。
            const target = selected === 'antique' ? -150 : 160;
            this.scrollY = this.clamp(target, this.minScroll, this.maxScroll);
        } else {
            this.scrollY = this.clamp(this.scrollY, this.minScroll, this.maxScroll);
        }
        this.mapContent?.setPosition(0, this.scrollY, 0);
    }

    private buildMapNode(parent: Node, map: MapChoice, x: number, y: number, index: number) {
        const selected = map.selected;
        const fill = map.playable
            ? (selected ? new Color(255, 210, 67) : new Color(255, 244, 214))
            : new Color(218, 207, 180, 248);
        const marker = UIKit.panel(parent, selected ? 142 : 116, selected ? 142 : 116,
            selected ? 71 : 58, fill, x, y,
            selected ? new Color(255, 250, 204) : UIColors.edgeSoft, selected ? 9 : 4);
        if (selected) UIKit.image(marker, 'icons/goose/texture', 88, 88, 0, 4);
        else UIKit.label(marker, map.playable ? `${index + 1}` : '…', 38,
            map.playable ? UIColors.text : UIColors.textLocked, 0, 3);

        const labelY = y - (selected ? 106 : 90);
        const label = UIKit.panel(parent, 270, 78, 18,
            map.playable ? new Color(255, 244, 214, 250) : new Color(230, 220, 196, 246),
            x, labelY, selected ? UIColors.gold : UIColors.edgeSoft, selected ? 5 : 3);
        UIKit.label(label, map.name, 27, map.playable ? UIColors.text : UIColors.textLocked, 0, 13);
        UIKit.label(label, map.tagline, 16, UIColors.textSoft, 0, -18);
        if (map.playable) {
            UIKit.tap(marker, () => this.tapMap(map.id));
            UIKit.tap(label, () => this.tapMap(map.id));
        }
    }

    private place(node: Node | null, w: number, h: number, x: number, y: number) {
        if (!node?.isValid) return;
        node.setPosition(x, y, 0);
        node.getComponent(UITransform)?.setContentSize(w, h);
    }

    private clamp(value: number, min: number, max: number) {
        return Math.max(min, Math.min(max, value));
    }

    dispose() {
        this.root = null;
        this.mapViewport = null;
        this.mapContent = null;
        this.controlDeck = null;
        this.soundStateArt = null;
    }
}
