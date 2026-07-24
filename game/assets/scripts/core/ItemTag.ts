import { _decorator, Component } from 'cc';

const { ccclass } = _decorator;

/** 挂在盒中每个可拾取物件上的标记 */
@ccclass('ItemTag')
export class ItemTag extends Component {
    id = '';
    picked = false;
    /**
     * 连续"净位移极小"的巡检周期计数:达到阈值即判定已停在原位、直接冻结。
     * 这是精简后**唯一**的逐件冻结判据(取代旧的 slow/rattle/pin/trail 多套启发式):
     * 无论是真静止还是被夹缝原地振荡,净位移都极小 → 都能收敛;真在下落/滚动的
     * 物件净位移大,不会误冻。抓不到的边角交给 GameManager 的 0.9s 定时器兜底。
     */
    stillTicks = 0;
    /** 上个巡检周期的世界坐标,算本周期净位移。lastPY=-99 作哨兵:首周期净位移视为极大,不冻。 */
    lastPX = 0;
    lastPY = -99;
    lastPZ = 0;
}
