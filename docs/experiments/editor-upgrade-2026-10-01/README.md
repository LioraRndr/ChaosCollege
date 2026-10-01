# 编辑器产品化升级验证（2026-10-01）

本目录保存 2026-10-01 产品化升级的浏览器验证脚本与关键截图。对应的会话记录见 [2026-10-01_1433-product-editor-upgrade.md](../../sessions/2026-10-01_1433-product-editor-upgrade.md)。

## 截图

| 文件 | 内容 |
|---|---|
| [poster-features.jpg](poster-features.jpg) | 综合功能海报：镀铬文字 + 网格变形、透视窗口、贴纸白边 + 投影、外发光、蒸汽波地形、走马灯、复印机条形码（1× 导出） |
| [poster-y3k.jpg](poster-y3k.jpg) | Y3K 海报：颗粒渐变、液态金属、毛玻璃卡片、液态铬标题、HUD、铬金属图腾、棱纹玻璃 |
| [sheet-effects-image.jpg](sheet-effects-image.jpg) / [sheet-effects-text.jpg](sheet-effects-text.jpg) | 全部 40 个效果在图片与透明文字上的默认参数结果 |
| [sheet-generators.jpg](sheet-generators.jpg) | 全部 26 个生成器的默认参数结果 |
| [sheet-stickers.jpg](sheet-stickers.jpg) | 全部矢量贴纸 |
| [ui-home.jpg](ui-home.jpg) 等 `ui-*.jpg` | 工程主页、多级菜单、素材抽屉、网格变形、画布内文字编辑、Y3K 工程界面 |

## 测试脚本（tests/）

脚本用 playwright-core 驱动本机 Chrome，测试依赖不进入项目。重跑方式：

```bash
mkdir -p /tmp/cc-tools/out && cp docs/experiments/editor-upgrade-2026-10-01/tests/* /tmp/cc-tools/
cd /tmp/cc-tools && npm init -y && npm i playwright-core@1.55
# t4 需要基线提交中的旧算法：
git -C <仓库根目录> show 515b299:app.js > /tmp/cc-tools/old-app.js && python3 make-legacy.py
CC_INDEX=file:///<仓库根目录>/index.html node t1.mjs
```

`lib.mjs` 默认使用 `/usr/bin/google-chrome`，截图写入 `/tmp/cc-tools/out/`。

| 脚本 | 覆盖内容 | 2026-10-01 结果 |
|---|---|---|
| t1 | 通过 API 添加 8 类图层、导入图片 | PASS，无控制台错误 |
| t2 | 真实指针：形状绘制、移动、单边拉伸、旋转、文字工具输入、文字拉伸、笔刷、四角扭曲、框选、全部撤销 / 重做 | PASS |
| t3 | 40 个效果 × 图片 / 文字、26 个生成器、55 个贴纸 | 全部无异常；900×675 图片最慢为 JPEG 腐蚀约 150 ms |
| t4 | 区块故障、帧感染与基线提交旧算法逐像素对比（5 组参数 × 2 种子 × 两效果 + 透明图关闭拖尾） | 21/21 完全一致 |
| t5 | 自动保存 → 刷新 → 从主页打开恢复；`.chaos` 导出再导入（作为副本）；PNG 下载 | PASS，下载文件 1080 × 1350 |
| t6 | 新建工程对话框、生成器 / 素材抽屉、添加效果菜单、三级菜单、画布大小（锚点）、字体选择器、导出对话框、右键菜单、快捷键 | PASS |
| t7 | 综合功能海报，1× / 2× 渲染耗时 | 约 0.1 s / 0.4 s |
| t8 | A4（2480×3508）大图 + 帧感染 + CMYK 半调：空闲 / 拖拽缩放 / 拖滑杆帧时间，画布内文字编辑 | 缩放拖拽约 17 ms/帧；拖滑杆平均约 31 ms/帧（加阶段缓存前约 198 ms） |
| t9 | 18 个一键风格 × 图片 / 文字；Y3K 海报 | 全部无异常 |
| t10 | 1280×720、1024×700 窗口布局 | PASS（修正断点后） |

未覆盖：系统剪贴板粘贴图片、File System Access 保存对话框（无头环境改走下载回退）、Windows 实机与桌面快捷方式、`queryLocalFonts` 授权弹窗。
