# 架构说明

这份文档回答一个问题：**要改某件事，该动哪个文件。**

几何为什么这么算、主线为什么是十八步，见 [DESIGN.md](../DESIGN.md)；界面用什么颜色、什么组件，见 [UI.md](../UI.md)。

---

## 分层

五层，只允许向下依赖，没有回指。

```
core/       尺寸与几何          谁也不认识：纯数字与盒体，连 three.js 都不碰
  ↓
render/     把几何变成画面      认识 core，不认识步骤内容
interact/   把指针变成装配      认识 render，不认识具体是哪一步
audio/      声音                谁也不认识
  ↓
ui/         界面组件            认识 DOM 与 three 的向量（标注和箭头要投到屏幕上），不认识灯笼
  ↓
app/        分步引擎            只认识「一步长什么样」这个约定
  ↓
steps/      十八步的内容        认识以上全部，通过 ctx 取用
modules/    做完之后的四件事
```

`main.js` 是唯一的组装处：它 new 出每一层，塞进一个共享的 `ctx`，再把步骤表交给引擎。

---

## ctx：全片共享的那一个对象

步骤脚本不 import 任何单例，需要什么都从 `ctx` 里拿。这样一步的代码读起来就是它自己做的事；
换一套渲染或换一套界面时，改的是 `main.js` 的一行装配，不是十八个文件。

| 键 | 是什么 | 常用的 |
|---|---|---|
| `stage` | 舞台 | `setRecommended({az,el,dist,fit})` · `setMood()` · `updaters` |
| `lantern` | 装配体中枢 | `setOps()` · `addOp()` · `showOnly()` · `setExplode()` · `setSection()` · `setLit()` |
| `hud` | 界面 | `setCue()` · `setNote()` · `setTask()` · `setAlts()` · `toast()` · `sheet()` · `dock()` · `addSpot()` · `hideOverlay()` / `closeOverlays()` |
| `drag` | 单自由度装配 | `begin({parts,…})` · `autoSeatAll()` |
| `mach` | 拖刀加工 | `begin({tool,from,to,carve,…})` · `autoRun()` |
| `sfx` `bgm` `voice` | 声音 | 三个都有 `play()`；`loop()` 只有 `sfx` 有，BGM 的循环写在曲目表的 `loop` 字段上 |
| `fx` | 粒子 | `chips` · `ripples` · `ring` · `tier` |
| `guides` | 三维方向箭头 | `set()` · `clear()` |
| `state` | 状态 | 直接读写；只有偏好会落盘，进度纯内存 |
| `engine` | 引擎自身 | `done()` · `go()` · `goToStep()` |

---

## 一步长什么样

一步是一份**声明**加两个钩子。引擎负责把上一步收干净，再把下一步铺开 —— 步骤本身不必操心清场。

```js
{
  id: 'C5', phase: 2,               // phase 决定它归到顶部哪一章
  title: '底盘做好了',
  mood: 'craft',                    // 场景基调，见 render/stage.js 的 MOODS
  bgm: 'BGM_B_CRAFT',               // 只有换曲子的那一步声明它
  cam: { az: 40, el: 30, dist: 320, target: [0, 0, C.LOWER_Z1], fit: FIT_RING },
  cue: { ico: 'drag', text: '<em>拖动横枨</em>，套住两个榫头' },
  narration: `两根横枨套上去……`,   // 字幕与配音共用这一份
  note: { title: '出头', spec: [...], body: '…' },
  task: { label: '明白了，开工', onClick(c, engine) { … } },  // 可选，需要动手时才有
  async enter(c, engine) { … },     // 铺开这一步
  exit(c) { … },                    // 收掉这一步自己造的东西
}
```

`cam.fit` 不是可选的装饰：它声明「这一步必须完整看到多大一块」，相机据此在窄画幅上自动后退。省掉它，
手机上就会裁边。取值见 `steps/util.js` 的 `FIT_*`。

