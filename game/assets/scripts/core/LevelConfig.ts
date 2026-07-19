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
    // 首关直接展示完整的“灌入式堆叠”：11 种 × 2 组 × 3 个 = 66 个。
    { items: ALL_ITEMS, groupsPerItem: 2, timeSec: 600 },
    { items: ['goose', 'banzhi', 'tongqian', 'pingankou', 'yupai'], groupsPerItem: 2, timeSec: 330 },
    { items: ['goose', 'baicai', 'banzhi', 'tongqian', 'pingankou', 'yuzhuo'], groupsPerItem: 2, timeSec: 300 },
    { items: ['goose', 'baicai', 'mile', 'banzhi', 'tongqian', 'yupai', 'yuzhuo'], groupsPerItem: 3, timeSec: 300 },
    { items: ['goose', 'baicai', 'mile', 'pixiu', 'banzhi', 'bracelet', 'hulu', 'tongqian'], groupsPerItem: 3, timeSec: 300 },
];

/** 校验：每关物件总数必须是 3 的倍数（groupsPerItem 保证了这一点，这里防御性再查一遍） */
export function validateLevel(def: LevelDef): boolean {
    return (def.items.length * def.groupsPerItem * 3) % 3 === 0;
}
