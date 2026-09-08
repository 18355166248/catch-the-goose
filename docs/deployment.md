# H5 部署说明

## 发布包

1. 用 Cocos Creator 3.8.8 打开 `game/`，等待资源导入完成。Windows 保存并关闭编辑器后构建，
   避免编辑器与 CLI 争用日志和 Chromium 缓存；macOS 保持本工程打开，避免生成空壳包。
2. 依次运行 `node tools/check.mjs` 和 `node tools/build-web.mjs`（Windows / macOS 通用）。
3. 发布目录为 `game/build/web-mobile/`；只部署门禁通过的新产物。

`build-templates/web-mobile/_headers` 会进入产物，适用于 Cloudflare Pages。因为 Jolt 胶水和
主脚本使用固定文件名，缓存只设为 1 小时并要求重新验证，不能使用 immutable 长缓存。

编辑器非默认安装路径时设置 `COCOS_CREATOR`。构建日志保存在
`game/temp/web-mobile-build.log`，构建入口会核对本工程的编辑器进程、生效配置、脚本完整性、
Jolt 胶水文件、source map 和 20 MiB 体积门禁，任一失败均返回非零退出码。

## 观测配置

默认 `telemetryEndpoint` 为空，不会向外发送。接入自有收集端时，在游戏脚本执行前设置：

```html
<script>
window.__GOOSE_CONFIG = {
  buildVersion: 'git-sha-or-release-version',
  telemetryEndpoint: 'https://your-domain.example/events'
};
</script>
```

接口接收 `POST { events: [...] }`，成功返回任意 2xx。事件不含用户账号、设备 ID、输入内容
或完整 URL；本地队列最多 200 条，发送失败保留并在后续重试。

核心事件：`app_boot`、`physics_ready`、`home_view`、`theme_select`、`level_select`、
`round_start`、`round_end`、`round_exit`、`prop_use`、`rescue_use`、
`asset_load_failed`、`remote_asset_fallback`、`runtime_error`。

## 上线与回滚

- 先发布预览环境，完成 `docs/real-device-checklist.md`。
- 再小流量分享给种子用户，不直接覆盖稳定地址。
- 保留上一份完整发布目录；错误率或开局率异常时切回上一部署版本。
- 发布后确认 HTML、`jolt-glue.js`、主脚本和两张 CDN 图片均返回 200。
