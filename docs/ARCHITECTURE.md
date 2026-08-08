# 架构说明

这份文档回答一个问题：**要改某件事，该动哪个文件。**

几何为什么这么算、主线为什么是十八步，见 [DESIGN.md](../DESIGN.md)；
界面用什么颜色、什么组件，见 [UI.md](../UI.md)。

---

## 分层

自下而上五层，只允许向下依赖，没有回指。

```
core/       尺寸与几何          不认识 three.js 之外的任何东西，也不认识界面
  ↓
render/     把几何变成画面      认识 core，不认识步骤内容
interact/   把指针变成装配      认识 render，不认识具体是哪一步
audio/      声音                谁也不认识
  ↓
ui/         界面组件            只认识 DOM 与自己的样式，不认识灯笼
  ↓
app/        分步引擎            只认识"一步长什么样"这个约定
  ↓
steps/      十八步的内容        认识以上全部，通过 ctx 取用
modules/    做完之后的四件事
```

`main.js` 是唯一的组装处：它 new 出每一层，塞进一个共享的 `ctx`，再把步骤表交给引擎。

---

## ctx：全片共享的那一个对象

步骤脚本不 import 任何单例，需要什么都从 `ctx` 里拿。这样一步的代码读起来就是它自己做的事，
换一套渲染或换一套界面时，改的是 `main.js` 的一行装配，不是十八个文件。

| 键 | 是什么 | 常用的 |
|---|---|---|
| `stage` | 舞台 | `setRecommended({az,el,dist,fit})` · `setMood()` · `updaters` |
| `lantern` | 装配体中枢 | `setOps()` · `addOp()` · `showOnly()` · `setExplode()` · `setSection()` · `setLit()` |
| `hud` | 界面 | `setCue()` · `setNote()` · `setTask()` · `setAlts()` · `toast()` · `sheet()` · `dock()` · `addSpot()` |
| `drag` | 单自由度装配 | `begin({parts,…})` · `autoSeatAll()` |
| `mach` | 拖刀加工 | `begin({tool,from,to,carve,…})` · `autoRun()` |
| `sfx` `bgm` `voice` | 声音 | `play()` · `loop()` |
| `fx` | 粒子 | `chips` · `ripples` · `ring` · `tier` |
| `guides` | 三维方向箭头 | `set()` · `clear()` |
| `state` | 存档 | 直接读写，写入即持久化 |
| `engine` | 引擎自身 | `done()` · `go()` · `goToStep()` |

---

## 一步长什么样

一步是一份**声明**加两个钩子。引擎负责把上一步收干净，再把下一步铺开 —— 步骤本身不必操心清场。

```js
{
  id: 'C5', phase: 2,               // phase 决定它归到顶部哪一章
  title: '底盘做好了',
  mood: 'craft',                    // 场景基调，见 render/stage.js 的 MOODS
  bgm: 'BGM_B_CRAFT',
  cam: { az: 40, el: 36, dist: 320, target: [0, 0, C.LOWER_Z1], snap: true, fit: FIT_RING },
  cue: { ico: 'drag', text: '<em>拖动横枨</em>，套住两个榫头' },
  narration: `两根横枨套上去……`,   // 字幕与配音共用这一份
  note: { title: '出头', spec: [...], body: '…' },
  task: { label: '明白了，开工', onClick(c, engine) { … } },  // 可选，需要动手时才有
  async enter(c, engine) { … },     // 铺开这一步
  exit(c) { … },                    // 收掉这一步自己造的东西
}
```

`cam.fit` 不是可选的装饰：它声明「这一步必须完整看到多大一块」，
相机据此在窄画幅上自动后退。省掉它，手机上就会裁边。取值见 `steps/util.js` 的 `FIT_*`。

引擎在 `go()` 里做的事，按顺序：停旁白 → `prev.exit()` → 取消拖拽与加工 → 清标注、笔记、任务、提示 →
关覆盖层 → 清高亮与剖切 → 铺开新一步 → `enter()`。

**翻页永远不被拦住。** 旁白没念完、任务没做完，都可以往前走。需要动手的步骤把动作放在底部那一个任务按钮上，与导航互不相干。

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

改一道工序只需 `lantern.addOp(id, OP.TENON)` —— 几何当场重建，切面自动变亮。
加工动画因此不需要美术出图，也不会与几何失同步。

**走刀去料**走的是同一条管线，只是把工序拆成了连续量。给 `mach.begin()` 加一句
`carve: { parts: ['LB-A1'], tag: OP.BEAM_SLOT }`，刀每动一下就把「刃尖在哪、走了多少」
交给 `lantern.carve()` → `buildPart(id, ops, carve)`，现算这一刀啃掉的那一块：

