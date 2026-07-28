import { sys } from 'cc';

/** score 为后加字段，旧存档没有 → 读取方按 0 处理。 */
export interface BestRecord { stars: number; progress: number; score?: number; }

/**
 * 本地存档 I/O。
 *
 * 只负责读写与容错，不碰 UI、不做业务判断——每个方法在存储不可用/内容损坏时
 * 都回落到调用方给的默认值，因此上层无需再包 try/catch。
 * 全部存档键集中在此，新增存档项也只改这一个文件。
 */
export class SaveData {
    private static readonly LEVEL = 'goose_level_v1';
    private static readonly DAILY = 'goose_daily_v1';
    private static readonly BEST = 'goose_best_v1';
    private static readonly SKIN = 'goose_skin_v1';
    private static readonly PROP = 'goose_props_v1';
    private static readonly PROPGIFT = 'goose_propgift_v1';
    private static readonly SOUND = 'goose_sound_v1';
    private static readonly TAUGHT = 'goose_taught_v1';

    private static read(key: string): string | null {
        try { return sys.localStorage.getItem(key); } catch { return null; }
    }

    private static write(key: string, value: string): void {
        try { sys.localStorage.setItem(key, value); } catch { /* 存储不可用则仅本局生效 */ }
    }

    private static readJson<T>(key: string, fallback: T): T {
        try { return JSON.parse(SaveData.read(key) ?? '') ?? fallback; } catch { return fallback; }
    }

    /** 当天日期键，用于每日免费次数的跨天重置。 */
    static todayKey(): string {
        const d = new Date();
        return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    }

    /**
     * 关卡进度按天作用域：只有当天存过的进度才沿用，跨天自动回落 null
     * → 上层从第 1 关重开。配合「每天固定场景 + 3 关阶梯」的每日挑战循环。
     * 兼容旧版纯数字存档（解析为 number，无 date 字段 → 视为非今天 → 重开）。
     */
    static getLevel(): number | null {
        const raw = SaveData.readJson<{ date?: string; index?: number } | null>(SaveData.LEVEL, null);
        return raw && raw.date === SaveData.todayKey() && typeof raw.index === 'number'
            ? raw.index : null;
    }
    static setLevel(index: number): void {
        SaveData.write(SaveData.LEVEL, JSON.stringify({ date: SaveData.todayKey(), index }));
    }

    /** 仅当存档日期是今天才沿用剩余次数，否则回落 fallback（跨天自动重置）。 */
    static getDaily(fallback: number): number {
        const raw = SaveData.readJson<{ date?: string; left?: number } | null>(SaveData.DAILY, null);
        return raw && raw.date === SaveData.todayKey() && typeof raw.left === 'number'
            ? raw.left : fallback;
    }
    static setDaily(left: number): void {
        SaveData.write(SaveData.DAILY, JSON.stringify({ date: SaveData.todayKey(), left }));
    }

    static getBest(): Record<number, BestRecord> {
        return SaveData.readJson<Record<number, BestRecord>>(SaveData.BEST, {});
    }
    static setBest(best: Record<number, BestRecord>): void {
        SaveData.write(SaveData.BEST, JSON.stringify(best));
    }

    static getSkin(): string | null {
        return SaveData.read(SaveData.SKIN);
    }
    static setSkin(id: string): void {
        SaveData.write(SaveData.SKIN, id);
    }

    static getProps<T>(fallback: T): T {
        return SaveData.readJson<T>(SaveData.PROP, fallback);
    }
    static setProps(counts: unknown): void {
        SaveData.write(SaveData.PROP, JSON.stringify(counts));
    }

    /** 音效开关。未存过按开启处理（首次进入有声）。 */
    static getSound(): boolean {
        return SaveData.read(SaveData.SOUND) !== '0';
    }
    static setSound(on: boolean): void {
        SaveData.write(SaveData.SOUND, on ? '1' : '0');
    }

    /** 新手引导：是否已看过一次玩法说明（永久，不跨天重置）。 */
    static taught(): boolean {
        return SaveData.read(SaveData.TAUGHT) === '1';
    }
    static markTaught(): void {
        SaveData.write(SaveData.TAUGHT, '1');
    }

    /** 每日道具礼包：今天是否已领取（跨天自动重置）。 */
    static claimedPropGiftToday(): boolean {
        return SaveData.read(SaveData.PROPGIFT) === SaveData.todayKey();
    }
    static markPropGift(): void {
        SaveData.write(SaveData.PROPGIFT, SaveData.todayKey());
    }
}
