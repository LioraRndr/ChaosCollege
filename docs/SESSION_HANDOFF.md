# 当前 Session 交接

更新时间：2026-10-02 11:35（Asia/Shanghai）

## 当前状态

分支 `claude/file-save-layers-menu-5k9g8u`（PR #1 已合并后继续）完成了云端版、新 Logo 和 GitHub 公开准备，尚未合并到 main。详细过程见 [2026-10-01_2347-save-layer-pick-menu.md](sessions/2026-10-01_2347-save-layer-pick-menu.md) 的「追加：云端部署……」一节，稳定事实见 [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)。

- **云端版**：`server/chaos_server.py`（Python 标准库）+ `js/cloud.js`；公开注册、云端自动保存、冲突提示、配额、管理命令；Docker Compose + Caddy 自动 HTTPS。部署步骤见 [DEPLOY.md](DEPLOY.md)。
- **本机版**：照旧可用（file:// / 桌面快捷方式），保存可靠性修复（PR #1）已在 main。
- **品牌**：不含字母的新 Logo（拼贴卡片 + 错位切片 + RGB 分色 + 四芒星），新 ico / PWA 图标；GitHub 横幅用 Instrument Serif（只在横幅 PNG 中）。
- **GitHub**：中文 README、README.en.md、MIT LICENSE、CONTRIBUTING、SECURITY、Issue 模板。

## 验证

- 云端端到端 t12 19/19；接口安全探测；Docker 镜像与 Compose + Caddy（localhost）实测通过。见 [cloud-deploy-2026-10-02](experiments/cloud-deploy-2026-10-02/README.md)。
- 本机版 t11 11/11，旧回归 t1 / t2 / t5 / t6 无错误。

## 等待用户

1. **公开前重写 Git 历史**（本环境权限拦截，需用户本机执行）：清除 `assets/ref-*.jpg`、`samples.js` 和 datamosh 实验目录里 7 张含参考图的 PNG，并把两个个人邮箱替换为 GitHub noreply 地址，然后强推所有分支。PR #1 页面仍会引用旧提交，彻底清除需联系 GitHub Support 或重建仓库。命令在 session 记录对应的最终回复中。
2. 合并本分支到 main（建议在历史重写之前合并，再一起重写）。
3. GitHub 设置：设为公开、简介、Topics、社交预览图上传 `docs/images/banner.png`、开启 Private vulnerability reporting（SECURITY.md 依赖它）。
4. 在自己的服务器上按 DEPLOY.md 部署；中国大陆服务器需备案。

## 下一步可做

- 历史重写后，文档里提到的旧提交号（如 `515b299`）都会失效，需要顺手更新。
- 可选：管理后台页面、邮箱找回密码（需要 SMTP）、工程分享链接、定时备份脚本。
- 性能边界不变：效果在主线程计算，超大图 + 帧感染单次可达数百毫秒。
