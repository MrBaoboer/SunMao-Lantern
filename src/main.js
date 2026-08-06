import './styles.css';
import * as THREE from 'three';

import { Stage } from './render/stage.js';
import { Lantern } from './render/lantern.js';
import { ChipBurst, Ripples, EnergyRing, Fireworks, detectTier } from './render/fx.js';
import { state } from './core/state.js';
import { runVerification, formatReport } from './core/verify.js';
import { HUD, Arrows } from './ui/hud.js';
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
 * 模块内的旁白（不在步骤表里，单独登记以便一起生成配音）。
 * 文案与 modules/*.js 中调用 voice.play 的内容保持一致。
 */
const MODULE_VO = [
  { id: 'D4b', title: '巡礼收束', cps: 3.6, text: '十三根木条，三十二个零件。\n没有用一根钉子，也没有用一滴胶水。' },
  { id: 'M1', title: 'M1 点亮之后', cps: 3.6, text: '亮了。\n光从绵纸里透出来，被木头挡成一格一格的 —— 这就是你刚才选的那个花纹。\n（停顿 1.0 s）\n看地上。' },
  { id: 'M2-1', title: 'M2 谜面一', cps: 3.5, text: '麻屋子，红帐子，里面住着一个白胖子' },
  { id: 'M2-2', title: 'M2 谜面二', cps: 3.5, text: '千条线，万条线，落到水里看不见' },
  { id: 'M2-3', title: 'M2 谜面三', cps: 3.5, text: '身子矮矮，肚里有火，越烧越短，烧完就没' },
  { id: 'M2-4', title: 'M2 谜面四', cps: 3.5, text: '有面没有口，有脚没有手，四只脚站着，自己不会走' },
  { id: 'M2-5', title: 'M2 谜面五', cps: 3.5, text: '不用一钉，不用一胶，一凹一凸，两木咬牢' },
  { id: 'M2-fin', title: 'M2 知识闭环', cps: 3.5, text: '这一题，你答得出来，是因为前面那二十多步你都看过了。\n不用一根钉，不用一滴胶 —— 一凹，一凸，两块木头就咬死了。\n这就是榫卯。' },
  { id: 'M4', title: 'M4 挂灯笼', cps: 3.8, text: '最后一步 —— 把它挂起来。\n转动视角，找一个位置，点一下就挂上去。\n挂墙上，它自己会垂下来晃；放桌上，它就稳稳地立着。\n（气口）\n想挂几盏都行。绕着走一圈看看 —— 从不同角度看，它是不一样的。\n拍张照吧。这是你做的。' },
  { id: 'M5', title: 'M5 入场', cps: 3.8, text: '最后 —— 放烟花。\n在屏幕上点一下，划一下，画个圈，都能放出不一样的花。\n试试看。' },
  { id: 'M5-fu', title: 'M5 福字', cps: 4.2, text: '哎 —— 是个「福」字。' },
  { id: 'M5-outro', title: 'M5 片尾', cps: 3.3, text: '烟花放完了，灯还亮着。\n（停顿 1.0 s）\n十三根木条，零颗钉子。\n这套办法，我们用了七千年。\n（停顿 1.5 s）\n新年快乐。' },
];

