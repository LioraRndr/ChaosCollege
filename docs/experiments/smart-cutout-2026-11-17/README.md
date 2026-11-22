# 智能抠图：选型与验证（2026-11-17）

对应会话记录：[2026-11-17_1359-smart-cutout.md](../../sessions/2026-11-17_1359-smart-cutout.md)。

用户要求「加一个智能抠图的功能，选用最佳方案」。约束：前端零依赖、无构建、file:// 可用；服务端只用 Python 标准库；云端版 CSP 只允许本站资源。

## 方案比较

| 方案 | 结论 |
|---|---|
| 服务端推理（Python + onnxruntime / rembg） | 需要 pip 依赖与 CPU 资源，违背「服务端只用标准库」，本机版也用不了。否决。 |
| 第三方抠图 API | 图片要上传第三方、需要密钥和费用，本机版离线不可用。否决。 |
| 传统算法（色差 / GrabCut / 魔棒） | 无需模型，但对复杂背景效果差，不算「智能」。否决。 |
| **浏览器内推理（ONNX Runtime Web + 分割模型）** | 本机版与云端版共用，图片不离开电脑，首次下载后离线可用。**采用。** |

## 模型实测

在无头 Chromium 中用 ONNX Runtime Web 1.31.1 跑 8 张不同题材的照片（人像 ×2、长发、猫、鞋、狗、自行车、盆栽组合、汽车），WebAssembly 单线程，本环境 4 核、无 GPU：

| 模型 | 体积 | 许可 | 单张耗时 | 质量 |
|---|---|---|---|---|
| U²-Netp（320） | 4.6 MB | Apache-2.0 | ~1.4 s | 边缘糊；盆栽漏掉一半、混进抱枕，车轮内部没抠空。不够用。 |
| ISNet general（1024，fp32 / fp16） | 176 / 88 MB | onnx-community 版标 AGPL-3.0（另有 Apache / MIT 转存） | ~10 s | 整体可用；白色鞋面变成半透明，猫身下的毯子半抠半留，盆栽玻璃缸残留背景。 |
| RMBG-1.4（1024，fp16） | 88 MB | BRIA 非商用许可 | ~10.5 s | 质量好，但许可证不允许商用，与本仓库 MIT 不兼容。否决。 |
| **BiRefNet_lite 512（fp16）** | **98 MB** | **MIT** | **~9 s** | **8 张里最稳**：鞋面完整不透明、自行车辐条和车轮内部抠空、盆栽与玻璃缸干净、车底阴影去掉；发丝略软。 |
| BiRefNet_lite 1024（onnx-community） | 115–224 MB | MIT | — | WASM 下 `std::bad_alloc`；WebGPU 下 Split 节点超出存储缓冲区上限。浏览器里跑不起来。 |

另外：WebGPU（SwiftShader 软件模拟）上 BiRefNet_lite 512 fp32 的输出与 WASM 逐像素平均差 0.016 / 255，说明两个后端结果一致；fp16 模型在不支持 `shader-f16` 的适配器上无法用 WebGPU，所以引擎只在有 `shader-f16` 时启用显卡，否则用 WASM。实体显卡上的速度本环境无法测。

蒙版放大：试过用导向滤波（guided filter）把 512 蒙版贴合到原图边缘，在发丝和白鞋边上反而出现光晕，改为高质量缩放 + 按放大倍数收紧过渡带，4000 px 照片合成约 0.25 s。

## 最终方案

- 模型 `studioludens/birefnet-lite-512` 提交 `962e679…` 的 `onnx/model_fp16.onnx`；运行库 `onnxruntime-web@1.31.1` 的 `ort.webgpu.min.js` + asyncify wasm。版本、大小、SHA-256、多个下载地址都写在 [`js/cutout-manifest.js`](../../../js/cutout-manifest.js)。
- 本机版从公共 CDN 下载（首次使用前征得同意），云端版由服务器镜像到数据卷后同源提供（CSP 不变宽，只加 `'wasm-unsafe-eval'`；加 COOP / COEP 启用多线程）。
- 推理在 Worker 中进行，不卡界面；引擎空闲 3 分钟释放内存。

## 浏览器端到端测试

| 脚本 | 内容 |
|---|---|
| [t13-smart-cutout.cjs](t13-smart-cutout.cjs) | 本机版（file://）：首次使用提示 → 下载 + 校验 + 缓存 → 预览透明背景 → 边缘收缩 / 扩展 / 羽化 / 对比原图 / 预览背景 → 应用（裁边、主体不移位、照片存 WebP）→ 撤销 / 重做 / 恢复原图（含旋转 + 翻转 + 缩放后的图层）→ 第二次不再下载 → 保留原图层 → 保存重开后原图仍在 → `.chaos` 打包原图 → 强制处理器 / 恢复显卡切换 → 非图片图层不可用 → 无控制台错误或警告 |
| [t14-cloud-cutout.cjs](t14-cloud-cutout.cjs) | 云端版：注册 → 导入图片 → 组件来自本站 `/vendor/cutout/` → 在严格 CSP 下抠图 → 跨源隔离生效 → 结果自动保存到账号 → 整个过程没有请求离开本站 → 刷新后抠图与原图都能从云端载入 → 无控制台错误 |

```bash
# 依赖 playwright（本环境已预装）；照片用任意 JPG
node docs/experiments/smart-cutout-2026-11-17/t13-smart-cutout.cjs photo.jpg /tmp/cc-t13-profile /tmp/cc-t13-shots

rm -rf /tmp/cc-cut && CC_DATA=/tmp/cc-cut CC_PORT=8090 python3 server/chaos_server.py &   # 启动后后台下载组件
python3 server/chaos_server.py admin cutout   # （同一 CC_DATA）可等待下载完成
node docs/experiments/smart-cutout-2026-11-17/t14-cloud-cutout.cjs photo.jpg http://127.0.0.1:8090/ /tmp/cc-t14-shots
```

结果（2026-11-17 / 11-22）：

- t13：冷缓存 27 项、热缓存 25 项全部通过（冷缓存首次含下载约 25–32 s，推理 10–12 s；之后每张 9–12 s）。
- t14：本地 Python 服务 8/8，Docker 镜像（数据卷预置组件）8/8；跨源隔离后推理 6–7 s（多线程）。
- 服务端：组件后台下载并逐个校验；服务器后台下载与 `admin cutout` 同时运行时，最初共用一个临时文件导致一方报错（靠换镜像重试才成功），已改为各自的临时文件 + 下载前后检查，复测两者并发无报错、无残留、哈希正确；未下载完时 `/vendor/cutout/` 返回 503 与进度提示；无外网的容器给出「未能下载，运行 admin cutout」提示且不影响其他功能；清单外文件名、路径穿越均 404；`If-None-Match` 返回 304。
- 旧回归：云端 t12 19/19；本机 t11 10/11、t1 / t2 / t6 无错误、t5 功能正常——t11 与 t5 唯一的报错是 file:// 下 Chrome 拦截 `manifest.webmanifest`（本次未改动，属于新版 Chrome 对 file:// 的既有行为）。

测试照片来自 Pexels，截图里含这些照片，所以只留在测试机上，不提交进仓库。
