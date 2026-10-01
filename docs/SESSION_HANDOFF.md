# 当前 Session 交接

更新时间：2026-10-01 13:52（Asia/Shanghai）

## Git 管理与私有仓库上传（2026-10-01）

- 本轮用户明确授权 Git 管理和上传 GitHub 私有仓库。
- 已初始化 main，初始提交 932583e（44 个文件）；源码、素材、docs 实验与会话记录纳入版本管理。
- .gitignore 排除 .playwright-cli、.superpowers、环境文件和常见凭据/临时文件；.gitattributes 与仓库 core.autocrlf=false 保持现有文件字节/行尾。
- GitHub 授权已恢复；私有仓库：[LioraRndr/ChaosCollege](https://github.com/LioraRndr/ChaosCollege)，API 确认 private=true。origin 使用 HTTPS，main 已成功推送并跟踪 origin/main。
- 本轮记录：[2026-10-01_1352-git-private-github.md](sessions/2026-10-01_1352-git-private-github.md)。

## 当前状态

用户明确选择：**一张图片自身像视频卡住一样，局部黏连、拖长、崩坏**。帧感染已按此目标重做，用户回复「这个不错」。在用户进一步授权「可以，帮我优化」后，已完成小范围性能优化，保留用户认可的最终像素；两组真实 Chromium 基准约快 11%/13%。

## 本轮实现

- app.js 中的 applyDatamoshFrame 改为确定性空间场与 2–14 次双缓冲反馈，窄纹理条带在局部被拉长，未感染区域保持原图。
- Inspector 新增「套用卡帧拖坏」：自身来源、感染率 72、矢量块 14、拖拽距离 120、流向角 0、卡帧累积 78；支持撤销。
- 自身选项显示「自身 / 卡帧反馈」，控制名称使用「拖拽距离」「卡帧累积」。另图 donor 与独立 Block glitch 保留。
- 每块取样坐标/尺寸只计算一次；省去额外原图快照；两张反馈 Canvas/Context 复用；不透明自身图片省去逐块 clearRect，透明图与 donor 保留原行为。
- 图片效果缓存按最近使用顺序淘汰，同时限制 80 条与 64 MiB RGBA 像素；淘汰/失效时 Canvas 尺寸清零。两张反馈画布合计超过 16 MiB 时计算后清零，全局缓存清空时也释放。限制保留量，不限制完整尺寸计算的瞬时开销。
- 仍为无依赖静态平面编辑器，没有视频处理、真实运动估计或构建；Git 已于 2026-10-01 初始化。

## 验证与证据

- PASS：node --check app.js；修改文本严格 UTF-8、无 BOM、无乱码。
- PASS：实际 Chromium 浏览器的空白画布 + 单个数字花园图片，预设产生局部黏连拖长；撤销/重做正常。
- PASS：固定参数重复套用截图一致；拖拽距离 0 时截图恢复原图。
- PASS：优化前后 19 组完整 RGBA 像素对照全部一致，覆盖 1×/2×、微小尺寸、边缘块、小块高累积、0 参数、透明像素、隐藏 donor 两种 fit、删除 donor 回退与缓冲跨尺寸复用。
- PASS：缓存字节/条目预算、淘汰计数、donor 依赖失效、清空释放与 2× 大缓冲释放。
- 实测每组预热 2 次、交替测量 9 次取中位数，包含效果函数与最终 getImageData：900×1125 默认预设 116.8 → 104.3 ms（下降 10.7%）；480×360、块 4、累积 100 为 231.8 → 201.8 ms（下降 12.9%）。只代表两组任务，不等于整个编辑器。
- PASS：最终应用调参、撤销/重做、复制两图片图层、另图来源、删除后撤销正常。
- PASS：2× PNG 生成 Blob、显示导出成功并返回就绪；浏览器 warn/error 日志为空。
- NOT_VERIFIED：自动下载事件超时，未取得文件并核对尺寸或内容。
- 证据与结果：[verification.json](experiments/datamosh-2026-09-30/verification.json)、[原图与效果对照](experiments/datamosh-2026-09-30/comparison.png)、[应用实景](experiments/datamosh-2026-09-30/editor-proof.png)。同目录保留 app-before.js 修改前备份。
- 优化证据：[重跑说明](experiments/datamosh-performance-2026-09-30/README.md)、[最终逐像素/基准结果](experiments/datamosh-performance-2026-09-30/benchmark-results.json)、[优化后应用实景](experiments/datamosh-performance-2026-09-30/editor-proof.png)。同目录 app-before-optimization.js 是用户认可视觉的优化前版本。
- 2026-10-01 00:01 收尾：最终生产文件哈希与基准结果一致；修改文本 UTF-8 无 BOM、无替换字符，文档本地链接可达。临时验证页已关闭，127.0.0.1:8089 静态服务已停止。

## 下一次需要知道的边界

- 审美目标以本轮单图卡帧答复为准，不自动回到旧版跨镜头融合目标。
- 若仍偏离，用具体图片/参考帧确认黏连范围、拉长形状与清晰区域比例。
- 当前预设仍为 11 轮主线程反馈，拖动效果滑杆会重新计算。核心缓冲由五份减为四份，估算 900×1125 约 16.2 MB、2× 约 64.8 MB，不含源图/主画布/内部副本/其他缓存；没有进程内存实测。两张复用反馈画布在预算内会保留存储，不能把瞬时缓冲减少直接等同为空闲内存减少。
- 64 MiB 效果缓存和 16 MiB 临时画布保留预算不代表整个页面内存上限；大图、多大图层、小块、高累积仍可能卡顿，缓存超额淘汰后可能重算。
- 用户关心维护成本，本轮保持现有渲染流程；轻量预览、Worker、GPU 路径均未加入。若用户使用后仍明显卡，再评估拖动时轻量预览、松手/导出完整计算。
- 透明图与 donor 算法路径已做浏览器逐像素对照；极限尺寸性能、实际下载文件仍未核对。
- 应用没有刷新持久化，刷新/关闭会丢失内存作品。
- 桌面启动方式沿用 2026-08-31 的 CHAOS.COLLAGE 快捷方式与 launch.vbs/launch.ps1；本轮未重新验证快捷方式。
- shatter 美学调参仍是历史遗留，未纳入本轮。

完整记录：[2026-09-30_2240-datamosh-intent-review.md](sessions/2026-09-30_2240-datamosh-intent-review.md)。同一对话的后续消息继续更新该文件。
