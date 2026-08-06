import './styles.css';
import * as THREE from 'three';

import { Stage } from './render/stage.js';
import { Lantern } from './render/lantern.js';
import { ChipBurst, Ripples, EnergyRing, Fireworks, detectTier } from './render/fx.js';
import { state } from './core/state.js';
import { runVerification, formatReport } from './core/verify.js';
import { HUD, GuideArrows } from './ui/hud.js';
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
const bar = boot.querySelector('.bootbar i');
const bootmsg = boot.querySelector('.bootmsg');
const progress = (p, msg) => {
  bar.style.width = `${Math.round(p * 100)}%`;
  if (msg) bootmsg.textContent = msg;
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
  const guides = new GuideArrows();
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

  // ── 互动模块枢纽 ──
  const MODULES = [
    { id: 'M1', ic: '🔥', nm: '点灯', ds: '让它亮起来', open: openM1 },
    { id: 'M2', ic: '🎋', nm: '猜灯谜', ds: '五题闯关，答对越多灯越亮', open: openM2 },
    { id: 'M3', ic: '🖌', nm: '新春许愿', ds: '写下心愿，生成一张海报', open: openM3 },
    { id: 'M4', ic: '📷', nm: 'AR 挂灯笼', ds: '把它挂在你家门口', open: openM4 },
    { id: 'M5', ic: '🎆', nm: '烟花庆祝', ds: '五种花型，等你点', open: openM5 },
  ];
  ctx.openHub = () => {
    const done = state.modulesDone || {};
    const n = Object.keys(done).filter((k) => done[k]).length;
    hud.showOverlay(`<div class="panel">
      <h2>过年该做的事</h2>
      <p class="lead">顺序随意，想先做哪个都可以 · 已完成 ${n}/5</p>
      <div class="hub">
        ${MODULES.map((m) => `<button class="hub-item" data-m="${m.id}">
            ${done[m.id] ? '<span class="stamp">成</span>' : ''}
            <span class="ic">${m.ic}</span>
            <span class="nm">${m.nm}</span>
            <span class="ds">${m.ds}</span>
          </button>`).join('')}
      </div>
      <div style="margin-top:26px;text-align:center;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <button id="hub-replay" class="ghost-btn">重看制作过程</button>
        <button id="hub-verify" class="ghost-btn">几何校验报告</button>
      </div>
      ${n === 5 ? '<p class="lead" style="margin-top:20px;color:var(--tenon)">五项全部完成 · 已解锁双色描金</p>' : ''}
    </div>`, { solid: false, onMount: (o) => {
      o.classList.add('clear');
      o.querySelectorAll('.hub-item').forEach((b) => {
        b.addEventListener('mouseenter', () => SFX.play('UI_HOVER_SOFT'));
        b.addEventListener('click', () => {
          const m = MODULES.find((x) => x.id === b.dataset.m);
          SFX.play('PORTAL_ENTER');
          hud.hideOverlay();
          hud.showBottom(false);
          hud.showTop(false);
          m.open(ctx, () => {
            hud.showBottom(true);
            hud.showTop(true);
            SFX.play('STAMP');
            ctx.openHub();
          });
        });
      });
      o.querySelector('#hub-replay').addEventListener('click', () => {
        hud.hideOverlay();
        engine.goToStep('D5');
      });
      o.querySelector('#hub-verify').addEventListener('click', showVerify);
    } });
  };

  // ── 几何校验报告面板 ──
  const showVerify = () => {
    const { pass, total } = formatReport(report);
    hud.showOverlay(`<div class="panel">
      <h2>几何闭合验算</h2>
      <p class="lead">§13.1 建模自检表 → 运行时断言 · ${pass}/${total} 项通过</p>
      <div class="verify">${report.map((r) =>
        `<div class="${r.ok ? 'ok' : 'no'}">${r.ok ? '✓' : '✗'} [${r.code}] ${r.title}</div>` +
        (r.detail ? `<div style="opacity:.6;padding-left:20px">${r.detail}</div>` : '')).join('')}
      </div>
      <div style="margin-top:22px;text-align:center"><button id="v-close" class="main-btn">关闭</button></div>
    </div>`, { onMount: (o) => {
      o.querySelector('#v-close').addEventListener('click', () => {
        hud.hideOverlay();
        if (engine.current?.id === 'D6') ctx.openHub();
      });
    } });
  };
  hud.onVerify = showVerify;

  // ── 结构检视器（V3.0 新增：把散落各步的六次剖切升级为全局能力）──
  let inspectOn = false;
  hud.onInspect = () => {
    inspectOn = !inspectOn;
    hud.el.inspect.dataset.on = inspectOn ? '1' : '0';
    if (!inspectOn) {
      lantern.setSection(null, false);
      lantern.setExplode(0, 'layered');
      hud.hideOverlay();
      return;
    }
    hud.showOverlay(`<div class="panel" style="position:fixed;right:0;top:14vh;width:min(300px,80vw);pointer-events:auto">
      <div class="card">
        <h4>结构检视器<span class="tag">X</span></h4>
        <div class="slider-wrap" style="margin:10px 0"><span>爆炸</span>
          <input id="ins-ex" type="range" min="0" max="100" value="0" style="width:150px"></div>
        <div class="slider-wrap"><span>半透</span>
          <input id="ins-sec" type="range" min="0" max="100" value="0" style="width:150px"></div>
        <p>几何为程序化生成，任意时刻都可剖切与拆解 —— 这是网页端相对分步讲解器的真正优势。</p>
      </div>
    </div>`, { solid: false, onMount: (o) => {
      o.classList.add('clear');
      o.querySelector('#ins-ex').addEventListener('input', (e) => {
        lantern.setExplode(e.target.value / 100, 'layered');
      });
      o.querySelector('#ins-sec').addEventListener('input', (e) => {
        const k = e.target.value / 100;
        for (const p of lantern.parts.values()) {
          p.material.transparent = k > 0;
          p.material.opacity = 1 - k * 0.8;
          p.material.depthWrite = k < 0.5;
          p.material.needsUpdate = true;
        }
      });
    } });
  };
  addEventListener('keydown', (e) => { if (e.key === 'x' || e.key === 'X') hud.onInspect(); });

  hud.onSoundToggle = (v) => { SFX.setEnabled(v); bgm.setEnabled(v); };

  // ── 主循环 ──
  stage.updaters.add((dt, t) => {
    tickTweens(dt);
    lantern.update(dt, t);
    fx.chips.update(dt);
    fx.ripples.update(dt);
    fx.ring.update(dt);
    fx.fireworks.update(dt);
    hud.updateHotspots(stage.camera);
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
  await sleep(280);
  boot.classList.add('gone');
  setTimeout(() => { boot.hidden = true; }, 900);
  hud.showTop(true);
  hud.showBottom(true);

  await engine.go(0);
}

main().catch((e) => {
  console.error(e);
  bootmsg.innerHTML = `出错了：${e.message}<br><small style="opacity:.6">详情见控制台</small>`;
  bootmsg.style.color = '#e0776f';
});

export { THREE };
