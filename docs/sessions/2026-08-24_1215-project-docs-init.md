# Session: 初始化项目文档与连续性机制

- 时间：2026-08-24 12:15（Asia/Shanghai）
- 状态：已完成
- 用户原始请求：“熟悉项目目录，把项目文档初始化一下，每次新增对话都要本地化记录，并确保切换session后能无缝衔接。”

## 启动上下文

- 工作目录：`D:\R_Program\ChaosCollege`
- 根目录包含 `index.html`、`styles.css`、`app.js`、`samples.js`、`serve.sh`、`README.md` 和 3 个 JPG 资源。
- 项目不是 Git 仓库；没有包管理器、构建配置或测试配置。
- 检查时未发现 `AGENTS.md`、`Agent.md` 或 `Claude.md`。
- 修改前已确认原有文本文件均为 UTF-8（无 BOM），未发现乱码。

## 目标与计划

1. 梳理项目结构、运行链路、状态模型与技术约束。
2. 建立稳定项目上下文、当前交接文档和按 session 追加的本地历史。
3. 用根目录规则强制后续 session 先恢复、后建档、结束前交接。
4. 检查链接、编码、文档一致性和现有 JavaScript 语法。

## 对话与关键决定

- 将信息拆分为“稳定事实 / 当前状态 / 历史记录”三层，减少新 session 恢复时的上下文噪声。
- “每次新增对话”按每个独立 session 建立一份本地 Markdown 记录；同一 session 的后续对话追加到同一记录。
- 默认保存结构化摘要，并保留会影响任务边界的用户原始请求；不落盘敏感信息或大段工具输出。
- 不擅自初始化 Git，也不引入框架或依赖。
- 12:35 用户追加需求：“然后，给这个编辑器制作一个 datamosh 效果”。本次继续沿用同一 session 记录。
- datamosh 将接入现有图片效果链和 Inspector，以 seed 驱动的块级横向拖影与色彩错位实现，保证同一参数可复现，并保持当前原生 Canvas 架构。
- 12:56 用户澄清：需要的是 After Effects Datamosh 插件一类的跨镜头帧间效果——新场景已出现，但上一场景的轮廓、块和运动继续附着在新画面上；已实现的静态故障错位效果需要保留。
- 核对官方说明后确认，目标机制是删除新镜头开头的 I-frame，让随后 P-frame 的运动向量继续作用于上一镜头像素。现有静态 `Datamosh` 将改名为 `Block glitch`，新的真实帧间功能命名为 `Temporal Mosh`。
- 由于浏览器无法直接执行本机 FFmpeg，将新增只监听本机的 Python 静态/API 服务；原有直接打开 HTML 的静态工作流继续保留。
- 13:45 用户再次明确最终交付物不是视频，而是平面编辑器中呈现 AE Datamosh 感染瞬间的单帧效果。方向调整为纯 Canvas 静态 `Datamosh Frame`：保留 `Block glitch`，移除视频工作台入口，以宏块运动场、轮廓幽灵和残差附着模拟“上一帧运动继续寄生在当前画面”。

## 修改记录

- 更新 `README.md`，增加文档入口。
- 新增 `AGENTS.md`。
- 新增 `docs/README.md`、`docs/PROJECT_CONTEXT.md`、`docs/SESSION_HANDOFF.md`。
- 新增 `docs/sessions/README.md` 和本记录。
- `app.js` 新增 `applyDatamosh` 像素处理、3 个图片效果参数、`BROWSER CRASH` 示例参数和 remix 随机化。
- 更新 `README.md` 与 `docs/PROJECT_CONTEXT.md` 的功能说明。
- 将原静态效果的 UI 名称改为 `Block glitch`，保留底层参数、配方和 remix 行为。
- 新增 `server.py`，实现本机 FFmpeg 状态接口、视频上传限制、三段 MPEG-4 编码、I-frame 删除、码流拼接和 H.264/AAC 输出。
- 更新 `index.html`、`styles.css` 与 `app.js`，增加独立 Temporal Mosh 工作台和前端完整状态管理。
- 更新 `serve.sh`、`README.md`、`AGENTS.md`、项目上下文与交接文档。
- 未修改样例数据或图片资产。
- 根据 13:45 的最终澄清，在 `app.js` 新增纯 Canvas `applyDatamoshFrame`，保留现有 `applyDatamosh` 作为独立 `Block glitch`。
- `Datamosh Frame` 新增感染强度、前一帧来源、宏块尺寸、运动距离、流向角度和持续度参数；默认从当前图片合成前一帧，也可选择另一图片图层作为 donor。
- donor 模式按旧图轮廓梯度与新旧帧亮度残差激活宏块，再沿 seed 驱动的连续运动场重复搬运；隐藏 donor 后仍可引用，删除 donor 会清理缓存并回退自回声。
- Inspector 新增有明确视觉层级的 `BLOCK GLITCH` / `DATAMOSH FRAME` 分组；`browser-crash` 配方与 Remix 接入新参数。
- 从 `index.html` 与 `app.js` 撤下视频工具栏入口、弹窗、FFmpeg API 状态及事件；`serve.sh` 恢复普通静态服务器。
- 尝试删除早期 `server.py` 视频原型时被安全钩子拦截；该文件保留但已从 UI、脚本与现行文档运行链路断开。
- 再次更新 `README.md`、`AGENTS.md`、`PROJECT_CONTEXT.md` 与 `SESSION_HANDOFF.md`，把最终项目边界固定为静态平面效果。

