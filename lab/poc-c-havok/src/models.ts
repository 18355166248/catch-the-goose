/**
 * GLB 装载与几何预处理（Babylon.js 侧）。
 *
 * 与 POC B 的 models.ts 是**同一套口径**：加载时一次性把视觉重心归零、量好包围盒、
 * 抽出凸包点集，之后每件实例化直接复用。两套 POC 的件在物理上必须是同样的尺寸与
 * 同样的凸包，否则比出来的是模型预处理差异而不是引擎差异。
 *
 * 与 Three 版的唯一实现差别：Babylon 用 AssetContainer + instantiateModelsToScene 做
 * 克隆（Three 是 Object3D.clone），因为 Babylon 的 Mesh 克隆需要走容器才能正确复制
 * 材质与骨架引用。
 */

import { AssetContainer } from '@babylonjs/core/assetContainer';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import '@babylonjs/loaders/glTF';

export interface ModelAsset {
    id: string;
    container: AssetContainer;
    /** 居中所需的平移量（把包围盒中心搬到原点）。 */
    offset: Vector3;
    /** 居中后的局部包围盒半尺寸。 */
    half: Vector3;
    /** 凸包代理用的点集（居中后的局部坐标，已抽稀）。 */
    hullPoints: Float32Array;
}

export async function loadModels(ids: string[], scene: Scene): Promise<Map<string, ModelAsset>> {
    const out = new Map<string, ModelAsset>();
    await Promise.all(ids.map(async id => {
        const container = await LoadAssetContainerAsync(`/models/${id}.glb`, scene);

        // 量世界包围盒：容器里的 mesh 还没进场景，得先自己刷一遍世界矩阵。
        const min = new Vector3(Infinity, Infinity, Infinity);
        const max = new Vector3(-Infinity, -Infinity, -Infinity);
        for (const m of container.meshes) {
            if (!m.getTotalVertices()) continue;
            m.computeWorldMatrix(true);
            const bb = m.getBoundingInfo().boundingBox;
            min.minimizeInPlace(bb.minimumWorld);
            max.maximizeInPlace(bb.maximumWorld);
        }
        const center = min.add(max).scale(0.5);
        const half = max.subtract(min).scale(0.5);

        out.set(id, {
            id,
            container,
            offset: center.negate(),
            half,
            hullPoints: extractHullPoints(container.meshes, center),
        });
    }));
    return out;
}

/**
 * 抽出凸包点集（与 POC B 的同名函数逐行等价，含分格规则与格数）。
 *
 * 全量顶点（几千个）喂给凸包构造器纯属浪费——凸包只由外壳顶点决定。按空间方向分格
 * 取每格最外的一个点：压到约 100 个点，又保证各方向的极值点不会被抽掉（随机抽稀会
 * 把尖端抽没，凸包就缩水了）。两套 POC 必须用同一套抽稀，否则凸包档没有可比性。
 */
function extractHullPoints(meshes: AbstractMesh[], center: Vector3): Float32Array {
    const buckets = new Map<number, { d: number; x: number; y: number; z: number }>();
    const v = new Vector3();

    for (const mesh of meshes) {
        const pos = mesh.getVerticesData(VertexBuffer.PositionKind);
        if (!pos) continue;
        mesh.computeWorldMatrix(true);
        const mat = mesh.getWorldMatrix();
        for (let i = 0; i < pos.length; i += 3) {
            v.copyFromFloats(pos[i], pos[i + 1], pos[i + 2]);
            Vector3.TransformCoordinatesToRef(v, mat, v);
            const x = v.x - center.x, y = v.y - center.y, z = v.z - center.z;
            const d = Math.hypot(x, y, z);
            if (d < 1e-6) continue;
            const theta = Math.atan2(z, x);                             // -π..π
            const phi = Math.acos(Math.max(-1, Math.min(1, y / d)));    // 0..π
            const key = Math.floor((theta + Math.PI) / (2 * Math.PI) * 12) * 12
                + Math.floor(phi / Math.PI * 12);
            const cur = buckets.get(key);
            if (!cur || d > cur.d) buckets.set(key, { d, x, y, z });
        }
    }

    const arr = new Float32Array(buckets.size * 3);
    let k = 0;
    buckets.forEach(b => { arr[k++] = b.x; arr[k++] = b.y; arr[k++] = b.z; });
    return arr;
}

/**
 * 实例化一件的视觉体。返回一个已居中的 TransformNode，位姿由物理驱动。
 *
 * 居中放在**子节点**上而不是根节点上：根节点的 position/rotationQuaternion 要留给
 * 物理刚体写入，DCC 残留偏移必须由内层吸收，否则碰撞体与视觉永远错位——正式工程的
 * centerVisualAndFitCollider 治的就是这个病。
 */
export function instantiateModel(asset: ModelAsset, scene: Scene, scale: number): TransformNode {
    const root = new TransformNode(`${asset.id}_root`, scene);
    const inst = asset.container.instantiateModelsToScene(n => `${asset.id}_${n}`, false);
    const holder = new TransformNode(`${asset.id}_holder`, scene);
    holder.parent = root;
    holder.position.copyFrom(asset.offset);
    for (const n of inst.rootNodes) (n as TransformNode).parent = holder;
    root.scaling.setAll(scale);

    for (const n of inst.rootNodes) {
        for (const m of (n as TransformNode).getChildMeshes(false)) {
            m.receiveShadows = true;
            (m as Mesh).alwaysSelectAsActiveMesh = true;
        }
    }
    return root;
}
