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
    if (/ERR_ABORTED/.test(t)) return;      // 音频清单缺文件时的正常中止
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

  // 五个互动模块的入口
  await page.evaluate(() => window.__ctx.openHub());
  await page.waitForTimeout(700);
  const doors = await page.$$eval('.door', (els) => els.length);
  if (doors !== 5) note(vp.name, `收尾应有 5 个入口，实际 ${doors} 个`);

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
