/**
 * 装点年味（5 步）—— 从骨架到一盏灯
 */

import * as THREE from 'three';
import { V, a, C, J4, PALETTE, Junk } from './util.js';
import { PATTERNS, buildPatternTexture } from '../render/lattice.js';
import { EXPLODE_LAYERS } from '../render/lantern.js';
import { icon } from '../ui/icons.js';
import { tween, Ease, wait } from '../util/tween.js';

const junk = new Junk(null);

export function act4(ctx) {
  junk.scene = ctx.stage.scene;
  const WOOD = [
    'LB-A1', 'LB-A2', 'LB-C1', 'LB-B1', 'LB-B2',
    'UB-A1', 'UB-A2', 'UB-B1', 'UB-B2', 'PL-01', 'PL-02', 'PL-03', 'PL-04',
  ];
  const PANELS = ['LT-01', 'LT-02', 'LT-03', 'LT-04'];

  const framed = (c) => {
    c.lantern.attachAll();
    c.lantern.showOnly(null);
    for (const id of WOOD) { c.lantern.setOps(id, 'all'); c.lantern.parts.get(id).installed = true; }
    c.lantern.applyAssembly();
  };

  return [
    // ══════════════════════════════════════════════════════
    {
      id: 'D1', phase: 3,
      title: '选一个花纹',
      mood: 'studio',
      bgm: 'BGM_C_FESTIVE',
      cam: { az: 90, el: 4, dist: 360, target: [0, 0, 96], snap: true },
      narration: `框架好了，四个面还空着。
要用一片叫「格心」的木板填上 —— 在一整块板上镂空做出花纹，这样才够结实。
（气口）
麻叶纹，六出放射，寓意生生不息；
万字纹，回环相连，叫「万福不断头」。
挑一个，四面都用它。`,
      async enter(c, engine) {
        junk.clear();
        framed(c);
        c.lantern.showPanels(false);
        c.lantern.showDecor(false);
        c.lantern.core.visible = false;

        c.hud.dock({
          body: `<div class="picks">${PATTERNS.map((p) => `
            <button class="pick" type="button" data-id="${p.id}"
                    aria-pressed="${p.id === c.state.patternId}">
              <canvas width="220" height="220" data-cv="${p.id}"></canvas>
              <span class="pick-on">${icon('check')}</span>
              <div class="pick-meta">
                <div class="pick-nm">${p.name}</div>
                <div class="pick-mn">${p.meaning}</div>
              </div>
            </button>`).join('')}</div>`,
          onMount: (o) => {
            for (const p of PATTERNS) {
              const cv = o.querySelector(`[data-cv="${p.id}"]`);
              const tex = buildPatternTexture(p.id, 220);
              const g = cv.getContext('2d');
              g.fillStyle = '#0a0806'; g.fillRect(0, 0, 220, 220);
              g.globalCompositeOperation = 'lighter';
              g.drawImage(tex.image, 0, 0, 220, 220);
              tex.dispose();
            }
            // 选中即定案，直接往下走 —— 不再多一个确认按钮
            o.querySelectorAll('.pick').forEach((btn) => {
              btn.addEventListener('click', async () => {
                o.querySelectorAll('.pick').forEach((b) => b.setAttribute('aria-pressed', 'false'));
                btn.setAttribute('aria-pressed', 'true');
                c.state.patternId = btn.dataset.id;
                c.lantern.setPattern(btn.dataset.id);
                c.lantern.showPanels(true);
                for (const pid of PANELS) c.lantern.parts.get(pid).installed = true;
                c.lantern.applyAssembly();
                c.sfx.play('WOOD_TAP');
                await wait(0.7);
                engine.next();
              });
            });
          },
        });
        c.hud.setCue('点一个花纹，就用它了', 'tap');
      },
      exit(c) { c.hud.hideOverlay(); junk.clear(); },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'D2', phase: 3,
      title: '把板子装进去',
      mood: 'studio',
      cam: { az: 90, el: 6, dist: 350, target: [0, 0, 96], snap: true },
      narration: `装板不靠榫，也不靠胶：上下两道槽把板夹住，就完了。
可板比空腔还高一点，怎么塞进去？
（气口）
先斜着，把板顶进上面那道深槽 —— 上槽特意做得深，就是留这个余量的。
摆正，再往下一落，下端正好掉进下面那道浅槽。上下都吃住了，板就再也出不来。
不粘不钉。木头会热胀冷缩，留着余地，它才不会开裂。`,
      note: {
        title: '上槽比下槽深三倍',
        body: '深出来的那一截，正好是把板<em>塞进去</em>需要的余量。',
        foot: '两边一样深，这块板就根本塞不进去。',
      },
      async enter(c, engine) {
        junk.clear();
        framed(c);
        c.lantern.showPanels(true);
        c.lantern.showDecor(false);
        c.lantern.core.visible = false;
        for (const id of PANELS) c.lantern.parts.get(id).installed = false;
        c.lantern.applyAssembly();

        let seated = 0;
        const install = async (pid, guided) => {
          const p = c.lantern.parts.get(pid);
          const g = p.mesh;
          const home = p.home.clone();
          const out = new THREE.Vector3(...p.placement.outward);
          const tilt = (J4.TILT_DEG * Math.PI) / 180;
          const rotZ = p.placement.rotZ;
          const axis = new THREE.Vector3(out.y, -out.x, 0).normalize();
          const lift = J4.SLOT_UP_D - J4.BITE_UP;

          if (guided) c.hud.setCue('① <em>斜着</em>顶进上面那道深槽');
          await tween(0.5, (k) => {
            g.setRotationFromAxisAngle(axis, -tilt * k);
            g.rotation.z = rotZ;
            g.position.copy(home).addScaledVector(out, -a(1) * (1 - k)).setZ(home.z + lift * k);
          }, { ease: Ease.outQuad });
          c.sfx.play('WOOD_SLIDE', { gain: 0.5 });

          if (guided) c.hud.setCue('② <em>摆正</em>，让下端越过下面的框');
          await tween(0.4, (k) => {
            g.setRotationFromAxisAngle(axis, -tilt * (1 - k));
            g.rotation.z = rotZ;
          }, { ease: Ease.inOutQuad });

          if (guided) c.hud.setCue('③ <em>落下去</em>，下端进浅槽');
          await tween(0.35, (k) => { g.position.z = home.z + lift * (1 - k); }, { ease: Ease.inQuad });
          g.position.copy(home);
          g.rotation.set(0, 0, rotZ);
          p.installed = true;

          c.sfx.play('PANEL_SEAT', { pitch: seated * 2 });
          c.fx.ripples.emit(home.clone().setZ(C.UPPER_Z0), out, { color: PALETTE.MORTISE, size: 12 });
          seated++;
          c.hud.setCue(`格心 <b>${seated}</b> / 4`);
        };

        const one = async () => {
          const pid = PANELS[seated];
          if (!pid) return;
          if (seated === 0) c.lantern.setSection(['UB-A1'], true);
          await install(pid, seated === 0);
          c.lantern.setSection(null, false);
          if (seated >= 4) {
            c.sfx.play('WOOD_SETTLE', { gain: 0.5 });
            c.hud.toast('四片都装好了', { gold: true });
            engine.done();
            return;
          }
          c.hud.setTask(`装第 ${seated + 1} 片`, one);
        };

        c.hud.setTask('装第 1 片', one);
        c.hud.setAlts([{ label: '四片一起装', ico: 'spark', onClick: async () => {
          while (seated < 4) await install(PANELS[seated], false);
          c.hud.toast('四片都装好了', { gold: true });
          engine.done();
        } }]);
      },
      exit(c) {
        junk.clear(); c.lantern.setSection(null, false);
        for (const id of PANELS) c.lantern.parts.get(id).installed = true;
        c.lantern.applyAssembly();
      },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'D3', phase: 3,
      title: '糊纸，贴花，上锁',
      mood: 'studio',
      cam: { az: 55, el: 16, dist: 430, target: [0, 0, 96], snap: true },
      narration: `接下来是灯笼的「皮」。
先在里面糊一层绵纸 —— 它挡在灯和木头之间，把硬光揉软；再在外面贴上红纸窗花。
（气口）
然后是四个角的祥云牙子。它看着是云头花纹，其实撑着这个角，让方框不容易变歪。
再装顶上的龙纹角花：一边把小舌插进槽里，一边正好盖住柱头 —— 柱子从此拔不出来。
好看的东西，往往同时是有用的。
（气口）
顶上一个中国结，底下一串红流苏。最后，把灯芯放进去。`,
      note: {
        title: '角花在干什么',
        body: '云头牙子撑住四个角；顶上的角花<em>盖住柱头</em>，柱子就再也拔不出来。',
        foot: '一道咬，一道压 —— 两道锁。',
      },
      async enter(c, engine) {
        junk.clear();
        framed(c);
        c.lantern.showPanels(true);
        for (const id of PANELS) c.lantern.parts.get(id).installed = true;
        c.lantern.applyAssembly();
        c.lantern.showDecor(false);
        c.lantern.core.visible = false;

        let phase = 0;
        const steps = [
          {
            label: '糊绵纸',
            run: async () => {
              for (const [i, g] of c.lantern.decor.papers.entries()) {
                g.visible = true;
                const m = g.children[0].material;
                m.opacity = 0;
                await tween(0.3, (k) => { m.opacity = 0.72 * k; });
                c.sfx.play('PAPER', { pitch: i * 1.5 });
              }
              c.hud.setCue('纸糊在<em>内侧</em> —— 它把硬光揉软');
            },
          },
          {
            label: '贴窗花',
            run: async () => {
              for (const [i, g] of c.lantern.decor.cutpapers.entries()) {
                g.visible = true;
                g.scale.setScalar(0.6);
                await tween(0.34, (k) => g.scale.setScalar(0.6 + 0.4 * Ease.outBack(k)));
                g.scale.setScalar(1);
                c.sfx.play('PAPER', { pitch: 4 + i * 2, gain: 0.8 });
              }
              c.hud.setCue('福到 · 年年有余 · 连年如意 · 福气临门');
            },
          },
          {
            label: '装祥云牙子',
            run: async () => {
              for (const [i, b] of c.lantern.decor.brackets.entries()) {
                b.visible = true;
                const home = b.position.clone();
                const from = home.clone().add(b.userData.slideIn.clone().multiplyScalar(-1.6));
                b.position.copy(from);
                await tween(0.3, (k) => b.position.lerpVectors(from, home, Ease.outCubic(k)));
                b.position.copy(home);
                c.sfx.play('WOOD_TAP', { pitch: i * 2, gain: 0.7 });
              }
              c.hud.setCue('四个角，各撑一个');
            },
          },
          {
            label: '装龙纹角花',
            run: async () => {
              for (const [i, p] of c.lantern.decor.plates.entries()) {
                p.visible = true;
                const home = p.position.clone();
                p.position.z = home.z + a(2.5);
                if (i === 0) {
                  c.lantern.setSection(['UB-B1'], true);
                  c.hud.toast('一边插进槽里，一边盖住柱头', { dur: 2400 });
                }
                await tween(i === 0 ? 0.8 : 0.28, (k) => {
                  p.position.z = home.z + a(2.5) * (1 - Ease.inQuad(k));
                });
                p.position.copy(home);
                c.sfx.play('SNAP_LOCK', { pitch: i * 2, gain: 0.7 });
                if (i === 0) { await wait(0.7); c.lantern.setSection(null, false); }
              }
              c.hud.setCue('两道锁 —— 一道咬，一道压');
            },
          },
          {
            label: '挂结与流苏',
            run: async () => {
              c.lantern.knot.visible = true;
              c.lantern.tassel.visible = true;
              c.sfx.play('KNOT_SWING');
              c.hud.setCue('风一吹，它就动了');
            },
          },
          {
            label: '放灯芯',
            run: async () => {
              c.lantern.core.visible = true;
              c.lantern.setLit(0);            // 还不点亮
              const home = c.lantern.core.userData.home || c.lantern.core.position.clone();
              c.lantern.core.userData.home = home;
              c.lantern.core.position.z = home.z - a(4);
              await tween(0.8, (k) => {
                c.lantern.core.position.z = home.z - a(4) * (1 - Ease.outCubic(k));
              });
              c.lantern.core.position.copy(home);
              c.sfx.play('WOOD_TAP', { pitch: -4 });
              c.hud.setCue('灯芯就位 —— 先不点，留到最后');
              c.hud.setNote({
                title: '做完了',
                spec: [['木构件', '13'], ['装饰件', '10'], ['格心与纸', '12'], ['灯芯', '1'], ['合计', '36 件']],
                body: '榫卯节点 26 处。钉子 0，胶水 0。',
              });
            },
          },
        ];

        const step = async () => {
          const s = steps[phase];
          c.hud.setTask(null);
          await s.run();
          phase++;
          if (phase >= steps.length) { engine.done(); return; }
          c.hud.setTask(steps[phase].label, step);
        };
        c.hud.setTask(steps[0].label, step);
      },
      exit(c) { junk.clear(); c.lantern.setSection(null, false); c.lantern.clearHighlights(); },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'D4', phase: 3,
      title: '拆开看一遍',
      mood: 'studio',
      cam: { az: 48, el: 22, dist: 660, target: [0, 0, 96], snap: true },
      cps: 3.9,
      narration: `我们把它拆开看一遍。
最底下是下面那个框：四根木条穿成井字，中间横着一根中梁。
往上是一模一样的上框，只是没有中梁。
中间四根柱子把两个框夹住，然后是四片格心、里外两层纸，最后是那些看着像花、其实在干活的装饰件。
（气口）
五层，三十六件。每一件都只做一件事，但每一件都不能少。`,
      async enter(c) {
        junk.clear();
        framed(c);
        c.lantern.showPanels(true);
        for (const id of PANELS) c.lantern.parts.get(id).installed = true;
        c.lantern.applyAssembly();
        c.lantern.showDecor(true);
        c.lantern.core.visible = true;

        c.hud.dock({
          body: `<div class="layers">${EXPLODE_LAYERS.map((l) =>
            `<button class="layer" type="button" data-l="${l.id}" aria-pressed="false">
               <span>${l.name}</span><b>${l.count}</b></button>`).join('')}</div>
            <div class="slider"><span>拆开</span>
              <input type="range" min="0" max="100" value="0" aria-label="拆开"></div>`,
          hint: '点一层，只看那一层',
          onMount: (o) => {
            o.querySelectorAll('.layer').forEach((b) => {
              b.addEventListener('click', () => {
                const on = b.getAttribute('aria-pressed') === 'false';
                o.querySelectorAll('.layer').forEach((x) => x.setAttribute('aria-pressed', 'false'));
                b.setAttribute('aria-pressed', String(on));
                c.lantern.focusLayer(on ? +b.dataset.l : null);
                c.lantern.setExplode(c.lantern.explodeT, 'layered');
              });
            });
            const rng = o.querySelector('input');
            rng.addEventListener('input', () => c.lantern.setExplode(rng.value / 100, 'layered'));
            c.explodeRange = rng;
          },
        });

        await wait(0.6);
        await tween(3.0, (k) => {
          c.lantern.setExplode(k, 'layered');
          if (c.explodeRange) c.explodeRange.value = k * 100;
        }, { ease: Ease.inOutCubic });

        c.hud.setAlts([{ label: '合回去', ico: 'refresh', onClick: async () => {
          await tween(2.2, (k) => {
            c.lantern.setExplode(1 - k, 'layered');
            if (c.explodeRange) c.explodeRange.value = (1 - k) * 100;
          }, { ease: Ease.inOutCubic });
          c.sfx.play('SNAP_IN');
        } }]);
      },
      exit(c) {
        junk.clear();
        c.hud.hideOverlay();
        c.lantern.focusLayer(null);
        c.lantern.setExplode(0, 'layered');
      },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'D5', phase: 3,
      title: '过年该做的事',
      mood: 'night',
      bgm: 'BGM_C_FESTIVE_LOOP',
      cam: { az: 50, el: 14, dist: 500, target: [0, 0, 96], snap: true },
      narration: `灯笼做好了。
接下来是过年该做的事：点上它，猜几个灯谜，写一句愿望，把它挂起来，再放一场烟花。
想先做哪个都行。`,
      async enter(c) {
        junk.clear();
        framed(c);
        c.lantern.showPanels(true);
        for (const id of PANELS) c.lantern.parts.get(id).installed = true;
        c.lantern.applyAssembly();
        c.lantern.showDecor(true);
        c.lantern.core.visible = true;
        c.lantern.setLit(c.state.lit ? Math.min(1.4, 1 + c.state.riddleScore * 0.08) : 0);
        c.openHub();
      },
      exit() { junk.clear(); },
    },
  ];
}
