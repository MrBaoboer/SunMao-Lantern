# 故障排查

按「你看到了什么」找。

---

## 页面打不开

### 封面停在「三维画面没能启动」

三维初始化失败了。九成是 WebGL 不可用：

1. 打开 <https://get.webgl.org/webgl2/>，看这台机器支不支持 WebGL 2；
2. 不支持的话，换一个基线之内的浏览器（版本见 [DEVELOPMENT.md](DEVELOPMENT.md#环境)）；
3. 支持却仍然失败，打开控制台看第一条红色报错 —— 真正的原因在那里，封面上只是它的结果。

远程桌面、虚拟机和部分 Linux 发行版默认禁用硬件加速，也会落到这一条。
Chrome 可以用 `--enable-unsafe-swiftshader` 强制走软件渲染，慢但能跑。

### 封面一直停在「正在……」，进度条不走

某一段初始化卡住了，控制台通常有一条未捕获异常。

`main()` 里 `await` 到的拒绝都会被外面那个 `.catch()` 接住，封面会换成「三维画面没能启动」。
所以停在「正在……」只可能是接不住的那两类：没被 `await` 的浮动 Promise（比如某个 `wait(...).then(...)` 链），
以及主循环 updater 里抛出的错（各有一层 try-catch，只打日志不中断这一帧）。

另外确认 `npm install` 是完整的：`node_modules/three` 存在，且版本是 0.185.x。

### 一片黑 / 一片空白，控制台却没有报错

多半是 canvas 尺寸为 0。
检查是不是把页面嵌进了一个高度未定的容器 —— `#stage` 是 `position: fixed; inset: 0`，
需要视口有真实高度。

---

## 画面不对

### 灯笼被裁掉一截

每一步的机位都要声明 `cam.fit`，缺了它窄画幅上一定裁边。在控制台里看当前这一步：

```js
__ctx.stage._lastFrame     // 这一步实际用的机位声明
__ctx.stage.safe           // 界面占掉的上下边（像素）
```

`fit` 为 `undefined` 就是漏了。取值见 `src/steps/util.js` 的 `FIT_*`，
或直接写 `{ r: 水平半径, h: 垂直半高 }`（毫米，相对镜头目标点）。

`fit` 写了却仍然裁边，量一下这一步真正有多大 —— 拆开、离位陈列、装饰件外移都会让实际
跨度远超「一盏灯」的尺寸：

```js
// 当前可见网格的世界包围盒（水平半径 / 竖向两端）
(() => { let r = 0, lo = Infinity, hi = -Infinity;
  __ctx.stage.scene.traverse((o) => { if (!o.isMesh || !o.visible || !o.geometry) return;
    o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox;
    for (let i = 0; i < 8; i++) { const v = new (window.__ctx.stage.camera.position.constructor)(
      i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z);
      o.localToWorld(v); r = Math.max(r, Math.hypot(v.x, v.y));
      lo = Math.min(lo, v.z); hi = Math.max(hi, v.z); } });
  return { r, lo, hi }; })()
```

还有一种：算出来的距离被**手动缩放的上限**夹住了。`setRecommended()` 会把 `maxDistance`
抬到至少容得下这一步，绕开它直接写 `controls.maxDistance` 就会复发。

```js
__ctx.stage.controls.maxDistance                  // 应 ≥ 相机到目标的距离
__ctx.stage.camera.position.distanceTo(__ctx.stage.controls.target)
```

### 底部的字和控件叠在一起

坞的高度没被量到。界面层每次开关覆盖层都会重算并写入 `--dock-h`：

```js
getComputedStyle(document.documentElement).getPropertyValue('--dock-h')
```

是 `0px` 而底部确实有一排控件，分两种：那段 HTML 的根节点没有 `.dock` 类（`hud.dock()` 生成的结构不要在
`onMount` 里替换掉）；或者有人把 `#syncSafe()` 里写 `--dock-h` 那一句挪到了「安全区没变就早退」之后 ——
坞高与安全区是两件事，坞比底部那一摞矮时安全区根本不变，早退就再也写不到这个变量。

### 自己写脚本截图，机位怎么设都不生效

封面挂着一个每帧改写推荐机位的自转 updater（`main.js` 里的 `drift`）。
把 `#cover` 直接 `hidden` 掉它照样在跑，之后任何 `setRecommended()` 都会被逐帧覆盖 ——
拍出来永远是封面那个机位，每次的方位角还略有不同。

**必须真的按下「开始做灯」**，`enter()` 才会把它摘掉：

```js
await page.click('#cv-go');
await page.evaluate(() => document.querySelector('.overlay .btn-primary')?.click()); // 收掉「怎么操作」
```

`tools/shots.mjs` 就是这么做的，照抄即可。另外开场那一步在远处撒了一圈「灯河」光点精灵，
拍产品图时记得关掉，否则画面边角会留下几点橙色：

```js
scene.traverse((o) => { if (o.isSprite) o.visible = false; });
```

### 木头是奶白色的，看不出木纹

光加多了 —— `src/render/stage.js` 的 `MOODS` 里，四路光的总辐照只留了约三成余量，越过就被 ACES 推平。
想让画面更亮，改 `bg`（背景那一对颜色）与 `bloom`，别整体上调光，见 [DESIGN.md §7](../DESIGN.md#7-画面曝光与背景)。

### 浅色模式下整盏灯像蒙了一层白纱

浅色三档（craft / studio / dusk）的 `bloom` 被改成了非零。键光下的绵纸亮度贴着高通阈值，
走 composer 的档位上纸面会自己越线起辉，辉光糊回棂条与窗花 —— 低配档走直出，所以从来没有这层白。
把 `src/render/stage.js` 里 `MOODS.light` 各档的 `bloom` 改回 0 即可；深色与夜色的溢出留给灯焰，不在此列。

### 浅色模式下画面正中浮着一枚白色圆斑

改过 `stage.js` 的 `MOODS` 里某一档的 `bg[0]`（背景中心色），而且改亮了。

背景是一整块**径向渐变**，而 `UnrealBloomPass` 的高通是 `smoothstep(threshold, threshold + 0.01, luma)` ——
0.01 的过渡宽度等于一刀硬切：背景中心一旦越过阈值，高通就沿等亮度线把渐变裁出一个圆盘，模糊之后就是那枚有边沿的白斑。
深色各档背景亮度只有 0.01–0.02，碰不到；浅色的 `craft`（0.88）与 `studio`（0.92）本来就贴着 0.86 这条线。

`setMood()` 会把阈值取成下限 0.86 与「本档背景最亮处 + 0.02」的高者，所以复发只有一种可能：
绕过 `setMood()` 直接写 `stage.bloom.threshold`。查一下当前这一档：

```js
__ctx.stage.bloom.threshold        // 浅色 studio 下应约 0.94，craft 约 0.90
__ctx.stage.bloom.enabled = false  // 关掉这一道 pass，白斑随之消失即可确认
```

### 刀具看着是反的 / 歪的

`Machining._orientTool()` 搭的正交基取反了，或者有人把它改回了 `lookAt()`。
`npm run smoke` 每一步都验一次刃口与攻角的点积，反了会直接报 `dot=-1.000`。

轴向约定与 `lookAt()` 为什么不能用，见 [DESIGN.md §4](../DESIGN.md#4-教学件与刀具让动作和结果对得上)。

### 走刀时木头不掉料 / 刀没去过的地方也没了

不掉料：这一步的 `mach.begin()` 漏了 `carve`，或者 `carve.tag` 与 `onDone` 里 `addOp()` 的工序对不上。
没有 `carve` 就退回老行为 —— 走完几刀之后整道工序一次性开出来。

刀没去过的地方也没了，分两种。三层判据见 [DESIGN.md §4](../DESIGN.md#料要跟着刀走)：

**同一趟刀里，别处的料也掉了。** 第一层判错了。检查这一步的 `faceNormal` 是不是与走刀方向垂直 ——
两者指同一个轴时这一层就失效。

**下一趟刀刚下去，那一处就已经成形了。** 走完的那几趟被 `carveFinish()` 记宽了。
`verify.js` 的 `[CARVE]` 钉的就是这件事，改动这条路径后先跑 `npm run verify`。

```js
__ctx.mach.job.carveKey    // { parts, tag, travel, axis, dir, lane }
__ctx.mach.job.carveT      // 当前进度 0–1，只增不减
__ctx.mach.job.sweptLo     // 这一趟刃尖扫过的区间（进给轴，世界坐标）
__ctx.mach.job.sweptHi
__ctx.lantern.parts.get('LB-B1').carved   // { tag, lanes: [{ lane, swept }] } 走完的那几趟
```

### 刀插在木头里

探面探空了。刀的高度是每帧探出来的：沿刀身取五处，各从上方沿进刀方向打射线，取最高的面，
把刃尖放上去。`carve` 漏了、构件当时还没摆到位（`detach()` 排在 `begin()` 之后）、
或者传的是一件隐藏着的备份件，`rideMeshes` 就是空的 —— 刀直接坐在走刀线上，
而走刀线是**走到底**时刃尖的位置，不是料的表面。

```js
__ctx.mach.job.rideMeshes   // 探面的目标；空的就是没量到
__ctx.mach.job.rideLast     // 刃尖此刻高出走刀线多少毫米
__ctx.mach.job.lift         // 开工时那个面有多高（探面结果的上限）
```

反过来，**刀停在面上不往里走**多半不是毛病：口子比刀窄（透眼 4 mm，与凿身同宽）时，
刚体本来就进不去。约定见 [DESIGN.md §4](../DESIGN.md#4-教学件与刀具让动作和结果对得上)。

### 格心与木条的接缝在明暗闪烁（拖拽旋转后尤其明显）

两个面落在同一个平面上了，深度缓冲里是同一个值。不必靠肉眼判 ——
把所有材质的深度函数从 `LessEqual` 换成 `Less` 再渲一帧，两次之间会变的像素就是深度完全打平的地方：

```js
const set = (v) => __ctx.stage.scene.traverse((o) => {
  if (o.isMesh && o.material) [].concat(o.material).forEach((m) => { m.depthFunc = v; });
});
set(2);   // LessDepth —— 相等时先画的赢
set(3);   // LessEqualDepth（默认）—— 相等时后画的赢
```

正常应当只剩个位数的零星像素。成片出现说明有人拿掉了 `lattice.js` 里那 0.3 mm 的
渲染让位（`GAP`），或者新加的构件也做成了严丝合缝，见
[DESIGN.md §1](../DESIGN.md#1-几何算出来的不是建出来的)。

`near` 也别乱调大：它确实能换来深度精度，但 `minDistance` 量的是相机到**目标**的距离，
拉到最近时相机已经探进灯笼里了 —— 实测手机上的 D5 最近处只有 7.3 mm。

### 拖着转的时候，木头（或压在灯笼纸上的棂条）在沸腾

程序化花纹的走样。有人把 `materials.js` 的 `fbmF()` 换回了不带足迹的 `fbm()`，
或者把足迹参数（`fw`）算错了 —— 比如拿世界坐标而不是构件自己的坐标去求导，见
[DESIGN.md §1](../DESIGN.md#1-几何算出来的不是建出来的)。

判据是「同一处像素在相邻两帧之间来回跳」，不是「整片在变」：镜头转起来，花纹本来就该跟着木头一起挪。
把木料换成平色跑一遍，量出「合法的明暗变化」有多少：

```js
// 控制台里把某一根换成同色平材质，两个机位各渲一帧比一比
const m = __ctx.lantern.parts.get('PL-01').material;
__ctx.lantern.parts.get('PL-01').mesh.material = new m.constructor({ color: m.color, roughness: m.roughness });
```

MSAA 与提高像素比都救不了这一类 —— 前者只管几何边缘，后者只是多采几次同一片噪声。

### 木纹在木头里流动 / 拖着走的时候花纹变了

有人把木料着色器的取样点改回了世界坐标。`vGrain` 应当取 `position`，即构件自己的坐标系 ——
料被拖动、离位陈列、爆炸拆开都不能让花纹动，转过来摆的料也不能变成横纹。
十三根各有各的花靠 `seed` 与 `tone`，不靠位置，见
[DESIGN.md §1](../DESIGN.md#1-几何算出来的不是建出来的)。

### 明明什么都停了，画面却在轻微颤动

多半是有人拿掉了 `stage.js` 里 `setSafeArea()` 的 `REFRAME_MIN` 门槛：
字幕换一行，安全区就差一行的高度，每变一次就重算一次机位，相机与主光的目标点跟着挪，
阴影贴图整体位移，灯笼纸上棂条的影子于是持续爬动（[DESIGN.md §6](../DESIGN.md#6-取景算出来的不是摆出来的)）。

```js
__ctx.stage.setRecommended = new Proxy(__ctx.stage.setRecommended, {  // 数一数它被叫了几次
  apply(f, t, a) { console.log('reframe', __ctx.stage.safe); return f.apply(t, a); } });
```

静置几秒之后，相机每帧位移应当是 0。

### 翻回上一步，画面空了

那一步的 `enter()` 接着上一步的现场写，自己没把台子摆全。每一步都必须能从任何一步进来 ——
顶上的格子可以跳到任何一处，箭头也能往回翻。补齐 `attachAll()` / `showOnly()` / `allFinished()` /
`showPanels` / `showDecor` / 灯芯这几项，见 [ARCHITECTURE.md](ARCHITECTURE.md#一步长什么样)。
`npm run smoke` 会倒着走一遍十八步，并数每一步画面里有几件东西。

### 教学件的凹槽看起来是凸的

那处又用实心块拼了。改用 `demoSolid({ blank, cuts })` 让 CSG 真的挖出来，内壁才会照常受光。
贴面片为什么一定读反，见 [DESIGN.md §4](../DESIGN.md#4-教学件与刀具让动作和结果对得上)。

### 浅色模式下某几步仍然是暗的

设计如此：夜里的场景（D5 与其后的互动模块）不跟主题走，见 [UI.md §主题](../UI.md#主题)。
切回白天的场景时自己恢复，菜单里的选择也不受影响。开场的傍晚（A1）是跟主题走的，浅色下偏米色属正常。

### 帧率低 / 风扇狂转

`src/render/fx.js` 的 `detectTier()` 分三档，**移动设备一律判成 low**（内存与核心数只管桌面端）。
low 档像素比压到 1.5、离屏目标不开 MSAA、关阴影；mid 档像素比 1.75、MSAA 2×、阴影贴图 1024 ——
这些在 `src/render/stage.js` 的 `TIERS` 表里。另有两项不在表里：关高光溢出在 `main.js`，
M4 天球贴图减半在 `modules/m3-m4.js`。

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
2. 浏览器要求一次真实手势才允许出声 —— 页面上任何一次真实点击或按键都能解锁，但脚本里直接调 `__engine.go()` 不算；
3. 系统或标签页是否静音。

**旁白朗读**这一项只在真的有配音文件时才出现在菜单里。仓库不含音频，
放进 `public/audio/vo/` 并在同目录 `manifest.json` 里登记之后它才会出现。字幕不受影响，一直都在。

---

## 测试与构建

### `npm run smoke` 报缺少 playwright

浏览器内核要单独装一次：

```bash
npx playwright install chromium
```

### `npm run smoke` 报「没有 dist/」

它跑的是构建产物，不是开发服务器。先 `npm run build`。想对着已经起好的地址跑：

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

输出里会写清哪一条、期望什么、实际什么。几何是整数毫米的，失败一定是真的对不上，不是精度问题。

---

## 部署之后

### 页面白屏，控制台报资源 404

`vite.config.js` 的 `base` 被从 `'./'` 改成了绝对路径 —— 产物就不再是相对路径，子路径部署当场 404。

### 部署上去是旧版本

Vercel 按提交部署，本地改完要先推上去。产物是纯静态的，没有服务端，也没有需要配置的环境变量。
