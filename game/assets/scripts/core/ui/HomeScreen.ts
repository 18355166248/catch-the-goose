import { Node, Color, Layers, UITransform, Graphics, NodeEventType } from 'cc';
import { Screen } from './UIRouter';
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

/**
 * 挑战路线页：首个地图章节使用设计稿拆分出的真实美术层，交互热区和文案仍由代码驱动。
 * 新地图继续向章节上方追加，既保住当前稿的完成度，也不把整页做成无法扩展的死图。
 */
export class HomeScreen implements Screen {
    readonly name = 'home';
    // 头图自身从 y=778.5 开始；1700 高的纯色托底属于出血，不应在宽屏顶部露出来。
    readonly artTop = 778.5;
    readonly dimWorld = true;

    private mapContent: Node | null = null;
    private scrollY = 0;
    private minScroll = 0;
    private maxScroll = 0;

    constructor(private data: HomeData) {}

    build(root: Node) {
        const d = this.data;
        // 图片异步载入前用深胡桃木兜底，避免首帧闪出游戏中的 3D 场景。
        UIKit.panel(root, 760, 1700, 0, new Color(71, 39, 23), 0, 0);

        this.buildMapViewport(root);

        // 底部整块取自选定设计稿，木纹、浮雕、轨道、按钮和阴影都保持原始质感。
        UIKit.image(root, 'textures/challenge-ui/bottom-dynamic/texture',
            720, 543, 0, -506);
        this.buildChallengePanel(root);

        UIKit.image(root, 'textures/challenge-ui/header-reference/texture', 720, 173, 0, 692);
        UIKit.hitArea(root, 68, 76, 244, 716, () => this.showSettings(root));
        UIKit.hitArea(root, 76, 76, 310, 716, () => {
            d.soundOn = d.onToggleSound();
            this.showSoundToast(root, d.soundOn);
        });

        this.buildBottomDock(root);
    }

    private rebuild(root: Node) {
        for (const child of [...root.children]) child.destroy();
        this.build(root);
    }

    /** 短屏只裁地图与长背景，开局主操作始终吸附在安全区底部。 */
    private buildBottomDock(root: Node) {
        const dock = new Node('screenBottomDock');
        dock.layer = Layers.Enum.UI_2D;
        dock.setParent(root);
        dock.addComponent(UITransform).setContentSize(720, 184);
        dock.active = false;

        UIKit.panel(dock, 720, 184, 0, new Color(70, 36, 20, 246), 0, 92);
        UIKit.image(dock, 'textures/challenge-ui/cta-button/texture', 564, 143, 0, 94);
        UIKit.hitArea(dock, 564, 143, 0, 94, this.data.onStart);
    }

    /** 设置入口使用独立页面内浮层，避免借用已隐藏的游玩 HUD 弹窗层。 */
    private showSettings(root: Node) {
        root.getChildByName('homeSettings')?.destroy();
        const overlay = new Node('homeSettings');
        overlay.layer = Layers.Enum.UI_2D;
        overlay.setParent(root);
        overlay.addComponent(UITransform).setContentSize(720, 1700);

        const mask = UIKit.panel(overlay, 720, 1700, 0, new Color(20, 12, 8, 170), 0, -71.5);
        mask.on(NodeEventType.TOUCH_END, () => overlay.isValid && overlay.destroy());

        const card = UIKit.panel(overlay, 500, 360, 32, UIColors.cream, 0, 410,
            UIColors.edge, 6);
        UIKit.label(card, '设 置', 44, UIColors.gold, 0, 118);
        const sound = UIKit.panel(card, 360, 82, 22, new Color(238, 220, 188), 0, 28,
            UIColors.edgeSoft, 3);
        const soundLabel = UIKit.label(sound, `声音  ${this.data.soundOn ? '开' : '关'}`,
            28, UIColors.text, 0, 0);
        UIKit.tap(sound, () => {
            this.data.soundOn = this.data.onToggleSound();
            soundLabel.string = `声音  ${this.data.soundOn ? '开' : '关'}`;
        });
        const close = UIKit.panel(card, 260, 72, 20, UIColors.goldFill, 0, -92,
            UIColors.edge, 4);
        UIKit.label(close, '关闭', 28, UIColors.text, 0, 0);
        UIKit.tap(close, () => overlay.isValid && overlay.destroy());
    }

    private showSoundToast(root: Node, on: boolean) {
        root.getChildByName('soundToast')?.destroy();
        const toast = UIKit.panel(root, 250, 66, 24, new Color(48, 29, 18, 230),
            0, 610, UIColors.edge, 3);
        toast.name = 'soundToast';
        UIKit.label(toast, on ? '声音已开启' : '声音已关闭', 24, UIColors.cream, 0, 0);
        setTimeout(() => toast.isValid && toast.destroy(), 1200);
    }

