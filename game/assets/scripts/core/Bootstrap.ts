import { director, Director, Node, Camera, DirectionalLight, Color } from 'cc';
import { EDITOR } from 'cc/env';
import { GameManager } from './GameManager';

/**
 * 免编辑器接线的自举：场景启动后自动搭好游戏所需节点。
 * 模块顶层代码在引擎启动时执行（Cocos 会加载所有项目脚本），
 * 这里挂一次性回调，在首个场景 launch 后：
 * 1. 清掉模板场景里多余的展示节点（保留相机和平行光）
 * 2. 创建 GameRoot 并挂 GameManager，把场景相机塞给它
 */
// 用 on 而非 once：结算后 loadScene 重开时需要再次自举。
// EDITOR 守卫：编辑器加载脚本时也会执行本模块并派发场景事件，
// 不加守卫会在编辑器场景里反复堆积 GameRoot（并随"当前场景预览"带进游戏）。
if (!EDITOR) director.on(Director.EVENT_AFTER_SCENE_LAUNCH, () => {
    const scene = director.getScene();
    if (!scene) return;
    // 防重复自举（双保险）：
    // 1) globalThis 按场景 uuid 加锁——脚本模块被评估两遍时两个副本共享同一把锁
    // 2) 节点名兜底
    (globalThis as any).__bootVer = 5; // 自测用：确认页面加载的是本版脚本
    // 防重复自举：标记打在场景实例上（scene.uuid 是资源 uuid，重载后同值，不能当锁用）
    const inst = scene as any;
    if (inst.__gooseBooted) return;
    inst.__gooseBooted = true;

    // 清掉场景里已有的 GameRoot / HudCanvas——编辑器"当前场景"预览可能带进脏节点
    for (const c of [...scene.children]) {
        if (c.name === 'GameRoot' || c.name === 'HudCanvas') c.destroy();
    }

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

    const root = new Node('GameRoot');
    root.setParent(scene);
    const gm = root.addComponent(GameManager);
    gm.cam = cam;
    console.log('[Bootstrap] 自举完成，游戏开始');
});
