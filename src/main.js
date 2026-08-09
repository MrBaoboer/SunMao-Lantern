/*
 * 榫卯灯笼 · 国风流光
 * Copyright © 2026 MrBaoboer
 *
 * 本程序是自由软件：你可以依据自由软件基金会发布的 GNU Affero 通用公共许可证
 * （第 3 版）的条款重新分发和／或修改它。
 *
 * 分发本程序是希望它有用，但不附带任何担保；甚至不含对适销性或特定用途适用性的
 * 默示担保。详见 GNU Affero 通用公共许可证。
 *
 * 你应当已随本程序收到一份该许可证的副本（见仓库根目录的 LICENSE）；
 * 如果没有，见 <https://www.gnu.org/licenses/>。
 *
 * 课程编排、旁白与美术素材不在本许可证之内，见 legal/CC-BY-NC-SA-4.0.txt 与 COMMERCIAL.md。
 */

import './styles.css';
import * as THREE from 'three';

import { Stage } from './render/stage.js';
import { Lantern } from './render/lantern.js';
import { ChipBurst, Ripples, EnergyRing, detectTier } from './render/fx.js';
import { state, resetRun } from './core/state.js';
import { runVerification, formatReport } from './core/verify.js';
import { HUD, Arrows } from './ui/hud.js';
import { icon } from './ui/icons.js';
import { SFX, unlockAudio } from './audio/sfx.js';
import { BGM } from './audio/bgm.js';
import { VoiceTrack } from './audio/voice.js';
import { DragAssembly } from './interact/assembly.js';
import { Machining } from './interact/machining.js';
import { Engine } from './app/engine.js';
import { tween, tick as tickTweens, reducedMotion } from './util/tween.js';
import { makeSimpleDrag, AIM_LANTERN, FIT_LANTERN } from './steps/util.js';
import { act1 } from './steps/act1.js';
import { act3 } from './steps/act3.js';
import { act4 } from './steps/act4.js';
import { openM1, openM2 } from './modules/m1-m2.js';
import { openM3, openM4 } from './modules/m3-m4.js';
import { MODULE_VO, playVO } from './modules/vo.js';
import { installDevShot } from './devshot.js';

