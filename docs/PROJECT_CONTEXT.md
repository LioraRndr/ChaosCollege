# CHAOS.COLLAGE 项目上下文

最后核对：2026-10-02 00:05（Asia/Shanghai）

## 项目定位

CHAOS.COLLAGE 是浏览器端的静态平面设计编辑器，面向高密度 Y2K / Y3K、cyber-collage、Xerox / Punk 风格的海报与图形。原生 HTML / CSS / JS，无依赖、无构建，直接打开 `index.html` 即可使用（file:// 下也能用，所以不用 ES module，全部是经典脚本）。只做静态图片，不处理视频。

## 当前能力

- **工程**：工程主页（快速新建、最近工程缩略图、搜索 / 排序、打开、重命名、创建副本、导出 `.chaos`、删除、存储占用与持久存储申请）；新建工程对话框（常用比例 / 社交平台 / 印刷 300 DPI / 屏幕 / 旧版尺寸 34 个预设，自定义尺寸支持 px / mm / cm / in + DPI，背景色或透明）；自动保存到本机工程库（主页底部显示当前库所在的浏览器与来源）；Ctrl+S 立即保存（若关联了 `.chaos` 文件则同时写入，自动保存在已授权时也会顺带写入）；另存 / 打开 `.chaos`。
- **画布尺寸**：不再有一键切换比例按钮；改为「图像 → 画布大小… / 画布预设（三级菜单）」打开对话框一次性应用，支持等比缩放内容、拉伸内容、按锚点扩展 / 裁切三种方式，可撤销。
- **界面**：菜单栏（文件 / 编辑 / 图像 / 图层 / 视图 / 帮助，支持多级子菜单）、左侧工具栏、工具选项栏、图层 / 资源 / 历史三个面板、右侧属性面板、生成器与素材抽屉、右键菜单、快捷键说明。
- **工具**：选择移动（8 柄非等比拉伸、Shift 等比、Alt 中心、旋转柄、Alt 拖动复制、框选与多选、智能吸附参考线；点击处有已选图层时优先编辑它，被遮挡的图层可在面板选中后直接在画布上拖动，或右键「选择图层」挑选）、变形（扭曲 / 透视 / 斜切 / 4×4 网格变形，带预设）、抓手、缩放、文字（画布内直接编辑）、形状拖拽绘制（12 种）、笔刷（圆头 / 马克笔 / 霓虹 / 虚线 / 喷漆）、吸管。
- **图层**：图像、文字、形状、贴纸（矢量）、生成器、笔刷、错误窗口、3D 爆裂。全部类型都支持非等比拉伸、旋转、翻转、透视 / 网格变形、效果栈、图层样式（投影、外发光、贴纸描边、毛玻璃背景模糊）、剪切蒙版、17 种混合模式、散乱重复、锁定 / 隐藏、栅格化。
- **文字**：163 个分组字体条目并检测本机是否可用；「读取本机全部字体」（Local Font Access，Chrome / Edge）；导入 TTF / OTF / WOFF / WOFF2 到本机字体库（解析字体名，随 `.chaos` 打包）；字重、斜体、字号、行距、字距、对齐、竖排、弧形弯曲、纯色 / 渐变 / 镀铬 / 全息填充、双层描边、横纵拉伸、10 个快速样式（含 Y3K）。
- **效果**：40 个可叠加、可排序、可开关的效果，分调色 / 印刷像素 / 故障 / 扭曲 / 光效材质 / 风格化六组；18 个一键风格。`Block glitch`（区块故障）与 `Datamosh Frame`（帧感染）是 2026-09-30 用户认可版本的移植，不透明图片逐像素一致；帧感染新增「透明处拖尾叠加」，让文字 / 贴纸保留原形。
- **生成器与素材**：26 个参数化生成器 + 错误窗口（经典 / XP / Mac / 暗色 / 酸性）、条形码、胶带、纸屑、3D 爆裂 / 尖刺、Y3K 组合（毛玻璃卡片、液态铬星芒 / 爱心、铬金属图腾）；55 个可换色矢量贴纸（Y2K 符号、UI / 电脑、像素）。
- **导出**：PNG / JPG / WEBP，0.5×–4×，可透明，可只导出选中图层；有 File System Access 时弹出保存对话框，否则下载。
- **Y3K**：调研与落地对照见 [research/y3k.md](research/y3k.md)。

