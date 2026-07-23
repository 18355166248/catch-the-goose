/** 关卡配置：种类 × 组数 × 时限。每组 = 3 个相同物件。 */

export interface LevelDef {
    /** 参与本关的物件 id（对应 resources/models/ 下的 glb 文件名） */
    items: string[];
    /** 每种物件的组数（1 组 = 3 个） */
    groupsPerItem: number;
    /** 时限（秒） */
    timeSec: number;
    /** 初始条件种子：同一关重试保持物件顺序、投放点、旋转和初速度一致 */
    seed: number;
}

/** 全部可用物件 id */
export const ALL_ITEMS = [
    'goose', 'baicai', 'mile', 'pixiu',
    'banzhi', 'bracelet', 'hulu', 'pingankou',
    'tongqian', 'yuzhuo',
    // CC0/CC-BY 新增(见 resources/models/CREDITS.md)
    'yuanbao', 'baoshi', 'yushi', 'jingling',
];

export const LEVELS: LevelDef[] = [
    // 总时长随物件数增加，单位物件时间逐关下降：10s → 9s → 8.3s → 6.9s → 5.9s。
    // 第 1 关是上手关：4 种强对比配色 × 2 组 = 24 件，先教会“找同类凑三”。
    { items: ['goose', 'baicai', 'tongqian', 'bracelet'], groupsPerItem: 2, timeSec: 240, seed: 104729 },
    { items: ['goose', 'banzhi', 'tongqian', 'pingankou', 'hulu'], groupsPerItem: 2, timeSec: 270, seed: 130363 },
    { items: ['goose', 'baicai', 'banzhi', 'tongqian', 'pingankou', 'yuzhuo'], groupsPerItem: 2, timeSec: 300, seed: 155921 },
    { items: ['goose', 'baicai', 'mile', 'banzhi', 'hulu', 'tongqian', 'yuzhuo', 'yuanbao', 'yushi', 'jingling'], groupsPerItem: 2, timeSec: 330, seed: 181081 },
    // 终盘关：11 种 × 2 组 = 66 件（含全部 4 个新物件），密度控制在已调优的量级。
    { items: ['goose', 'baicai', 'mile', 'pixiu', 'tongqian', 'bracelet', 'yuanbao', 'baoshi', 'yushi', 'jingling', 'hulu'], groupsPerItem: 2, timeSec: 390, seed: 206369 },
];

/** 校验：每关物件总数必须是 3 的倍数（groupsPerItem 保证了这一点，这里防御性再查一遍） */
export function validateLevel(def: LevelDef): boolean {
    return (def.items.length * def.groupsPerItem * 3) % 3 === 0
        && Number.isInteger(def.seed) && def.seed > 0;
}
