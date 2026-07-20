import { Color } from 'cc';

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
    },
    {
        id: 'jade', name: '翡翠青玉',
        swatch: [new Color(70, 156, 128), new Color(20, 72, 58)],
        floor: { color: new Color(34, 102, 84) },
        frame: { color: new Color(20, 72, 58) },
        rim: { color: new Color(70, 156, 128) },
        accent: new Color(214, 178, 98),
        shadow: new Color(10, 38, 30),
        backdrop: new Color(222, 240, 232),
        gloss: 0.45,
    },
    {
        id: 'ebony', name: '鎏金黑檀',
        swatch: [new Color(230, 184, 80), new Color(30, 24, 21)],
        floor: { color: new Color(44, 35, 30), tex: 'wood_dark' },
        frame: { color: new Color(26, 20, 18), tex: 'wood_dark' },
        rim: { color: new Color(66, 52, 44), tex: 'wood_dark' },
        accent: new Color(230, 184, 80),
        shadow: new Color(6, 5, 5),
        backdrop: new Color(64, 52, 46),
        gloss: 0.6,
    },
    {
        id: 'porcelain', name: '青花瓷',
        swatch: [new Color(240, 244, 250), new Color(40, 82, 158)],
        floor: { color: new Color(236, 240, 248) },
        frame: { color: new Color(40, 82, 158) },
        rim: { color: new Color(206, 220, 242) },
        accent: new Color(44, 86, 162),
        shadow: new Color(120, 140, 178),
        backdrop: new Color(232, 238, 248),
        gloss: 0.3,
    },
    {
        id: 'oak', name: '暖阳原木',
        swatch: [new Color(224, 186, 134), new Color(158, 112, 66)],
        floor: { color: new Color(198, 152, 98), tex: 'wood_floor' },
        frame: { color: new Color(158, 112, 66), tex: 'wood_floor' },
        rim: { color: new Color(224, 186, 134), tex: 'wood_floor' },
        accent: new Color(214, 170, 96),
        shadow: new Color(120, 88, 54),
        backdrop: new Color(250, 240, 220),
    },
    {
        id: 'market', name: '超市购物篮',
        swatch: [new Color(232, 66, 58), new Color(214, 218, 224)],
        // 亮红塑料篮 + 铬合金提手 + 冷调明亮卖场地面：整体跳出中式古董调，更现代。
        floor: { color: new Color(228, 62, 54) },
        frame: { color: new Color(198, 42, 38) },
        rim: { color: new Color(248, 104, 96) },
        accent: new Color(214, 218, 224),
        shadow: new Color(96, 22, 20),
        backdrop: new Color(226, 232, 238),
        gloss: 0.3,
    },
];

export const DEFAULT_SKIN_ID = 'redwood';

/** 按 id 取皮肤，未知 id 回落到默认皮肤（存档损坏/旧版本兼容）。 */
export function getSkin(id: string | null | undefined): SceneSkin {
    return SKINS.find(s => s.id === id) ?? SKINS[0];
}
