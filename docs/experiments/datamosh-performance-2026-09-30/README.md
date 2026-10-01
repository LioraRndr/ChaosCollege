# Datamosh 小范围性能优化验证

时间：2026-09-30。当前项目没有新增运行依赖，以下脚本只用于离线本机验证。

## 证据

- [benchmark-results.json](benchmark-results.json)：最终生产函数的 19 组完整 RGBA 字节对照、缓存限额检查与 9 次交替基准原始耗时。全部像素一致。
- [benchmark-proof.png](benchmark-proof.png)：真实 Chromium 对照页面截图。
- [editor-proof.png](editor-proof.png)：最终编辑器单图预设截图。
- [editor-verification.json](editor-verification.json)：实际编辑流程检查结果与导出验证边界。
- [export-ui-proof.png](export-ui-proof.png)：两图片图层与另图来源下的 2× 导出成功提示；未取得下载文件核对尺寸/内容。
- [app-before-optimization.js](app-before-optimization.js)：用户已认可视觉的优化前版本。
- [initial-probe.json](initial-probe.json)：首次外提/复用的探索数据，性能波动较大，不作为最终提速证据。

## 重跑

1. 在项目根目录运行 `node docs/experiments/datamosh-performance-2026-09-30/make-bench.cjs`。生成器严格 UTF-8 读取备份与当前 app.js，提取生产函数并记录 SHA-256，生成 bench.js/bench.html。
2. 项目根目录运行 `python -m http.server 8089 --bind 127.0.0.1`。
3. 浏览器打开 `http://127.0.0.1:8089/docs/experiments/datamosh-performance-2026-09-30/bench.html`，点击 Run pixel checks and benchmark，等待 PASS/FAIL。
4. 重跑会更新页面结果，已有 benchmark-results.json 不会自动覆盖。

计时包含效果函数与最终 getImageData，以强制完成延迟 Canvas 绘制；每组预热 2 次，前后交替测量 9 次，取中位数。测试使用浏览器解码的 assets/ref-garden.jpg/ref-ui.jpg；透明用例由真实图片与透明背景构造。缓存管理检查使用尺寸对象验证实际生产缓存辅助函数的字节计数与淘汰，完整应用另做交互 smoke test。

最终两组中位数：900×1125 预设 116.8 → 104.3 ms，约下降 10.7%；480×360 小块高累积 231.8 → 201.8 ms，约下降 12.9%。结果仅适用于这次机器与浏览器的两组任务，不是整个编辑器的提速保证。页面展示的 RGBA 缓冲字节是存储预算/估算，未测量进程总内存。

当前生产 app.js SHA-256：d01b56d439f84b744798cd78b7f06f6885723aed20532ccf4051b729f8f2d931。
