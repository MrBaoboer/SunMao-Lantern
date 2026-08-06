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
import { MODULE_VO } from './modules/vo.js';
import { installDevShot } from './devshot.js';

/** 做完灯之后的五件事 */
const DOORS = [
  { id: 'M1', ico: 'flame', nm: '点灯', ds: '把这盏灯点亮', open: openM1 },
  { id: 'M2', ico: 'slip', nm: '猜灯谜', ds: '答对一个，灯亮一分', open: openM2 },
  { id: 'M3', ico: 'brush', nm: '写心愿', ds: '写在灯上，存成一张画', open: openM3 },
  { id: 'M4', ico: 'lantern', nm: '挂起来', ds: '挂到你想挂的地方', open: openM4 },
  { id: 'M5', ico: 'firework', nm: '放烟花', ds: '点一下，划一下，画个圈', open: openM5 },
];

const cover = document.getElementById('cover');
const coverBar = document.getElementById('cover-bar');
const coverMsg = document.getElementById('cover-msg');
const coverAct = document.getElementById('cover-act');

const progress = (p, msg) => {
  coverBar.style.width = `${Math.round(p * 100)}%`;
  if (msg) coverMsg.textContent = msg;
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
  hud.hasVoice = voice.available.size > 0;

  progress(0.9, '正在合龙');
  await frame();

  const engine = new Engine(ctx);
  engine.setSteps([...act1(ctx), ...act3(ctx), ...act4(ctx)]);

  // ── 做完灯之后的五件事 ──
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
    hud.setCue(n === DOORS.length ? '五件事都做完了 · 灯还亮着'
      : n ? `五件事，做完了 <b>${n}</b> 件`
        : '想先做哪个都行');
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
    const close = () => {
      hud.hideOverlay();
      if (engine.current?.id === 'D5') ctx.openHub();
    };
    hud.sheet({
      title: '严丝合缝',
      lede: '这盏灯的每一个尺寸，都是同一个数算出来的',
      body: `<div class="spec">
        ${spec.map(([k, v]) => `<div class="sp"><span>${k}</span><i></i><b>${v}</b></div>`).join('')}
        <div class="sp sum"><span>零件相碰之处</span><i></i><b>${clash?.ok ? '0' : '有'}</b></div>
      </div>
      <p class="verdict">${icon('check')}<span>${pass} / ${total} 项校验通过</span></p>`,
      actions: [{ label: '知道了', kind: 'primary', on: close }],
      onEsc: close,
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
      onEsc: () => hud.onInspect(),
      onMount: (o) => {
        o.querySelector('#ins-x').addEventListener('input', (e) => lantern.setExplode(e.target.value / 100, 'layered'));
        o.querySelector('#ins-s').addEventListener('input', (e) => setSeeThrough(e.target.value / 100));
      },
    });
  };

  addEventListener('keydown', (e) => {
    if ((e.key === 'x' || e.key === 'X') && (inspecting || !hud.overlayOpen)) hud.onInspect();
  });

  hud.onSound = (v) => { SFX.setEnabled(v); bgm.setEnabled(v); };
  hud.onTheme = (v) => stage.setTheme(v);
  hud.onRestart = () => { if (inspecting) hud.onInspect(); engine.go(0); };
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

  // ── 封面 ──
  // 三维已经就绪：把成品摆上台，让封面化开之后背后就是这盏灯。
  lantern.attachAll();
  lantern.showOnly(null);
  lantern.allFinished();
  for (const p of lantern.parts.values()) p.installed = true;
  lantern.applyAssembly();
  lantern.showPanels(true);
  lantern.showDecor(true);
  lantern.core.visible = true;
  lantern.setLit(0);
  stage.setMood('dusk');

  let az = 62;
  const drift = (dt) => { az += dt * 2.4; stage.setRecommended({ az, el: 12, dist: 470 }); };
  drift(0);
  stage.snapToRecommended();
  stage.updaters.add(drift);

  progress(1);
  await sleep(200);
  cover.dataset.ready = '1';

  const enter = async (index) => {
    coverAct.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    stage.updaters.delete(drift);
    cover.classList.add('gone');
    setTimeout(() => { cover.hidden = true; }, 1000);
    hud.showChrome(true);
    if (!state.primed) {
      state.primed = true;
      await sleep(480);                     // 让封面先退干净，再摊开这一页
      await new Promise((done) => hud.guide({ label: '开始吧', onClose: done }));
    }
    await engine.go(index);
  };

  const resumeAt = Math.min(state.maxStep || 0, engine.steps.length - 1);
  const fresh = resumeAt <= 0;
  const stepName = engine.steps[resumeAt]?.title || '';

  coverAct.innerHTML = `
    <button class="btn btn-primary" id="cv-go">${fresh ? '开始做灯' : `继续 · 第 ${resumeAt + 1} 步`}</button>
    <div class="cover-alt">
      ${fresh ? '' : '<button class="btn btn-text" id="cv-new">从头开始</button>'}
      <button class="btn btn-text" id="cv-help">怎么操作</button>
    </div>
    <p class="cover-meta">${fresh ? '约 8 分钟 · 随时可以停' : `上次停在「${stepName}」`}</p>`;
  coverMsg.hidden = true;
  coverAct.hidden = false;
  coverAct.querySelector('#cv-go').focus();

  coverAct.querySelector('#cv-go').addEventListener('click', () => enter(resumeAt));
  coverAct.querySelector('#cv-new')?.addEventListener('click', () => enter(0));
  coverAct.querySelector('#cv-help').addEventListener('click', () => hud.guide({ full: true }));
}

main().catch((e) => {
  console.error(e);
  coverMsg.hidden = false;
  coverMsg.textContent = '这盏灯没能点亮';
  coverMsg.classList.add('bad');
  coverAct.hidden = false;
  coverAct.innerHTML = `
    <button class="btn btn-primary" id="cv-retry">重新加载</button>
    <p class="cover-meta">如果一直不行，换个新一点的浏览器试试</p>`;
  coverAct.querySelector('#cv-retry').addEventListener('click', () => location.reload());
});

export { THREE };
