# 贡献指南

感谢你愿意改进 CHAOS.COLLAGE！

## 提 Issue

- **Bug**：写清楚浏览器和版本、本机版还是云端版、复现步骤、期望结果和实际结果，能附截图或 `.chaos` 工程文件最好。
- **新功能**：先说想做出什么样的画面或解决什么问题，再说具体做法。

## 本地开发

项目没有构建步骤，也没有依赖：

```bash
# 本机版：直接用 Chrome / Edge 打开 index.html

# 云端版：启动服务后访问 http://127.0.0.1:8080
python3 server/chaos_server.py
```

提交前请至少做这些检查：

```bash
for f in js/*.js app.js; do node --check "$f"; done
python3 -m py_compile server/chaos_server.py
```

浏览器回归测试脚本在 `docs/experiments/` 下各次记录的目录里（使用 playwright-core，依赖不放进仓库）。

## 代码约定

- 保持零依赖、零构建，脚本以经典 `<script>` 方式加载（`file://` 下也要能用），不要改成 ES module 或引入框架。
- 编辑器模块挂在 `window.CC` 上，编辑器状态集中在 `CC.App`；跟随周围代码的命名和注释风格。
- 所有文本文件使用 UTF-8（无 BOM）、LF 换行。
- 服务端只用 Python 标准库。

## Pull Request

- 一个 PR 只做一件事，描述里写清楚改了什么、怎么验证的。
- 涉及界面的改动请附前后截图。
