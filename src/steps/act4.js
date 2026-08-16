/**
 * 装点年味（5 步）—— 从骨架到一盏灯
 */

import * as THREE from 'three';
import { a, C, J4, PALETTE, Junk, AIM_LANTERN, FIT_LANTERN, FIT_FRAME } from './util.js';
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
      cam: { az: 40, el: 10, dist: 360, target: [0, 0, 96], fit: FIT_FRAME },
      narration: `框架好了，四个面还空着。
每一面要填一片镂空的木板，叫「格心」。
细木条叫棂条，一根搭着一根。
所以掏空了这么多，板还立得住。
（气口）
万字纹，一笔连到底 ——「万福不断头」。
麻叶纹，像麻叶那样舒展 ——「生生不息」。
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
              <canvas width="180" height="180" data-cv="${p.id}"></canvas>
              <span class="pick-meta">
                <span class="pick-nm">${p.name}</span>
                <span class="pick-mn">${p.note}</span>
              </span>
              <span class="pick-on">${icon('check')}</span>
            </button>`).join('')}</div>`,
          onMount: (o) => {
            // 缩略图跟着主题走：浅色下是木棂压在宣纸上，深色下是灯从背后透出来
            const css = getComputedStyle(document.documentElement);
            const dark = document.documentElement.dataset.theme === 'dark';
            const paper = css.getPropertyValue('--surface-2').trim() || '#fbf6ea';
            for (const p of PATTERNS) {
              const cv = o.querySelector(`[data-cv="${p.id}"]`);
              const tex = buildPatternTexture(p.id, 180);
              const g = cv.getContext('2d');
              g.fillStyle = dark ? '#0d0a07' : paper;
              g.fillRect(0, 0, 180, 180);
              g.globalCompositeOperation = dark ? 'lighter' : 'multiply';
              g.globalAlpha = dark ? 1 : 0.82;
              g.drawImage(tex.image, 0, 0, 180, 180);
              g.globalCompositeOperation = 'source-over';
              g.globalAlpha = 1;
              tex.dispose();
            }
            const choose = (btn) => {
              o.querySelectorAll('.pick').forEach((b) => b.setAttribute('aria-pressed', 'false'));
              btn.setAttribute('aria-pressed', 'true');
              c.state.patternId = btn.dataset.id;
              c.lantern.setPattern(btn.dataset.id);
              c.lantern.showPanels(true);
              for (const pid of PANELS) c.lantern.parts.get(pid).installed = true;
              c.lantern.applyAssembly();
              c.sfx.play('WOOD_TAP');
              c.hud.setCue('四面都用它了');
              engine.done();
            };
            // 选中即定案，直接往下走 —— 不再多一个确认按钮
            o.querySelectorAll('.pick').forEach((btn) => {
              btn.addEventListener('click', async () => {
                choose(btn);
                await wait(0.7);
                engine.next();
              });
            });
            // 直接按「下一步」：替他把现在选着的那一个定下来，页先不翻 ——
            // 四面用哪个花纹是这一遍唯一的个性化选择，总得让他看见它落到灯上
            engine.assist(() => choose(o.querySelector('.pick[aria-pressed="true"]')
              || o.querySelector('.pick')));
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
      cam: { az: 35, el: 14, dist: 350, target: [0, 0, 96], fit: FIT_FRAME },
      narration: `装板不靠榫，也不靠胶。
上下两道槽把板夹住，就成了。
可板比两个框中间的空当还高一点。
怎么装进去？
（气口）
先斜着，把板顶进上面那道深槽。
上槽特意开得深，多出的那一截是给板让的路。
摆正，再往下一落，下端正好进浅槽。
上下都咬住了，板就掉不出来。
（气口）
但也没夹死 —— 装完了，那一截还空着。
木头潮了会胀，干了会缩，空着的地方是留给它的。`,
      note: {
        title: '上槽是下槽的三倍深',
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
          c.hud.setCue(`格心 <b>${seated}</b> / 4`, null, { quiet: true });
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
        c.hud.setAlts([{ label: '帮我装上', ico: 'spark', onClick: async () => {
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
      cam: { az: 55, el: 16, dist: 430, target: AIM_LANTERN, fit: FIT_LANTERN },
      narration: `接下来是灯笼的「皮」。
