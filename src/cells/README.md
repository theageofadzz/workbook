# Cicada Cells

源码为 `main.js`、`layout.js`、`demo.js` 和 `template.html`。网站构建时通过 `tools/cells.mjs` 生成自包含的 `index.html`，再复制到 `docs/assets/cells/index.html`。可在浏览器中独立打开。

- 默认 9 个细胞，支持在 1–20 个之间调整。
- 支持拖动旋转、滚轮缩放、点击反馈、暂停、重置视角及全屏。
- 声音由 Web Audio 本地合成，点击声音按钮后启用。
- 署名链接指向 `https://github.com/theageofadzz`。
- `#demo` 从九个细胞开始自动循环增减，手动操作后停止演示；`#cover` 使用相同循环并隐藏界面。
- 文章内的场景离开视野后停止渲染；尊重系统的减少动态效果偏好。
- 用 `node --test src/cells/*.test.js` 验证布局、弹簧反向过渡与演示循环。

视觉参考：Sam Hox / Second Eight，[*Tessel in 3D. Cells, motion and sound.*](https://x.com/secondeight_/status/2120519348804542930)。网页为独立实现的视觉练习，不代表真实生物数据。Three.js 与 Lucide 的许可注释保留在内联脚本中。
