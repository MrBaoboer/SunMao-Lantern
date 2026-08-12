# 参与进来

这是一个能跑的演示课程，不是框架。改动越小越容易并进来。

**最有用的贡献**：修 bug、改错别字与拗口的文案、补无障碍、补浏览器兼容、报告某台设备上跑不动。

**基本不会并的**：引入运行时依赖（`three` 之外）、换框架或加构建层、加新的互动模块与新的一幕。
这些不是坏主意，只是会改变项目的形状，动手之前先开个 Issue 聊。

---

## 先跑起来

命令清单与环境要求见 [README](README.md#跑起来)，模块边界见 [ARCHITECTURE.md](docs/ARCHITECTURE.md)，
跑不起来先翻 [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)。

## 提交之前

```bash
npm run check:code
```

动过三维、主线步骤或界面布局，再跑一次冒烟。它跑的是构建产物，所以要排在 `check:code` 之后，
浏览器内核也得先按 README 装一次：

```bash
npm run smoke
```

CI 上每个 PR 只跑 `check:code`，冒烟要合并进 `main` 之后才跑（[为什么](docs/ARCHITECTURE.md#检查)），
所以本地这一遍值得。

---

## 几条约定

- **尺寸必须是整数毫米。** 基本模数 a = 12 mm，最小刻度 1 mm，`core/modulus.js` 的 `a()` 带栅格断言。
- **加一步、加一个模块**照 [ARCHITECTURE.md](docs/ARCHITECTURE.md) 里那两张清单走，别漏了 `cam.fit`。
- **改样式先改令牌**，组件不直接写颜色和字号；文案按 [UI.md](UI.md) 的规矩写。
- **旁白只有一处出处**：主线在步骤的 `narration` 字段，模块在 `src/modules/vo.js`。
- **两份生成物别手改** —— `旁白解说稿.md` 出自 `npm run script`，README 的五张图出自 `npm run shots`。
- **几何对不上以断言为准。** `src/core/verify.js` 是唯一会自己报错的规格，它和文档打架时改文档。

---

## 提交与 PR

提交信息和 PR 标题用中文，一句话说清做了什么，不用前缀：

```
修掉浅色模式画面正中那枚白色光斑
```

PR 描述照模板里那三栏填：改了什么、为什么、怎么验证的。改动涉及画面的话，附一张截图最省事。

发现安全问题不要开 Issue，走 [SECURITY.md](SECURITY.md)。参与讨论请遵守[行为准则](CODE_OF_CONDUCT.md)。

---

## 关于授权

这个项目是双轨授权：代码 AGPL-3.0，内容与素材 CC BY-NC-SA 4.0，另有单独的商业授权（见 [COMMERCIAL.md](COMMERCIAL.md)）。

**提交 PR 即表示**：你的贡献以同样的双轨条件发布，并且你同意版权人可以把它包含在另行商业授权的版本里。
这是商业授权能成立的前提 —— 只要有一段贡献没有这个许可，整份授权就给不出去。

你保留自己贡献的著作权，也可以在别处继续使用它。只提交你有权提交的东西。
