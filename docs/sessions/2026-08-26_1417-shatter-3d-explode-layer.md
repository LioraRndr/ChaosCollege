# Session: 新增 3D 爆裂碎片图层（shatter）

- 时间：2026-08-26 14:17（Asia/Shanghai）
- 状态：已完成
- 用户原始请求："下面为这个编辑器添加新功能。就是这种3D爆炸类图样转2D的功能，这个能做到吗？"（附 Blender 爆炸 icosphere 截图 + 黑/白/红碎片成品图各一张）；15:30 追加："你这个不就是粒子吗，我要的不是粒子啊。我给你的那个图是用blender搞的一个充满尖刺的不规则实体，调整一下阈值和光泽，使之有 Y2K 的那种感觉。当然，你这次做的这个效果也有用，先留着"

## 启动上下文

- 已按 `AGENTS.md` 强制流程恢复：`README.md`、`docs/README.md`、`docs/PROJECT_CONTEXT.md`、`docs/SESSION_HANDOFF.md`、`docs/sessions/README.md`、最近记录 `2026-08-26_1141-session-resume.md`。
- 项目：CHAOS.COLLAGE 浏览器端静态平面编辑器，无构建/无依赖/非 Git 仓库，纯 Canvas 2D，全部效果走确定性 seed（mulberry32 + state.seed + layer.id）。
- 上一 session 完成 UI 现代化重设计 + 中文化 + 图标化 + 图层拖拽调序 + 自定义下拉，功能逻辑零改动。

## 可行性结论

参考图本质 = 低多边形球体爆炸 + 透视投影 + 平涂着色。纯 Canvas 2D 软渲染即可实现，不引入 WebGL/three.js：
icosahedron 细分成 icosphere → 面片沿法线位移（爆炸）+ 随机翻滚 + 旋涡扭转 → 透视投影 → 画家算法深度排序 → 法线光照平涂（主体黑/高光白 + 红色点缀面）→ 可选线框 + 中心飞刺。

## 目标与计划

1. 新增 `shatter` 图层类型：`defaultShatter()` 参数对象嵌套在 `layer.shatter`，`createShatterLayer()`，素材页生成器入口「3D 爆裂」。
2. 渲染：`drawShatterLocal()`，两级缓存——几何缓存（seed+爆炸类参数）与像素缓存（全部参数+w/h+qualityScale），参数经 `invalidateLayer` 的 cacheVersion 失效。
3. 检查器「内容」分组：细分/爆炸/翻滚/旋涡/漂移/高光/点缀比例/飞刺/线框 + 三色配色。
4. 配套：ICONS.shatter、typeMap/iconMap、remixLayer 分支、invalidateLayer 清 shatter 缓存。
5. 验证：`node --check` + Playwright 浏览器 smoke test（渲染、调参、导出）。
6. 收尾：更新本 session 文件、sessions/README 索引、SESSION_HANDOFF，同步 README/PROJECT_CONTEXT 能力列表。

## 对话与关键决定

- 14:17 用户要求新增「3D 爆炸类图样转 2D」功能，附 Blender 爆炸 icosphere 截图与黑/白/红碎片成品图。判断：纯 Canvas 2D 软渲染可实现，不需要 WebGL/three.js，与项目零依赖约束兼容。
- 形态选择：作为新图层类型 `shatter`（生成器入口「3D 爆裂」），而非图像效果——参考成品是独立图形；图层形态自动获得变换/混合模式/repeater/撤销/导出全套能力。
- 不引入「视角」控制参数：视角倾斜由 seed 驱动（reseed/remix 即换视角），保持参数面板克制。
- 缓存策略：像素缓存 key 含全部参数 + w/h + seed，参数变化自然产生新 key，因此 shatter 不需要走 `invalidateLayer` 的 cacheVersion 路径；几何缓存（细分/爆炸/翻滚/旋涡/漂移/飞刺）与像素缓存（含配色/线框/高光）分离，拖配色滑杆不重建几何。
- 美学迭代三轮：①初版碎片太大太稀、亮面过多 → 默认细分 2→3、push 改为幂次分布（保留致密核心）；②灰蒙蒙 → 改 reflect 高光模型（diffuse 用原始 ndl，背光面纯黑）；③加 per-face 缩放方差（0.55–1.2）拉开碎片大小层次，相机距离随爆炸强度拉近增强透视。

## 修改记录

