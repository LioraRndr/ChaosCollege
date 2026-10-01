# Session 本地记录索引

每个新对话/session 创建一个独立 Markdown 文件；同一 session 内的后续消息持续更新同一文件。命名格式：

```text
YYYY-MM-DD_HHmm-<short-slug>.md
```

时间使用 `Asia/Shanghai`。如果能取得平台 session ID，可在文档元数据中记录，但文件名仍保持人类可读。

## 最近记录（新到旧）

- [`2026-10-01_1433-product-editor-upgrade.md`](2026-10-01_1433-product-editor-upgrade.md) — 产品化升级：工程库与 .chaos 文件、工程主页、新建预设、画布大小对话框、工具栏与变形、40 个效果与一键风格、生成器与贴纸、字体库、Y3K 调研与实现；删除配方与参考图；本地 Git 基线（未推送）。
- [`2026-10-01_1352-git-private-github.md`](2026-10-01_1352-git-private-github.md) — 初始化 Git 版本管理，建立 LioraRndr/ChaosCollege 私有仓库并推送 main。
- [`2026-09-30_2240-datamosh-intent-review.md`](2026-09-30_2240-datamosh-intent-review.md) — 帧感染改为单图卡帧反馈，用户认可后完成小范围性能优化；19 组逐像素一致，两组基准约快 11%/13%，增加缓存与临时画布预算，保存证据。
- [`2026-08-31_1556-desktop-launcher.md`](2026-08-31_1556-desktop-launcher.md) — Windows 桌面一键启动：品牌图标 + 静默 VBS/PS1，Chrome/Edge 应用窗口打开编辑器。
- [`2026-08-26_1417-shatter-3d-explode-layer.md`](2026-08-26_1417-shatter-3d-explode-layer.md) — 新增 3D 爆裂碎片图层（shatter，双形态：爆裂 + 尖刺实体）：icosphere + 透视投影纯 Canvas 软渲染。
- [`2026-08-26_1141-session-resume.md`](2026-08-26_1141-session-resume.md) — 恢复上一 session 上下文，完成无缝衔接并等待下一步指令。
- [`2026-08-24_1215-project-docs-init.md`](2026-08-24_1215-project-docs-init.md) — 初始化项目文档、目录认知与跨 session 交接机制。

## 每条记录的最低字段

```markdown
# Session: <标题>

- 时间：YYYY-MM-DD HH:mm（Asia/Shanghai）
- 状态：进行中 / 已完成 / 已阻塞
- 用户原始请求：<保留会改变任务边界的原话>

## 启动上下文
## 目标与计划
## 对话与关键决定
## 修改记录
## 验证
## 遗留事项与下一步
```

记录以恢复工作所需的信息为准，不保存密码、令牌、个人隐私或大段无关终端输出。完整的强制流程见 [`../../AGENTS.md`](../../AGENTS.md)。
