# Session: 保存机制排查、下层图层点选、子菜单高亮

- 时间：2026-10-01 23:47 – 2026-10-02 00:05（Asia/Shanghai）
- 状态：已完成
- 运行环境：Claude Code 云端容器，仓库 `/home/user/ChaosCollege`，分支 `claude/file-save-layers-menu-5k9g8u`
- 用户原始请求：

> 1.现在文件保存是什么机制，我做了一个工程，重启应用后这个工程就没了
> 2.图层居于下面时在画面上经常点不到，会点到上面的图层；可以改为：就是我在侧边栏选中一个下边图层的时候，画面上就可以编辑这个选中的图层，而不是自动又变成上边图层聚焦编辑
> 3.如图，有一部分的菜单有一点显示上的小瑕疵

附图：「图像 → 画布预设」子菜单里，鼠标扫过的「常用比例 / 社交平台 / 印刷 300 DPI / 屏幕 / 经典」全部保持高亮。

## 启动上下文

- 按 AGENTS.md 读取 README、docs/README、PROJECT_CONTEXT、SESSION_HANDOFF、session 索引与最近记录（2026-10-01_1433）。
- 编码核对：将修改的 `js/*.js`、`README.md`、`docs/*.md` 均为 UTF-8 无 BOM。
- `origin/main` 已包含上一 session 的产品化提交（最新 `43bbdd7`），PROJECT_CONTEXT 里「尚未推送」的说法已过期，本次修正。

## 关键发现

1. **保存机制**：工程存在浏览器 IndexedDB（库 `chaos-collage`），改动后 900 ms 防抖自动保存；`.chaos` 文件只在用户另存 / Ctrl+S 时写入。
2. **确认的丢失路径**：旧 `saveProject` 先 `await` 渲染缩略图（WebP 编码是异步的），再写 IndexedDB。关窗口时 pagehide 触发的保存来不及走到写入，最后约 1 秒内的改动会丢。用 Playwright 持久化配置复现：改动后 200 ms 内关闭上下文，重启后改动不在。
3. **整个工程消失没能复现**：新建工程时会强制立即保存，Chromium file:// 下重启后工程仍在。整份工程消失更可能是环境原因：换了浏览器（Chrome / Edge）、换了打开方式（file:// 与 http://127.0.0.1:8080 是不同的库）、无痕窗口、或浏览器设置「关闭时清除网站数据」。需要用户确认是哪种。
4. **点选**：`hitTest` 总是返回最上层命中图层，按下鼠标时直接把选择换成它。
5. **菜单高亮**：`ui.js` 打开子菜单时给行加 `.open`，移到同级其他行只关闭下级菜单，没有去掉旧行的 `.open`。另外「经典」预设名本身带尺寸，菜单又拼一次尺寸，显示成「竖版 900×1125 · 900×1125」。

## 修改记录

- `js/app-core.js`
  - `saveProject` 先写工程文档（沿用上次的缩略图），写完再异步生成缩略图并用 `putThumb` 单独更新；`flushSave` 在有改动时直接发起不带缩略图的保存。
  - 新建工程后静默调用 `navigator.storage.persist()`。
  - 新增 `hitTestAll`；`hitTest` 增加 `preferSelected`：点击点下有已选图层时优先返回它。
- `js/storage.js`：`putProject` 未传缩略图时在同一事务里保留已有缩略图；新增 `putThumb`。
- `js/app-tools.js`：选择 / 移动、文字工具、悬停高亮、双击、右键都优先已选图层；Shift / Ctrl 点选仍按最上层切换。右键菜单把指针下的全部图层传给菜单。
- `js/app-dialogs.js`
  - 右键菜单新增「选择图层 ▸」，列出指针下所有图层（从上到下），可直接选中被遮挡的图层。
  - 自动保存后，若工程关联了 `.chaos` 文件且写权限已授予，4 秒防抖顺带写入该文件（不主动弹授权）。
  - 工程主页底部显示「工程库位置：浏览器 · 来源」；「数据存储说明」补充浏览器 / 无痕 / 清除数据设置和关联文件说明。
