import { director, Director, Node, Camera, DirectionalLight, Color, view, ResolutionPolicy, Layers } from 'cc';
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
    (globalThis as any).__bootVer = 13; // 自测用：确认页面加载的是本版脚本

    // 竖屏设计分辨率（微信小游戏目标形态），宽度固定、高度随屏幕
    view.setDesignResolutionSize(720, 1280, ResolutionPolicy.FIXED_WIDTH);
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

    // 清掉模板场景的全部子节点（含模板相机/灯——它们是 PrefabInstance，
    // 预览的二次场景启动会把预制体节点回收导致黑屏；相机灯光全部自建普通节点）
    for (const child of [...scene.children]) {
        if (child.name === 'GameRoot' || child.name === 'HudCanvas') continue; // 已在上面清过
        child.destroy();
    }

    // 自建主相机（竖屏取景：抬高视场角补偿窄横向视野）
    const cn = new Node('MainCam');
    cn.setParent(scene);
    cn.layer = Layers.Enum.DEFAULT;
    const cam = cn.addComponent(Camera);
    cam.fov = 60;
    cn.setPosition(0, 8.5, 7);
    cn.setRotationFromEuler(-52, 0, 0);
    cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    cam.clearColor = new Color(52, 46, 40, 255); // 深木色背景
    console.log('[Bootstrap] 自建相机就位 world=', cn.worldPosition.toString());

    // 自建平行光（暖色）
    const ln = new Node('MainLight');
    ln.setParent(scene);
    ln.layer = Layers.Enum.DEFAULT;
    const light = ln.addComponent(DirectionalLight);
    light.color = new Color(255, 246, 228, 255);
    ln.setRotationFromEuler(-62, -24, 0);

    // 暖环境光 + 平面阴影（物件投影到盒底，立体感的关键）
    try {
        const globals = (scene as any).globals ?? (scene as any)._globals;
        if (globals?.ambient) {
            globals.ambient.skyColor = new Color(214, 196, 176, 255);
            globals.ambient.groundAlbedo = new Color(88, 72, 60, 255);
        }
        if (globals?.shadows) {
            globals.shadows.enabled = true;
            globals.shadows.type = 0; // Planar
            globals.shadows.shadowColor = new Color(30, 18, 10, 110);
            globals.shadows.distance = 0.02;
            console.log('[Bootstrap] 平面阴影已启用');
        }
    } catch (e) {
        console.warn('[Bootstrap] 光照全局设置失败', e);
    }

    const root = new Node('GameRoot');
    root.setParent(scene);
    const gm = root.addComponent(GameManager);
    gm.cam = cam;
    console.log('[Bootstrap] 自举完成，游戏开始');
});
