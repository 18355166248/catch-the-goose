import { director, Director, Node, Camera, DirectionalLight, Color } from 'cc';
import { GameManager } from './GameManager';

/**
 * 免编辑器接线的自举：场景启动后自动搭好游戏所需节点。
 * 模块顶层代码在引擎启动时执行（Cocos 会加载所有项目脚本），
 * 这里挂一次性回调，在首个场景 launch 后：
 * 1. 清掉模板场景里多余的展示节点（保留相机和平行光）
 * 2. 创建 GameRoot 并挂 GameManager，把场景相机塞给它
 */
director.once(Director.EVENT_AFTER_SCENE_LAUNCH, () => {
    const scene = director.getScene();
    if (!scene) return;

    // 关掉场景天空盒（模板拷贝过来的环境贴图引用可能不完整，会拖垮渲染管线）
    try {
        const globals = (scene as any).globals ?? (scene as any)._globals;
        if (globals?.skybox) {
            globals.skybox.enabled = false;
            console.log('[Bootstrap] 已禁用天空盒');
        }
    } catch (e) {
        console.warn('[Bootstrap] 禁用天空盒失败', e);
    }

    // 清理模板自带的展示模型（保留相机、灯和 GameRoot）
    for (const child of [...scene.children]) {
        if (child.name === 'GameRoot') continue;
        const keep = child.getComponentInChildren(Camera) || child.getComponentInChildren(DirectionalLight);
        if (!keep) child.destroy();
    }

    // 相机：无论手动还是自举，都强制摆到俯视机位
    let cam = scene.getComponentInChildren(Camera);
    if (!cam) {
        const cn = new Node('Main Camera');
        cn.setParent(scene);
        cam = cn.addComponent(Camera);
    }
    cam.node.setParent(scene); // 脱离可能存在的父级变换
    cam.node.setPosition(0, 9, 9);
    cam.node.setRotationFromEuler(-45, 0, 0);
    // 强制纯色清屏：模板相机默认用天空盒清屏，天空盒资源不完整会导致渲染中断（画面卡在闪屏）
    cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    cam.clearColor = new Color(52, 46, 40, 255); // 深木色背景
    console.log('[Bootstrap] 相机就位 world=', cam.node.worldPosition.toString(), 'clearFlags=', cam.clearFlags);

    if (!scene.getComponentInChildren(DirectionalLight)) {
        const ln = new Node('Main Light');
        ln.setParent(scene);
        ln.addComponent(DirectionalLight);
        ln.setRotationFromEuler(-60, -30, 0);
    }

    let gm = scene.getComponentInChildren(GameManager);
    if (!gm) {
        const root = new Node('GameRoot');
        root.setParent(scene);
        gm = root.addComponent(GameManager);
    }
    gm.cam = cam;
    console.log('[Bootstrap] 自举完成，游戏开始');
});
