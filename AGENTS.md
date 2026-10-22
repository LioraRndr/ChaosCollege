# 项目协作规则

本文件是所有新对话/session 的固定入口。任何代理开始工作前都必须先读取本文件，并按下述顺序恢复上下文。

## 编码前置检查（强制）

1. 对任何现有文件执行修改前，必须先确认该文件当前编码（如 UTF-8、GBK）。
2. 编码未确认时禁止写入，只能读取并提示确认编码。
3. 写回时必须保持与原文件编码一致，禁止擅自转换编码。
4. 禁止对未知编码文件使用高风险整文件重写。
5. 若发现乱码特征（如“鑠版堪”“濮煎”），必须立即停止修改并先解决编码问题。
6. 本项目截至 2026-08-24 的既有文本文件均为 UTF-8（无 BOM）；这只是历史记录，修改前仍需实际复核目标文件。

## Claude.md / Agent.md 兼容入口

如果任一工作目录下存在 `Claude.md`、却没有 `Agent.md`，先创建只作为入口的 `Agent.md` 并链接到同目录的 `Claude.md`。保留 `Claude.md` 原内容，不复制、不改写，使两者等效。

## 新 session 启动流程（强制）

1. 读取 `README.md`。
2. 读取 `docs/README.md` 和 `docs/PROJECT_CONTEXT.md`，恢复稳定项目事实。
3. 读取 `docs/SESSION_HANDOFF.md`，恢复最近状态、未决事项和建议下一步。
4. 读取 `docs/sessions/README.md`，再读取其中索引指向的最近一条 session 记录。
5. 在修改代码前，为本次新对话创建 `docs/sessions/YYYY-MM-DD_HHmm-<slug>.md`。至少记录时间、用户原始请求、已知上下文和初始计划。
6. 如果上述文档与代码冲突，以可验证的代码现状为准，并在本次 session 记录与交接文档中修正文档。

## 工作过程记录（强制）

- 每个新对话使用一个独立 session 文件；同一对话的后续消息继续追加在同一文件，不重复建档。
- 记录用户目标、关键发现、重要决定、修改文件、验证结果和未完成事项。
- 默认记录结构化摘要，同时保留能改变任务边界的用户原始表述；不要写入口令、令牌、个人隐私或大段无关工具输出。
- 发生方向变化、重要取舍或阻塞时，立即更新当前 session 文件，不要只依赖最终收尾。

## session 结束流程（强制）

1. 更新本次 session 文件，写明实际结果、验证命令/结果、遗留问题和推荐下一步。
2. 更新 `docs/sessions/README.md` 的索引，把本次记录置于最上方。
3. 更新 `docs/SESSION_HANDOFF.md`，只保留下一次 session 真正需要的当前状态；历史细节留在 session 记录中。
4. 检查新增或修改文档之间的链接可达，确认没有占位符、矛盾或过期结论。
5. 最终回复必须与本地记录一致。若因权限或异常无法写入，应明确告诉用户本次未完成本地化记录。

## 项目边界

- 本地 checkout 是无需安装或构建的浏览器端静态平面编辑器；Datamosh 只生成静态单帧视觉，不处理视频。线上云端服务来自另一个已核验的源码快照，部署事实见下述服务器交接，不要把本地代码状态当作线上状态。
- 不要把 `samples.js` 中的大段 Base64 图片数据直接打印到日志或文档。
- 未经用户明确授权，不初始化 Git、不引入包管理器、不改成框架项目。
- 代码结构、运行方式和当前限制以 `docs/PROJECT_CONTEXT.md` 为准。

## 服务器部署交接

- 服务器维护目录 `D:\R_Program\服务器` 是部署事实真源。涉及部署、线上配置、域名、接口、服务器文件或版本的任务，启动时先读 [STATE.md](D:/R_Program/服务器/projects/chaos-college/STATE.md) 和 [OUTBOX.md](D:/R_Program/服务器/projects/chaos-college/OUTBOX.md)，再读 [运维手册](D:/R_Program/服务器/scripts/chaos-college/README.md)。
- 此类 session 收尾时向 `D:\R_Program\服务器\projects\chaos-college\INBOX\YYYY-MM-DD_HHMM_主题.md` 写简报：改了什么、为什么、验证结果、服务器待办。由服务器维护 session 合并归档；项目侧不要直接改 STATE/CURRENT/CHANGELOG。纯本地开发可跳过投递。
- 线上地址 <https://chaos.sakisaki.top/>；首次版本为 `35f61230d2c4d31c62fd9c971bd24adb252b6e08` 的源码快照，无 `.git`。本地 checkout 未在部署 session 拉取或升级。
- 保留线上 `.env`、`docker-compose.nginx.yml` 与数据卷 `chaos-collage-data`；禁止删除数据卷、运行 down -v 或默认 Caddy Compose。更新前明确数据备份与恢复方案，不读取或归档业务数据库、密码或完整环境变量。