`cam` 只是**下达一个机位**，翻页时相机自己绕过去，没有跳切
（[DESIGN.md §6](../DESIGN.md#6-取景算出来的不是摆出来的)）。真要另起一个场 ——
互动模块进夜色、封面摆位、脚本拍图 —— 才直接叫 `stage.snapToRecommended()`。

引擎在 `go()` 里做的事，按顺序：`cancelAll()`（掐断上一步没跑完的补间）→ 停旁白 → `prev.exit()` →
取消拖拽与加工 → 清标注、笔记、任务、提示 → `closeOverlays()`（两层一起收）→ `ctx.exitInspect?.()` →
清高亮、剖切与灯火 → `stage.hold(false)`（解开上一步锁住的机位）→ 铺开新一步 → `enter()`。

`enter()` 里抛错不会把人卡住：引擎记下日志，置 `taskDone`（否则「下一步」会一直去按一个
铺不完的任务按钮），并弹一句说明 —— 翻页与顶上的格子不经过 `enter()`，一定还走得通。

**`enter()` 必须自己把台子摆全，不能接着上一步的现场。** 谁在前面是不定的：顶上的格子能跳到任何一步，
箭头能往回翻。要用整盏灯就自己 `attachAll()` + `showOnly(null)` + `allFinished()` + 装上 + `showPanels`/
`showDecor`/灯芯；只要台面上那几根就自己 `only()` 与 `detach()`。少一句的后果是整块画面空掉 ——
A2 曾经只写了一句改亮度，从 B1（把整盏灯藏干净的那一步）翻回来时，屏幕上一件东西也没有。
`npm run smoke` 因此**倒着再走一遍**十八步，并数每一步画面里到底有几件东西。

`exitInspect` 是「拆开看看」注册在 `ctx` 上的复位钩子。少了它，开着「拆开看看」翻页时坞被收掉，
爆炸与半透却留在模型上 —— 灯笼永久停在拆开的样子，没有任何入口能收回去。

**需要动手的步骤，「下一步」先用来做活儿：一下按键做一段。** 一段是走刀一趟 `mach.autoRun()`、
装配一件 `drag.seat(id)`、按一下底部那个任务按钮，或者步骤自己登记的 `engine.assist(fn)`
（教学件那三步的推入、B1 的一个部位、D1 的选花纹）—— 都是现成的降级路径，没有第二套演法。
做完最后一段、步骤自己 `done()` 之后，「下一步」才翻页。

`pending` 在段与段之间也是真的：上一段的收尾演示还在放时（C4 锯完四个榫头到横枨那三道，中间将近三秒），
那一下按键不作废也不跳步 —— `#waitLeg` 等下一段起来，就做那一段；五秒等不到才认这一步做完。
规矩本身见 [UI.md](../UI.md#五条规矩)。

---

## 数据流：一根木条从参数到画面

```
modulus.js   a = 12 mm，全部尺寸落在整数毫米栅格上
    ↓
parts.js     毛坯盒 − 若干带工序标签的切除盒 → Solid
    ↓        （工序标签 = OP.BEAM_SLOT / TENON / MORTISE / SOCKET / …）
boxcsg.js    非均匀体素栅格 + 贪心面网格化 → 顶点 + aCut 属性
    ↓
geometry.js  → THREE.BufferGeometry
materials.js 木料着色器读 aCut，把加工新露出的面提亮一档
    ↓
lantern.js   持有 13 件木构件 + 4 片格心 + 装饰件，管两件事：
             ops（做到哪一道工序）与 installed（装没装上）
```

改一道工序只需 `lantern.addOp(id, OP.TENON)` —— 几何当场重建，切面自动变亮。加工动画因此不需要美术出图，也不会与几何失同步。

**走刀去料**走的是同一条管线，只是把工序拆成了连续量。
给 `mach.begin()` 加一句 `carve: { parts: ['LB-A1'], tag: OP.BEAM_SLOT }`，刀的位置与进度就一路交给
`lantern.carve()` → `buildPart(id, ops, carve)`。三条判定与其中的坑见 [DESIGN.md §4](../DESIGN.md#料要跟着刀走)，
`verify.js` 的 `[CARVE]` 钉住其中最容易错的一条。

刀够不着的部分（另一根枨、另一个端头）仍由 `onDone` 里的 `addOp()` 补上，文案会明说「另一头同样一锯」。

---

## 状态

`core/state.js` 是一个 Proxy：**只有 `PREFS` 的键会落 `localStorage`**，进度那一半纯内存。隐私模式下静默降级为全内存。

字段分两类，界线在文件顶部就划好了：

- **`PREFS` 偏好** —— 深色、声音、字幕、旁白朗读、是否看过「怎么操作」。跨会话保留。
- **`RUN` 进度** —— 纹样、点亮与亮度、灯谜得分、愿望与海报编号、模块完成情况。**每次打开都从头开始。**

`load()` 只从存档里取 `PREFS` 的键，进度一律用默认值 —— 旧版本存档里多出来的字段自然被忽略。
写入侧也只挑 `PREFS`：进度反正下次不读，却会让愿望这类内容无谓地留在本机上。
加字段时先定它属于哪一类，放错的后果是用户刷新之后回到一个自己不记得的状态。

「从头再来」调 `resetRun()`，只把 `RUN` 那一半拨回默认值，偏好一概不动。

---

## 加一步要改哪几个文件

1. 在 `steps/act1.js` / `act3.js` / `act4.js` 里加一个步骤对象，`phase` 填对；
2. 别漏掉 `cam.fit`，理由见上；
3. 只在这一步存在的场景挂件，用 `Junk` 收着，在 `exit()` 里 `clear()`；
4. 旁白写在 `narration`，不要另开文案文件；单行别超过约三十字
   （字幕按行推进，一行有多长它就在屏幕上停多久）；
5. 跑 `npm run smoke`，它会检查这一步可达、有标题、相机正常。

顶部章节是按 `phase` 自动铺的，不用改导航。

## 加一个互动模块

模块是「打开一扇门，做完关上」的形态，签名固定：

```js
export function openM6(c, onExit) {
  // 造场景、开覆盖层
  return close;          // 收干净、hideOverlay、onExit()
}
```

在 `main.js` 的 `DOORS` 里加一项即可，旁白写进 `modules/vo.js`。

---

## 构建

Vite，无框架，无 CSS 预处理器。`base: './'`，产物用相对路径，
放子路径下不用改配置。`three` 单独切一个 chunk，因为它比其余全部代码加起来还大。

分包配置按 Vite 8 的 rolldown 写：键是 `build.rolldownOptions`（不是 `rollupOptions`），
分组用 `output.codeSplitting.groups` 按模块 id 匹配（`manualChunks` 在这里无效），见 `vite.config.js`。

开发期两个中间件（`vite.config.js`，`apply: 'serve'`，不进生产构建）：

- `POST /__shot` —— 页面把 canvas 的 dataURL 发过来，写到 `.shots/`，用于无法直接截屏的环境；
- `POST /__manifest` —— 页面把**运行时的真实步骤数据**导出，供 `tools/make-script.mjs` 排版配音稿，
  让页面自己交代它念了什么。日常重跑不必守着浏览器：`npm run script`（`tools/vo-manifest.mjs`）
  用一个占位 `ctx` 在 Node 里取到同一张步骤表 —— 步骤脚本本身是纯数据。

生产构建另有一个插件（`apply: 'build'`）：`transformIndexHtml` 里扫出首页的内联脚本，现算 sha256，
拼成一份 CSP 注入到 `<head>` 最前面。三处讲究：

- **必须是 head-prepend。** meta 形式的 CSP 只管到它后面解析的内容，排在内联脚本之后等于没写；
- **哈希要先把换行归一成 `\n`。** 按 HTML 解析规范，分词阶段 `\r\n` 与孤立的 `\r` 都被归一，
  浏览器算的是归一之后的文本 —— 不跟着做，Windows 上产出的哈希就比浏览器多算几个 CR，
  脚本被当场挡下；
- **不写死在 `vercel.json` 里。** 那段脚本以后改一个字，写死的哈希就失配，而失配特别隐蔽：
  页面照样能用，只是主题脚本被挡，每次打开先闪一下白。

`vercel.json` 只留跟产物无关的那几个头：缓存，加一组安全响应头（清单见 [SECURITY.md](../SECURITY.md)）。

`tools/shots.mjs`（`npm run shots`）从**构建产物**里重出 README 的五张图 —— 拍的是真实运行的页面。

## 检查

`npm run check` = `check:code`（`lint` → `test` → `verify` → `build` → `size`）→ `smoke`。

CI 把这两半拆开，挂在不同的时机：

- `check:code` 全是纯 Node 的活，对版本敏感（ESLint 10、rolldown、`node:test`），
  **每个 PR** 在 22.13 与 24 上各跑一遍，二三十秒。`engines` 声明支持两头，就得有人替这句话作证。
- `smoke` 是软件渲染的浏览器走查，十几分钟，**只在合并进 `main` 之后跑**（或手动触发），
  只跑声明的下限 22.13。它验的是同一个 Chromium 里的行为，
  按 Node 版本再跑一遍多验到的约等于零。`main` 本来就是部署源，红了几分钟内就知道。

`test` 与 `size` 的实现在 `tools/unit.test.mjs`（零依赖）与 `tools/size-budget.mjs`。

CI 上的冒烟**不加 `--shots`** —— 三十六张软件渲染截图要好几分钟，而绿的跑次没人看。
脚本只在某一步刚记下问题时截那一张，失败时 `.shots/smoke/` 作为 artifact 上传。
本地排查才用 `npm run smoke -- --shots`，每一步都截。

ESLint 用扁平配置，只开 `recommended` 一档，风格问题一概不管。两处按项目实际情况放宽：
`caughtErrors: 'none'`（隐私模式读 `localStorage`、解码失败之类的空 `catch` 到处都是，是有意的），
以及 `tools/make-script.mjs` 里放行全角空格 —— 那是排中文的排版字符，按默认规则改会把生成的《旁白解说稿》排版弄坏。
