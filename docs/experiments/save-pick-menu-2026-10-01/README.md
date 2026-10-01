# 保存可靠性、下层图层点选、子菜单高亮验证（2026-10-01）

对应会话记录：[2026-10-01_2347-save-layer-pick-menu.md](../../sessions/2026-10-01_2347-save-layer-pick-menu.md)。

## 文件

| 文件 | 内容 |
|---|---|
| [t11-save-pick-menu.mjs](t11-save-pick-menu.mjs) | 浏览器回归：工程库位置提示、面板选中下层图层后在画布拖动、右键「选择图层」、子菜单扫过后只高亮一行、改动后立刻关窗口再重启仍保留、缩略图不丢 |
| [menu-submenu-highlight.png](menu-submenu-highlight.png) | 修复后：鼠标扫过「画布预设」全部分类，只剩当前一行高亮；「经典」预设不再重复尺寸 |

## 重跑

```bash
rm -rf /tmp/cc-tools/profile-t11   # 每次需要全新的浏览器配置目录
cd /tmp/cc-tools && npm i playwright-core
CC_INDEX=file:///<仓库根目录>/index.html CC_CHROME=<chrome 或 chromium 路径> node <仓库根目录>/docs/experiments/save-pick-menu-2026-10-01/t11-save-pick-menu.mjs
```

## 2026-10-01 结果

在 Chromium（Playwright 1.56 自带）上 11/11 PASS，无控制台错误。旧回归 t1、t2、t5、t6（[editor-upgrade-2026-10-01](../editor-upgrade-2026-10-01/README.md)）同样通过。
