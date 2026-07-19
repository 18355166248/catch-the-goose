/** 关卡配置：种类 × 组数 × 时限。每组 = 3 个相同物件。 */

export interface LevelDef {
    /** 参与本关的物件 id（对应 resources/models/ 下的 glb 文件名） */
    items: string[];
    /** 每种物件的组数（1 组 = 3 个） */
    groupsPerItem: number;
    /** 时限（秒） */
    timeSec: number;
}

/** 全部可用物件 id */
export const ALL_ITEMS = [
    'goose', 'baicai', 'mile', 'pixiu',
    'banzhi', 'bracelet', 'hulu', 'pingankou',
    'tongqian', 'yupai', 'yuzhuo',
];

export const LEVELS: LevelDef[] = [
    // 第 1 关是上手关：4 种强对比配色 × 2 组 = 24 件，时间宽裕，先教会“找同类凑三”。
    { items: ['goose', 'baicai', 'tongqian', 'bracelet'], groupsPerItem: 2, timeSec: 360 },
    { items: ['goose', 'banzhi', 'tongqian', 'pingankou', 'hulu'], groupsPerItem: 2, timeSec: 330 },
    { items: ['goose', 'baicai', 'banzhi', 'tongqian', 'pingankou', 'yuzhuo'], groupsPerItem: 2, timeSec: 300 },
    { items: ['goose', 'baicai', 'mile', 'banzhi', 'hulu', 'tongqian', 'yupai', 'yuzhuo'], groupsPerItem: 2, timeSec: 300 },
    // 终盘关：全 11 种 × 2 组 = 66 件，展示完整灌入式堆叠。
    { items: ALL_ITEMS, groupsPerItem: 2, timeSec: 360 },
];

/** 校验：每关物件总数必须是 3 的倍数（groupsPerItem 保证了这一点，这里防御性再查一遍） */
export function validateLevel(def: LevelDef): boolean {
    return (def.items.length * def.groupsPerItem * 3) % 3 === 0;
}
