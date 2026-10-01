# Y3K 风格调研与落地（2026-10-01）

用户在本轮请求中提出「研究 y3k 效果」。本文记录调研结论、参考来源，以及它们在编辑器里对应的功能，方便后续继续调参或扩展。

## 风格定义

Y3K 是 Y2K 复古未来主义之后的「下一步」：Y2K 回看 2000 年前后的数码乐观主义，Y3K 则想象「公元 3000 年」，更精密、更冷、更像高端渲染。几个参考来源的共识如下：

- **材质**：液态金属 / 镀铬、虹彩与全息表面、高光泽面，常见「外骨骼」式雕塑轮廓。
- **色彩**：深色或中性底，配虹彩渐变、柔和辉光、霓虹点缀（电光蓝、荧光绿、紫、粉）；整体色板比 Y2K 克制，靠材质出彩。
- **光与透明**：柔光、光晕、玻璃 / 半透明、磨砂模糊，以及模拟光线掠过表面的柔和高光。
- **文字**：液态铬字、实验性展示字体、未来感书法与符号（cybersigilism 赛博图腾），常与模糊、速度感叠加。
- **细节与构图**：多层叠加、有意的混乱，搭配精密的科技 HUD 细节（刻度、坐标、数据读数）；故障纹理作为点缀而不是主体。
- **文化来源**：K-pop 视觉（数字叠层、粉紫辉光、CGI 化）、赛博图腾、Y2K 怀旧的升级版。

## 落地对照

| Y3K 特征 | 编辑器里的实现 |
|---|---|
| 液态金属 / 镀铬 | 效果「液态镀铬」（形状浮雕 + 环境映射，7 种金属）；生成器「液态金属」（metaball）；文字填充「镀铬金属」；素材抽屉 Y3K 分类的「液态铬星芒 / 爱心 / 铬金属图腾」 |
| 虹彩 / 全息 | 效果「全息彩虹膜」、渐变映射「全息」配色；填充模式「彩虹全息」 |
| 玻璃 / 半透明 | 效果「玻璃折射」（棱纹玻璃 / 涟漪玻璃 / 透镜，带色散、磨砂、高光）；图层样式「毛玻璃」（实时模糊下方内容）；生成器「毛玻璃卡片」 |
| 柔光 / 光晕 | 效果「氛围光晕」（内容背后的渐变柔光）、「辉光 Bloom」；图层样式「外发光」；生成器「体积光束」「镜头星芒」 |
| 颗粒渐变 | 生成器「颗粒渐变」；效果「胶片颗粒」 |
| 赛博图腾 | 生成器「赛博图腾」（种子驱动的对称棘刺），可叠加镀铬 |
| 科技细节 | 生成器「科技 HUD」（准星 / 角标取景框 / 仪表盘 / 遥测数据） |
| 速度感 / 模糊字 | 效果「运动 / 缩放模糊」+「RGB 分离」 |
| 一键组合 | 「一键风格 → Y3K」：液态铬、全息玻璃、冰蓝金属、虹彩光晕、棱纹玻璃、速度模糊、颗粒梦境；文字预设「Y3K 液态铬」「Y3K 光晕」 |

示例成片见 [poster-y3k.jpg](../experiments/editor-upgrade-2026-10-01/poster-y3k.jpg)：颗粒渐变底、液态金属、毛玻璃卡片、液态铬标题、HUD、铬金属图腾和棱纹玻璃图片。

## 已知局限与可继续的方向

- 所有材质都是 2D 近似：镀铬与液态金属用高度场 + 环境映射模拟，不是真实 3D 光线追踪；形状越圆润（「圆润度」越大）越像金属。
- 毛玻璃是逐帧把下方已绘制内容模糊后裁进图层形状，放在剪切蒙版组里时只能看到组内内容。
- 后续可考虑：真实 3D 文字挤出与倒角、HDR 风格的环境贴图导入、带法线的玻璃厚度、动画（本项目当前只做静态）。

## 参考来源

- [The Y3K aesthetic: how Y2K nostalgia, K-pop, and cybersigilism shape the future of design — Envato](https://elements.envato.com/learn/y3k-aesthetic-k-pop-cybersigilism)
- [What Is Y3K Beauty? Futuristic Makeup Trend Explained — Perfect Corp](https://www.perfectcorp.com/consumer/blog/photo-editing/y3k-fashion)
- [Bringing the Y3K Aesthetic from the Runway to Your Home — Decorilla](https://www.decorilla.com/online-decorating/y3k-aesthetic)
- [Chromecore — Aesthetics Wiki](https://aesthetics.fandom.com/wiki/Chromecore)
- [Y2K Futurism — Aesthetics Wiki](https://aesthetics.fandom.com/wiki/Y2K_Futurism)
- [8 Holographic Design Elements for Y2K Branding — Studio 2AM](https://studio2am.co/blogs/news/8-holographic-design-elements-for-y2k-coded-branding-systems)
- [7 Retro-Futuristic Text Effects for Y2K-Inspired Album Art — Studio 2AM](https://studio2am.co/blogs/news/7-retro-futuristic-text-effects-for-y2k-inspired-album-art)
- [Y2K Liquid Metal Text Effect — FontVibe](https://fontvibe.ai/styles/y2k-liquid)
