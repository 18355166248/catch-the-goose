import { Node, Color } from 'cc';
import { Screen } from './UIRouter';
import { UIKit, UIColors } from './UIKit';

export interface OnboardingData {
    onDone: () => void;
}

/**
 * 首次启动引导：它是独立页面，不是盖在游戏上的说明弹窗。
 * 三步只回答开局前必须知道的事；首局里“指出可消物件”的动态教学仍由 GameManager 负责。
 */
export class OnboardingScreen implements Screen {
    readonly name = 'onboarding';
    readonly artTop = 850;
    readonly dimWorld = true;

    constructor(private data: OnboardingData) {}

    build(root: Node) {
        UIKit.panel(root, 760, 1700, 0, new Color(76, 111, 74), 0, 0);
        UIKit.image(root, 'textures/challenge-map-bg/texture', 760, 1700, 0, 0, 118);
        const shade = UIKit.panel(root, 760, 1700, 0, new Color(31, 54, 42, 92), 0, 0);
        shade.setSiblingIndex(1);

        UIKit.label(root, '抓住大鹅', 66, UIColors.cream, 0, 486);
        UIKit.label(root, '一场从野餐篮开始的收集旅行', 24, new Color(242, 224, 174), 0, 430);

        const steps = [
            ['① 选一站', '沿地图向上探索，先选本局要挑战的场景'],
            ['② 定难度', '轻松、标准、大师，开始后本局不再更换'],
            ['③ 凑三个', '把相同物件放进七格，凑齐三个立即消除'],
        ] as const;
        steps.forEach(([title, note], i) => {
            const y = 246 - i * 174;
            const row = UIKit.panel(root, 612, 138, 28, new Color(255, 244, 214, 244), 0, y,
                new Color(187, 130, 66), 4);
            UIKit.label(row, title, 32, UIColors.text, -254, 24, true);
            UIKit.label(row, note, 21, UIColors.textSoft, -254, -26, true);
        });

        UIKit.label(root, '准备好了吗？地图会随着旅程不断向上延伸', 22,
            new Color(245, 229, 190), 0, -338);
        UIKit.primaryButton(root, '开始探索', 0, -446, this.data.onDone);
    }
}
