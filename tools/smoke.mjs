/**
 * 冒烟测试 —— 把整条主线在真实浏览器里跑一遍。
 *
 * `npm run verify` 只证明几何是闭合的，证明不了页面能不能打开。
 * 这个脚本补上另一半：构建产物起一个静态服务，用无头 Chromium 走完十八步，
 * 沿途盯着控制台报错、资源 404 和未捕获异常，任何一条都判失败。
 *
 *   node tools/smoke.mjs                 桌面 + 手机两种画幅
 *   node tools/smoke.mjs --shots         顺便把每一步截图写到 .shots/smoke/
 *   node tools/smoke.mjs --url http://…  跑一个已经起好的地址（跳过 preview）
 *
 * 需要 Chromium：npx playwright install chromium
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const opt = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };

const WANT_SHOTS = has('--shots');
const SHOT_DIR = path.resolve('.shots/smoke');

/**
 * CI 上放宽等待。
 *
 * GitHub runner 走 CPU 软件渲染，冷启动还要现编着色器，比开发机慢一个量级 ——
 * 同一个提交本机全绿，CI 上却因为几个等待超时误报，两次跑挂的还不是同一批断言，
 * 正是「机器慢且不稳」的样子，不是代码回归。
 *
 * 放宽的只是耐心，断言一条没动。条件满足时等待立刻返回，所以本机不会因此变慢。
 */
const PATIENCE = process.env.CI ? 4 : 1;
const tmo = (ms) => ms * PATIENCE;

/*
 * 手机那一档要连**画质分档**一起验到。
 *
 * `detectTier()` 先问 `navigator.userAgentData.mobile`，而 Playwright 的 `isMobile`
 * 只改视口与触摸，不动 UA —— 于是 userAgentData.mobile 是 false，判出来是 high 档：
 * 手机画幅那一遍照样开着 bloom、阴影与 4× MSAA，走的是 composer 那条路，
 * 和真机上跑的完全不是同一份管线。带上真的移动 UA，这一遍才真的是低配档
 * （bloom 关、阴影关、MSAA 0、renderer.render 直出）。
 */
const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36'
  + ' (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, isMobile: false },
  { name: 'mobile', width: 390, height: 844, isMobile: true, userAgent: PHONE_UA, tier: 'low' },
];

/** 允许出现的控制台噪音：软件渲染与无声卡环境的既有告警，与页面正确性无关 */
const IGNORE = [
  /THREE\.WebGLRenderer: Context Lost/i,
  /Framebuffer is incomplete/i,
  /AudioContext was not allowed to start/i,
];

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('缺少 playwright。先装依赖，再装浏览器内核：');
  console.error('  npm install');
  console.error('  npx playwright install chromium');
  process.exit(2);
}

// ── 起服务 ──────────────────────────────────────────────
let server = null;
let base = opt('--url', '');
if (!base) {
  if (!fs.existsSync('dist/index.html')) {
    console.error('没有 dist/。先跑 npm run build。');
    process.exit(2);
  }
  const { preview } = await import('vite');
  server = await preview({ preview: { port: 4173, strictPort: false } });
  base = server.resolvedUrls.local[0];
}
console.log(`冒烟测试 · ${base}`);

// ── 走一遍 ──────────────────────────────────────────────
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const failures = [];
const note = (vp, msg) => { failures.push(`[${vp}] ${msg}`); };

/**
 * 一种画幅走一遍。
 *
 * 两种画幅**并行**跑：软件渲染是 CPU 密集的，而 runner 有四个核；
 * 两个页面各在自己的渲染进程里，互不抢同一份帧缓冲。
 * 串着跑等于把这条作业的耗时加起来，而它本来就是整条流水线的长杆。
 */