## 验证

- Markdown 链接检查通过：所有本地相对链接均指向现有文件。
- 编码检查通过：所有新增/修改 Markdown 均为 UTF-8（无 BOM）。
- 乱码特征检查未发现实际问题；扫描只命中 `AGENTS.md` 中故意写入的检测示例。
- `node --check app.js` 通过。
- `node --check samples.js` 通过。
- 以新 session 读者视角复核后，可分别从 `PROJECT_CONTEXT.md`、`SESSION_HANDOFF.md` 和本记录回答“项目是什么、如何运行、当前做到哪、最近为何这样决定、下一步从哪里继续”。
- 真实浏览器 smoke test 通过：`BROWSER CRASH` 可加载，Datamosh/Mosh block/Mosh drift 控件均可见，浏览器控制台无错误。
- 将 datamosh 从 0 调至 80 后，Canvas 区域截图哈希由 `889512464` 变为 `1007331212`，说明效果改变了实际渲染。
- 以相同 seed 和参数重新渲染后截图哈希仍为 `1007331212`，说明效果具有确定性。
- FFmpeg 原型测试通过：删除新场景首个 I-frame 后，感染帧显示上一场景的轮廓/块受新场景 P-frame 运动驱动，恢复段重新显示干净 I-frame。
- 本机 API 端到端输出为 H.264、320×240、30 fps、119 帧、3.966667 秒；非法切点返回 HTTP 422。
- 浏览器 UI 端到端通过：识别 FFmpeg 8.0.1、载入 4 秒测试视频、设置 2.00 秒切点/1.20 秒感染/Q14、生成 163.2 KB 结果 Blob并提供预览下载。
- 空状态下载链接已确认隐藏、渲染按钮禁用；静态 `Block glitch` 仍可见；浏览器控制台无错误。
- 最终浏览器回归确认顶部已无 `TEMPORAL MOSH`；Inspector 同时显示 `BLOCK GLITCH`、`DATAMOSH FRAME` 与 `Previous frame`。
- 单图验证：`browser-crash` 的自回声模式产生可见的轮廓拖附、宏块保持和方向性运动残差。
- 双图验证：`digital-garden` 中成功把 `UI RUINS CUTOUT` 作为 `GARDEN BACKGROUND` 的前一帧 donor，旧图块注入新图。
- 2× PNG 导出验证通过，页面状态返回 `PNG EXPORTED AT 2X`。
- 最终 `node --check app.js`、`node --check samples.js` 通过；13 个文本文件均为 UTF-8 无 BOM，未发现实际乱码；Markdown 本地链接全部可达；当前 UI 与运行文档不再含活动视频入口。

## 遗留事项与下一步

- 当前无阻塞项；最终交付为静态 `Datamosh Frame`，原 `Block glitch` 同时保留。
- donor 当前使用其原始图片与 Fit 模式，不继承 donor 图层的画布变换或图片效果。
- 2× 大尺寸输出会额外创建当前帧、donor 与前一帧 Canvas，瞬时内存占用高于普通效果。
- `server.py` 是已停用的早期视频原型；因安全钩子阻止删除而留在目录中，不属于当前运行路径。