配方（digital-garden 等四套）和三张参考截图已按用户要求删除；不再有内置样例图片。

## 目录地图

```text
ChaosCollege/
├─ AGENTS.md                 # 新 session 必读规则与本地化记录协议
├─ README.md                 # 用户运行说明
├─ index.html                # 单页 DOM 骨架，按依赖顺序加载 js/*.js
├─ styles.css                # 全部界面样式
├─ app.js                    # 启动：收集 DOM、恢复字体库与偏好、打开工程主页
├─ js/
│  ├─ util.js                # CC.util：数学、随机、颜色、画布、文件工具
│  ├─ storage.js             # CC.storage：IndexedDB 工程库 + .chaos 文件格式
│  ├─ fonts.js               # CC.fonts：字体目录、可用性检测、本机字体、导入字体
│  ├─ warp.js                # CC.warp：四角单应 + 4×4 Bézier 网格，软件光栅化
│  ├─ effects.js             # CC.effects：效果注册表、像素工具、调色/印刷/光效/风格化
│  ├─ effects-glitch.js      # 故障与扭曲效果（含移植的区块故障与帧感染）
│  ├─ effects-y3k.js         # 玻璃折射、氛围光晕、一键风格 LOOKS
│  ├─ shatter.js             # CC.shatter：3D 爆裂 / 尖刺渲染
│  ├─ vector-assets.js       # CC.vectorAssets：矢量贴纸库与赛博图腾路径
│  ├─ generators.js          # CC.generators：参数化生成器
│  ├─ text.js                # CC.paint 填充 + CC.text 文字排版 / 绘制
│  ├─ render.js              # CC.createRenderer：图层渲染、栅格缓存、效果阶段缓存、变形、样式、剪切蒙版
│  ├─ ui.js                  # CC.ui：图标、菜单、对话框、下拉框、控件、字体选择器
│  ├─ model.js               # CC.model：工程 / 图层默认值、尺寸预设、图层工厂、文字预设
│  ├─ app-core.js            # CC.App：状态、历史、资源、自动保存、视图、图层操作
│  ├─ app-tools.js           # 工具与指针交互、覆盖层、吸附、文字编辑、快捷键、拖放粘贴
│  ├─ app-panels.js          # 工具栏、选项栏、图层/资源/历史面板、抽屉、属性面板
│  └─ app-dialogs.js         # 工程主页、新建 / 画布大小 / 导出对话框、菜单、文件读写
├─ server.py                 # 早期视频实验残留；当前不使用
├─ serve.sh                  # 普通静态服务器（8080）
├─ launch.ps1 / launch.vbs / launch.bat  # Windows 启动器（Chrome/Edge --app 打开 index.html）
├─ assets/chaos-collage.ico  # 桌面图标
└─ docs/
   ├─ README.md / PROJECT_CONTEXT.md / SESSION_HANDOFF.md
   ├─ research/y3k.md        # Y3K 调研
   ├─ experiments/           # 历次验证证据（含 2026-10-01 测试脚本与截图）
   └─ sessions/              # 每次对话的本地历史
```

## 运行与验证

- Windows：桌面快捷方式 `CHAOS.COLLAGE.lnk` → `launch.vbs` → `launch.ps1`，用 Chrome / Edge 的 `--app` 窗口打开 `index.html`（file://）。目录结构变化不影响启动器。
- 其他：直接打开 `index.html`，或 `python -m http.server 8080` 后访问 `http://127.0.0.1:8080`。注意两种方式是不同来源，工程库互不可见。
- 语法检查：`for f in js/*.js app.js; do node --check "$f"; done`
- 浏览器回归：[experiments/editor-upgrade-2026-10-01](experiments/editor-upgrade-2026-10-01/README.md) 中的 playwright-core 脚本（依赖装在 /tmp，不进入项目）。

