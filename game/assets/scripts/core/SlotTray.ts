import { Node } from 'cc';

/** 暂存槽纯数据逻辑：7 格，相同物件相邻排列，凑 3 消除。与渲染解耦，便于单测。 */

export interface SlotEntry {
    id: string;
    node: Node;
}

export const TRAY_CAPACITY = 7;

export class SlotTray {
    entries: SlotEntry[] = [];

    /**
     * 放入一个物件。返回：
     * - matched: 若凑满 3 个，返回被消除的 3 个 entry（已从槽中移除）
     * - full: 放入后（且未消除时）是否已爆满 → 失败
     */
    add(id: string, node: Node): { matched: SlotEntry[] | null; full: boolean } {
        // 插入到同 id 最后一个的后面；没有同类则追加到末尾
        let insertAt = this.entries.length;
        for (let i = this.entries.length - 1; i >= 0; i--) {
            if (this.entries[i].id === id) { insertAt = i + 1; break; }
        }
        this.entries.splice(insertAt, 0, { id, node });

        const same = this.entries.filter(e => e.id === id);
        if (same.length >= 3) {
            const matched = same.slice(0, 3);
            this.entries = this.entries.filter(e => !matched.includes(e));
            return { matched, full: false };
        }
        return { matched: null, full: this.entries.length >= TRAY_CAPACITY };
    }

    get count(): number { return this.entries.length; }

    clear(): void { this.entries = []; }
}
