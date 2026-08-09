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

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, isMobile: false },
  { name: 'mobile', width: 390, height: 844, isMobile: true },
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

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.isMobile,
    hasTouch: vp.isMobile,
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

  await page.click('#cv-go');
  // 「开始做灯」到第一步之间有几段固定等待（封面退场 480 ms + 引导页）——
  // 这几处也得过 tmo()，CI 上慢一个量级时落空会让 engine.go(0) 根本没执行
  await page.waitForTimeout(tmo(1400));
  // 首次进入会摊开「怎么操作」，收掉它
  await page.evaluate(() => document.querySelector('.overlay .btn-primary')?.click());
  await page.waitForTimeout(tmo(600));

  const total = await page.evaluate(() => window.__engine.steps.length);
  if (total !== 18) note(vp.name, `主线应有 18 步，实际 ${total} 步`);

  /*
   * 画面真的画出来了吗。
   *
   * 走完十八步只证明脚本没抛错。着色器编译失败、材质全黑、相机在物体内部 ——
   * 这些都会让 canvas 变成一块纯色，而整套断言一条都不会响。
   * 取 canvas 缩略图的亮度标准差：一块纯色趋近 0，有木头有背景则明显大于 0。
   */
  const framePainted = async () => page.evaluate(() => {
    const s = window.__ctx.stage;
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
    return { sd: Math.sqrt(Math.max(0, sq / n - mean * mean)), mean };
  });

  if (WANT_SHOTS) fs.mkdirSync(SHOT_DIR, { recursive: true });

  for (let i = 0; i < total; i++) {
    await page.evaluate((n) => window.__engine.go(n), i);
    await page.waitForTimeout(tmo(900));

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
        tool = { kind: c.mach.tool.userData.kind, dot: edge.dot(attack) };
      }
      return { id: e.current?.id, title, cam, tool };
    });
    if (!state.id) note(vp.name, `第 ${i + 1} 步没有进入`);
    if (!state.title) note(vp.name, `第 ${i + 1} 步没有标题`);
    if (!(state.cam > 0)) note(vp.name, `第 ${i + 1} 步相机距离异常：${state.cam}`);
    if (state.tool && state.tool.dot < 0.99) {
      note(vp.name, `第 ${i + 1} 步 ${state.tool.kind} 刃口没有对着工件（dot=${state.tool.dot.toFixed(3)}）`);
    }

    const paint = await framePainted();
    if (!(paint.sd > 3)) {
      note(vp.name, `第 ${i + 1} 步画面是一块纯色（亮度标准差 ${paint.sd.toFixed(2)}，均值 ${paint.mean.toFixed(0)}）`);
    }

    if (WANT_SHOTS) {
      const n = String(i + 1).padStart(2, '0');
      await page.screenshot({ path: path.join(SHOT_DIR, `${vp.name}-${n}-${state.id}.png`) });
    }
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
    const goStep = async (id, ms = 1100) => {
      await page.evaluate((s) => window.__engine.goToStep(s), id);
      await page.waitForTimeout(ms);
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
        await page.waitForTimeout(1000);
      }
      if (!ran) { note(vp.name, `${label}: 没有出现加工任务`); return; }
      console.log(`    ${label} 加工完成 · ${ran} 道工序`);
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
      await page.waitForTimeout(600);
      console.log(`    ${label} 装配完成`);
    };

    await goStep('C2'); await runJobs('C2');
    await goStep('C3'); await seatAll('C3');
    await goStep('C4'); await runJobs('C4');
    await goStep('C5'); await seatAll('C5');

    // C6 整步原先一条断言都没有：它的任务按钮在 onClick 里跑六道工序再起一次装配，
    // 那一串是主线上唯一「一个按钮带出一整段」的结构，最值得盯
    await goStep('C6');
    await page.evaluate(() => document.getElementById('btn-task')?.click());
    await page.waitForTimeout(tmo(4200));
    await seatAll('C6');

    await goStep('C7'); await runJobs('C7');
    await goStep('C8'); await seatAll('C8');

    // 六道工序走完，上枨框必须真的带上全部工序 —— 计数器走完不代表几何跟上了
    const upperOps = await page.evaluate(() =>
      ['UB-A1', 'UB-B1'].map((id) => window.__ctx.lantern.parts.get(id).ops.size));
    if (upperOps.some((n) => n < 4)) note(vp.name, `C6 之后上枨框工序数偏少：${upperOps.join(' / ')}`);

    // 快速翻页：上一步的僵尸回调不能落到下一步上
    await page.evaluate(() => { window.__engine.go(17); window.__engine.go(2); window.__engine.go(9); });
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.__engine.go(0));
    await page.waitForTimeout(900);
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
    await goStep('D5', 1600);
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

    // M3 海报：画面区域必须真的截到灯笼，不能是空白
    await openDoor('M3');
    await page.click('.wish >> nth=0', { timeout: tmo(5000) }).catch(() => note(vp.name, 'M3 没有出现愿望列表'));
    await page.click('#go', { timeout: tmo(3000) }).catch(() => {});
    // 落笔动画点「写快一点」跳过逐字，低帧率下才等得完
    await page.waitForTimeout(800);
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