## 运行时架构

1. `index.html` 依次加载 `js/` 下的模块，最后加载 `app.js`。所有模块挂在 `window.CC` 上；编辑器模块共享 `CC.App`（`state`、`dom` 与各功能函数）。
2. 启动时打开 IndexedDB（库名 `chaos-collage`：`projects`、`assets`、`fonts`、`settings`、`handles` 五个表），注册已导入字体，恢复偏好，然后显示工程主页。
3. 工程文档 `doc = { version: 2, id, name, width, height, bg, transparent, seed, layers[], exportSettings }`。图层只引用图片资源 ID（`A_` + SHA-256 前缀），图片 Blob 单独存在 `assets` 表，所以撤销快照只是小 JSON。
4. 视口：`artCanvas` 按视口尺寸 × DPR 绘制，带缩放 / 平移变换；`overlayCanvas` 只画选框、控制柄、网格、参考线和预览。
5. 渲染：无效果 / 变形 / 样式的图层直接矢量绘制；否则走栅格管线「内容 → 效果栈 → 贴纸描边 → 变形 → 合成（投影 / 外发光）」，结果按内容哈希 + 质量缓存（LRU，192 MiB）。效果另有阶段缓存（96 MiB），调整第 N 个效果时复用前 N-1 个的输出。视口质量按缩放取 0.25 / 0.5 / 1 / 2；拖拽缩放时复用旧栅格拉伸预览，慢图层在交互中降低预览精度。
6. 剪切蒙版：一个基础图层加上方连续的 `clip` 图层组成一组，在临时画布中以基础图层的 alpha 裁切；毛玻璃样式把当前已绘制内容模糊后裁进图层形状。
7. 历史：每步保存文档 JSON 快照，最多 100 步，历史面板可跳转。任何改动标记为未保存，900 ms 防抖后写入 IndexedDB：先写工程文档（沿用旧缩略图），再异步生成 360px WebP 缩略图单独更新，所以 pagehide / 切到后台时的保存能在窗口关闭前开始写入。工程关联了 `.chaos` 文件且写权限已授予时，保存后 4 s 防抖顺带写入该文件。
8. `.chaos` 文件：JSON（`format: "chaos-collage-project"`、`version: 2`、`doc`、以 data URL 内嵌的 `assets` 与用到的导入字体 `fonts`）。打开时若库中已有同 ID 工程，可选择覆盖或作为副本打开。

## 关键约束

- 现有文本文件均为 UTF-8（无 BOM）、LF；修改前仍按 `AGENTS.md` 复核编码。
- 不引入包管理器、框架或构建；测试驱动只装在 /tmp。
- 浏览器目标为 Chrome / Edge（canvas filter、letterSpacing、File System Access、Local Font Access）。其他浏览器缺失这些 API 时会退化（如另存改为下载）。
- 数据只在本机浏览器中，清除浏览器数据会删除工程库；重要工程应另存 `.chaos`。
- 效果与生成器在主线程计算。大图（如 A4 300 DPI）加帧感染这类重效果，单次计算可达数百毫秒；导出受浏览器画布上限约束（单边 ≤ 32000、总像素约 2.2 亿以内）。
- `docs/experiments/datamosh-*` 的旧基准脚本依赖已删除的 `samples.js`，需要从基线提交 `515b299` 取回才能重跑。

## 版本管理

- 远端 `https://github.com/LioraRndr/ChaosCollege`（私有）。`origin/main` 已包含 2026-10-01 产品化升级（截至 `43bbdd7`）。
- 之后的改动在功能分支上进行（如 2026-10-01 夜间的 `claude/file-save-layers-menu-5k9g8u`），通过 PR 合并到 main（如 [PR #1](https://github.com/LioraRndr/ChaosCollege/pull/1)）。
- 仓库级 `core.autocrlf=false`，`.gitattributes` 为 `* -text`。
