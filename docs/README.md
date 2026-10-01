# 项目文档入口

这里把信息分为三层，避免新 session 既找不到上下文，又被历史细节淹没：

1. **稳定事实**：[`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) — 项目目标、目录、架构、运行方式和技术约束。
2. **当前状态**：[`SESSION_HANDOFF.md`](SESSION_HANDOFF.md) — 最近进展、验证情况、未决事项和下一步。
3. **历史记录**：[`sessions/README.md`](sessions/README.md) — 每次新对话的本地索引与独立记录。

代理的强制启动/收尾流程位于根目录 [`AGENTS.md`](../AGENTS.md)。新 session 应先读稳定事实，再读当前状态，最后只补充阅读最近的历史记录。

补充资料：

- **调研**：[`research/y3k.md`](research/y3k.md) — Y3K 风格调研、来源与功能对照。
- **验证证据**：[`experiments/`](experiments/) — 每次重要改动的测试脚本、基准与截图，例如 [`editor-upgrade-2026-10-01`](experiments/editor-upgrade-2026-10-01/README.md)、[`save-pick-menu-2026-10-01`](experiments/save-pick-menu-2026-10-01/README.md)。

## 维护原则

- `PROJECT_CONTEXT.md` 只在稳定事实变化时更新。
- `SESSION_HANDOFF.md` 是可覆盖的“现在”，不要堆积完整历史。
- `sessions/` 是只追加的“过去”，每个新对话单独建档。
- 文档与实现不一致时，以经过检查的代码现状为准，并同步修正文档。
- 所有 Markdown 文件使用 UTF-8（无 BOM）。修改现有文件前仍需重新检查编码。
