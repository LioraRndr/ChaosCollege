# 当前 Session 交接

更新时间：2026-11-22（Asia/Shanghai）

## 当前状态

- `main`（`f94f904`）已包含云端版、新 Logo、GitHub 包装（PR #1、#2 均已合并）。
- 分支 `claude/serene-johnson-qr0db8` 新增**智能抠图**，已推送，**尚未合并到 main**。详见 [2026-11-17_1359-smart-cutout.md](sessions/2026-11-17_1359-smart-cutout.md)，选型与验证见 [experiments/smart-cutout-2026-11-17](experiments/smart-cutout-2026-11-17/README.md)，稳定事实见 [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)。
  - 图片图层「智能抠图…」：BiRefNet_lite 512 模型在浏览器内运行（有 f16 显卡走 WebGPU，否则 WebAssembly），图片不上传；可调边缘、羽化，自动裁边，可恢复原图或保留原图层。
  - 组件（约 121 MB）不进仓库，按 `js/cutout-manifest.js` 固定版本与 SHA-256 首次使用时下载：本机版走公共 CDN，云端版由服务器镜像到数据卷（`CC_CUTOUT`、`admin cutout`）。

## 验证

- 智能抠图：t13 本机版 27/27（冷缓存）/ 25/25（热缓存）；t14 云端版 8/8（本地服务、全新数据目录、Docker 各一次）。
- 旧回归：云端 t12 19/19；本机 t11 10/11（唯一失败是 Chrome 153 在 file:// 下拦截 manifest，与改动无关），t1 / t2 / t5 / t6 功能正常。
- 未验证：实体显卡上的 WebGPU 路径（本环境无 GPU）。

## 等待用户

1. 在自己的 Chrome / Edge 里试用智能抠图（首次下载约 121 MB），确认效果与速度；满意后合并本分支（可在 GitHub 上为本分支开 PR）。
2. 云端服务器升级后会自动下载组件；服务器不能访问外网时按 [DEPLOY.md](DEPLOY.md)「智能抠图组件」手动放入。
3. 此前遗留仍有效：公开仓库前在本机重写 Git 历史（清除参考截图、替换个人邮箱，命令见 [2026-10-01_2347 记录](sessions/2026-10-01_2347-save-layer-pick-menu.md)）；GitHub 公开设置；服务器部署（中国大陆需备案）。

## 下一步可做

- 抠图增强：画笔修补蒙版、批量抠图、非图片图层自动栅格化后抠图、显卡上试 1024 级模型以提升发丝细节。
- 旧测试 t11 / t5 忽略 file:// 下的 manifest 报错。
- 可选：管理后台页面、邮箱找回密码、工程分享链接、定时备份脚本。
