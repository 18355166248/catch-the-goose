import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        // lab/shared 在工程外，dev server 默认不许读；放开到 lab 根目录。
        fs: { allow: ['..'] },
        // 绑 0.0.0.0：真机跑分要用手机直连本机（验收里那条「中端安卓 ≥30fps」）。
        // 这是跑测场，不是正式工程的 dev server，暴露在局域网里没有额外风险。
        host: true,
    },
    // Jolt 的 wasm 由胶水脚本自行 fetch，不能让 vite 预打包时把它当成普通依赖内联。
    optimizeDeps: { exclude: ['jolt-physics'] },
});
