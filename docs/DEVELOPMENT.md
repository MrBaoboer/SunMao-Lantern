# 开发与维护

跑起来、改代码、跑检查、发上线，都在这一份里。其余技术文档：

| | |
|---|---|
| [DESIGN.md](DESIGN.md) | 几何、主线、刀具、取景、音频为什么这么实现 |
| [UI.md](UI.md) | 界面设计语言：主题、令牌、组件、文案 |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | 跑不起来、画面不对、测试挂了，按症状查 |
| [SECURITY.md](../SECURITY.md) · [COMMERCIAL.md](../COMMERCIAL.md) | 攻击面与响应头 · 双轨授权 |

---

## 环境

- **Node** 22.13+ 或 24（`package.json` 的 `engines`）。上界是闭的：Vercel 按这一行挑构建用的 Node，
  CI 只验声明的这两个版本。
- **浏览器**需要 WebGL 2 与 ES2022。基线：Chrome / Edge 111+、Safari 16.4+、Firefox 113+。
  移动设备与低配机自动减配（抗锯齿、阴影、后期），配色不变。
  WebGL 上下文被系统回收时（移动端切后台常见）等一次 `webglcontextrestored`，原地接着走。

## 命令

```bash
npm install
npm run dev        # 开发服务器 → http://localhost:5173
```

```bash
npm run build      # 静态产物 → dist/
npm run lint       # ESLint
npm test           # 单元断言：模数守卫、CSG 内核、补间取消语义
npm run verify     # 几何闭合验算（Node 端，不需要浏览器）
npm run size       # 产物体积门槛
npm run smoke      # 冒烟测试：真实浏览器走完十八步与四个模块
npm run check:code # 上面除冒烟外的五样，二三十秒
npm run check      # check:code + smoke
```

`smoke` 与 `shots` 要先装一次浏览器内核：

```bash
npx playwright install chromium
```

## 项目结构

```
src/
  core/       modulus 模数体系 · boxcsg CSG 内核 · parts 构件参数 · verify 几何验算 · state 全局状态
  render/     stage 舞台与取景 · lantern 装配体 · materials · geometry · lattice 纹样 · decor · fx
  interact/   assembly 单自由度约束装配 · machining 拖刀加工
  audio/      sfx 合成音效 · voice 旁白字幕 · bgm 背景音乐
  ui/         hud 界面层 · icons · styles/{tokens,base,chrome,controls,surfaces}.css
  app/        engine 分步引擎
  steps/      act1 / act3 / act4 十八步主线 · util 步骤共用工具
  modules/    m1-m2 点灯与灯谜 · m3-m4 心愿与挂灯 · vo 模块旁白与片尾
  util/       tween 补间与调度
  main.js     唯一的装配处 · styles.css 样式入口
public/       原样进产物：站点图标两枚 · audio/{bgm,vo} 音频挂载口
art/          原画（不进产物），站点图标由它生成
tools/        单元断言 · 几何验算 · 冒烟测试 · 体积门槛 · 重出截图 · 导出旁白 · 生成图标
vite.config.js   构建配置、开发期两个中间件、生产 CSP 注入
```