- `js/ui.js`：菜单行进入时清除同级 `.open`，只保留当前展开子菜单的那一行高亮。
- `js/model.js`：经典预设改名为「竖版 4:5 / 方形 1:1 / 横版 16:9」，菜单不再重复尺寸。
- 文档：README.md、docs/PROJECT_CONTEXT.md、docs/SESSION_HANDOFF.md、docs/sessions/README.md、docs/README.md、本文件；新增 docs/experiments/save-pick-menu-2026-10-01/（README、测试脚本、截图）。

## 验证

- `node --check` 全部 JS 通过。
- 新回归 t11（Chromium 持久化配置，file://）11/11 PASS：主页显示工程库位置；面板选中下层图层后在重叠区拖动，移动的是下层且上层不动；无选择时点击选最上层；右键「选择图层」列出两层并能选中下层；扫过「画布预设」5 个分类后只有 1 行高亮；改动后立即关闭窗口，重启后 3 个图层都在、缩略图保留；无控制台错误。
- 旧回归 t1、t2、t5、t6 通过，无错误。
- 未验证：Windows 实机关闭窗口的时序；File System Access 关联文件的自动写入（无头环境没有保存对话框）。

## 遗留事项与下一步

- 请用户确认工程丢失时的打开方式：是否总用桌面快捷方式、电脑上是否同时有 Chrome 和 Edge、是否开启了「关闭时清除网站数据」。主页底部现在会显示当前工程库位置，便于对照。
- 重要工程建议另存一次 `.chaos`，之后自动保存会顺带更新它（重启后按一次 Ctrl+S 重新授权）。
- 可选：自动备份到用户选定的文件夹（File System Access 目录句柄），作为浏览器存储之外的第二份。

## 追加：PR（2026-10-02）

