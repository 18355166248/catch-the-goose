import { _decorator, Component } from 'cc';

const { ccclass } = _decorator;

/** 挂在盒中每个可拾取物件上的标记 */
@ccclass('ItemTag')
export class ItemTag extends Component {
    id = '';
    picked = false;
    /** 连续低速的巡逻计数;达到阈值后逐件冻结,消除堆内接触抖动。 */
    slowTicks = 0;
}