const boot = document.getElementById('boot');
const bar = boot.querySelector('.boot-line i');
const bootMsg = boot.querySelector('.boot-msg');
const progress = (p, msg) => {
  bar.style.width = `${Math.round(p * 100)}%`;
  if (msg) bootMsg.textContent = msg;
};
const frame = () => new Promise((r) => setTimeout(r, 16));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  progress(0.06, '正在为你点亮这盏灯……');
  const tier = detectTier();

  const stage = new Stage(document.getElementById('stage'));
  stage.setMood('craft');
  if (tier === 'low') { stage.bloomEnabled = false; stage.renderer.shadowMap.enabled = false; }
  progress(0.22, '正在架设工作台……');
  await frame();

  // ── 几何闭合验算：加载即跑，不通过则在控制台高亮 ──
  const report = runVerification();
  const bad = report.filter((r) => !r.ok);
  console.groupCollapsed(
    `%c榫卯灯笼 · 几何闭合验算  ${report.length - bad.length}/${report.length}`,
    `color:${bad.length ? '#e0776f' : '#c8a063'};font-weight:bold`,
  );
  for (const r of report) {
    console.log(`%c${r.ok ? '✓' : '✗'} [${r.code}] ${r.title}`,
      `color:${r.ok ? '#86c58a' : '#e0776f'}`, r.detail || '');
  }
  console.groupEnd();

  progress(0.42, '正在下料……');
  await frame();

  const lantern = new Lantern(stage, state);
  progress(0.66, '正在开榫凿卯……');
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
  const ctx = {
    stage, lantern, hud, sfx: SFX, bgm, voice, state, fx, guides, tier,
  };
  ctx.drag = new DragAssembly(ctx);
  ctx.mach = new Machining(ctx);
  ctx.simpleDrag = makeSimpleDrag(ctx);

  await Promise.all([voice.loadManifest(), bgm.loadManifest()]);

  progress(0.86, '正在合龙……');
  await frame();

  // ── 步骤表（V3.0：24 步）──
  const engine = new Engine(ctx);
  engine.setSteps([...act1(ctx), ...act3(ctx), ...act4(ctx)]);

  // ── 五个入口 ──
  const DOORS = [
    { id: 'M1', ic: '🔥', nm: '点灯', ds: '让它亮起来', open: openM1 },
    { id: 'M2', ic: '🎋', nm: '猜灯谜', ds: '答对一个，灯亮一分', open: openM2 },
    { id: 'M3', ic: '🖌', nm: '写心愿', ds: '写在灯上，存成一张画', open: openM3 },
    { id: 'M4', ic: '🏮', nm: '挂起来', ds: '挂到你想挂的地方', open: openM4 },
    { id: 'M5', ic: '🎆', nm: '放烟花', ds: '点、划、画个圈', open: openM5 },
  ];
  ctx.openHub = () => {
    const done = state.modulesDone || {};
    const n = DOORS.filter((d) => done[d.id]).length;
    hud.showOverlay(`<div class="dock">
      <div class="doors">
        ${DOORS.map((m) => `<button class="door" data-m="${m.id}">
            ${done[m.id] ? '<span class="seal">成</span>' : ''}
            <span class="ic">${m.ic}</span><span class="nm">${m.nm}</span><span class="ds">${m.ds}</span>
          </button>`).join('')}
      </div>
    </div>`, { veil: false, onMount: (o) => {
      o.querySelectorAll('.door').forEach((b) => {
        b.addEventListener('mouseenter', () => SFX.play('UI_HOVER_SOFT'));
        b.addEventListener('click', () => {
          const m = DOORS.find((x) => x.id === b.dataset.m);
          SFX.play('PORTAL_ENTER');
          hud.hideOverlay();
          hud.showChrome(false);
          m.open(ctx, () => {
            hud.showChrome(true);
            SFX.play('STAMP');
            ctx.openHub();
          });
        });
      });
    } });
    hud.setHint(n ? `已经做了 <em>${n}</em> 件 · 想先做哪个都行` : '想先做哪个都行');
    hud.setAlts([{ label: '重看制作过程', onClick: () => { hud.hideOverlay(); engine.goToStep('D5'); } }]);
  };

  // ── 尺寸对照 ──
  // 这盏灯的几何是按一套尺寸算出来的，打开页面时会自己核对一遍。
  // 这里只挑几条人看得懂的说，完整结果在控制台。
  const showCheck = () => {
    const { pass, total } = formatReport(report);
    const ok = pass === total;
    const clash = report.find((r) => r.code === 'CLASH');
    hud.showOverlay(`<div class="sheet">
      <h2>严丝合缝</h2>
      <p class="lede">这盏灯的每一个尺寸，都是同一个数算出来的</p>
      <div class="tally">
        <div class="r"><span>木条截面</span><b>12 毫米</b></div>
        <div class="r"><span>其余所有尺寸</span><b>它的整数倍</b></div>
        <div class="r"><span>榫头穿透后露出</span><b>6 毫米</b></div>
        <div class="r"><span>上槽 / 下槽</span><b>6 / 2 毫米</b></div>
        <div class="r"><span>细颈截面</span><b>柱身的四分之一</b></div>
        <div class="r sum"><span>零件两两相碰之处</span><b>${ok ? '0' : '有'}</b></div>
      </div>
      <p class="lede" style="margin:30px 0 0">
        ${clash?.detail || ''}<br>页面每次打开都会重算一遍，${pass} / ${total} 项通过。
      </p>
      <div class="foot"><button id="chk-x" class="primary">好</button></div>
    </div>`, { onMount: (o) => {
      o.querySelector('#chk-x').addEventListener('click', () => {
        hud.hideOverlay();
        if (engine.current?.id === 'D6') ctx.openHub();
      });
    } });
  };
  hud.onCheck = showCheck;

  // ── 拆开看看：任意时刻剖切与拆解 ──
  let inspecting = false;
  hud.onInspect = () => {
    inspecting = !inspecting;
    if (!inspecting) {
      lantern.setSection(null, false);
      lantern.setExplode(0, 'layered');
      for (const p of lantern.parts.values()) {
        p.material.transparent = false; p.material.opacity = 1;
        p.material.depthWrite = true; p.material.needsUpdate = true;
      }
      hud.hideOverlay();
      return;
    }
    hud.showOverlay(`<div class="dock">
      <div class="slider"><span>拆开</span><input id="ins-x" type="range" min="0" max="100" value="0"></div>
      <div class="slider"><span>透明</span><input id="ins-s" type="range" min="0" max="100" value="0"></div>
      <button id="ins-close" class="ghost">收起</button>
    </div>`, { veil: false, onMount: (o) => {
      o.querySelector('#ins-x').addEventListener('input', (e) =>
        lantern.setExplode(e.target.value / 100, 'layered'));
      o.querySelector('#ins-s').addEventListener('input', (e) => {
        const k = e.target.value / 100;
        for (const p of lantern.parts.values()) {
          p.material.transparent = k > 0;
          p.material.opacity = 1 - k * 0.8;
          p.material.depthWrite = k < 0.5;
          p.material.needsUpdate = true;
        }
      });
      o.querySelector('#ins-close').addEventListener('click', () => hud.onInspect());
    } });
  };
  addEventListener('keydown', (e) => {
    if ((e.key === 'x' || e.key === 'X') && !hud.overlayOpen) hud.onInspect();
    else if ((e.key === 'x' || e.key === 'X') && inspecting) hud.onInspect();
  });

  hud.onSound = (v) => { SFX.setEnabled(v); bgm.setEnabled(v); };

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

  // 开发期：把全片旁白导出为生成清单（供 tools/gen-voice.mjs 使用）
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

  progress(1, '好了');
  await sleep(320);
  boot.classList.add('gone');
  setTimeout(() => { boot.hidden = true; }, 1100);
  hud.showChrome(true);

  await engine.go(0);
}

main().catch((e) => {
  console.error(e);
  bootMsg.textContent = `没能打开：${e.message}`;
  bootMsg.style.color = '#d98a80';
});

export { THREE };
