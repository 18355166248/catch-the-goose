import { defineConfig } from 'vite';

export default defineConfig({
    // lab/shared 在工程外，dev server 默认不许读；放开到 lab 根目录。
    server: { fs: { allow: ['..'] } },
    // Jolt 的 wasm 由胶水脚本自行 fetch，不能让 vite 预打包时把它当成普通依赖内联。
    optimizeDeps: { exclude: ['jolt-physics'] },
});
