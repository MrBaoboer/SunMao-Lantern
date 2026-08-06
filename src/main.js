import './styles.css';
import * as THREE from 'three';

import { Stage } from './render/stage.js';
import { Lantern } from './render/lantern.js';
import { ChipBurst, Ripples, EnergyRing, Fireworks, detectTier } from './render/fx.js';
import { state } from './core/state.js';
import { runVerification, formatReport } from './core/verify.js';
import { HUD, Arrows } from './ui/hud.js';
import { icon } from './ui/icons.js';
import { SFX, unlockAudio } from './audio/sfx.js';
import { BGM } from './audio/bgm.js';
import { VoiceTrack } from './audio/voice.js';
import { DragAssembly } from './interact/assembly.js';
import { Machining } from './interact/machining.js';
import { Engine } from './app/engine.js';
import { tick as tickTweens } from './util/tween.js';
import { makeSimpleDrag } from './steps/util.js';
import { act1 } from './steps/act1.js';
import { act3 } from './steps/act3.js';
import { act4 } from './steps/act4.js';
import { openM1, openM2 } from './modules/m1-m2.js';
import { openM3, openM4, openM5 } from './modules/m3-m5.js';
import { installDevShot } from './devshot.js';

/**
 * 模块里的旁白。它们不在步骤表里，单独登记，好让配音稿一次导全。
 * 文案与 modules/*.js 里的 voice.play 保持一致。
 */
const MODULE_VO = [
  { id: 'M1', title: 'M1 点亮之后', cps: 3.6, text: '亮了。\n光从绵纸里透出来，被木头挡成一格一格的 —— 这就是你选的那个花纹。\n（停顿 1.0 s）\n看地上。' },
  { id: 'M2-1', title: 'M2 谜面一', cps: 3.5, text: '麻屋子，红帐子，里面住着一个白胖子' },
  { id: 'M2-2', title: 'M2 谜面二', cps: 3.5, text: '千条线，万条线，落到水里看不见' },
  { id: 'M2-3', title: 'M2 谜面三', cps: 3.5, text: '身子矮矮，肚里有火，越烧越短，烧完就没' },
  { id: 'M2-4', title: 'M2 谜面四', cps: 3.5, text: '有面没有口，有脚没有手，四只脚站着，自己不会走' },
  { id: 'M2-5', title: 'M2 谜面五', cps: 3.5, text: '不用一钉，不用一胶，一凹一凸，两木咬牢' },
  { id: 'M2-fin', title: 'M2 知识闭环', cps: 3.5, text: '这一题你答得出来，是因为前面那些步骤你都看过了。\n不用一根钉，不用一滴胶 —— 一凹，一凸，两块木头就咬死了。\n这就是榫卯。' },
  { id: 'M4', title: 'M4 挂灯笼', cps: 3.8, text: '把它挂起来。\n转一转视角，找个喜欢的位置，点一下就挂上去。\n（气口）\n想挂几盏都行。绕着走一圈 —— 从不同角度看，它是不一样的。\n拍张照吧。这是你做的。' },
  { id: 'M5', title: 'M5 入场', cps: 3.8, text: '最后，放烟花。\n点一下，划一下，画个圈，放出来的花都不一样。\n试试看。' },
  { id: 'M5-fu', title: 'M5 福字', cps: 4.2, text: '哎 —— 是个「福」字。' },
  { id: 'M5-outro', title: 'M5 片尾', cps: 3.3, text: '烟花放完了，灯还亮着。\n（停顿 1.0 s）\n十三根木条，零颗钉子。\n这套办法，我们用了七千年。\n（停顿 1.5 s）\n新年快乐。' },
];

/** 五道门 */
const DOORS = [
  { id: 'M1', ico: 'flame', nm: '点灯', ds: '把这盏灯点亮', open: openM1 },
  { id: 'M2', ico: 'slip', nm: '猜灯谜', ds: '答对一个，灯亮一分', open: openM2 },
  { id: 'M3', ico: 'brush', nm: '写心愿', ds: '写在灯上，存成一张画', open: openM3 },
  { id: 'M4', ico: 'lantern', nm: '挂起来', ds: '挂到你想挂的地方', open: openM4 },
  { id: 'M5', ico: 'firework', nm: '放烟花', ds: '点一下，划一下，画个圈', open: openM5 },
];

