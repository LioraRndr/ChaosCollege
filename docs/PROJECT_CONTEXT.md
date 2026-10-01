# CHAOS.COLLAGE 项目上下文

最后核对：2026-10-01 00:01（Asia/Shanghai）

## 项目定位

CHAOS.COLLAGE 是一个浏览器端平面海报与故障影像编辑器原型，用来制作高密度 Y2K、cyber-collage 和 Xerox/Punk 风格静态内容。项目没有依赖安装或打包步骤，可直接打开 `index.html`；当前 Datamosh 目标是单张图片自身卡帧时局部黏连、拖长、崩坏的静态单帧视觉，不处理视频。

## 当前能力

- 导入本地图片或拖放图片到画布。
- 新增文字、复古错误窗口、几何形状、箭头、条形码、胶带和纸屑等图层。
- 移动、缩放、旋转、复制、删除、排序、显隐、透明度及混合模式。
- 带 seed、位移、淡出、缩放和 jitter 的确定性 repeater/scatter。
- `shatter` 爆裂碎片图层：纯 Canvas 软渲染的 3D 球体定格——icosahedron 细分成球，透视投影 + 画家算法深度排序 + 法线光照平涂（主体/高光/点缀三色），可叠加线框与中心飞刺。双形态：`burst` 爆裂（面片沿法线炸开 + 翻滚/旋涡/漂移，平滑光泽）与 `spike` 尖刺实体（共享顶点白噪声位移保持连体 + 随机面挤出长尖刺，色阶分档硬边光照 + 阈值化高光，Y2K 金属感）。几何与像素两级缓存，全部由项目 seed 确定性驱动。
- 对图片应用对比度、饱和度、posterize、threshold、dither、halftone、pixelate、Datamosh Frame、RGB split、noise、invert 等效果。
- `Block glitch`（内部字段仍为 `datamosh`）提供强度、宏块尺寸和横向漂移参数，以项目 seed 与图层 ID 驱动，可稳定复现单帧块级错位；它不是帧间 datamosh。
- `Datamosh Frame` 用纯 Canvas 的连续局部运动场和双缓冲反馈，在 2–14 次迭代中重复搬运已损坏的像素；局部窄纹理条带被拉长，形成卡帧黏连与块级崩坏，未感染区域保持原图。
- `前一帧` 默认为 `自身 / 卡帧反馈`；可选另一图片图层作为起始 donor，donor 可隐藏而不影响引用。`套用卡帧拖坏` 一键设为自身来源、感染率 72、矢量块 14、拖拽距离 120、流向角 0、卡帧累积 78；支持撤销。
- `digital-garden`、`windows-hell`、`browser-crash`、`xerox-punk` 四套视觉配方，以及空白画布。
- 竖版（900×1125）、方形（1000×1000）、横版（1280×720）三种画布。
- 1×/2× PNG 导出、最多 50 步的内存内撤销/重做、键盘微调。

## 目录地图

```text
ChaosCollege/
├─ AGENTS.md                 # 新 session 必读规则与本地化记录协议
├─ README.md                 # 用户运行说明与文档入口
├─ index.html                # 单页应用 DOM 骨架
├─ styles.css                # 全部界面、画布容器和响应式样式
├─ app.js                    # 状态、图层模型、渲染、交互、配方与导出
├─ samples.js                # 3 张示例图的内嵌 JPEG Base64 数据
├─ server.py                 # 早期视频实验残留；当前 UI 与运行链路不使用
├─ serve.sh                  # 启动普通静态服务器（8080）
├─ launch.ps1                # Windows 启动器：Chrome/Edge --app 打开 index.html
├─ launch.vbs                # 静默调用 launch.ps1，避免弹出控制台
├─ launch.bat                # 可见的备用启动入口
├─ assets/                   # 示例图片的原始 JPG 文件与桌面图标
│  ├─ chaos-collage.ico
│  ├─ ref-ui.jpg
│  ├─ ref-garden.jpg
│  └─ ref-browser.jpg
└─ docs/
   ├─ README.md              # 文档导航
   ├─ PROJECT_CONTEXT.md     # 本文件：稳定事实
   ├─ SESSION_HANDOFF.md     # 当前交接状态
   └─ sessions/              # 每次对话的本地历史
```

## 运行与验证

Windows 上一键启动：桌面快捷方式 `CHAOS.COLLAGE.lnk` 指向 `launch.vbs`，用本机 Chrome 或 Edge 的应用窗口打开 `index.html`，不启本地 HTTP 服务。项目内也可运行 `launch.bat`。

编辑器可直接打开 `index.html`。如果浏览器限制本地文件，也可以在项目根目录运行普通静态服务器：

```bash
python -m http.server 8080
```

然后访问 `http://127.0.0.1:8080`。`serve.sh` 封装了同一命令。纯语法检查可使用：

