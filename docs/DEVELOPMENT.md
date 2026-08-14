# 开发与维护

跑起来、跑检查、发上线，都在这一份里。
要改某件事该动哪个文件，见 [ARCHITECTURE.md](ARCHITECTURE.md)；为什么这么实现，见 [DESIGN.md](../DESIGN.md)；
跑不起来或画面不对，查 [TROUBLESHOOTING.md](TROUBLESHOOTING.md)。

---

## 环境

**Node** 22.13+ 或 24+（`package.json` 的 `engines`）。

**浏览器**需要 WebGL 2（three 0.185 的渲染器只申请 `webgl2` 上下文，没有降级）与 ES2022，
建议按 Chrome / Edge 111+、Safari 16.4+、Firefox 113+ 这条保守基线。
移动设备与低配机走减配档，各档的颜色完全一致。
上下文被系统回收时（移动端切后台常见）会等一次 `webglcontextrestored`，找回来就原地接着走。

## 命令

```bash
npm install
npm run dev        # 开发服务器 → http://localhost:5173
```

```bash
npm run build      # 静态产物 → dist/
npm run lint       # ESLint
npm test           # 单元断言：模数守卫、CSG 内核、补间取消语义
npm run verify     # 几何闭合验算（Node 端，无需浏览器）
npm run size       # 产物体积门槛
npm run smoke      # 冒烟测试：真实浏览器走完十八步 + 四个模块
npm run check:code # 上面除冒烟外的五样（不进浏览器，二三十秒）
npm run check      # check:code + smoke
```

`smoke` 与 `shots` 需要一次性装好浏览器内核：

```bash
npx playwright install chromium
```

冒烟测试的覆盖面见 [DESIGN.md §12](../DESIGN.md#12-验收)；CI 上两条作业各管一半、分开的理由见
[ARCHITECTURE.md](ARCHITECTURE.md#检查)。

## 实现要点

无框架、无后端：一个 [three.js](https://threejs.org) 依赖，一份 Vite 配置，产物是纯静态文件。
五件事决定了这套代码的形状：

- **几何是算出来的。** 十三件木构件由「毛坯盒 − 若干带工序标签的切除盒」生成，
  模数栅格断言、干涉检测、面数预算与「切面自动亮一档」都由此顺带成立
  （[DESIGN.md §1](../DESIGN.md#1-几何算出来的不是建出来的)）。
- **料是跟着刀走的。** 刀的位置与进度直接喂给 CSG，现算这一刀啃掉的那一块
  （[DESIGN.md §4](../DESIGN.md#4-教学件与刀具让动作和结果对得上)）。
- **取景是算出来的。** 每一步只声明「必须完整看到多大一块」，距离由代码算，
  界面占掉的画面与伸出工件的刀身都算在内（[DESIGN.md §6](../DESIGN.md#6-取景算出来的不是摆出来的)）。
- **音效是实时合成的。** 二十记声音全部由 WebAudio 按物理模型现场算
  （[DESIGN.md §9](../DESIGN.md#9-音频)）。
- **纹样是程序化的。** 万字纹与麻叶纹都由一组「二维线段 + 线宽」生成，再挤出成真实的镂空棂条。
  同一份线段数据同时供给灯上的棂条、地面的光斑、海报的脚线与选纹样的缩略图 —— 用户选的纹样，四处永远是同一个。
  README 首图里地上那片光斑不是贴图，是格心当聚光灯遮罩烘出来的。

## 项目结构

```
src/
  core/       modulus 模数体系 · boxcsg CSG 内核 · parts 构件参数 · verify 几何验算 · state 全局状态
  render/     stage 舞台与取景 · lantern 装配体 · materials · geometry · lattice 纹样 · decor · fx
  interact/   assembly 单自由度约束装配 · machining 拖刀加工
  audio/      sfx 模态合成音效 · voice 旁白字幕 · bgm 背景音乐
  ui/         hud 界面层 · icons · styles/{tokens,base,chrome,controls,surfaces}.css
  app/        engine 分步引擎
  steps/      act1 / act3 / act4 十八步主线 · util 步骤共用工具
  modules/    m1-m2 点灯与灯谜 · m3-m4 心愿与挂灯 · vo 模块旁白与片尾
  util/       tween 补间与调度
  main.js     唯一的装配处 · styles.css 样式入口
tools/        单元断言 · 几何验算 · 冒烟测试 · 体积门槛 · 重出截图 · 导出旁白
vite.config.js   构建配置、开发期两个中间件、生产 CSP 注入
```

模块边界与依赖方向见 [ARCHITECTURE.md](ARCHITECTURE.md)。

构建产物 836 kB（gzip 229 kB），其中 three.js 单独一块 619 kB，其余全部代码加起来 217 kB；
门槛写在 `tools/size-budget.mjs`，`npm run size` 越线即红。
产物里没有图片也没有字体：图标是内联 SVG 线稿，favicon 与那层纸纹是 data-URI SVG。

仓库也不含音频文件，旁白与背景音乐留了挂载口；没有音频时字幕照常走完（见 [DESIGN.md §9](../DESIGN.md#9-音频)）。

## 生成物

README 的五张图与《旁白解说稿.md》都是生成的，不要手改；改了模型、界面或旁白之后重出一遍：

```bash
npm run shots      # 从构建产物里重拍五张图 → docs/img/
npm run script     # 从源码导出旁白 → 旁白解说稿.md
```

## 部署

纯静态产物，任何静态托管都能放，搁在子路径下（如 GitHub Pages 的 `/repo/`）也不用改配置。
当前 Demo 在 Vercel：

```bash
npm run build && npx vercel deploy --prod
```

首页的 CSP 由构建时注入（见 [ARCHITECTURE.md](ARCHITECTURE.md#构建)），
托管侧的缓存与安全响应头在 `vercel.json`，清单见 [SECURITY.md](../SECURITY.md)。
