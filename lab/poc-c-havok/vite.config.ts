import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        // lab/shared 在工程外，dev server 默认不许读；放开到 lab 根目录。
        fs: { allow: ['..'] },
        // 绑 0.0.0.0：真机跑分要用手机直连本机。见 poc-b-jolt/vite.config.ts 的说明。
        host: true,
    },
    // Havok 的 wasm 由胶水脚本自行 fetch，不能让 vite 预打包时把它当成普通依赖内联。
    optimizeDeps: { exclude: ['@babylonjs/havok'] },
});