async function walk(vp) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.isMobile,
    hasTouch: vp.isMobile,
    ...(vp.userAgent ? { userAgent: vp.userAgent } : {}),
  });
  const page = await ctx.newPage();

  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (IGNORE.some((re) => re.test(t))) return;
    note(vp.name, `console.error: ${t}`);
  });
  page.on('pageerror', (e) => note(vp.name, `未捕获异常: ${e.message}`));
  page.on('requestfailed', (r) => {
    const t = r.failure()?.errorText || '';
    // 只放行音频缺文件时的中止 —— 其他资源的 ERR_ABORTED 是真问题
    if (/ERR_ABORTED/.test(t) && /\/audio\//.test(r.url())) return;
    note(vp.name, `请求失败: ${r.url()} ${t}`);
  });
  // requestfailed 只管连不上，管不了 404/500 —— 那是「连上了，服务器说没有」。
  // 声称「资源 404 判失败」得由这一条兑现。仓库不含音频，那两个清单缺就缺
  page.on('response', (r) => {
    if (r.status() < 400) return;
    if (/\/audio\//.test(r.url())) return;
    note(vp.name, `HTTP ${r.status()}: ${r.url()}`);
  });

  await page.goto(base, { waitUntil: 'load' });

  // 封面就绪 = 三维、几何验算、界面全部初始化完毕
  await page.waitForFunction(() => !!window.__engine, null, { timeout: tmo(30000) })
    .catch(() => note(vp.name, '三十秒内没能初始化 __engine'));
  await page.waitForSelector('#cv-go', { timeout: tmo(15000) })
    .catch(() => note(vp.name, '封面上没有出现开始按钮'));

  const check = await page.evaluate(() => window.__verifyReport ?? null);
  if (check && check.failed) note(vp.name, `几何验算未通过：${check.failed} 项`);

  // 这一遍真的落在声明的那一档上吗 —— 低配档的整条渲染路径都不一样
  if (vp.tier) {
    const got = await page.evaluate(() => ({
      tier: window.__ctx.tier,
      bloom: window.__ctx.stage.bloomEnabled,
      shadow: window.__ctx.stage.renderer.shadowMap.enabled,
    }));
    if (got.tier !== vp.tier) note(vp.name, `画质档应为 ${vp.tier}，实际 ${got.tier}`);
    if (vp.tier === 'low' && (got.bloom || got.shadow)) {
      note(vp.name, `低配档不该开后处理与阴影：bloom=${got.bloom} shadow=${got.shadow}`);
    }
  }

  await page.click('#cv-go');
  // 「开始做灯」到第一步之间有几段固定等待（封面退场 480 ms + 引导页）——
  // 这几处也得过 tmo()，CI 上慢一个量级时落空会让 engine.go(0) 根本没执行
  await page.waitForTimeout(tmo(1400));
  // 首次进入会摊开「怎么操作」，收掉它
  await page.evaluate(() => document.querySelector('.overlay .btn-primary')?.click());
  await page.waitForTimeout(tmo(600));

  /*
   * 走主线时关掉高光溢出。
   *
   * 这不是为了省时间而放弃断言，而是因为**时间本身就是断言的一部分**：
   * 补间按 rAF 推进，且 dt 被钳在 0.05 s，所以一段 3 秒的动画至少要 60 帧。
   * 软件渲染 + 全屏五级 bloom 在 CI 上只有个位数帧率 —— 那一段 3 秒的动画
   * 于是要走二十秒，而这二十秒里什么也没多验到。关掉之后帧率回到几十，
   * 同样的断言一条不少，只是不必陪着它慢慢烧 CPU。
   *
   * 后处理这条管线另有专门的一条断言（见下面的 composerPainted），
   * 只渲染几帧，不必让整条主线都陪着。
   * 手机那一遍本来就在低配档上（VIEWPORTS 带了移动 UA，上面刚断言过），
   * 产品上就是不开 bloom 的 —— 这一句对它是空操作。
   */
  await page.evaluate(() => { window.__ctx.stage.bloomEnabled = false; });

  const total = await page.evaluate(() => window.__engine.steps.length);
  if (total !== 18) note(vp.name, `主线应有 18 步，实际 ${total} 步`);

  /*
   * 画面真的画出来了吗。
   *
   * 走完十八步只证明脚本没抛错。着色器编译失败、材质全黑、相机在物体内部 ——
   * 这些都会让 canvas 变成一块纯色，而整套断言一条都不会响。
   * 取 canvas 缩略图的亮度标准差：一块纯色趋近 0，有木头有背景则明显大于 0。
   */
  const framePainted = async (bloom = null) => page.evaluate((withBloom) => {
    const s = window.__ctx.stage;
    const was = s.bloomEnabled;
    if (withBloom !== null) s.bloomEnabled = withBloom;
    if (s.bloomEnabled) s.composer.render();
    else s.renderer.render(s.scene, s.camera);
    const src = s.renderer.domElement;
    const cv = document.createElement('canvas');
    cv.width = 48; cv.height = 48;
    const g = cv.getContext('2d');
    g.drawImage(src, 0, 0, src.width, src.height, 0, 0, 48, 48);
    const d = g.getImageData(0, 0, 48, 48).data;
    let sum = 0, sq = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
      sum += l; sq += l * l;
    }
    const mean = sum / n;
    s.bloomEnabled = was;
    return { sd: Math.sqrt(Math.max(0, sq / n - mean * mean)), mean };
  }, bloom);

  /*
   * 翻到某一步并等它铺开。
   *
   * 原先是固定睡 900 ms（CI 上 ×4 = 3.6 s）。十八步两种画幅就是两分钟纯睡眠，
   * 而这段时间里页面的 rAF 一直在软件渲染 —— 睡得越久，CI 越慢。
   * 引擎自己有 `busy`：`go()` 进去置真，`enter()` 返回后置假。等它就够了，
   * 剩下一小口是留给 enter 里那些不 await 的收尾（补间起步、音效）。
   */
  const settle = async (ms = 160) => {
    await page.waitForFunction(() => window.__engine && !window.__engine.busy,
      null, { timeout: tmo(25000) })
      .catch(() => note(vp.name, '这一步二十五秒内没有铺开'));
    // 翻页不再跳切，相机要绕过去 —— 铺开之后再等它走到位，
    // 否则「画面里有几件东西」量的是转场中途的那一帧
    await page.waitForFunction(() => window.__ctx?.stage?.camSettled !== false,
      null, { timeout: tmo(20000) })
      .catch(() => note(vp.name, '这一步的转场二十秒内没有走完'));
    await page.waitForTimeout(tmo(ms));
  };

  /** 走到第 i 步，把这一步该成立的都验一遍 */
  const checkStep = async (i, tag = '') => {
    const before = failures.length;
    await page.evaluate((n) => window.__engine.go(n), i);
    await settle();

    const state = await page.evaluate(() => {
      const e = window.__engine;
      const c = window.__ctx;
      const title = document.getElementById('steptitle')?.textContent || '';
      const cam = c.stage.camera.position.distanceTo(c.stage.controls.target);

      // 刀具朝向：刃口（模型 -Z）必须指着工件。
      // 这一条曾经是反的 —— lookAt() 转的是 +Z，锯齿因此朝天、凿柄扎进木头。
      let tool = null;
      if (c.mach?.tool && c.mach?.job?.faceNormal) {
        const V3 = c.stage.camera.position.constructor;      // THREE.Vector3
        const edge = new V3(0, 0, -1).applyQuaternion(c.mach.tool.quaternion).normalize();
        const attack = c.mach.job.faceNormal.clone().normalize();
        // 探面的目标：空的话刀就直接坐在走刀线上（= 埋进料里），见 DESIGN.md §4
        tool = {
          kind: c.mach.tool.userData.kind, dot: edge.dot(attack),
          rides: c.mach.job.rideMeshes?.length ?? 0,
        };
      }
      /*
       * 画面里到底有没有东西。
       *
       * 「不是一块纯色」拦不住这一类：背景本来就是一圈渐变，把整盏灯藏干净之后
       * 亮度标准差仍有 4 上下，照样过线。所以直接数：可见、且投影落在画面里的网格。
       */
      const V3 = c.stage.camera.position.constructor;
      const v = new V3();
      let onScreen = 0;
      // 相机的视图矩阵是渲染那一刻才更新的。翻页刚跳完机位、这一帧还没画出来时，
      // project() 会拿上一步的视图矩阵去投 —— 投出来的坐标能到几十，一件都不在画幅里
      c.stage.camera.updateMatrixWorld(true);
      c.stage.scene.traverse((o) => {
        if (!o.isMesh || o === c.stage.backdrop || o === c.stage.ground) return;
        for (let p = o; p; p = p.parent) if (!p.visible) return;
        o.getWorldPosition(v).project(c.stage.camera);
        if (Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && v.z < 1) onScreen++;
      });
      return { id: e.current?.id, title, cam, tool, onScreen };
    });
    if (!state.id) note(vp.name, `${tag}第 ${i + 1} 步没有进入`);
    if (!state.title) note(vp.name, `${tag}第 ${i + 1} 步没有标题`);
    if (!(state.cam > 0)) note(vp.name, `${tag}第 ${i + 1} 步相机距离异常：${state.cam}`);
    if (state.tool && state.tool.dot < 0.99) {
      note(vp.name, `${tag}第 ${i + 1} 步 ${state.tool.kind} 刃口没有对着工件（dot=${state.tool.dot.toFixed(3)}）`);
    }
    if (state.tool && !state.tool.rides) {
      note(vp.name, `${tag}第 ${i + 1} 步 ${state.tool.kind} 没有可探面的工件 —— 刀会埋进料里`);
    }

    // 最少的一步（B1–B3 两块教学件）也有两件；一件都没有 = 这一步没把台子摆起来
    if (state.onScreen < 2) {
      note(vp.name, `${tag}第 ${i + 1} 步画面里只有 ${state.onScreen} 件东西`);
    }

    const paint = await framePainted();
    if (!(paint.sd > 3)) {
      note(vp.name, `${tag}第 ${i + 1} 步画面是一块纯色（亮度标准差 ${paint.sd.toFixed(2)}，均值 ${paint.mean.toFixed(0)}）`);
    }

    /*
     * 截图只在两种情况下拍：`--shots`（本地排查用，每一步都拍），
     * 以及**这一步刚记下新的问题**。
     *
     * 一张 1440×900 的软件渲染截图不便宜，三十六张能吃掉 CI 上好几分钟 ——
     * 而绿的那些跑次里没有一个人会去看它们。红的那一步反而是唯一有人看的。
     */
    if (WANT_SHOTS || failures.length > before) {
      const n = String(i + 1).padStart(2, '0');
      fs.mkdirSync(SHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(SHOT_DIR, `${vp.name}-${tag ? 'b' : ''}${n}-${state.id}.png`) });
    }
  };

  for (let i = 0; i < total; i++) await checkStep(i);

  /*
   * 倒着再走一遍（桌面画幅一遍就够）。
   *
   * 正着走时每一步都由上一步替它铺好了台子，于是「这一步自己没把台子摆全」
   * 这一类毛病一条都看不见 —— A2 从 B1 翻回来整盏灯消失，正着走十八步全绿。
   * 倒着走一遍，每一步都得自己成立。
   */
  if (!vp.isMobile) {
    for (let i = total - 1; i >= 0; i--) await checkStep(i, '倒着走 · ');
  }

  /*
   * 后处理这条管线单独验一次。
   *
   * 主线是关着 bloom 走的（见上面的注释），所以 composer 那条路要有人替它作证：
   * 走一帧、量一次，两条路给出的应当是同一幅画面。只渲染两帧，代价可以忽略。
   *
   * 这一条真正要拦的是「OutputPass 掉了」或「离屏目标不对」——
   * 那种故障下整幅会退回线性值，暗掉两三成（背景那处修掉的老问题就是 157 vs 209）。
   * 所以留 5% 的余量：高光溢出只在越过阈值的地方加亮，而夜色场景里
   * 越线的像素本来就少，两条路的舍入差摆到 1% 上下是正常的 —— 卡死在
   * 「必须更亮」上，等来的是一条随画幅浮动的假警报。
   */
  {
    await page.evaluate(() => window.__engine.goToStep('D5'));
    await settle();
    await page.evaluate(() => { window.__ctx.lantern.setLit(1); });
    const off = await framePainted(false);
    const on = await framePainted(true);
    if (!(on.sd > 3)) note(vp.name, `后处理路径画面是一块纯色（标准差 ${on.sd.toFixed(2)}）`);
    if (!(on.mean >= off.mean * 0.95)) {
      note(vp.name, `后处理路径整幅偏暗：composer ${on.mean.toFixed(1)} vs 直出 ${off.mean.toFixed(1)}`);
    }
    await page.evaluate(() => { window.__ctx.lantern.setLit(window.__ctx.state.lit ? 1 : 0); });
  }

  // ── 交互回归（桌面画幅跑一遍就够；go(n) 只进入步骤，不代表任务能走完）──
  if (!vp.isMobile) {
    // 软件渲染 + 全屏 bloom 只有个位数帧率，dt 又被钳在 0.05 ——
    // 一切按时间累计的机制都以慢镜头爬行。关掉 bloom（等价产品的低配档路径），
    // 时间类断言按此现实放宽
    await page.evaluate(() => { window.__ctx.stage.bloomEnabled = false; });
    // seq 任务在 onDone 里立即接续下一个 job，「job 为空」的窗口观察不到，
    // 给 begin 打个计数补丁，靠序号判断上一个已结束
    await page.evaluate(() => {
      const m = window.__ctx.mach;
      window.__jobSeq = 0;
      const ob = m.begin.bind(m);
      m.begin = (o) => { window.__jobSeq++; return ob(o); };
    });
    const goStep = async (id, ms = 220) => {
      await page.evaluate((s) => window.__engine.goToStep(s), id);
      await settle(ms);
    };
    // 上限只是跑飞时的兜底。C4 拆成一处一趟之后已有 6 趟，留足余量 ——
    // 撞上限会静默少跑几趟，看起来却像通过了
    const runJobs = async (label, maxJobs = 12) => {
      let ran = 0;
      for (let n = 0; n < maxJobs; n++) {
        const has = await page.waitForFunction(() => !!window.__ctx.mach.job, null, { timeout: tmo(6000) }).catch(() => null);
        // 第一轮就没有任务 —— 这一步根本没起加工，是真失败；
        // 后面几轮没有 —— 工序走完了，正常收工。原先两种情况都是静默 return，
        // 于是这条断言对「加工整个坏掉」是看不见的（装配那边的 seatAll 一直会报）
        if (!has) break;
        ran++;
        const seq = await page.evaluate(() => window.__jobSeq);
        // evaluate 会一直等页面里的 Promise —— autoRun 卡死时必须有硬超时兜底
        await page.evaluate(() => Promise.race([
          window.__ctx.mach.autoRun(),
          new Promise((r) => setTimeout(r, 20000)),
        ]));
        await page.waitForFunction((s) => !window.__ctx.mach.job || window.__jobSeq > s, seq, { timeout: tmo(25000) })
          .catch(() => note(vp.name, `${label}: 加工任务没有走完`));
        await page.waitForTimeout(tmo(220));
      }
      if (!ran) { note(vp.name, `${label}: 没有出现加工任务`); return; }
      console.log(`    [${vp.name}] ${label} 加工完成 · ${ran} 道工序`);
    };
    const seatAll = async (label) => {
      const has = await page.waitForFunction(() => !!window.__ctx.drag.session, null, { timeout: tmo(6000) }).catch(() => null);
      if (!has) { note(vp.name, `${label}: 没有出现装配任务`); return; }
      await page.evaluate(() => Promise.race([
        window.__ctx.drag.autoSeatAll(),
        new Promise((r) => setTimeout(r, 20000)),
      ]));
      await page.waitForFunction(() => !window.__ctx.drag.session?.pending?.size, null, { timeout: tmo(20000) })
        .catch(() => note(vp.name, `${label}: 装配没有完成`));
      await page.waitForTimeout(tmo(220));
      console.log(`    [${vp.name}] ${label} 装配完成`);
    };

    await goStep('C2'); await runJobs('C2');
    await goStep('C3'); await seatAll('C3');
    await goStep('C4'); await runJobs('C4');
    await goStep('C5'); await seatAll('C5');

    // C6 整步原先一条断言都没有：它的任务按钮在 onClick 里跑六道工序再起一次装配，
    // 那一串是主线上唯一「一个按钮带出一整段」的结构，最值得盯
    await goStep('C6');
    await page.evaluate(() => document.getElementById('btn-task')?.click());
    // 六道工序各 0.5 s 串着走，走完才起装配任务 —— 等它，别按秒数猜
    await page.waitForFunction(() => !!window.__ctx.drag.session, null, { timeout: tmo(20000) })
      .catch(() => note(vp.name, 'C6: 一键六道工序之后没有起装配任务'));
    await seatAll('C6');

    await goStep('C7'); await runJobs('C7');
    await goStep('C8'); await seatAll('C8');

    // 六道工序走完，上枨框必须真的带上全部工序 —— 计数器走完不代表几何跟上了
    const upperOps = await page.evaluate(() =>
      ['UB-A1', 'UB-B1'].map((id) => window.__ctx.lantern.parts.get(id).ops.size));
    if (upperOps.some((n) => n < 4)) note(vp.name, `C6 之后上枨框工序数偏少：${upperOps.join(' / ')}`);

    /*
     * 需要动手的一步：一下「下一步」做一段，做完最后一段才翻页。
     * 三条一起钉 —— 只验「装完了」不验「一下只装一件」，一口气全做完那版照样是绿的。
     *
     * 必须从别的步骤进来：`goToStep` 对当前所在的这一步是空操作，
     * 接着上一段直接再来一次，验的会是一个已经装完的步骤。
     */
    await goStep('C5');
    const navNext = () => page.evaluate(() => document.getElementById('nav-next').click());
    const rested = () => page.waitForFunction(
      () => !window.__engine.helping && !window.__engine.busy, null, { timeout: tmo(30000) })
      .catch(() => note(vp.name, 'C5：按下「下一步」之后这一段没有落地'));
    const nav = async () => {
      await navNext(); await rested(); await page.waitForTimeout(tmo(220));
      return page.evaluate(() => ({
        id: window.__engine.current?.id,
        left: window.__ctx.drag.session?.pending?.size ?? 0,
        done: window.__engine.taskDone,
      }));
    };
    const pend = await page.evaluate(() => window.__ctx.drag.session?.pending?.size ?? 0);
    if (pend !== 2) note(vp.name, `C5 应有 2 件待装，实际 ${pend} —— 下面三条不作数`);
    const one = await nav();
    if (one.id !== 'C5' || one.left !== 1) {
      note(vp.name, `C5：第一下应只装一件、且不翻页，实际停在 ${one.id}、还剩 ${one.left} 件`);
    }
    const two = await nav();
    if (two.id !== 'C5' || two.left !== 0 || !two.done) {
      note(vp.name, `C5：第二下应装完另一件、仍不翻页，实际停在 ${two.id}、还剩 ${two.left} 件`);
    }
    await navNext();
    await settle(220);
    const landed = await page.evaluate(() => window.__engine.current?.id);
    if (landed !== 'C6') note(vp.name, `C5 装完再按「下一步」应到 C6，实际 ${landed}`);

    // 快速翻页：上一步的僵尸回调不能落到下一步上
    await page.evaluate(() => { window.__engine.go(17); window.__engine.go(2); window.__engine.go(9); });
    await settle(400);
    await page.evaluate(() => window.__engine.go(0));
    await settle(400);
    const settled = await page.evaluate(() => window.__engine.current?.id);
    if (settled !== 'A1') note(vp.name, `快速翻页后应停在 A1，实际 ${settled}`);

    // 门是 openHub() 现渲染的。原先直接 `?.click()`，门还没挂上时这一下**静默落空** ——
    // 机器一慢，M3 那串「没有愿望列表 / 海报没生成 / 海报空白」全是同一次空点击的余波，
    // 报出来的却是三条互不相干的故障。先等门出现，再点。
    const openDoor = async (id) => {
      const ok = await page.waitForSelector(`.door[data-m="${id}"]`, { timeout: tmo(8000) }).catch(() => null);
      if (!ok) { note(vp.name, `${id}: 收尾没有出现这扇门`); return false; }
      await page.evaluate((m) => document.querySelector(`.door[data-m="${m}"]`).click(), id);
      return true;
    };

    // M1 长按引火：低帧率下点满一圈要几十秒，只断言「按住确实在积累亮度」
    await goStep('D5', 400);
    if (await openDoor('M1')) {
      await page.waitForSelector('#fire', { timeout: tmo(8000) }).catch(() => null);
      const fireBox = await page.locator('#fire').boundingBox().catch(() => null);
      if (fireBox) {
        await page.mouse.move(fireBox.x + fireBox.width / 2, fireBox.y + fireBox.height / 2);
        await page.mouse.down();
        const litOk = await page.waitForFunction(() => window.__ctx.lantern.litLevel > 0.001 || window.__ctx.state.lit, null, { timeout: tmo(15000) })
          .then(() => true).catch(() => false);
        await page.mouse.up();
        if (!litOk) note(vp.name, 'M1 按住引火没有反应');
      } else note(vp.name, 'M1 没有出现点灯按钮');
    }
    await page.evaluate(() => document.getElementById('btn-back')?.click());
    await page.waitForTimeout(900);

    /*
     * M3 海报：画面区域必须真的截到灯笼，不能是空白。
     *
     * 这一段的每一下都是「先 waitForSelector 断言它在，再进 evaluate 里点」——
     * 与本文件其余各处一致，不用 `page.click()`。后者要等元素「稳住」才肯落点，
     * 而卷有 480 ms 入场、卡片还有悬停位移；两种画幅并行 + 软件渲染时帧率只有个位数，
     * 稳定判定动辄好几秒。原先「选愿望 5 秒 / 点写上去 3 秒且失败被吞掉」就卡在这里：
     * 报出来的是下游的「海报没有生成 / 海报空白」两条，指向完全错误的地方。
     */
    if (await openDoor('M3')) {
      const wishes = await page.waitForSelector('.wish', { timeout: tmo(10000) }).catch(() => null);
      if (!wishes) note(vp.name, 'M3 没有出现愿望列表');
      await page.evaluate(() => document.querySelector('.wish')?.click());

      // 「写上去」在选中愿望之前是禁用的
      const go = await page.waitForSelector('#go:not([disabled])', { timeout: tmo(10000) }).catch(() => null);
      if (!go) note(vp.name, 'M3 选了愿望之后「写上去」仍然不可点');
      await page.evaluate(() => document.querySelector('#go')?.click());

      // 落笔那一页认它自己的画布；点「写快一点」跳过逐字，低帧率下才等得完
      const pad = await page.waitForSelector('#ink', { timeout: tmo(15000) }).catch(() => null);
      if (!pad) note(vp.name, 'M3 没有进入落笔那一页');
      await page.evaluate(() => {
        document.querySelectorAll('#overlay button').forEach((b) => { if (b.textContent.includes('写快一点')) b.click(); });
      });
      await page.waitForSelector('img.poster', { timeout: tmo(60000) })
        .catch(() => note(vp.name, 'M3 海报没有生成'));
      const posterOk = await page.evaluate(async () => {
        const img = document.querySelector('img.poster');
        if (!img) return false;
        await img.decode();
        const cv = document.createElement('canvas');
        cv.width = 64; cv.height = 64;
        const g = cv.getContext('2d');
        // 采样海报中部（灯笼截图的落点）：空白只剩纯渐变，亮度方差趋近 0
        g.drawImage(img, 0, img.naturalHeight * 0.22, img.naturalWidth, img.naturalHeight * 0.4, 0, 0, 64, 64);
        const d = g.getImageData(0, 0, 64, 64).data;
        let sum = 0, sq = 0;
        const n = d.length / 4;
        for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; sum += l; sq += l * l; }
        const mean = sum / n;
        return Math.sqrt(sq / n - mean * mean) > 6;
      }).catch(() => false);
      if (!posterOk) note(vp.name, 'M3 海报的画面区域是空白（截图前没有渲染）');
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(tmo(900));

    // ── M2 猜灯谜：五题走完要到结算页，并且真的加过亮度 ──
    if (await openDoor('M2')) {
      let asked = 0;
      for (let q = 0; q < 6; q++) {
        const has = await page.waitForSelector('.opt', { timeout: tmo(8000) }).catch(() => null);
        if (!has) break;
        asked++;
        await page.evaluate(() => document.querySelector('.opt')?.click());
        await page.waitForTimeout(tmo(500));
        // 答完必须给出解释，且「下一题」要出现 —— 不出现就是这一屏走不下去
        const answered = await page.evaluate(() => ({
          why: (document.getElementById('ans')?.textContent || '').trim().length,
          next: !document.getElementById('next')?.hidden,
        }));
        if (!answered.why) note(vp.name, `M2 第 ${asked} 题答完没有给解释`);
        if (!answered.next) note(vp.name, `M2 第 ${asked} 题答完没有出现「下一题」`);
        await page.evaluate(() => document.getElementById('next')?.click());
        await page.waitForTimeout(tmo(500));
      }
      if (asked !== 5) note(vp.name, `M2 应有 5 题，实际走了 ${asked} 题`);
      const done = await page.evaluate(() => !!window.__ctx.state.modulesDone?.M2);
      if (!done) note(vp.name, 'M2 走完五题没有记成完成');
      await page.evaluate(() => document.getElementById('btn-back')?.click());
      await page.waitForTimeout(tmo(900));
    }

    // ── M4 挂起来：挂一盏、拍一张、全部收起 ──
    if (await openDoor('M4')) {
      const clickDock = (text) => page.evaluate((t) => {
        const b = [...document.querySelectorAll('.dock button')].find((x) => x.textContent.includes(t));
        if (b) b.click();
        return !!b;
      }, text);
      if (!await clickDock('挂一盏')) note(vp.name, 'M4 没有出现「挂一盏」');
      await page.waitForTimeout(tmo(900));
      const hung = await page.evaluate(() => ({
        done: !!window.__ctx.state.modulesDone?.M4,
        kids: window.__ctx.stage.scene.children.length,
      }));
      if (!hung.done) note(vp.name, 'M4 挂上一盏之后没有记成完成');
      if (!await clickDock('全部收起')) note(vp.name, 'M4 没有出现「全部收起」');
      await page.waitForTimeout(tmo(700));
      const after = await page.evaluate(() => window.__ctx.stage.scene.children.length);
      if (after >= hung.kids) note(vp.name, `M4「全部收起」没有把挂上去的收掉（${hung.kids} → ${after}）`);
      await page.evaluate(() => document.getElementById('btn-back')?.click());
      await page.waitForTimeout(tmo(900));
    }
  }

  // 四个互动模块的入口
  await page.evaluate(() => window.__engine.goToStep('D5'));
  await page.waitForTimeout(tmo(1200));
  await page.evaluate(() => window.__ctx.openHub());
  await page.waitForTimeout(tmo(700));
  const doors = await page.$$eval('.door', (els) => els.length);
  if (doors !== 4) note(vp.name, `收尾应有 4 个入口，实际 ${doors} 个`);

  /*
   * 主题切换：两套颜色都要能落到页面上。
   *
   * 这一段原先跑在 D5 上 —— 而 D5 是夜色场景，界面被 setTone('dark') 压着，
   * 于是「深色」恒过、「浅色」被那句注释豁免，两条断言实际上都是空的。
   * 换到一个跟主题走的步骤（C1，studio）上验，两套都要真的换过去。
   */
  await page.evaluate(() => window.__engine.goToStep('C1'));
  await page.waitForTimeout(tmo(900));
  for (const theme of ['dark', 'light']) {
    await page.evaluate((t) => window.__ctx.hud.setTheme(t), theme);
    await page.waitForTimeout(tmo(400));
    const got = await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
      meta: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
    }));
    if (got.theme !== theme) note(vp.name, `切到${theme === 'dark' ? '深' : '浅'}色失败，实际是 ${got.theme}`);
    if (got.meta !== got.bg) note(vp.name, `地址栏配色没跟上主题：meta=${got.meta} --bg=${got.bg}`);
  }

  console.log(`  ${vp.name} ${vp.width}×${vp.height} · ${total} 步走完`);
  await ctx.close();
}

await Promise.all(VIEWPORTS.map(walk));

await browser.close();
await server?.close();

console.log('');
if (failures.length) {
  console.error(`冒烟测试未通过 · ${failures.length} 项`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('冒烟测试通过 · 无控制台报错、无资源缺失、十八步全部可达');
if (WANT_SHOTS) console.log(`截图 → ${SHOT_DIR}`);