- `app.js`（全部改动）：
  - 新增 `shatterCache` / `shatterGeomCache` 两级 LRU 缓存（上限 10 / 24）。
  - `defaultShatter()`：mode/density 3/explode 100/tumble 45/twist 30/scatter 40/gloss 70/accentRatio 16/spikes 45/jagged 55/spikeCount 35/spikeLen 60/bands 4 + 三色 + 线框。
  - `createShatterLayer(name, mode)`、`normalizeLayer` 合并 shatter 默认值、`addShatter(mode)`。
  - 核心渲染：`buildIcosphere()`（midpoint 缓存细分，1–4 级 = 20/80/320/1280 面）、`buildShatterGeometry()`（双形态：burst = 法线爆炸位移 + tumble 双轴翻滚 + twist 绕 Y 螺旋 + scatter 漂移；spike = 共享顶点白噪声位移 + 面挤出尖刺；共用随机视角倾斜与径向飞刺；返回 `{ items, maxR }`）、`renderShatterToCanvas()`（透视投影、画家算法排序；burst 平滑光照 / spike 色阶分档 + 阈值高光；点缀面、线框叠加）、`drawShatterLocal()`（像素缓存 + drawImage）。
  - `drawLayerLocal` 加 shatter 分支；`ICONS.shatter`；`renderLayers`/`renderInspector` 类型映射；检查器「内容」分组按形态切换参数（burst：爆炸/翻滚/旋涡/漂移；spike：粗糙度/尖刺数量/尖刺长度/色阶分档；共用：细分/高光/点缀/飞刺/配色/线框）；`remixLayer` shatter 分支；生成器事件 `shatter`/`spike` 两分支。
- `index.html`：素材页生成器网格新增「3D 爆裂」「3D 尖刺」按钮。
- `docs/PROJECT_CONTEXT.md`、`README.md`：能力列表补 shatter 条目。
- 新增本 session 文件。

## 验证

- `node --check app.js && node --check samples.js` 通过。
- Playwright（Chromium + `python -m http.server 8899`）实测：控制台 0 错误 0 警告；空白配方 + 黑底上添加 3D 爆裂，渲染出深度遮挡正确的光泽碎片球爆（截图确认，含局部放大）；检查器控件全部渲染；「爆炸强度」100→180 滑杆实时重渲染；Ctrl+Z / Ctrl+Shift+Z 撤销重做正常；换种子后构图完全变化（确定性）；2× PNG 导出（1800×2250）边缘锐利。
- 尖刺模式（15:45 追加验证）：黑底上尖刺实体连成一体、长尖刺、硬边分档光照 + 阈值白高光 + 红色点缀到位；「色阶分档」4→2 实时切换为两档海报化；「形态」下拉切回爆裂碎片正常；撤销/重做正常；控制台 0 错误 0 警告。
- 未测：大规模 repeater 叠加 shatter 的性能（count 上限 60，每层独立缓存，理论可承受）。

## 尖刺实体模式（15:45 追加）

- 用户反馈：第一版爆裂是"粒子"，目标是 Blender 风格的「充满尖刺的不规则实体」+ 阈值/光泽调出的 Y2K 感；爆裂效果保留。
- 实现：`shatter` 图层加 `mode` 参数（`burst` 爆裂 / `spike` 尖刺实体），检查器顶部「形态」下拉切换，参数组按形态切换。
- spike 模式几何：共享顶点沿自身方向白噪声位移（`jagged`，网格保持连体不开裂）→ 随机面（`spikeCount` 概率）沿法线挤出为三面尖刺（`spikeLen` 长度），顶点级凹凸 + 挤出尖刺形成不规则实体；径向飞刺照常叠加。
- spike 模式光照（Y2K 硬边）：漫反射按 `bands` 色阶分档（`floor(ndl*bands)/bands`，再 pow 1.35 压暗中档），reflect 高光阈值化（specRaw>0.3 直接纯白）；`bands=0` 回退平滑模型。自动按几何最大半径取景（`maxR`），不会飞出画面。
- 朝向处理：spike 模式法线按所在面质心方向做外向校正（`pushFace` 的 `refDir`，burst 模式不校正以保留翻滚明暗多样性）。
- 入口：素材页生成器新增「3D 尖刺」按钮（`addShatter('spike')`）；`createShatterLayer` 按 mode 设默认（spike: gloss 75 / accentRatio 14 / spikes 40）；`remixLayer` 补 spike 参数随机化。
- 几何/像素缓存 key 均加入 mode 与 spike 参数，切形态自然失效重渲。
- 验证：黑底空白画布实测——尖刺实体连成一体、长尖刺、硬边分档 + 白高光 + 红色点缀到位；「色阶分档」4→2 实时变两档海报化；形态下拉切回爆裂正常；撤销/重做正常；控制台 0 错误 0 警告。

## 遗留事项与下一步

- 等待用户试用两种形态并提美学意见（默认配色/密度/尖刺参数均可再调）。
- 可选后续方向：图片纹理碎片爆裂（把图片纹理贴到面片上）；视角/光源方向参数；把该风格做成一键配方。
- 沿用既有约束：无刷新持久化；`.playwright-cli/` 为 smoke test 残留可删。