const boot = document.getElementById('boot');
const bar = boot.querySelector('.boot-line i');
const bootMsg = document.getElementById('boot-msg');
const progress = (p, msg) => {
  bar.style.width = `${Math.round(p * 100)}%`;
  if (msg) bootMsg.textContent = msg;
};
const frame = () => new Promise((r) => setTimeout(r, 16));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const tier = detectTier();

  const stage = new Stage(document.getElementById('stage'));
  stage.setTheme(state.theme);
  stage.setMood('craft');
  if (tier === 'low') { stage.bloomEnabled = false; stage.renderer.shadowMap.enabled = false; }
  progress(0.2, '正在架设工作台');
  await frame();

  // 几何闭合验算：加载即跑，不通过则在控制台高亮
  const report = runVerification();
  const bad = report.filter((r) => !r.ok);
  console.groupCollapsed(
    `%c榫卯灯笼 · 几何闭合验算  ${report.length - bad.length}/${report.length}`,
    `color:${bad.length ? '#e0776f' : '#a8802f'};font-weight:bold`,
  );
  for (const r of report) {
    console.log(`%c${r.ok ? '✓' : '✗'} [${r.code}] ${r.title}`,
      `color:${r.ok ? '#4f8a55' : '#c25a4e'}`, r.detail || '');
  }
  console.groupEnd();

  progress(0.45, '正在下料');
  await frame();

  const lantern = new Lantern(stage, state);
  progress(0.72, '正在开榫凿卯');
  await frame();

  const hud = new HUD(state);
  const bgm = new BGM(state, SFX);
  const voice = new VoiceTrack(state, hud);
  const guides = new Arrows();
  const fx = {
    chips: new ChipBurst(stage.scene, tier),
    ripples: new Ripples(stage.scene),
    ring: new EnergyRing(stage.scene),
    fireworks: new Fireworks(stage.scene, tier),
    tier,
  };

  /** 全片共享上下文 */
  const ctx = { stage, lantern, hud, sfx: SFX, bgm, voice, state, fx, guides, tier };
  ctx.drag = new DragAssembly(ctx);
  ctx.mach = new Machining(ctx);
  ctx.simpleDrag = makeSimpleDrag(ctx);

  await Promise.all([voice.loadManifest(), bgm.loadManifest()]);

  progress(0.9, '正在合龙');
  await frame();

  const engine = new Engine(ctx);
  engine.setSteps([...act1(ctx), ...act3(ctx), ...act4(ctx)]);

  // ── 五道门 ──
  ctx.openHub = () => {
    const done = state.modulesDone || {};
    const n = DOORS.filter((d) => done[d.id]).length;
    hud.dock({
      body: `<div class="doors">${DOORS.map((m) => `
        <button class="door" type="button" data-m="${m.id}">
          ${done[m.id] ? '<span class="seal">成</span>' : ''}
          <span class="door-ic">${icon(m.ico)}</span>
          <span class="door-nm">${m.nm}</span>
          <span class="door-ds">${m.ds}</span>
        </button>`).join('')}</div>`,
      onMount: (o) => {
        o.querySelectorAll('.door').forEach((b) => {
          b.addEventListener('click', () => {
            const m = DOORS.find((x) => x.id === b.dataset.m);
            SFX.play('UI_TAP');
            hud.hideOverlay();
            hud.showChrome(false);
            m.open(ctx, () => {
              hud.showChrome(true);
              SFX.play('SUCCESS', { gain: 0.7 });
              ctx.openHub();
            });
          });
        });
      },
    });
    hud.setCue(n ? `五件事，做完了 <b>${n}</b> 件` : '想先做哪个都行');
  };

  // ── 尺寸对照 ──
  // 这盏灯的几何是按一套尺寸算出来的，打开页面时自己核对一遍。
  // 这里只挑几条人看得懂的说，完整结果在控制台。
  const showCheck = () => {
    const { pass, total } = formatReport(report);
    const clash = report.find((r) => r.code === 'CLASH');
    const spec = [
      ['木条截面', '12 毫米'],
      ['其余所有尺寸', '它的整数倍'],
      ['榫头穿透后露出', '6 毫米'],
      ['上槽 / 下槽', '6 / 2 毫米'],
      ['细颈截面', '柱身的四分之一'],
    ];
    hud.sheet({
      title: '严丝合缝',
      lede: '这盏灯的每一个尺寸，都是同一个数算出来的',
      body: `<div class="spec">
        ${spec.map(([k, v]) => `<div class="sp"><span>${k}</span><i></i><b>${v}</b></div>`).join('')}
        <div class="sp sum"><span>零件相碰之处</span><i></i><b>${clash?.ok ? '0' : '有'}</b></div>
      </div>
      <p class="verdict">${icon('check')}<span>每次打开自动核对 · ${pass} / ${total} 项通过</span></p>`,
      actions: [{ label: '知道了', kind: 'primary', on: () => {
        hud.hideOverlay();
        if (engine.current?.id === 'D5') ctx.openHub();
      } }],
    });
  };
  hud.onCheck = showCheck;

  // ── 拆开看看：任意时刻剖切与拆解 ──
  let inspecting = false;
  const setSeeThrough = (k) => {
    for (const p of lantern.parts.values()) {
      p.material.transparent = k > 0;
      p.material.opacity = 1 - k * 0.8;
      p.material.depthWrite = k < 0.5;
      p.material.needsUpdate = true;
    }
  };
  hud.onInspect = () => {
    inspecting = !inspecting;
    if (!inspecting) {
      lantern.setSection(null, false);
      lantern.setExplode(0, 'layered');
      setSeeThrough(0);
      hud.hideOverlay();
      return;
    }
    hud.dock({
      body: `<div class="slider"><span>拆开</span><input id="ins-x" type="range" min="0" max="100" value="0" aria-label="拆开"></div>
             <div class="slider"><span>透明</span><input id="ins-s" type="range" min="0" max="100" value="0" aria-label="透明"></div>`,
      actions: [{ label: '收起', on: () => hud.onInspect() }],
      onMount: (o) => {
        o.querySelector('#ins-x').addEventListener('input', (e) => lantern.setExplode(e.target.value / 100, 'layered'));
        o.querySelector('#ins-s').addEventListener('input', (e) => setSeeThrough(e.target.value / 100));
      },
    });
  };

  addEventListener('keydown', (e) => {
    if (e.key === 'x' || e.key === 'X') {
      if (inspecting || !hud.overlayOpen) hud.onInspect();
    } else if (e.key === 'Escape') {
      hud.closeMenu();
      if (inspecting) hud.onInspect();
    }
  });

  hud.onSound = (v) => { SFX.setEnabled(v); bgm.setEnabled(v); };
  hud.onTheme = (v) => stage.setTheme(v);
  // 夜色场景里界面跟着变暗，否则字压在黑画面上读不出来
  stage.onMood = (name) => hud.setTone(name === 'night' ? 'dark' : null);
  hud.setTone(stage.moodName === 'night' ? 'dark' : null);

  // ── 主循环 ──
  stage.updaters.add((dt, t) => {
    tickTweens(dt);
    lantern.update(dt, t);
    fx.chips.update(dt);
    fx.ripples.update(dt);
    fx.ring.update(dt);
    fx.fireworks.update(dt);
    hud.updateSpots(stage.camera);
    guides.update(stage.camera);
  });
  stage.start();

  window.__ctx = ctx;
  window.__engine = engine;
  installDevShot(stage);

  // 开发期：把全片旁白导出为配音清单，供 tools/make-script.mjs 排版
  if (import.meta.env.DEV) {
    window.__exportVO = async () => {
      const items = engine.steps
        .filter((s) => s.narration)
        .map((s) => ({ id: s.id, title: s.title, cps: s.cps ?? 4.0, lyric: !!s.lyric, text: s.narration }));
      items.push(...MODULE_VO);
      const r = await fetch('/__manifest', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ generatedFrom: 'runtime', count: items.length, items }, null, 2),
      }).then((x) => x.json());
      return r.file;
    };
  }
  unlockAudio();

  progress(1);
  await sleep(280);
  boot.classList.add('gone');
  setTimeout(() => { boot.hidden = true; }, 1000);
  hud.showChrome(true);

  await engine.go(0);
}

main().catch((e) => {
  console.error(e);
  bootMsg.textContent = `没能打开：${e.message}`;
  bootMsg.classList.add('bad');
});

export { THREE };