- 刀没压在上面的切除盒**不动它** —— 顺枨顶面两条槽，因此要走两趟，一趟一条；
- 深度按「已完成刀数 + 本刀走过的比例」自入刀面向里推进，只增不减。

刀够不着的部分（另一根枨、另一个端头）仍由 `onDone` 里的 `addOp()` 补上，
文案会明说「另一头同样一锯」。详见 [DESIGN.md](../DESIGN.md) §4。

---

## 状态

`core/state.js` 是一个写入即落 `localStorage` 的 Proxy。隐私模式下静默降级为内存态。

字段分两类，界线在文件顶部就划好了：

- **`PREFS` 偏好** —— 深色、声音、字幕、旁白朗读、是否看过「怎么操作」。跨会话保留。
- **`RUN` 进度** —— 纹样、点亮与亮度、灯谜得分、愿望与海报编号、模块完成情况。**每次打开都从头开始。**

`load()` 只从存档里取 `PREFS` 的键，进度一律用默认值 —— 旧版本存档里多出来的字段自然被忽略。
加字段时先想清楚它属于哪一类：放错地方的后果是用户刷新之后回到一个他不记得的状态。

---

## 加一步要改哪几个文件

1. 在 `steps/act1.js` / `act3.js` / `act4.js` 里加一个步骤对象，`phase` 填对；
2. 给 `cam.fit` 一个值，`steps/util.js` 里有现成的四个，不合适就写 `{ r, h }`；
3. 只在这一步存在的场景挂件，用 `Junk` 收着，在 `exit()` 里 `clear()`；
4. 旁白写在 `narration`，不要另开文案文件 —— 配音稿由运行时数据导出；
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

在 `main.js` 的 `DOORS` 里加一项即可。旁白写进 `modules/vo.js` —— 播放与导出配音稿取的是同一份。

---

## 构建

Vite，无框架，无 CSS 预处理器。`base: './'`，产物用相对路径，放子路径下不用改配置。
`three` 单独切一个 chunk，因为它比其余全部代码加起来还大。

分包写法跟着 Vite 8 走：打包器换成了 rolldown，配置键是 `build.rolldownOptions`
（`rollupOptions` 已改名），`manualChunks` 的对象写法也没了 ——
改用 `output.codeSplitting.groups` 按模块 id 匹配，见 `vite.config.js`。

开发期两个中间件（`vite.config.js`，`apply: 'serve'`，不进生产构建）：

- `POST /__shot` —— 页面把 canvas 的 dataURL 发过来，写到 `.shots/`，用于无法直接截屏的环境；
- `POST /__manifest` —— 页面把**运行时的真实步骤数据**导出，供 `tools/make-script.mjs` 排版配音稿。

第二个是有意为之：让页面自己交代它念了什么，好过让脚本用正则去解析源码。

生产构建另有一个插件（`apply: 'build'`）：`transformIndexHtml` 里扫出首页的内联脚本，
现算 sha256，拼成一份 CSP 注入到 `<head>` 最前面。三处讲究：

- **必须是 head-prepend。** meta 形式的 CSP 只管到它后面解析的内容，排在内联脚本之后等于没写；
- **哈希要先把换行归一成 `\n`。** 按 HTML 解析规范，分词阶段 `\r\n` 与孤立的 `\r` 都被归一，
  浏览器算的是归一之后的文本 —— 不跟着做，Windows 上产出的哈希就比浏览器多算几个 CR，脚本被当场挡下；
- **不写死在 `vercel.json` 里。** 那段脚本以后改一个字，写死的哈希就失配，而失配特别隐蔽：
  页面照样能用，只是主题脚本被挡，每次打开先闪一下白。

`vercel.json` 只留跟产物无关的那几个头：缓存、`X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy`。

`tools/shots.mjs`（`npm run shots`）从**构建产物**里重出 README 的五张图，同理：
截图由真实运行的页面产出，改了模型或界面就重跑一次，图不会和实现各说各话。

## 检查

`npm run check` = `lint` → `verify` → `build` → `smoke`，GitHub Actions 在 Node 22.13 与 24 上各跑一遍。

ESLint 用扁平配置，只开 `recommended` 一档，风格问题一概不管。两处按项目实际情况放宽：
`caughtErrors: 'none'`（隐私模式读 `localStorage`、解码失败之类的空 `catch` 到处都是，是有意的），
以及 `tools/make-script.mjs` 里放行全角空格 —— 那是排中文的排版字符，不是手误，
按默认规则改反而会把生成的《旁白解说稿》排版弄坏。
