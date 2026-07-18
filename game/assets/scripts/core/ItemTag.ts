import { _decorator, Component } from 'cc';

const { ccclass } = _decorator;

/** 挂在盒中每个可拾取物件上的标记 */
@ccclass('ItemTag')
export class ItemTag extends Component {
    id = '';
    picked = false;
}