    /**
     * 第一章按设计稿拆成固定标题与地图 body，地图切换只替换 body。
     * 后续新增地图时按章节追加同规格 segment，而不是回退到程序化圆点占位。
     */
    private buildMapViewport(root: Node) {
        const viewport = new Node('mapViewport');
        viewport.layer = Layers.Enum.UI_2D;
        viewport.setParent(root);
        viewport.setPosition(0, 201, 0);
        viewport.addComponent(UITransform).setContentSize(720, 912);

        const selectedMap = this.data.maps.find(m => m.selected);
        const body = selectedMap?.id === 'antique'
            ? 'textures/challenge-ui/map-antique-body/texture'
            : 'textures/challenge-ui/map-fruit-body/texture';
        UIKit.image(viewport, body, 720, 912, 0, 0);

        // 首章两个节点已由插画完整绘制，只覆盖透明热区，不再叠加程序化圆圈和牌匾。
        const fruit = this.data.maps[0];
        const antique = this.data.maps[1];
        if (fruit?.playable) UIKit.hitArea(viewport, 250, 240, -124, -144,
            () => this.data.onPickMap(fruit.id));
        if (antique?.playable) UIKit.hitArea(viewport, 250, 240, 146, 228,
            () => this.data.onPickMap(antique.id));
    }

    private drawRoute(parent: Node, points: { x: number; y: number }[]) {
        if (points.length < 2) return;
        const n = new Node('route');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(parent);
        n.addComponent(UITransform).setContentSize(720, parent.getComponent(UITransform)?.height ?? 1200);
        const g = n.addComponent(Graphics);
        g.lineWidth = 18;
        g.strokeColor = new Color(247, 232, 186, 238);
        g.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            // 路线用折线而非固定贴图：新增节点时它会自动连上，不需要重新出一张长图。
            const mid = (points[i - 1].y + points[i].y) / 2;
            g.lineTo(points[i - 1].x, mid);
            g.lineTo(points[i].x, mid);
            g.lineTo(points[i].x, points[i].y);
        }
        g.stroke();
    }

    private buildMapNode(parent: Node, map: MapChoice, x: number, y: number, index: number) {
        const selected = map.selected;
        const fill = map.playable
            ? (selected ? new Color(255, 210, 67) : new Color(255, 244, 214))
            : new Color(205, 195, 165);
        const marker = UIKit.panel(parent, selected ? 148 : 126, selected ? 148 : 126,
            selected ? 74 : 63, fill, x, y, selected ? new Color(255, 250, 204) : UIColors.edge,
            selected ? 10 : 5);
        if (selected) {
            // 选中节点用工程现有的大鹅真图作“玩家棋子”，对应设计稿里的旅行主角。
            // 未选节点继续显示路线序号，节点再多也不会需要额外美术。
            UIKit.image(marker, 'icons/goose/texture', 92, 92, 0, 5);
        } else {
            UIKit.label(marker, map.playable ? `${index + 1}` : '…', 40,
                map.playable ? UIColors.text : UIColors.textLocked, 0, 3);
        }

        const labelY = y - (selected ? 112 : 98);
        const label = UIKit.panel(parent, 274, 84, 18,
            map.playable ? new Color(255, 244, 214, 250) : new Color(224, 216, 191, 242),
            x, labelY, selected ? UIColors.gold : UIColors.edgeSoft, selected ? 5 : 3);
        UIKit.label(label, map.name, 28, map.playable ? UIColors.text : UIColors.textLocked, 0, 15);
        UIKit.label(label, map.tagline, 17, UIColors.textSoft, 0, -20);

        if (map.playable) {
            UIKit.tap(marker, () => this.data.onPickMap(map.id));
            UIKit.tap(label, () => this.data.onPickMap(map.id));
        }
    }

    private buildChallengePanel(root: Node) {
        const d = this.data;
        const selectedMap = d.maps.find(m => m.selected);
        const selectedLevel = d.levels.find(l => l.selected);
        const detail = selectedLevel?.detail.replace(/ · 石头 \d+/, '') ?? '';
        const compactDetail = detail.split(' · ').slice(1).join(' · ');
        UIKit.label(root,
            `${selectedLevel?.text ?? '标准'}挑战 · ${compactDetail}`,
            26, new Color(116, 73, 42), 0, -324);

        const selectedLevelIndex = Math.max(0, d.levels.findIndex(l => l.selected));
        const difficultyTextures = [
            'textures/challenge-ui/difficulty-easy-selected/texture',
            'textures/challenge-ui/difficulty-normal-selected/texture',
            'textures/challenge-ui/difficulty-master-selected/texture',
        ];
        UIKit.image(root, difficultyTextures[selectedLevelIndex] ?? difficultyTextures[0],
            581, 164, 0, -451);

        const xs = [-220, 0, 220];
        d.levels.forEach((lv, i) => {
            if (lv.unlocked) UIKit.hitArea(root, 176, 164, xs[i], -451, () => d.onPickLevel(i));
        });

        // 主按钮本身来自设计稿，点击区单独覆盖，避免再画一层粗糙的通用按钮。
        UIKit.hitArea(root, 564, 143, 0, -648, d.onStart);
    }

    private clamp(value: number, min: number, max: number) {
        return Math.max(min, Math.min(max, value));
    }

    dispose() {
        this.mapContent = null;
    }
}
