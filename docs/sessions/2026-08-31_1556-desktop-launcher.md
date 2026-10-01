# Session: 桌面快捷启动

- 时间：2026-08-31 15:56（Asia/Shanghai）
- 状态：已完成
- 用户原始请求：帮我给这个应用，做一个快捷的启动方式，然后发到我桌面上

## 启动上下文

- 已按 `AGENTS.md` 恢复：`README.md`、`docs/README.md`、`docs/PROJECT_CONTEXT.md`、`docs/SESSION_HANDOFF.md`、最近 session `2026-08-26_1417-shatter-3d-explode-layer.md`。
- CHAOS.COLLAGE 是无构建、无依赖的浏览器静态平面编辑器，入口为 `index.html`。
- 桌面已有同类本地工具快捷方式（Artwork Destruction Tool、Rndr Lab、RndrOS、任务仪表盘）。
- 本机有 Chrome 与 Edge。应用无 `fetch` / ES module，`file://` 可直接运行。

## 目标与计划

1. 在项目根目录放 Windows 启动器。
2. 生成品牌 `assets/chaos-collage.ico`。
3. 在用户桌面创建 `CHAOS.COLLAGE.lnk`。
4. 用 Chrome/Edge `--app` 打开 `index.html`，不启本地服务器。
5. 同步 README / 项目上下文 / session 交接。

## 对话与关键决定

- 不启本地 HTTP 服务：避免桌面留 python 进程；关闭应用窗口即可。
- 快捷方式走 `wscript.exe` + `launch.vbs`，对齐现有「任务仪表盘」静默启动习惯。
- 优先 Chrome，其次 Edge；`--app` + `--window-size=1440,900`。
- 用户在启动测试后回复「看到启动了」，确认窗口已出现。

## 修改记录

- 新增 `launch.ps1`、`launch.vbs`、`launch.bat`
- 新增 `assets/chaos-collage.ico`
- 桌面新增 `C:\Users\valir\Desktop\CHAOS.COLLAGE.lnk`
- 更新 `README.md`、`docs/PROJECT_CONTEXT.md`、`docs/SESSION_HANDOFF.md`、`docs/sessions/README.md`
- 验证用临时 `assets/chaos-collage-preview.png` 已删除

## 验证

- `CHAOS.COLLAGE.lnk` 存在；目标 `wscript.exe`，参数指向 `launch.vbs`，图标指向 `assets/chaos-collage.ico`
- `launch.ps1` 拉起 Chrome 应用窗口；用户确认看到启动
- 文档文件均为 UTF-8（无 BOM）；启动脚本为 ASCII

## 遗留事项与下一步

无。若桌面图标丢失，双击项目根目录 `launch.bat` 即可，或按 session 记录重建 `.lnk`。
