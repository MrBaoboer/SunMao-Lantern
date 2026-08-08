/**
 * 重出 README 的五张图 —— 全部从**构建产物**里拍，图和实现不会各说各话。
 *
 *   npm run build && node tools/shots.mjs
 *   node tools/shots.mjs hero          只重出其中一张
 *   node tools/shots.mjs --url http://…  对着已经起好的地址拍
 *
 * 需要 Chromium：npx playwright install chromium
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const argv = process.argv.slice(2);
const opt = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const only = argv.filter((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--url');

const OUT = path.resolve('docs/img');

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('缺少 playwright。先装依赖，再装浏览器内核：');
  console.error('  npm install');
  console.error('  npx playwright install chromium');
  process.exit(2);
}

let server = null;
let base = opt('--url', '');
if (!base) {
  if (!fs.existsSync('dist/index.html')) {
    console.error('没有 dist/。先跑 npm run build。');
    process.exit(2);
  }
  const { preview } = await import('vite');
  server = await preview({ preview: { port: 4180, strictPort: false } });
  base = server.resolvedUrls.local[0];
}

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

/**
 * 开一页并走到「已进入主线」的状态。
 *
 * 必须真的按下「开始做灯」：封面挂着一个每帧改写推荐机位的自转 updater，
 * 只把封面藏起来它照样在跑，之后任何 setRecommended 都会被它逐帧覆盖 ——
 * 拍出来永远是封面那个机位。按下按钮才会把它摘掉。
 */
async function open({ width, height, isMobile = false }) {
  const ctx = await browser.newContext({
    viewport: { width, height }, isMobile, hasTouch: isMobile,
  });
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__engine, null, { timeout: 30000 });
  await page.waitForSelector('#cv-go', { timeout: 15000 });
  await page.click('#cv-go');
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelector('.overlay .btn-primary')?.click());
  await page.waitForTimeout(600);
  return { ctx, page };
}

const shot = async (page, name) => {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`  ${name}.png`);
};

const want = (n) => !only.length || only.includes(n);

/**
 * 两张成品图共用的摆盘：整盏灯做完、装齐、界面全部退场，再按给定基调与机位站好。
 *
 * az 一律取 58 而不是贴着 45° 的角：正对 45° 时近处那根角柱正好立在画面中轴上，
 * 把垂在灯笼正中的穗子挡掉九成。偏开 13°，「福」这一面接近正对、圆圈是圆的，
 * 鱼那一面还看得清，穗子也整条露出来。
 */
async function finished(page, o) {
  await page.evaluate((o) => {
    const c = window.__ctx;
    c.hud.showChrome(false);
    c.hud.quiet(true);
    c.hud.hideOverlay();
    // 开场那一步在远处撒了一圈「灯河」光点精灵，会在画面边角留下橙色斑
    c.stage.scene.traverse((s) => { if (s.isSprite) s.visible = false; });
    c.hud.setTheme('dark');
    c.stage.setMood(o.mood);

    c.lantern.attachAll();
    c.lantern.showOnly(null);
    c.lantern.allFinished();
    for (const p of c.lantern.parts.values()) p.installed = true;
    c.lantern.applyAssembly();
    c.lantern.showPanels(true);
    c.lantern.showDecor(true);
    c.lantern.core.visible = true;
    c.lantern.setLit(o.lit);

    c.stage.setRecommended({
      az: 58, el: o.el, dist: o.dist,
      target: new (c.stage.camera.position.constructor)(0, 0, o.tz),
      fit: o.fit,
    });
    c.stage.snapToRecommended();
  }, o);
  await page.waitForTimeout(2600);
}

// ── hero：点亮之后的夜景（首图）────────────────────────────
// night 是唯一开地面的一档基调（stage.js 的 MOODS.fixed），格心纹样作为
// 聚光灯 cookie 落在地上 —— 灯上的棂条和地上的光斑是同一份线段数据。
if (want('hero')) {
  const { ctx, page } = await open({ width: 1400, height: 880 });
  // 目标点压到 80、机位抬到 18°，为的是把地上那片光斑收进画面；
  // 再高就会从顶口直视灯芯，亮斑抢戏。
  await finished(page, { lit: 1, mood: 'night', el: 18, dist: 470, tz: 80, fit: { r: 110, h: 130 } });
  await shot(page, 'hero');
  await ctx.close();
}

// ── unlit：不点灯的完整灯笼 ───────────────────────────────
// 点亮之后木作被光晕吃掉大半，所以另留一张不点灯的：榫头、格心、绵纸都看得清。
if (want('unlit')) {
  const { ctx, page } = await open({ width: 1400, height: 880 });
  // dusk 而不是 studio：studio 的键光把木料打到发白，红「福」也跟着掉色。
  // dusk 压暗环境、留住暖调，木头是琥珀色的，糊上的绵纸反而更白。
  // el 12 / dist 430 是「四根出头的榫和穗子都不出画」的前提下能站到的最近处。
  await finished(page, { lit: 0, mood: 'dusk', el: 12, dist: 430, tz: 96, fit: { r: 98, h: 112 } });
  await shot(page, 'unlit');
  await ctx.close();
}

// ── craft：拖凿子在顺枨顶面开榫槽 ─────────────────────────
if (want('craft')) {
  const { ctx, page } = await open({ width: 1200, height: 800 });
  await page.evaluate(() => window.__engine.goToStep('C2'));
  await page.waitForTimeout(2600);
  await shot(page, 'craft');
  await ctx.close();
}

// ── exploded：三十六件构件的分层拆解 ──────────────────────
if (want('exploded')) {
  const { ctx, page } = await open({ width: 1200, height: 800 });
  await page.evaluate(() => window.__engine.goToStep('D4'));
  // D4 进场自带一段 3 秒的展开补间，等它走完再拍
  await page.waitForTimeout(6000);
  await shot(page, 'exploded');
  await ctx.close();
}

// ── mobile：竖屏下的第一步，整盏灯完整在画面里 ────────────
if (want('mobile')) {
  const { ctx, page } = await open({ width: 390, height: 844, isMobile: true });
  await page.evaluate(() => window.__engine.goToStep('A1'));
  await page.waitForTimeout(3000);
  await shot(page, 'mobile');
  await ctx.close();
}

await browser.close();
await server?.close();
console.log(`→ ${OUT}`);