- 用户在 Claude Code 界面为本分支创建了 [LioraRndr/ChaosCollege#1](https://github.com/LioraRndr/ChaosCollege/pull/1)；后续推送到本分支会更新该 PR。交接与项目上下文已同步引用。

## 追加：云端部署、新 Logo、GitHub 公开准备（2026-10-02 11:11 起）

- PR #1 已由用户合并；本分支已快进到 `origin/main`（`0ffa7e1`）后继续。
- 用户原话：

> 我是用桌面快捷方式打开的，好像用的 Chrome 桌面应用的壳，我也有 Edge 浏览器。
> 我现在要部署到我那个服务器上，提供云端使用，就是自动保存云端、可另存为到本地。
> 然后重做一个精致点的logo。并且把 github 上面包装好，比如中文文档，之后要设为公开。

- 用户选择（问答）：云端**公开注册、多用户**；公开前**重写 Git 历史**清除别人的参考截图；许可证 **MIT**；服务器 **Linux + Docker**。
- 公开前审查发现：`assets/ref-*.jpg`、`samples.js`、`docs/experiments/datamosh-*` 里 7 张 PNG（内容是参考截图及其处理结果）仍在历史中；提交元数据含两个个人邮箱。未发现令牌 / 私钥。
- 历史重写（filter-branch + 强推 main）被本环境的权限规则拦截，未执行；改为把命令交给用户在本机运行。
- 计划：零依赖 Python 标准库后端（SQLite + 文件存储、注册登录、配额、限流），前端 `CC.storage` 增加云端实现；Docker Compose + Caddy 自动 HTTPS；新 Logo（SVG / ICO / PNG / 社交预览图）；中文 README、MIT LICENSE、部署文档。

### 过程中的用户补充

> 用instrument serif字体
> 我说的是banner字体，logo的话感觉还是不放C比较好

- 先做过「切片 C」图形，又试过用 Instrument Serif 的 C；按用户澄清，最终：**Logo 不含字母**（前后两张拼贴卡片，前卡被切开一条错位并带 RGB 分色，加 Y2K 四芒星，是旧 Logo 的延续）；**Instrument Serif 只用于 GitHub 横幅**（渲染为 PNG，字体文件不进仓库）；软件内字标保持原来的无衬线样式。

### 实际结果

- 云端服务 `server/chaos_server.py`（Python 标准库）：注册 / 登录 / 退出 / 改密码 / 注销账号；scrypt 密码哈希、HttpOnly + SameSite=Lax（HTTPS 下 Secure）会话 Cookie、写请求自定义头 + Origin 校验、登录注册限流、空间配额与单文件上限、注册开关 / 邀请码 / 人数上限；工程（带版本号做冲突检测）、图片、缩略图、字体的读写接口；只放行编辑器静态文件，带 CSP 等安全头；上传文件以附件形式返回（SVG 不会被当作网页执行）；`admin` 子命令管理账号。
- 前端 `js/cloud.js`：自动识别云端服务，登录 / 注册页（可选「本机试用」），登录后把 `CC.storage` 的工程库换成 API；`app-core.js` 保存失败处理：网络错误静默重试、401 弹出重新登录、409 让用户选「加载云端版本 / 用当前窗口覆盖」；主页显示账号菜单、云端用量；文件菜单增加「账号」；状态栏与提示改为「已保存到云端」。`.chaos` 导入改为先建工程再传图片。
- 部署：Dockerfile（非 root、健康检查）、docker-compose.yml（app + Caddy 自动 HTTPS，数据卷 `chaos-collage-data`）、deploy/Caddyfile、deploy/docker-compose.http.yml（无域名试用）、.env.example、.dockerignore；删除早期视频实验的 `server.py`。
- 品牌：assets/logo-mark.svg、logo-glyph.svg、新 chaos-collage.ico（16–256）、icon-192/512、apple-touch-icon、manifest.webmanifest；页面图标与顶栏 / 主页 / 登录页换成新 Logo。
- GitHub 包装：中文 README（横幅、徽章、特色、截图、快速开始、云端保存说明、快捷键、结构）、README.en.md、LICENSE（MIT）、CONTRIBUTING.md、SECURITY.md、Issue 模板、docs/DEPLOY.md（部署、配置、账号管理、备份、升级、HTTP 试用、无 Docker、安全设计、常见问题）、docs/images/。
- 文档：PROJECT_CONTEXT、AGENTS.md 项目边界、docs/README、SESSION_HANDOFF、session 索引、新增 experiments/cloud-deploy-2026-10-02。

### 验证

- `node --check` 全部 JS、`python3 -m py_compile server/chaos_server.py` 通过。
- 云端端到端 t12：19/19 PASS（两次全新数据目录）。
- 接口安全探测（curl）：CSRF 403、路径穿越 / 非公开目录 404、未登录 401、弱密码 400、安全响应头齐全。
- Docker：镜像构建、容器健康检查、`admin list` 正常；Compose + Caddy（localhost 内部证书）HTTPS 注册成功，Cookie 带 Secure，带 HSTS；两个 compose 文件 `config` 校验通过。
- 自查发现并修复：被拒绝的写请求未读请求体会污染长连接上的下一个请求，改为出错时关闭连接；修复后重建镜像复测、t12 两次 19/19。
- 测试插曲：容器内没有 `ss`，测试服务器重启脚本一度没停掉旧进程，改为按 /proc 命令行查找后重跑全部云端测试。
- 本机版回归：t11 11/11，t1 / t2 / t5 / t6 无错误。

### 未完成 / 需要用户操作

- **重写 Git 历史**（清除 `assets/ref-*.jpg`、`samples.js`、datamosh 实验里 7 张含参考图的 PNG，并把提交中的两个个人邮箱换成 GitHub noreply 地址）被本环境权限拦截，需用户在本机执行；命令见本次最终回复。重写后 PR #1 页面仍引用旧提交，若要彻底清除需联系 GitHub Support 或重建仓库。
- 设为公开、仓库简介 / Topics / 社交预览图（docs/images/banner.png）需在 GitHub 设置页由用户操作。
- 部署到用户服务器需用户执行（我无法登录其服务器）；中国大陆服务器需 ICP 备案。
- 用户确认：工程丢失时使用桌面快捷方式（Chrome 应用窗口）、同时装有 Edge。代码层未能复现整库消失；云端版上线后不再依赖浏览器存储。
