import { Color } from 'cc';
import { BoundaryDef } from './ContainerBoundary';

/**
 * 场景皮肤（换肤只换外观，不改玩法与物理边界）。
 *
 * 3D 容器/背景全部由 GameManager.buildBox() 程序化生成，颜色和贴图都是参数。
 * 这里把整套调色板抽成预设，切皮时销毁并按新皮肤重建 SceneRoot 即可。
 */

/** 一个可换色部件：底色 + 可选贴图（贴图会被底色着色，走 resources/textures/<tex>/texture）。 */
export interface SkinRole {
    color: Color;
    tex?: string;
}

export interface SceneSkin {
    id: string;
    /** 选皮面板显示名。 */
    name: string;
    /** 选皮面板预览用的两个代表色（面色 + 描边色）。 */
    swatch: [Color, Color];
    /** 篮底板。 */
    floor: SkinRole;
    /** 厚框 / 外框 / 柜框。 */
    frame: SkinRole;
    /** 内沿 / 格栅 / 高光沿。 */
    rim: SkinRole;
    /** 铰链 / 角件（金件或金属件）。 */
    accent: Color;
    /** 篮底投影色。 */
    shadow: Color;
    /** 背景大板（unlit，叠加在背景贴图上着色）。 */
    backdrop: Color;
    /** 背景贴图名，默认 'backdrop'。 */
    backdropTex?: string;
    /** 木盒三大部件粗糙度：塑料/瓷器更小更亮，木头留空用默认 0.85。 */
    gloss?: number;
    /**
     * 承载物边界（换成圆锅/圆碗/圆筐等造型时声明）。留空 = 沿用默认矩形边界。
     * 声明后物理围栏、逃逸判定、视觉兜底、投放种子全部按该形状生效，物品不会离开容器。
     * 注意：非矩形场景还需在 GameManager.buildBox 里替换对应的可见容器几何。
     */
    boundary?: BoundaryDef;
}

/**
 * 六套皮肤。第一套 redwood 与换肤前的硬编码调色板一字不差，作为默认皮肤。
 */
export const SKINS: SceneSkin[] = [
    {
        id: 'redwood', name: '深红木',
        swatch: [new Color(137, 72, 48), new Color(72, 28, 22)],
        floor: { color: new Color(93, 45, 33), tex: 'wood_floor' },
        frame: { color: new Color(72, 28, 22), tex: 'wood_dark' },
        rim: { color: new Color(137, 72, 48), tex: 'wood_floor' },
        accent: new Color(205, 151, 62),
        shadow: new Color(39, 18, 17),
        backdrop: new Color(255, 255, 255),
        backdropTex: 'bg_redwood',
    },
    {
        id: 'jade', name: '翡翠青玉',
        swatch: [new Color(70, 156, 128), new Color(20, 72, 58)],
        floor: { color: new Color(34, 102, 84) },
        frame: { color: new Color(20, 72, 58) },
        rim: { color: new Color(70, 156, 128) },
        accent: new Color(214, 178, 98),
        shadow: new Color(10, 38, 30),
        backdrop: new Color(255, 255, 255),
        backdropTex: 'bg_jade',
        gloss: 0.45,
    },
    {
        id: 'picnic', name: '户外野餐',
        // 藤编野餐篮：暖调柳条 + 草绿格纹背景（bg_picnic）；矩形边界沿用默认，容器几何暂用木盒重着色。
        swatch: [new Color(198, 158, 108), new Color(120, 150, 78)],
        floor: { color: new Color(198, 158, 108) },
        frame: { color: new Color(150, 112, 68) },
        rim: { color: new Color(216, 184, 130) },
        accent: new Color(180, 140, 90),
        shadow: new Color(90, 70, 44),
        backdrop: new Color(255, 255, 255),
        backdropTex: 'bg_picnic',
        gloss: 0.5,
    },
];

export const DEFAULT_SKIN_ID = 'redwood';

/** 按 id 取皮肤，未知 id 回落到默认皮肤（存档损坏/旧版本兼容）。 */
export function getSkin(id: string | null | undefined): SceneSkin {
    return SKINS.find(s => s.id === id) ?? SKINS[0];
}
