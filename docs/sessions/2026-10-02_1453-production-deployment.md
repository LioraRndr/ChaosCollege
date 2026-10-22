# Session: CHAOS.COLLAGE 首次生产部署交接

- 时间：2026-10-02（Asia/Shanghai）
- 状态：已完成
- Codex task ID：01a0fb4c-018a-7fc1-9954-b03fadf1c12d
- 用户原始请求：“帮我部署下”；指定域名 chaos.sakisaki.top，随后确认雨云控制台“开好了”并要求“继续”。

## 启动上下文

已读取项目实际 AGENTS 入口、README、docs 索引、PROJECT_CONTEXT、SESSION_HANDOFF、session 索引与最近记录。源项目目录没有 Claude.md 入口。本地 checkout 与 GitHub 云端部署分支不同，部署使用固定源码快照，不拉取或覆盖本地代码。

## 目标与计划

按用户链接的 docs/DEPLOY.md 上线云端编辑器；现有服务器 Nginx 占用 80/443，采用 Docker app + 宿主机 Nginx/Certbot，并保留其他站点。服务器规则要求接入部署 STATE/OUTBOX/INBOX 协议。

## 对话与关键决定

- 用户指定 chaos.sakisaki.top，部署到现有雨云 38.92.15.160。
- 固定 `claude/file-save-layers-menu-5k9g8u` 的 `35f61230d2c4d31c62fd9c971bd24adb252b6e08`；GitHub 只读连接器取得 54 文件并逐个校验 Git blob SHA-1。
- SSH 在认证前断开，用户完成雨云登录后通过现有 VNC 执行受控部署；未修改 SSH/密钥/防火墙或 sudo 权限。
- 服务器目录 `/home/codex-debug/chaos-college` 无 `.git`。容器 `chaos-collage-app`，`127.0.0.1:8090 → 8080`，数据卷 `chaos-collage-data` 挂载 `/data`；Nginx 提供 HTTPS，Certbot 自动续期。

## 修改记录

项目侧仅修改 AGENTS.md、SESSION_HANDOFF.md、session 索引，并新增本记录，均保持确认的 UTF-8 无 BOM、LF；不修改编辑器代码，不提交或推送 Git。

服务器侧详情及事实真源在 [STATE.md](D:/R_Program/服务器/projects/chaos-college/STATE.md)、[OUTBOX.md](D:/R_Program/服务器/projects/chaos-college/OUTBOX.md)、[完整部署记录](D:/R_Program/服务器/sessions/2026-10-02_1435_CHAOS首次部署.md)。本 session 由服务器维护方主动写入交接，部署事实已在服务器侧归档，无需重复投递自己的 INBOX 简报。

## 验证

- 已部署源码 JS 语法、Python 编译、bash -n 通过。本地隔离空库 13 项通过。
- 公网 13 项通过：HTTPS/TLS、HTTP 301、配置与健康接口、静态资源、未登录工程 401、内部路径 404、安全响应头。
- 既有 sakisaki.top、www、wayfinder、shop、yaoyiyao 的 HTTPS 均 200；真实 Chrome 注册页完整可见。
- 未创建线上测试账户、未代填密码、未读取或复制业务数据库；未执行线上登录后保存/恢复完整流程。上游测试报告没有当作本次生产验收。

## 遗留事项与下一步

- 用户自行注册登录后使用云端工程，初始每账号 500 MiB、单次上传 40 MiB。
- 还没有自动数据备份，后续更新前明确备份/恢复与数据兼容方案。不得删除卷或直接以本地旧 checkout 覆盖线上快照。
- SSH 认证前断开原因待确认，现有雨云 VNC 可恢复；具体运维看服务器 [手册](D:/R_Program/服务器/scripts/chaos-college/README.md)。
