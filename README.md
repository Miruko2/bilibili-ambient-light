# B站氛围光 · Ambient Light for Bilibili

在 B 站看视频时，把画面的色彩实时延伸到整个网页背景，营造沉浸式的氛围光效果。

![开启与关闭氛围光的对比](store/screenshots/1-compare.png)

## 功能

- **氛围光**：逐帧读取视频画面，把边缘色彩柔和地扩散到页面背景，并自然渐隐。
- **自动识别黑边**：视频自带的黑边会被跳过，光从画面真正的边缘出发。
- **通透页面**：页面切换为半透明深色主题，并加上文字阴影，内容依旧清晰。
- **跟随播放模式**：宽屏模式同样生效；网页全屏、全屏和小窗播放时自动隐藏。
- **排除主页**：在设置的「页面」分组中开启后，仅排除 B 站主页，视频、番剧及其他页面保留原有行为；默认关闭。页面切换后会自动更新。
- **可调参数**：光晕范围、模糊、亮度、饱和度、对比度、渐隐起点与曲线、帧率上限等，调整实时生效。
- **三个预设**：柔和、沉浸、满屏（默认）。

## 安装

**Chrome 应用商店**（推荐）：[B站氛围光 · Ambient Light for Bilibili](https://chromewebstore.google.com/detail/jeooggamefikdijnbfbabphhffbmmjkn)

Edge 用户也可以从上面的链接安装：页面上方出现提示时，选择「允许来自其他应用商店的扩展」即可。

**手动安装**（开发版，用于调试代码）：

1. 下载或克隆本仓库。
2. 打开 `chrome://extensions`，开启右上角的「开发者模式」。
3. 点「加载已解压的扩展程序」，选择仓库根目录。
4. 打开任意 B 站视频页即可看到效果。点击工具栏上的扩展图标可以调整参数。

## 隐私

所有处理都在浏览器本地完成，不收集、不上传、不分享任何数据，只在本地保存你的设置。详见 [隐私政策](PRIVACY.md)。

## 工作原理

1. 把当前视频帧缩小画到一块小画布上。
2. 以视频为中心，把这一帧按越来越大的尺寸叠画多次，让边缘颜色一圈圈向外延伸。
3. 用渐变遮罩让光向页面边缘渐隐，再做模糊和调色，画到固定在页面最底层的画布上。
4. 用 `requestVideoFrameCallback` 跟随视频帧重绘，暂停或页面不可见时停止绘制。

整个渲染只用低分辨率画布，实测每帧主线程开销约 1–2 ms。

这个思路参考了 [Ambient light for YouTube](https://github.com/WesselKroos/youtube-ambilight)（MIT 协议），代码为针对 B 站独立重写。

## 目录结构

| 路径 | 内容 |
| --- | --- |
| `manifest.json` | 扩展清单（Manifest V3） |
| `src/settings.js` | 设置项定义、校验与存储 |
| `src/ambient.js` | 氛围光渲染器 |
| `src/content.js` | B 站页面集成：查找播放器、切换页面状态 |
| `src/content.css` | 透明页面、深色配色与文字阴影 |
| `popup/` | 工具栏弹窗（设置面板） |
| `icons/`、`assets/` | 图标、去色带噪点贴图和弹窗里的收款码 |
| `tools/generate-assets.mjs` | 生成图标、噪点贴图和商店图标 |
| `tools/pack.ps1` | 打包上架用的 zip 到 `dist/` |
| `store/` | 商店截图、宣传图和上架清单 |
| `docs/` | 项目主页，由 GitHub Pages 发布到 https://miruko2.github.io/bilibili-ambient-light/ |
| `promo/` | 用 Remotion 制作宣传视频和商店截图的工程 |
| `.github/` | 仓库页赞助（Sponsor）按钮的配置和收款码原图 |

## 开发

```powershell
node --test tests/exclude-home.test.cjs  # 验证主页排除、默认值和页面切换
node tools/generate-assets.mjs   # 重新生成图标和贴图
pwsh tools/pack.ps1              # 打包 dist/bilibili-ambient-light-<version>.zip
```

宣传视频和商店截图（`promo/`）需要 Node.js，录制步骤依赖本机的 Kimi WebBridge 浏览器扩展：

```powershell
cd promo
npm install
npm run record         # 逐帧录制 B 站页面
npm run record:popup   # 截取设置弹窗
npm run encode         # 合成片段
npm run music          # 配乐：从仓库根目录的音频文件第 33 秒起截取，并分析节拍（剪辑点对齐节拍）
npm run store:page     # 截取 Chrome 应用商店的搜索页和详情页（宣传片里的下载演示，用无头 Chrome，不登录）
npm run render         # 输出 promo/out/bilibili-ambient-promo.mp4
npm run store:shots    # 截取商店截图
npm run store:stills   # 合成对比图和宣传图块
```

录制的视频素材和配乐受版权保护，所以没有放进仓库。

## 支持作者

B站氛围光的全部功能都免费。如果它让你看视频更舒服，欢迎请作者喝杯咖啡，金额随意。扩展弹窗底部的「☕ 请作者喝杯咖啡」里也有这两个码。

<p align="center">
  <img src=".github/donate/wechat.jpg" alt="微信收款码" width="309">
  &nbsp;&nbsp;
  <img src=".github/donate/alipay.jpg" alt="支付宝收款码" width="280">
</p>

也欢迎去 [Chrome 应用商店](https://chromewebstore.google.com/detail/jeooggamefikdijnbfbabphhffbmmjkn/reviews) 留个评分，或者给仓库点个 Star。

## 声明

本扩展为个人开发的非官方工具，与哔哩哔哩（bilibili）没有任何关联。

## 许可证

[MIT](LICENSE)
