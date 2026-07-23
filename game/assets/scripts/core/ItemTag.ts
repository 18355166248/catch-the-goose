import { _decorator, Component } from 'cc';

const { ccclass } = _decorator;

/** 挂在盒中每个可拾取物件上的标记 */
@ccclass('ItemTag')
export class ItemTag extends Component {
    id = '';
    picked = false;
    /** 连续低速的巡逻计数;达到阈值后逐件冻结,消除堆内接触抖动。 */
    slowTicks = 0;
    /** 原地打转计数:速度不小但位置几乎不动(被夹缝反复弹) → 强制冻结。 */
    rattleTicks = 0;
    /** 逐周期净位移极小的连续计数:命中即"已钉在原位",无视速度直接冻结,专治静止微颤。 */
    pinTicks = 0;
    /** 上个巡逻周期的世界坐标,供打转检测比较。 */
    lastPX = 0;
    lastPY = -99;
    lastPZ = 0;
    /** 最近 6 个巡逻周期的位置轨迹(x,y,z 平铺),供慢摇/振荡检测。 */
    trail: number[] = [];
    /** 最近 6 个巡逻周期的运动强度,均值判据不受采样混叠影响。 */
    effWin: number[] = [];
}
