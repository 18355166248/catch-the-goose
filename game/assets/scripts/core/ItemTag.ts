import { _decorator, Component } from 'cc';

const { ccclass } = _decorator;

/** 挂在盒中每个可拾取物件上的标记 */
@ccclass('ItemTag')
export class ItemTag extends Component {
    id = '';
    picked = false;
    /**
     * 连续"困在锚点小 blob 内"的巡检周期计数:达到阈值即判定已停在原位、直接冻结。
     * 这是精简后**唯一**的逐件冻结判据(取代旧的 slow/rattle/pin/trail 多套启发式):
     * 用**锚点振幅**而非逐周期净位移——无论真静止还是被夹缝原地振荡(每拍抖几毫米、
     * 整体不挪窝),都困在 blob 内 → 收敛;真在下落/滚动会跑出 blob、重置锚点,不误冻。
     * 抓不到的极端边角交给 GameManager 的 0.9s 定时器兜底。
     */
    stillTicks = 0;
    /** 静止判定的锚点世界坐标:物件跑出锚点小 blob 才更新它。anchorY=-99 作哨兵:首拍必更新、不冻。 */
    anchorX = 0;
    anchorY = -99;
    anchorZ = 0;
}
