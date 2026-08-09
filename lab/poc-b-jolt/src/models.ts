/**
 * GLB 装载与几何预处理（Three.js 侧）。
 *
 * 正式工程里每个 glb 的场景根都带着 DCC 里的残留平移，碰撞盒直接挂根节点会与视觉
 * 错位（GameManager.centerVisualAndFitCollider 就是在治这个）。这里在**加载时一次性**
 * 把视觉重心归零并量好包围盒，之后每件实例化都直接复用，避免每件都重算。
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface ModelAsset {
    id: string;
    /** 已居中的模板（未缩放）。实例化时 clone。 */
    template: THREE.Object3D;
    /** 居中后的局部包围盒半尺寸。 */
    half: THREE.Vector3;
    /** 凸包代理用的点集（居中后的局部坐标，已抽稀）。 */
    hullPoints: Float32Array;
}

const loader = new GLTFLoader();

export async function loadModels(ids: string[]): Promise<Map<string, ModelAsset>> {
    const out = new Map<string, ModelAsset>();
    await Promise.all(ids.map(async id => {
        const gltf = await loader.loadAsync(`/models/${id}.glb`);
        const root = gltf.scene;
        root.updateWorldMatrix(true, true);

        // 居中：量出世界包围盒，把整棵子树反向平移，使包围盒中心落在原点。
        const box = new THREE.Box3().setFromObject(root);
        const center = box.getCenter(new THREE.Vector3());
        const holder = new THREE.Group();
        root.position.sub(center);
        holder.add(root);
        holder.updateWorldMatrix(true, true);

        const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);

        for (const o of holder.children) o.traverse(m => {
            if ((m as THREE.Mesh).isMesh) {
                m.castShadow = true;
                m.receiveShadow = true;
            }
        });

        out.set(id, { id, template: holder, half, hullPoints: extractHullPoints(holder) });
    }));
    return out;
}

/**
 * 抽出凸包点集。
 *
 * 全量顶点（几千个）直接喂给凸包构造器会让 56 件的建场耗时肉眼可见，而凸包只由外壳
 * 顶点决定，内部点纯属浪费。这里按空间分格取每格最外的一个点：既压到 ~100 个点，
 * 又保证各方向的极值点不会被抽掉（随机抽稀会把尖端抽没，凸包就缩水了）。
 */
function extractHullPoints(root: THREE.Object3D): Float32Array {
    const pts: number[] = [];
    const v = new THREE.Vector3();
    root.updateWorldMatrix(true, true);
    root.traverse(o => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || !mesh.geometry) return;
        const pos = mesh.geometry.getAttribute('position');
        if (!pos) return;
        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos as THREE.BufferAttribute, i).applyMatrix4(mesh.matrixWorld);
            pts.push(v.x, v.y, v.z);
        }
    });
    if (!pts.length) return new Float32Array(0);

    // 方向分格：把每个点按其单位方向落进 12×12 的球面格，每格只留离原点最远的那个。
    const buckets = new Map<number, { d: number; x: number; y: number; z: number }>();
    for (let i = 0; i < pts.length; i += 3) {
        const x = pts[i], y = pts[i + 1], z = pts[i + 2];
        const d = Math.hypot(x, y, z);
        if (d < 1e-6) continue;
        const theta = Math.atan2(z, x);              // -π..π
        const phi = Math.acos(Math.max(-1, Math.min(1, y / d))); // 0..π
        const key = Math.floor((theta + Math.PI) / (2 * Math.PI) * 12) * 12
            + Math.floor(phi / Math.PI * 12);
        const cur = buckets.get(key);
        if (!cur || d > cur.d) buckets.set(key, { d, x, y, z });
    }
    const arr = new Float32Array(buckets.size * 3);
    let k = 0;
    buckets.forEach(b => { arr[k++] = b.x; arr[k++] = b.y; arr[k++] = b.z; });
    return arr;
}