产物约 870 kB（gzip 约 250 kB）：three.js 单独一块 619 kB，其余全部 247 kB。
门槛写在 `tools/size-budget.mjs`（740 / 290 / 300 kB），`npm run size` 越线即红。
产物里没有字体，图片只有两枚站点图标 PNG（合计 16 kB）；界面图标是内联 SVG，纸纹是 data-URI SVG。
仓库不含音频，旁白与背景音乐留了挂载口，没有音频时字幕照常走完（[DESIGN.md §9](DESIGN.md#9-音频)）。

---

## 分层

五层，只允许向下依赖：

```
core/       尺寸与几何      纯数字与盒体，不碰 three.js
  ↓
render/     几何变画面      认识 core，不认识步骤内容
interact/   指针变装配      认识 render，不认识具体是哪一步
audio/      声音            谁也不认识
  ↓
ui/         界面组件        认识 DOM 与 three 的向量（标注要投到屏幕上），不认识灯笼
  ↓
app/        分步引擎        只认识「一步长什么样」这个约定
  ↓
steps/      十八步的内容    认识以上全部，通过 ctx 取用
modules/    做完之后的四件事
```

`main.js` 是唯一的组装处：new 出每一层，塞进共享的 `ctx`，把步骤表交给引擎。

## ctx

步骤脚本不 import 单例，需要什么都从 `ctx` 取。换渲染或换界面时改的是 `main.js` 的一行装配，不是十八个文件。

| 键 | 是什么 | 常用的 |
|---|---|---|
| `stage` | 舞台 | `setRecommended({az,el,dist,fit})` · `setMood()` · `hold()` · `updaters` |
| `lantern` | 装配体 | `setOps()` · `addOp()` · `showOnly()` · `setExplode()` · `setSection()` · `setLit()` |
| `hud` | 界面 | `setCue()` · `setNote()` · `setTask()` · `setAlts()` · `toast()` · `sheet()` · `dock()` · `addSpot()` · `hideOverlay()` / `closeOverlays()` |
| `drag` | 单自由度装配 | `begin({parts,…})` · `seat(id)` · `autoSeatAll()` |
| `mach` | 拖刀加工 | `begin({tool,from,to,carve,…})` · `autoRun()` |
| `sfx` `bgm` `voice` | 声音 | 都有 `play()`；`loop()` 只有 `sfx` 有，BGM 的循环写在曲目表的 `loop` 字段 |
| `fx` | 粒子 | `chips` · `ripples` · `ring` · `tier` |
| `guides` | 三维方向箭头 | `set()` · `clear()` |
| `state` | 状态 | 直接读写；只有偏好落盘 |
| `engine` | 引擎 | `done()` · `assist()` · `go()` · `goToStep()` |

## 一步长什么样

一步是一份声明加两个钩子。引擎负责把上一步收干净再铺开下一步，步骤本身不管清场。

```js
{
  id: 'C5', phase: 2,               // phase 决定归到顶部哪一章
  title: '底盘做好了',
  mood: 'craft',                    // 场景基调，见 render/stage.js 的 MOODS
  bgm: 'BGM_B_CRAFT',               // 只有换曲子的那一步声明
  cam: { az: 40, el: 30, dist: 320, target: [0, 0, C.LOWER_Z1], fit: FIT_RING },
  cue: { ico: 'drag', text: '<em>拖动横枨</em>，套住两个榫头' },
  narration: `两根横枨套上去……`,   // 字幕与配音共用
  note: { title: '出头', spec: [...], body: '…' },
  task: { label: '明白了，开工', onClick(c, engine) { … } },  // 需要动手时才有
  async enter(c, engine) { … },     // 铺开这一步
  exit(c) { … },                    // 收掉这一步自己造的东西
}
```

- **`cam.fit` 不能省。** 它声明「必须完整看到多大一块」，相机据此在窄画幅上自动后退；省掉它手机上就裁边。
  取值见 `steps/util.js` 的 `FIT_*`。
- **`cam` 只是下达机位**，翻页时相机自己绕过去。真要另起一个场（互动模块、封面、脚本拍图）才叫 `stage.snapToRecommended()`。
- **`enter()` 必须自己把台子摆全。** 顶上的格子能跳到任何一步，箭头能往回翻，谁在前面是不定的。
  要整盏灯就 `attachAll()` + `showOnly(null)` + `allFinished()` + 装板与装饰；只要台面上几根就 `only()` 与 `detach()`。
  少一句的后果是画面空掉，正着走看不出来，`npm run smoke` 倒着再走一遍就是为了抓它。
- **`enter()` 抛错不卡人。** 引擎记日志、置 `taskDone`、弹一句说明；翻页与顶上的格子不经过 `enter()`，一定走得通。
- **需要动手的步骤，「下一步」先用来做活儿**：一下按键做一段（走刀一趟 `mach.autoRun()`、装一件 `drag.seat(id)`、
  按一下任务按钮，或步骤登记的 `engine.assist(fn)`），做完最后一段、步骤 `done()` 之后才翻页。
  段与段之间的空当里那一下不作废：`#waitLeg` 等下一段起来就做，五秒等不到才认这一步做完。规矩本身见 [UI.md](UI.md#五条规矩)。

引擎 `go()` 的顺序：`cancelAll()` → 停旁白 → `prev.exit()` → 取消拖拽与加工 → 清标注、笔记、任务、提示 →
`closeOverlays()`（两层一起收）→ `ctx.exitInspect?.()` → 清高亮、剖切与灯火 → `stage.hold(false)` → 铺开新一步 → `enter()`。

`exitInspect` 是「拆开看看」注册在 `ctx` 上的复位钩子。少了它，开着「拆开看看」翻页时坞被收掉，
爆炸与半透却留在模型上，没有入口能收回去。

## 数据流

```
modulus.js   a = 12 mm，全部尺寸落在整数毫米栅格上
    ↓
parts.js     毛坯盒 − 若干带工序标签的切除盒 → Solid（标签 = OP.BEAM_SLOT / TENON / MORTISE / SOCKET / …）
    ↓
boxcsg.js    非均匀体素栅格 + 贪心面网格化 → 顶点 + aCut 属性
    ↓
geometry.js  → THREE.BufferGeometry
materials.js 木料着色器读 aCut，加工新露出的面提亮一档
    ↓
lantern.js   13 件木构件 + 4 片格心 + 装饰件；管 ops（做到哪道工序）与 installed（装没装上）
```

改一道工序只需 `lantern.addOp(id, OP.TENON)`，几何当场重建，切面自动变亮。加工动画不需要美术出图，也不会与几何失同步。

**走刀去料**走同一条管线，把工序拆成连续量：给 `mach.begin()` 加 `carve: { parts: ['LB-A1'], tag: OP.BEAM_SLOT }`，
刀的位置与进度就交给 `lantern.carve()` → `buildPart(id, ops, carve)`。三条判定见 [DESIGN.md §4](DESIGN.md#料要跟着刀走)，
`verify.js` 的 `[CARVE]` 钉住最容易错的那条。刀够不着的部分（另一根枨、另一个端头）由 `onDone` 里的 `addOp()` 补上。

## 状态

`core/state.js` 是一个 Proxy，字段分两类：

- **`PREFS` 偏好**：深色、声音、字幕、旁白朗读、是否看过「怎么操作」。落 `localStorage`，跨会话保留。
- **`RUN` 进度**：纹样、点亮与亮度、灯谜得分、愿望与海报编号、模块完成情况。纯内存，每次打开从头开始。

`load()` 只从存档取 `PREFS` 的键，旧存档里多出来的字段自然被忽略；写入侧同样只挑 `PREFS`。
隐私模式下静默降级为全内存。「从头再来」调 `resetRun()`，只拨回 `RUN`。
加字段先定它属于哪一类：放错的后果是用户刷新后回到一个自己不记得的状态。

## 加一步

1. 在 `steps/act1.js` / `act3.js` / `act4.js` 加一个步骤对象，`phase` 填对；顶部章节按 `phase` 自动铺，不用改导航。
2. 写上 `cam.fit`。
3. 只在这一步存在的场景挂件用 `Junk` 收着，`exit()` 里 `clear()`。
4. 旁白写在 `narration`，单行不超过约三十字：字幕按行推进，一行有多长就在屏幕上停多久。
5. 跑 `npm run smoke`，它会检查这一步可达、有标题、相机正常。

## 加一个互动模块

模块是「打开一扇门，做完关上」的形态，签名固定：

```js
export function openM5(c, onExit) {
  // 造场景、开覆盖层
  return close;          // 收干净、hideOverlay、onExit()
}
```

在 `main.js` 的 `DOORS` 里加一项，旁白写进 `modules/vo.js`。模块内的长异步链要用自己的 `closed` 标志守卫：
它们的 `wait`/`tween` 不经过引擎的 `cancelAll()`。

---

## 构建

Vite，无框架，无 CSS 预处理器。`base: './'`，产物用相对路径，放子路径下不用改配置。
`three` 单独切一个 chunk（比其余代码加起来还大）。分包按 Vite 8 的 rolldown 写：`build.rolldownOptions`，
分组用 `output.codeSplitting.groups` 按模块 id 匹配。

开发期两个中间件（`apply: 'serve'`，不进生产构建）：

- `POST /__shot`：页面把 canvas 的 dataURL 发过来，写到 `.shots/`；
- `POST /__manifest`：页面把运行时的真实步骤数据导出，供 `tools/make-script.mjs` 排版配音稿。
  日常重跑不必起浏览器：`npm run script` 用一个占位 `ctx` 在 Node 里取到同一张步骤表。

生产构建另有一个插件（`apply: 'build'`）：扫出首页的内联脚本，现算 sha256，拼成 CSP 注入到 `<head>` 最前面。三处讲究：

- **必须 head-prepend。** meta 形式的 CSP 只管到它后面解析的内容。
- **哈希前先把换行归一成 `\n`。** HTML 分词阶段 `\r\n` 与孤立的 `\r` 都被归一，浏览器算的是归一后的文本；
  不跟着做，Windows 上产出的哈希会多算几个 CR，脚本被当场挡下。
- **不写死在 `vercel.json`。** 脚本改一个字哈希就失配，而失配很隐蔽：页面照样能用，只是主题脚本被挡，每次打开先闪一下白。

`vercel.json` 只留与产物无关的头：缓存，加一组安全响应头（清单见 [SECURITY.md](../SECURITY.md)）。

## 检查

`npm run check` = `check:code`（`lint` → `test` → `verify` → `build` → `size`）→ `smoke`。两道验证各管一半：

- **`verify`** 证明几何是闭合的：尺寸落在模数栅格上、透眼真的贯穿、17 件构件两两无干涉、每道工序都去了料、面数在预算内。
  17 条断言，跑在 Node 里。页面加载时也会跑一遍，右上角「尺寸对照」可随时调阅。
  实现与几何有出入时以 `src/core/verify.js` 为准，它是唯一会自己报错的规格。
- **`smoke`** 证明这些几何真的能在页面上跑起来：十八步全部可达、每一步画面里确实有东西（可见且落在画幅内的网格 ≥ 2）、
  控制台无报错、无 HTTP 4xx/5xx、相机距离正常、刀具刃口朝着工件、加工与装配的降级路径走得完、
  需要动手的一步按「下一步」是一下做一段、C6 一键六道工序、M1–M4 各走一遍、深浅两套主题都真的换过去。
  1440×900 与 390×844（真实移动 UA，低配档）各走一遍，桌面画幅再倒着走一遍。

CI（`.github/workflows/ci.yml`）把两半拆开：

- `check:code` 全是纯 Node 的活，对版本敏感，**每个 PR** 在 22.13 与 24 上各跑一遍，二三十秒。
- `smoke` 是软件渲染的浏览器走查，十几分钟，**只在合并进 `main` 之后跑**（或手动触发），只跑 22.13。
  它验的是同一个 Chromium 里的行为，按 Node 版本再跑一遍多验到的约等于零。

CI 上的冒烟不加 `--shots`：三十六张软件渲染截图要好几分钟，而绿的跑次没人看。脚本只在某一步刚记下问题时截那一张，
失败时 `.shots/smoke/` 作为 artifact 上传。本地排查才用 `npm run smoke -- --shots`。

依赖升级挂在 `.github/dependabot.yml`，每月一次，每个生态一条 PR。`three` 是唯一进产物的依赖，
差异里出现它时 `check:code` 绿了不算数，还得在真机上走一遍。

ESLint 用扁平配置，只开 `recommended`。两处放宽：`caughtErrors: 'none'`（隐私模式读 `localStorage`、解码失败之类的空 `catch` 是有意的），
以及 `tools/make-script.mjs` 里放行全角空格（排中文的排版字符）。

## 生成物

README 的五张图、《旁白解说稿.md》与两枚站点图标都是生成的，不要手改。改了模型、界面、旁白或原画之后重出：

```bash
npm run shots                # 从构建产物里重拍五张图 → docs/img/
npm run script               # 从源码导出旁白 → 旁白解说稿.md
python tools/make-icons.py   # 从 art/lantern-icon.png 生成两枚站点图标 → public/
```

图标那条要 Python 3 与 Pillow，所以没做成 npm 脚本，也不进 `npm run check`：原画一年也未必改一次，
不值得为它给工具链添一个 Python 依赖。取景、圆角与调色板的取舍写在脚本头部。

旁白只有一处出处：主线在步骤的 `narration` 字段，模块在 `src/modules/vo.js`；
`vo.js` 的 `M2-1`…`M2-5` 是五条谜面的朗读版，必须与 `m1-m2.js` 的 `RIDDLES[].face` 逐字一致。

## 部署

纯静态产物，任何静态托管都能放，搁在子路径下也不用改配置。当前 Demo 在 Vercel，推到 `main` 即自动部署；也可以手动发：

```bash
npm run build && npx vercel deploy --prod
```

首页的 CSP 由构建时注入（见[构建](#构建)），托管侧的缓存与安全响应头在 `vercel.json`。
