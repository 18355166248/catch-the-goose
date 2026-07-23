import { Color } from 'cc';
import { BoundaryDef } from './ContainerBoundary';

/**
 * 场景皮肤（换肤只换外观，不改玩法与物理边界）。
 *
 * 一套皮肤 = 一张整屏背景图（SceneBackground 等比铺满）+ 一个中央置物筐 3D 模型。
 * 换肤时销毁并按新皮肤重建 SceneRoot 即可。
 */

export interface SceneSkin {
    id: string;
    /** 选皮面板显示名。 */
    name: string;
    /** 选皮面板预览用的两个代表色（面色 + 描边色）。 */
    swatch: [Color, Color];
    /** 背景 Sprite 的叠加色，通常留白（255,255,255）不改变贴图本色。 */
    backdrop: Color;
    /** 背景贴图名（resources/textures/<tex>/texture）。 */
    backdropTex?: string;
    /**
     * 中央置物筐 3D 模型 id（resources/models/<id>.glb）。加载后摆到容器中央并按开口缩放。
     * 留空则中央无可见容器（模型尚未就绪的皮肤），物件仍由隐形围栏约束。
     */
    containerModel?: string;
    /**
     * 承载物边界（换成圆锅/圆碗/圆筐等造型时声明）。留空 = 沿用默认矩形边界。
     * 声明后物理围栏、逃逸判定、视觉兜底、投放种子全部按该形状生效，物品不会离开容器。
     * 需与 containerModel 的开口对齐。
     */
    boundary?: BoundaryDef;
}

/**
 * 三套皮肤。背景图为「不带置物筐」的纯场景（四周陈设 + 中央留空），由 SceneBackground
 * 全屏等比铺满、不变形、随设备自适应；中央置物筐是独立的 3D 模型（containerModel），
 * 按皮肤加载并自动缩放到 CONTAINER_SPAN，隐形物理围栏保证物件精确落在筐内。
 *
 * 尚未配模型的皮肤留空 containerModel，中央暂无可见容器，
 * 物件仍由隐形围栏 + 平面阴影表现。
 */
const WHITE = () => new Color(255, 255, 255);

export const SKINS: SceneSkin[] = [
    {
        id: 'redwood', name: '深红木',
        swatch: [new Color(151, 78, 50), new Color(198, 156, 92)],
        backdrop: WHITE(),
        backdropTex: 'bg_redwood',
        containerModel: 'basket_redwood',
    },
    {
        id: 'jade', name: '翡翠青玉',
        swatch: [new Color(120, 178, 150), new Color(214, 178, 98)],
        backdrop: WHITE(),
        backdropTex: 'bg_jade',
        containerModel: 'bowl_jade',
        // 圆碗必须用圆边界：套默认矩形围栏时，矩形 4 角会把物件顶到碗壁外侧 = 穿模。
        // 圆心沿用默认矩形中心 (0,-0.88)。半径为保守初值——物件先落在碗内留余量；
        // 打开 GameManager.DEBUG_FENCE 看青色环段与碗口的差距后，逐步调大到贴合碗口。
        // clamp 略大于 wall，给渲染外轮廓留一点缓冲。
        boundary: {
            wall: { kind: 'circle', cx: 0, cz: -0.88, radius: 1.65 },
            clamp: { kind: 'circle', cx: 0, cz: -0.88, radius: 1.85 },
        },
    },
    {
        // 藤编方托盘模型待出（见 container-model-prompts.md 第 3 条），暂无可见容器。
        id: 'picnic', name: '户外野餐',
        swatch: [new Color(198, 158, 108), new Color(120, 150, 78)],
        backdrop: WHITE(),
        backdropTex: 'bg_picnic',
    },
];

export const DEFAULT_SKIN_ID = 'redwood';

/** 按 id 取皮肤，未知 id 回落到默认皮肤（存档损坏/旧版本兼容）。 */
export function getSkin(id: string | null | undefined): SceneSkin {
    return SKINS.find(s => s.id === id) ?? SKINS[0];
}
