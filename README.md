# theageofadzz

作品集 / 我的设计工程师职业生涯

**在线预览：<https://theageofadzz.github.io/workbook/>**

按照 [设计垂点](https://wxad.design/abc/) 的公开页面复刻和适配的个人网站版本。
保留原站的纸张颗粒背景、响应式排版、圆形动态封面、文章目录、悬浮导航、
交互实验、作品瀑布流及 React / Next.js 动画运行时。

## 页面

- 文章首页及全部公开文章内页。
- Crafts / CSS Generatives 作品墙，共 59 个原站示例项目。
- theageofadzz 关于页、404 页面。
- 手机与桌面布局、文章锚点目录、页面间跳转。

## 本地预览

```sh
npm ci
npm run dev
```

打开 <http://127.0.0.1:4173/workbook/>。可以用 `PORT=4174 npm run dev` 指定其他端口。
预览服务按照线上相同的 `/workbook` 子路径提供页面。

## 结构与维护

| 位置 | 用途 |
| --- | --- |
| `docs/` | 可直接发布的完整静态站点，包括文章、运行时代码、字体与图片 |
| `site.config.json` | 站点名称、简介、部署路径、GitHub 地址 |
| `src/workbook.css` | 品牌标识、导航提示、关于页样式 |
| `src/workbook.js` | 品牌适配、GitHub 与关于页导航、无障碍标签 |
| `tools/serve.mjs` | 无需额外服务器依赖的本地预览 |
| `tools/check.mjs` | 页面覆盖与本地链接、资源完整性检查 |
| `tools/sync.mjs` | 获取公开参考页面及依赖，生成本地快照 |
| `tools/build.mjs` | 重写部署路径、生成路由数据与发布目录 |
| `tools/optimize.mjs` | 将适合压缩的 GIF 转为动画 WebP，检查尺寸及播放时长 |

修改 `src/` 后运行 `npm run build`，再运行 `npm run check`。
仓库已经包含发布产物，普通构建和部署不需要访问参考网站。
运行 `npm run sync` 可获取并重建参考站快照；加 `-- --refresh` 可以忽略本地缓存。
快照构建会自动优化动图；首次迁移时节省约 223 MiB，同时保留帧尺寸及播放时长。

这是对原站公开静态产物的适配，包含运行所需的已编译代码，不是原站的未公开开发源码。
主要字体与图片已经本地化；视频和第三方 iframe 示例继续通过各自原有地址播放，
因此这些内容的可用性仍取决于原服务。

## GitHub Pages

在仓库 **Settings → Pages** 中设置：

- Source: **Deploy from a branch**
- Branch: **main**
- Folder: **/docs**

`docs/.nojekyll` 确保 `_next` 目录正常发布。提交并推送到 `main` 后，
GitHub 会自动更新在线站点，无需服务器、密钥或额外的 CI 工作流。

```sh
npm run check
git add .
git commit -m "Update theageofadzz branding"
git push origin main
```

## 来源与署名

视觉、原示例文章和作品来自 [设计垂点 / Aragakey.](https://wxad.design/abc/)。
本版本保留示例作者署名，不将原作者的经历和作品冒充为站点所有者的原创。
文章、字体、图片、视频和其他第三方内容的权利属于各自权利人。
正式替换为个人作品时，请一并更新作品标题、经历、正文、图片和外部链接。
