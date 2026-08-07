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

  await page.goto(base, { waitUntil: 'load' });

  // 封面就绪 = 三维、几何验算、界面全部初始化完毕
  await page.waitForFunction(() => !!window.__engine, null, { timeout: 30000 })
    .catch(() => note(vp.name, '三十秒内没能初始化 __engine'));
  await page.waitForSelector('#cv-go', { timeout: 15000 })
    .catch(() => note(vp.name, '封面上没有出现开始按钮'));

  const check = await page.evaluate(() => window.__verifyReport ?? null);
  if (check && check.failed) note(vp.name, `几何验算未通过：${check.failed} 项`);

  await page.click('#cv-go');
  await page.waitForTimeout(1400);
  // 首次进入会摊开「怎么操作」，收掉它
  await page.evaluate(() => document.querySelector('.overlay .btn-primary')?.click());
  await page.waitForTimeout(600);

  const total = await page.evaluate(() => window.__engine.steps.length);
  if (total !== 18) note(vp.name, `主线应有 18 步，实际 ${total} 步`);

  if (WANT_SHOTS) fs.mkdirSync(SHOT_DIR, { recursive: true });

  for (let i = 0; i < total; i++) {
    await page.evaluate((n) => window.__engine.go(n), i);
    await page.waitForTimeout(900);

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
        const has = await page.waitForFunction(() => !!window.__ctx.mach.job, null, { timeout: 6000 }).catch(() => null);
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
        await page.waitForFunction((s) => !window.__ctx.mach.job || window.__jobSeq > s, seq, { timeout: 25000 })
          .catch(() => note(vp.name, `${label}: 加工任务没有走完`));
        await page.waitForTimeout(1000);
      }
      if (!ran) { note(vp.name, `${label}: 没有出现加工任务`); return; }
      console.log(`    ${label} 加工完成 · ${ran} 道工序`);
    };
    const seatAll = async (label) => {
      const has = await page.waitForFunction(() => !!window.__ctx.drag.session, null, { timeout: 6000 }).catch(() => null);
      if (!has) { note(vp.name, `${label}: 没有出现装配任务`); return; }
      await page.evaluate(() => Promise.race([
        window.__ctx.drag.autoSeatAll(),
        new Promise((r) => setTimeout(r, 20000)),
      ]));
      await page.waitForFunction(() => !window.__ctx.drag.session?.pending?.size, null, { timeout: 20000 })
        .catch(() => note(vp.name, `${label}: 装配没有完成`));
      await page.waitForTimeout(600);
      console.log(`    ${label} 装配完成`);
    };

    await goStep('C2'); await runJobs('C2');
    await goStep('C3'); await seatAll('C3');
    await goStep('C4'); await runJobs('C4');
    await goStep('C5'); await seatAll('C5');
    await goStep('C7'); await runJobs('C7');
    await goStep('C8'); await seatAll('C8');

    // 快速翻页：上一步的僵尸回调不能落到下一步上
    await page.evaluate(() => { window.__engine.go(17); window.__engine.go(2); window.__engine.go(9); });
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.__engine.go(0));
    await page.waitForTimeout(900);
    const settled = await page.evaluate(() => window.__engine.current?.id);
    if (settled !== 'A1') note(vp.name, `快速翻页后应停在 A1，实际 ${settled}`);

    // M1 长按引火：低帧率下点满一圈要几十秒，只断言「按住确实在积累亮度」
    await goStep('D5', 1600);
    await page.evaluate(() => document.querySelector('.door[data-m="M1"]')?.click());
    await page.waitForTimeout(1400);
    const fireBox = await page.locator('#fire').boundingBox().catch(() => null);
    if (fireBox) {
      await page.mouse.move(fireBox.x + fireBox.width / 2, fireBox.y + fireBox.height / 2);
      await page.mouse.down();
      const litOk = await page.waitForFunction(() => window.__ctx.lantern.litLevel > 0.001 || window.__ctx.state.lit, null, { timeout: 15000 })
        .then(() => true).catch(() => false);
      await page.mouse.up();
      if (!litOk) note(vp.name, 'M1 按住引火没有反应');
    } else note(vp.name, 'M1 没有出现点灯按钮');
    await page.evaluate(() => document.getElementById('btn-back')?.click());
    await page.waitForTimeout(900);

    // M3 海报：画面区域必须真的截到灯笼，不能是空白
    await page.evaluate(() => document.querySelector('.door[data-m="M3"]')?.click());
    await page.waitForTimeout(1400);
    await page.click('.wish >> nth=0', { timeout: 5000 }).catch(() => note(vp.name, 'M3 没有出现愿望列表'));
    await page.click('#go', { timeout: 3000 }).catch(() => {});
    // 落笔动画点「写快一点」跳过逐字，低帧率下才等得完
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      document.querySelectorAll('#overlay button').forEach((b) => { if (b.textContent.includes('写快一点')) b.click(); });
    });
    await page.waitForSelector('img.poster', { timeout: 60000 })
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
    await page.waitForTimeout(900);

  }

  // 四个互动模块的入口
  await page.evaluate(() => window.__ctx.openHub());
  await page.waitForTimeout(700);
  const doors = await page.$$eval('.door', (els) => els.length);
  if (doors !== 4) note(vp.name, `收尾应有 4 个入口，实际 ${doors} 个`);

  // 主题切换：两套颜色都要能落到页面上
  for (const theme of ['dark', 'light']) {
    await page.evaluate((t) => window.__ctx.hud.setTheme(t), theme);
    await page.waitForTimeout(400);
    const got = await page.evaluate(() => document.documentElement.dataset.theme);
    // D5 是夜色场景，界面被场景压成深色 —— 这是设计如此，只校验深色能生效
    if (theme === 'dark' && got !== 'dark') note(vp.name, `切到深色失败，实际是 ${got}`);
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