先在里面糊一层绵纸。
再在外面贴上红纸窗花。
（气口）
四个角，各装一个祥云牙子。
它看着是云头花纹，其实撑着这个角。
有它在，方框才不容易歪。
再装顶上的龙纹角花，扣住四个柱头。
角花一装，柱子就再也退不出来了。
（气口）
中梁底下挂一个中国结，再接一串红流苏。
最后把灯芯放进去 —— 它就坐在中梁上面。`,
      note: {
        title: '上的是哪一道锁',
        spec: [['角花外挡边', '向外出挑 2 毫米'], ['角花压舌', '落进顶面浅槽']],
        body: '柱身和柱脚早已上下夹住框，剩下的只有往外退这一条路 —— '
            + '角花外缘多出来的那圈边，正好横在路口。牙子不在这条路上，它管的是角。',
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
                await tween(0.3, (k) => { m.opacity = 0.86 * k; });
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
              c.hud.setCue('四面各贴一张 —— 福到、年年有余、连年如意、福气临门');
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
              c.hud.setCue('四个柱头，都盖上了');
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
                title: '一盏灯的全部',
                spec: [['木构件', '13'], ['格心与纸', '12'], ['装饰件', '10'], ['灯芯', '1'], ['合计', '36 件']],
                body: '钉子 0，胶水 0。',
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
      // 取景按拆到底时的实测包围盒给：水平最远的是四张窗花（沿各自法向外移
      // 150 × 1.35 = 202.5 mm，实测半径 260），最高的是柱头角花、最低的是穗子
      // （z ∈ [−72, 265]，相对目标 92 的最大偏离 173）。
      // r 原先写 200，窄画幅上左右两张窗花整片被裁掉 —— 而这一步说的正是「一件不少」。
      cam: { az: 48, el: 22, dist: 660, target: [0, 0, 92], fit: { r: 260, h: 178 } },
      cps: 3.9,
      narration: `我们把它拆开看一遍。
最底下是底盘：四根木条穿成井字，中间横着一根中梁。
上面的框几乎一样，只是没有中梁。
中间四根柱子，把两个框夹住。
再往外是四片格心，里外各一层纸。
最外面那些看着像花，其实都在干活。
（气口）
五层，三十六件 —— 一件不多，一件不少。`,
      async enter(c) {
        junk.clear();
        framed(c);
        c.lantern.showPanels(true);
        for (const id of PANELS) c.lantern.parts.get(id).installed = true;
        c.lantern.applyAssembly();
        c.lantern.showDecor(true);
        c.lantern.core.visible = true;

        // 坞压得越矮，灯笼在画面里就越大 —— 这一步要看的正是那三十六件东西
        c.hud.dock({
          body: `<div class="layers">${EXPLODE_LAYERS.map((l) =>
            `<button class="layer" type="button" data-l="${l.id}" aria-pressed="false">
               <span>${l.name}</span><b>${l.count}</b></button>`).join('')}
            <div class="slider"><span>拆开</span>
              <input type="range" min="0" max="100" value="0" aria-label="拆开程度"></div></div>`,
          onMount: (o) => {
            o.querySelectorAll('.layer').forEach((b) => {
              // 与滑杆同理：坞被交还回来时，选中的那一层要跟着模型现在的样子摆。
              // 不摆的话，某一层还单独亮着，却没有一枚按钮显示为选中 ——
              // 再点它一下会当成「打开」，于是要点两次才收得掉
              b.setAttribute('aria-pressed', String(c.lantern.layerFocus === +b.dataset.l));
              b.addEventListener('click', () => {
                const on = b.getAttribute('aria-pressed') === 'false';
                o.querySelectorAll('.layer').forEach((x) => x.setAttribute('aria-pressed', 'false'));
                b.setAttribute('aria-pressed', String(on));
                c.lantern.focusLayer(on ? +b.dataset.l : null);
                c.lantern.setExplode(c.lantern.explodeT, 'layered');
                c.sfx.play('UI_TAP');
              });
            });
            const rng = o.querySelector('input');
            // 坞可能被「怎么操作」盖过又交还回来 —— 滑杆要跟着模型现在的样子摆，
            // 不能一律回到 0，否则灯笼摊开着而滑杆写着「没拆」
            rng.value = Math.round(c.lantern.explodeT * 100);
            rng.addEventListener('input', () => c.lantern.setExplode(rng.value / 100, 'layered'));
            c.explodeRange = rng;
          },
        });
        c.hud.setCue('点一层，单看那一层', 'tap');

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
      cam: { az: 50, el: 14, dist: 500, target: AIM_LANTERN, fit: FIT_LANTERN },
      narration: `灯笼做好了。
剩下的，是过年该做的四件事。`,
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