/** 做完灯之后的四件事 */
const DOORS = [
  { id: 'M1', ico: 'flame', nm: '点灯', ds: '按住不放，把灯点亮', open: openM1 },
  { id: 'M2', ico: 'slip', nm: '猜灯谜', ds: '答对一个，灯亮一分', open: openM2 },
  { id: 'M3', ico: 'brush', nm: '写心愿', ds: '挑一句吉利话，做成一张海报', open: openM3 },
  { id: 'M4', ico: 'lantern', nm: '挂起来', ds: '挂到夜色里，最多六盏', open: openM4 },
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

  // 画质分档在 Stage 里（像素比、MSAA、阴影贴图），这里只管后处理这一项
  const stage = new Stage(document.getElementById('stage'), tier);
  stage.setTheme(state.theme);
  stage.setMood('craft');
  if (tier === 'low') stage.bloomEnabled = false;

  /*
   * WebGL 上下文可能被系统回收（移动端切后台常见）—— 不处理就是永久黑屏。
   *
   * preventDefault() 之后浏览器会尝试恢复，three 的 onContextRestore 会把
   * 各级缓存重建、资源按需重传。所以这里等一等 restored，等到了就原地接着走；
   * 等不到（或用户不想等）才走重新加载 —— 那一条会丢掉这一遍的进度。
   */
  stage.canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    stage.stop();
    cover.hidden = false;
    cover.classList.remove('gone');
    coverMsg.hidden = false;
    coverMsg.classList.add('bad');
    coverMsg.textContent = '浏览器回收了图形资源，正在找回画面';
    coverAct.hidden = false;
    coverAct.innerHTML = `
      <button class="btn btn-primary" id="cv-recover">重新加载</button>
      <p class="cover-meta">切到别的应用太久时会这样。等几秒通常会自己回来；
        等不回来就重新加载，这一遍要从头开始。</p>`;
    coverAct.querySelector('#cv-recover').addEventListener('click', () => location.reload());
  });

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
  // 冒烟测试要读这个结果 —— 页面能打开不等于几何是对的
  window.__verifyReport = { total: report.length, failed: bad.length };

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
    tier,
  };

  /** 全片共享上下文 */
  const ctx = { stage, lantern, hud, sfx: SFX, bgm, voice, state, fx, guides, tier };
  ctx.drag = new DragAssembly(ctx);
  ctx.mach = new Machining(ctx);
  ctx.simpleDrag = makeSimpleDrag(ctx);

  await Promise.all([voice.loadManifest(), bgm.loadManifest()]);
  hud.hasVoice = voice.available.size > 0;

  progress(0.88, '正在合龙');
  await frame();

  // 着色器提前编译好。不编，全部 program 会挤在封面化开那一刻的第一帧里编 ——
  // 恰好是整段体验最需要顺的那一下。木料着色器有一大段程序化木纹，编译不便宜。
  try {
    await stage.renderer.compileAsync(stage.scene, stage.camera);
  } catch (e) {
    console.warn('[precompile]', e);   // 编不动不该拦住开场
  }
  progress(0.95);
  await frame();

  const engine = new Engine(ctx);
  engine.setSteps([...act1(ctx), ...act3(ctx), ...act4(ctx)]);

  // ── 做完灯之后的四件事 ──
  // 四件都做完时补一段片尾 —— 全片总得有个落点，而这里是唯一能确定
  // 「都玩过了」的时刻。四扇门是自由顺序，所以只认张数，不认顺序。
  let outroShown = false;
  let hubToken = 0;
  ctx.openHub = () => {
    const myToken = ++hubToken;
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
            hud.closeOverlays();        // 四扇门收干净，模块自己的坞才是底层
            hud.showChrome(false);
            const back = () => {
              hud.showChrome(true);
              SFX.play('SUCCESS', { gain: 0.7 });
              ctx.openHub();
            };
            // 模块自己崩了不能把人留在一块没有任何控件的画面上
            try {
              m.open(ctx, back);
            } catch (err) {
              console.error(`[module ${m.id}]`, err);
              hud.setBack(null);
              hud.toast(`「${m.nm}」没能打开，先回去看看别的`, { dur: 3200 });
              back();
            }
          });
        });
      },
    });
    hud.setCue(n === DOORS.length ? '四件事都做完了'
      : n ? `做完 <b>${n}</b> 件，还剩 <b>${DOORS.length - n}</b> 件`
        : '想先做哪个都行');

    if (n === DOORS.length && !outroShown) {
      outroShown = true;
      (async () => {
        playVO(ctx, state.lit ? 'OUTRO' : 'OUTRO-dark');
        await sleep(7500);
        // 这几秒里用户可能又进了别的模块 —— 片尾不该盖到人家头上
        if (hubToken !== myToken) return;
        hud.sheet({
          body: `<div class="finale">
            <div class="ln">13 根木条</div><div class="ln">0 颗钉子</div><div class="ln">7000 年</div>
          </div>`,
          actions: [{ label: '知道了', kind: 'primary', on: () => ctx.openHub() }],
          onEsc: () => ctx.openHub(),
          onMount: (o) => {
            o.querySelectorAll('.ln').forEach((el, i) => {
              el.style.opacity = 0;
              setTimeout(() => tween(0.7, (k) => { el.style.opacity = k; }), i * 900);
            });
          },
        });
      })();
    }
  };

  // ── 尺寸对照 ──
  // 这盏灯的几何是按一套尺寸算出来的，打开页面时自己核对一遍。
  // 这里只挑几条人看得懂的说，完整结果在控制台。
  const showCheck = () => {
    const { pass, total } = formatReport(report);
    const clash = report.find((r) => r.code === 'CLASH');
    const spec = [
      ['木条截面', '12 × 12 毫米'],
      ['其余所有尺寸', '它的整数倍'],
      ['榫头穿透后露出', '6 毫米'],
      ['上槽 / 下槽', '6 / 2 毫米'],
      ['细颈截面', '柱身的四分之一'],
    ];
    hud.sheet({
      top: true,
      title: '尺寸对照',
      lede: '这盏灯的每一个尺寸，都是同一个数算出来的',
      body: `<div class="spec">
        ${spec.map(([k, v]) => `<div class="sp"><span>${k}</span><i></i><b>${v}</b></div>`).join('')}
        <div class="sp sum"><span>零件相碰之处</span><i></i><b>${clash?.ok ? '0' : '有'}</b></div>
      </div>
      <p class="verdict">${icon('check')}<span>${pass} / ${total} 项校验通过</span></p>`,
      actions: [{ label: '知道了', kind: 'primary', on: () => hud.hideOverlay() }],
      onEsc: () => hud.hideOverlay(),
    });
  };
  hud.onCheck = showCheck;

  // ── 拆开看看：任意时刻剖切与拆解 ──
  let inspecting = false;
  let seeThrough = 0;
  const setSeeThrough = (k) => {
    seeThrough = k;
    for (const p of lantern.parts.values()) {
      const on = k > 0;
      // transparent / depthWrite 一变就换掉着色器的 OPAQUE 宏，17 个材质当场重编译。
      // 拖滑杆是连续动作，只在跨过阈值时才翻这两个开关，中间只改 opacity
      if (p.material.transparent !== on) {
        p.material.transparent = on;
        p.material.depthWrite = !on;
        p.material.needsUpdate = true;
      }
      p.material.opacity = 1 - k * 0.8;
    }
  };
  ctx.exitInspect = () => {
    if (!inspecting) return;
    inspecting = false;
    lantern.setSection(null, false);
    lantern.setExplode(0, 'layered');
    setSeeThrough(0);
  };
  hud.onInspect = () => {
    if (inspecting) { hud.hideOverlay(); ctx.exitInspect(); return; }
    inspecting = true;
    const pct = (v) => Math.round(v * 100);
    hud.dock({
      top: true,          // 盖在这一步自己的坞上面，收起时把它交还
      // 这一层可能被同为上层的另一页顶掉（坞不挡菜单，摊着它照样能点「尺寸对照」）。
      // 控件一走，爆炸与半透就得跟着还原 —— 否则灯笼停在拆开的样子，而没有任何入口能收回去
      onGone: () => ctx.exitInspect(),
      body: `<div class="slider"><span>拆开</span><input id="ins-x" type="range" min="0" max="100" value="${pct(lantern.explodeT)}" aria-label="拆开"></div>
             <div class="slider"><span>透明</span><input id="ins-s" type="range" min="0" max="100" value="${pct(seeThrough)}" aria-label="透明"></div>`,
      actions: [{ label: '收起', on: () => hud.onInspect() }],
      onEsc: () => hud.onInspect(),
      onMount: (o) => {
        o.querySelector('#ins-x').addEventListener('input', (e) => lantern.setExplode(e.target.value / 100, 'layered'));
        o.querySelector('#ins-s').addEventListener('input', (e) => setSeeThrough(e.target.value / 100));
      },
    });
  };

  addEventListener('keydown', (e) => {
    if (e.key !== 'x' && e.key !== 'X') return;
    // Ctrl/Cmd+X 是剪切，不该顺手把灯笼拆开；封面还没退场时也不该
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!cover.hidden && !cover.classList.contains('gone')) return;
    if (inspecting || !hud.overlayOpen) hud.onInspect();
  });

  // 上下文找回来了：原地接着走，不必重新加载，这一遍的进度也就留住了
  stage.canvas.addEventListener('webglcontextrestored', () => {
    stage.resize();
    stage.start();
    coverMsg.classList.remove('bad');
    coverAct.hidden = true;
    cover.classList.add('gone');
    setTimeout(() => { cover.hidden = true; }, 1000);
    hud.toast('画面回来了', { dur: 2200 });
  });

  // 切到别的标签页时整段停住。画面走 rAF，本来就停了；
  // 声音走 <audio> 与 setTimeout，不管的话回来时旁白已经念完、画面还在原处
  addEventListener('visibilitychange', () => {
    if (document.hidden) { bgm.suspend(); voice.suspend(); SFX.suspendLoops(); }
    else { bgm.resume(); voice.resume(); SFX.resumeLoops(); }
  });

  // 界面占掉的上下两条边交给三维 —— 灯笼据此让位与退远
  hud.onSafeArea = (safe) => stage.setSafeArea(safe);

  hud.onSound = (v) => { SFX.setEnabled(v); bgm.setEnabled(v); };
  hud.onTheme = (v) => stage.setTheme(v);
  // 「从头再来」是真的从头：这一遍的进度、亮度、灯谜得分、愿望一并清掉。
  // 只把索引拨回 0 的话，灯还是亮的、门上还盖着印 —— 那不叫从头
  hud.onRestart = async () => {
    if (inspecting) hud.onInspect();
    resetRun();
    outroShown = false;
    lantern.setLit(0);
    lantern.setPattern(state.patternId);
    await engine.go(0);
  };
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

  // 封面的灯退得远一些、转得慢一些：它是题字背后的一层影，不是主体。
  // 要求减少动效时就摆在那儿不转 —— 这是一段一直不停的运动，CSS 管不到
  let az = 62;
  const drift = (dt) => {
    az += dt * 2.0;
    stage.setRecommended({ az, el: 10, dist: 620, target: new THREE.Vector3(...AIM_LANTERN), fit: FIT_LANTERN });
  };
  drift(0);
  stage.snapToRecommended();
  if (!reducedMotion()) stage.updaters.add(drift);

  progress(1);
  await sleep(200);
  cover.dataset.ready = '1';

  // 每次打开都是新的一遍：封面只有一个入口，不问「要不要接着上次」
  const enter = async () => {
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
    await engine.go(0);
  };

  coverAct.innerHTML = `
    <button class="btn btn-primary" id="cv-go">开始做灯</button>
    <div class="cover-alt">
      <button class="btn btn-text" id="cv-help">怎么操作</button>
    </div>`;
  coverMsg.hidden = true;
  coverAct.hidden = false;
  coverAct.querySelector('#cv-go').focus();

  coverAct.querySelector('#cv-go').addEventListener('click', enter);
  coverAct.querySelector('#cv-help').addEventListener('click', () => hud.guide({ full: true }));
}

main().catch((e) => {
  console.error(e);
  coverMsg.hidden = false;
  coverMsg.textContent = '三维画面没能启动';
  coverMsg.classList.add('bad');
  coverAct.hidden = false;
  coverAct.innerHTML = `
    <button class="btn btn-primary" id="cv-retry">重新加载</button>
    <p class="cover-meta">这一页需要 WebGL 2。刷新一次通常就好；反复失败的话，
      换 Chrome / Edge 111 以上、Safari 16.4 以上或 Firefox 113 以上再试。</p>`;
  coverAct.querySelector('#cv-retry').addEventListener('click', () => location.reload());
});

export { THREE };
