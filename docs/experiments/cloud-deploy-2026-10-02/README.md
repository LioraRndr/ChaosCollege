# 云端版验证（2026-10-02）

对应会话记录：[2026-10-01_2347-save-layer-pick-menu.md](../../sessions/2026-10-01_2347-save-layer-pick-menu.md)（「追加：云端部署……」一节）。

## 浏览器端到端测试 t12

[t12-cloud.mjs](t12-cloud.mjs) 用 playwright-core 驱动 Chrome，对一个本地启动的云端服务跑完整流程：

注册 → 新建工程 → 导入 PNG 与 SVG 图片、添加图层 → 自动保存到云端 → 导入字体 → 刷新后会话保持、缩略图显示、字体与工程恢复 → 第二个浏览器登录同一账号修改 → 第一个窗口出现冲突提示并选择覆盖 → 第二个窗口选择加载云端版本 → 另存为 `.chaos` 下载 → 2 MB 配额拦截大图 → 用量统计 → 退出登录 → 本机试用模式 → 错误密码提示 → 无意外控制台错误（含 CSP）。

```bash
rm -rf /tmp/cc-cloud && CC_DATA=/tmp/cc-cloud CC_PORT=8090 CC_USER_QUOTA_MB=2 python3 server/chaos_server.py &
cd /tmp/cc-tools && npm i playwright-core
CC_BASE=http://127.0.0.1:8090/ CC_CHROME=<chrome 路径> CC_FONT=<任意 woff2 字体> node <仓库根目录>/docs/experiments/cloud-deploy-2026-10-02/t12-cloud.mjs
```

2026-10-02 结果：19/19 PASS（两次全新数据目录各跑一次）。

## 其他检查

- 接口安全：缺少 `X-Requested-With` 或 `Origin` 不符的写请求返回 403；`/docs/`、`/server/`、`/.git/`、`../` 路径穿越均为 404；未登录访问工程接口 401；弱密码 400；响应带 CSP、`X-Frame-Options: DENY`、`nosniff`。
- 长连接：被拒绝（401 / 403）的写请求会返回 `Connection: close`，未读的请求体不会污染同一连接上的下一个请求（实测下一请求 200）。
- 上传文件：SVG 按 `image/svg+xml` 记录类型，但直接访问时以 `application/octet-stream` + `attachment` 返回，不会作为网页执行。
- Docker：`docker build` 成功；容器内健康检查、静态文件、`admin list` 正常。
- Docker Compose + Caddy（`CC_DOMAIN=localhost`，Caddy 内部证书）：HTTPS 200，注册成功，会话 Cookie 带 `HttpOnly; SameSite=Lax; Secure`，响应带 HSTS；`docker compose config` 对两个 compose 文件均通过。
- 本机版（file://）回归：t11 11/11，旧回归 t1 / t2 / t5 / t6 无错误。
