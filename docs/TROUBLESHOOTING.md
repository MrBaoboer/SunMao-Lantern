# 故障排查

按「你看到了什么」找，每一条都给到下一步该做什么。

---

## 页面打不开

### 封面停在「这盏灯没能点亮」

三维初始化失败了。九成是 WebGL 不可用：

1. 打开 <https://get.webgl.org/webgl2/>，看这台机器支不支持 WebGL 2；
2. 不支持的话，换 Chrome / Edge 111+、Safari 16.4+ 或 Firefox 113+；
3. 支持却仍然失败，打开控制台看第一条红色报错 —— 真正的原因在那里，封面上只是它的结果。

远程桌面、虚拟机和部分 Linux 发行版默认禁用硬件加速，也会落到这一条。
Chrome 可以用 `--enable-unsafe-swiftshader` 强制走软件渲染，慢但能跑。

### 封面一直停在「正在……」，进度条不走

某一段初始化卡住了。控制台通常会有一条未捕获异常，
`main()` 的 `catch` 只在同步链路上生效，异步里抛出的会直接落到控制台。

先确认 `npm install` 是完整的：`node_modules/three` 存在，且版本是 0.170.x。

### 一片黑 / 一片空白，控制台却没有报错

多半是 canvas 尺寸为 0。检查是不是把页面嵌进了一个高度未定的容器 ——
`#stage` 是 `position: fixed; inset: 0`，需要视口有真实高度。

---

## 画面不对

### 灯笼被裁掉一截

每一步的机位都要声明 `cam.fit`，缺了它窄画幅上一定裁边。
在控制台里看当前这一步：

```js
__ctx.stage._lastFrame     // 这一步实际用的机位声明
__ctx.stage.safe           // 界面占掉的上下边（像素）
```

`fit` 为 `undefined` 就是漏了。取值见 `src/steps/util.js` 的 `FIT_LANTERN` / `FIT_FRAME` / `FIT_RING` / `FIT_BENCH`，
或直接写 `{ r: 水平半径, h: 垂直半高 }`（毫米，相对镜头目标点）。

### 底部的字和控件叠在一起

坞的高度没被量到。界面层每次开关覆盖层都会重算并写入 `--dock-h`：

```js
getComputedStyle(document.documentElement).getPropertyValue('--dock-h')
```

是 `0px` 而底部确实有一排控件，说明那段 HTML 的根节点没有 `.dock` 类 ——
`hud.dock()` 生成的结构不要在 `onMount` 里替换掉。

### 木头是奶白色的，看不出木纹

光加多了。`src/render/stage.js` 的 `MOODS` 里，环境 + 主光 + 补光 + 环境光的总和越过约 2.6 之后，
ACES 会把高光推平。想让画面更亮，优先调 `bg`（背景那一对颜色），不要整体上调光。

### 刀具看着是反的 / 歪的

三把刀都按同一个约定建模：**刃口朝 -Z，柄在 +Z，刀身沿 +X**。
`Machining._orientTool()` 据此搭正交基摆位 —— 不要改回 `lookAt()`，
它转的是物体的 **+Z**，会把锯齿转到朝天；而且默认 up 是 +Z，
「朝下看」正好是它的退化情形，滚转角由内部容错分支随手定。

`npm run smoke` 每一步都验一次刃口与攻角的点积，反了会直接报 `dot=-1.000`。

### 教学件的凹槽看起来是凸的

说明那处又用实心块拼了。凹进去的地方必须是**真的没有料** ——
用 `demoSolid({ blank, cuts })` 让 CSG 挖出来，内壁才会照常受光。
贴一块深色面片假装凹槽，得到的一定是相反的读数。

### 深色模式下某几步仍然是暗的

这是设计如此。傍晚与夜里的场景不跟主题走 —— 那几步界面会临时借用深色（`hud.setTone()`），
用户在菜单里的选择不受影响，切回浅色场景时会自己恢复。

### 帧率低 / 风扇狂转

`src/render/fx.js` 的 `detectTier()` 按内存与核心数分档，低端机会关掉辉光与阴影。
想手动确认：

```js
__ctx.tier                                  // 'low' | 'mid' | 'high'
__ctx.stage.bloomEnabled = false            // 关掉后期
__ctx.stage.renderer.shadowMap.enabled = false
```

分档只在首次加载时判定，改完刷新页面即恢复。

---

## 没有声音

音效是实时合成的，不需要任何文件。听不到先看三处：

1. 右上角菜单里「声音」是否开着；
2. 浏览器要求一次真实手势才允许出声 —— 必须点过封面上的按钮，直接调 `__engine.go()` 不算；
3. 系统或标签页是否静音。

**旁白朗读**这一项只在真的有配音文件时才出现在菜单里。仓库不含音频，
放进 `public/audio/vo/` 并在同目录 `manifest.json` 里登记之后它才会出现。字幕不受影响，一直都在。

---

## 测试与构建

### `npm run smoke` 报缺少 playwright

浏览器内核要单独装一次：

```bash
npm install
npx playwright install chromium
```

### `npm run smoke` 报「没有 dist/」

它跑的是构建产物，不是开发服务器。先 `npm run build`。
想对着已经起好的地址跑：

```bash
npm run smoke -- --url http://localhost:5173
```

### `npm run smoke` 挂在某一步

加 `--shots` 再跑一遍，`.shots/smoke/` 里会有每一步的截图，一眼能看出是哪一步、错在画面还是控制台。

```bash
npm run smoke -- --shots
```

**开发服务器不要边跑边改。** Vite 的模块热替换会在中途重载页面，
测试随即报「Execution context was destroyed」—— 那是热替换，不是产品缺陷。

### `npm run verify` 有断言失败

输出里会写清哪一条、期望什么、实际什么。几何是整数毫米的，失败一定是真的对不上，
不是精度问题。以 `src/core/verify.js` 的断言为准 —— 它是整个项目里唯一会自己报错的规格。

### `npm audit` 有告警

当前 vite 5 依赖的 esbuild 有一条中危告警，只影响**开发服务器**，不影响构建产物。
升到 vite 6+ 可以消除，但需要重新验证构建与冒烟测试。

---

## 部署之后

### 页面白屏，控制台报资源 404

资源路径不对。`vite.config.js` 里 `base: './'`，产物用的是相对路径，
放在任何子路径下都能跑 —— 如果被改成了绝对路径，子路径部署就会 404。

### 部署上去是旧版本

Vercel 按提交部署。本地改完要先推上去：

```bash
npm run build
npx vercel deploy --prod
```

产物是纯静态的，没有服务端，也没有需要配置的环境变量。