```bash
node --check app.js
node --check samples.js
```

项目目前没有自动化测试框架、lint 配置或包管理器配置，已在 2026-10-01 初始化 Git 仓库（main 分支）；当前运行时没有外部依赖。

GitHub 私有仓库：[LioraRndr/ChaosCollege](https://github.com/LioraRndr/ChaosCollege)。本地 main 跟踪 origin/main，origin 为 https://github.com/LioraRndr/ChaosCollege.git。

## 运行时架构

1. `index.html` 先加载 `samples.js`，后者把 3 个内嵌图片对象挂到 `window.SAMPLE_IMAGES`。
2. `app.js` 在 IIFE 中取得 DOM 与 Canvas 2D context，建立内存态 `state`。
3. 初始化会预载示例图片、绑定 DOM/指针/键盘事件，并载入 `digital-garden` 配方。
4. 所有静态图层进入统一渲染流程；图片效果会进入 `processedCache`，原图进入 `imageCache`。图片效果缓存按最近使用顺序淘汰，同时限制 80 条与 64 MiB RGBA 像素字节；失效/淘汰时将旧 Canvas 尺寸清零。该预算不包含原图、主画布、其他缓存及浏览器内部副本。`Block glitch` 与 `Datamosh Frame` 都在常规像素效果之后、halftone 之前处理。
5. 用户操作前后通过 JSON 快照维护 `history`/`future`，上限为 50 条；PNG 导出按 1× 或 2× 重绘。
6. `Datamosh Frame` 在最终回写前直接读取未改变的输出 Canvas 作为原图，省去额外原图快照；以 seed、图层 ID 和归一化位置生成平滑噪声场，由局部轮廓与感染率决定受损块。每块采样位置/尺寸只计算一次；双缓冲迭代反向采样上一次结果，以窄条带拉伸形成黏连，每轮未感染块恢复原图。完全不透明的自身反馈省去逐块清除，透明图片与另图 donor 保留清除步骤。两张反馈 Canvas 在图层与调用间复用，合计超过 16 MiB 时计算后清空像素存储，全局效果缓存清空时也释放；这限制的是保留量，计算时仍需完整尺寸。运动场仍是合成场，不从真实视频估计运动。
7. `感染率` 控制受损区域，`矢量块` 控制宏块尺度，`拖拽距离` 与 `流向角` 定义主要拉扯，`卡帧累积` 控制反馈轮数、累积位移与黏连强度。自身来源时，感染率 0 或拖拽距离 0 可恢复原图。

## 关键状态与数据边界

- 项目状态只有内存副本，刷新或关闭页面后会丢失；当前没有 `localStorage`、项目文件保存或后端同步。
- 用户导入的图片通过浏览器文件读取进入当前页面，不会上传。
- `samples.js` 是体积最大的文本文件，包含大段生成式 Base64 数据；除非确实要替换内嵌样例，不应手工整文件编辑。
- `assets/` 中的 JPG 与 `samples.js` 的内嵌数据并非运行时网络依赖；实际页面通过后者读取样例。
- HTML、CSS、JS 都是原生实现，没有框架和第三方库。
- `Block glitch` 与 `Datamosh Frame` 都是静态图片效果；后者模拟编解码器帧间感染的某一帧，但不会实际删除 I-frame。
- `server.py` 是已从 UI 和 `serve.sh` 断开的早期视频原型；文件删除被当前安全钩子拦截，不属于现行运行路径。

## 已知工程约束

- 现有文本文件在 2026-08-24 检查为 UTF-8（无 BOM）；每次修改前仍按 `AGENTS.md` 重新确认目标编码。
- 项目没有统一测试框架；涉及交互、渲染或导出的改动应至少做浏览器 smoke test。2026-09-30 Datamosh 优化保留了独立浏览器对照脚本与基准数据，见 [实验说明](experiments/datamosh-performance-2026-09-30/README.md)。
- `Previous frame` 引用的是 donor 图层的原始图片与 Fit 模式，不继承 donor 的画布变换或图片效果；删除 donor 后目标层会回退到自回声。
- Datamosh 仍在主线程完整计算。四份核心 RGBA 缓冲（输出、两张反馈 Canvas、ImageData）估算约 16 字节/像素，900×1125 约 16.2 MB、2× 约 64.8 MB；不等于进程内存实测，也不含源图、主画布、内部副本及其他缓存。大图片、小块、高累积和持续拖动仍可能卡顿。超过图片效果缓存预算时会淘汰并可能重算。2× 算法像素与导出成功提示已验证，实际下载文件尺寸/内容仍未核对。
- 自 2026-10-01 起使用 Git 保存版本；初始化前的历史保留在 docs/sessions 与 docs/experiments。修改前仍检查编码，并在 session 中记录变更。
