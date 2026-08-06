/**
 * 团圆（6 步）—— 从骨架到一盏灯
 */

import * as THREE from 'three';
import { V, a, C, J4, PALETTE, Junk } from './util.js';
import { PATTERNS, buildPatternTexture } from '../render/lattice.js';
import { EXPLODE_LAYERS } from '../render/lantern.js';
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
      id: 'D1', phase: 4, phaseRatio: 0.15,
      title: '选一个花纹',
      mood: 'studio',
      bgm: 'BGM_C_FESTIVE',
      cam: { az: 90, el: 4, dist: 320, target: [0, 0, 96], snap: true },
      gate: true,
      narration: `框架做好了，四个面是空的。
要把它填上 —— 用一片叫做「格心」的木板。
格心不是拼出来的，是在一整片木板上镂空做出花纹 —— 这样它才够结实，也才够整齐。
（气口）
花纹有讲究。
麻叶纹，六出放射，像麻叶舒展，寓意生生不息；
冰裂纹，看似随意开裂，其实每条线都不交叉，取「冰破春来」；
万字纹，回环相连，没有起点也没有终点，叫做「万福不断头」。
你想用哪一种？`,
      async enter(c, engine) {
        junk.clear();
        framed(c);
        c.lantern.showPanels(false);
        c.lantern.showDecor(false);
        c.lantern.core.visible = false;

        c.hud.showOverlay(`<div class="dock">
          <div class="picks">${PATTERNS.map((p) => `
            <button class="pick ${p.id === c.state.patternId ? 'on' : ''}" data-id="${p.id}">
              <canvas width="220" height="220" data-cv="${p.id}"></canvas>
              <div class="meta"><div class="nm">${p.name}</div><div class="mn">${p.meaning}</div></div>
            </button>`).join('')}
          </div>
        </div>`, { veil: false, onMount: (o) => {
          for (const p of PATTERNS) {
            const cv = o.querySelector(`[data-cv="${p.id}"]`);
            const tex = buildPatternTexture(p.id, 220);
            const g = cv.getContext('2d');
            g.fillStyle = '#0a0806'; g.fillRect(0, 0, 220, 220);
            g.globalCompositeOperation = 'lighter';
            g.drawImage(tex.image, 0, 0, 220, 220);
            tex.dispose();
          }
          o.querySelectorAll('.pick').forEach((btn) => {
            btn.addEventListener('click', () => {
              o.querySelectorAll('.pick').forEach((b) => b.classList.remove('on'));
              btn.classList.add('on');
              c.state.patternId = btn.dataset.id;
              c.lantern.setPattern(btn.dataset.id);
              c.lantern.showPanels(true);
              for (const pid of PANELS) c.lantern.parts.get(pid).installed = true;
              c.lantern.applyAssembly();
              c.sfx.play('UI_TAP_WOOD');
              engine.unlock('就用这个');
            });
          });
        } });
        c.hud.setHint('这个选择会一直留到最后');
      },
      exit(c) { c.hud.hideOverlay(); junk.clear(); },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'D2', phase: 4, phaseRatio: 0.32,
      title: '把板子装进去',
      mood: 'studio',
      cam: { az: 90, el: 6, dist: 350, target: [0, 0, 96], snap: true },
      gate: true,
      narration: `装板，是木作里的第三种基本功 —— 不靠榫，也不靠胶。
上下两道槽，把板夹住，就完了。
可是问题来了：板比空腔还高一点，怎么塞进去？
（气口）
老办法是这样的：
先斜着，把板顶进上面那道深槽 —— 上槽特意做得深，就是留这个余量的。
顶到底，再摆正。
然后往下一落 —— 下端正好掉进下面那道浅槽。
上下都吃住了，板就再也出不来。
（停顿 0.8 s）
不粘、不钉。木头会热胀冷缩，这样留着余地，它才不会开裂。`,
      note: {
        title: '上槽比下槽深三倍',
        body: '深出来的那一截，正好是把板<em>塞进去</em>需要的余量：'
            + '先斜着顶进深槽，摆正，再落下来。',
        tiny: '两边一样深，这块板在数学上就装不进去。',
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

          if (guided) c.hud.setHint('① <em>斜着</em>顶进上面那道深槽');
          await tween(0.5, (k) => {
            g.setRotationFromAxisAngle(axis, -tilt * k);
            g.rotation.z = rotZ;
            g.position.copy(home).addScaledVector(out, -a(1) * (1 - k)).setZ(home.z + lift * k);
          }, { ease: Ease.outQuad });
          c.sfx.play('WOOD_SLIDE', { gain: 0.6 });

          if (guided) c.hud.setHint('② <em>摆正</em>，让下端越过下面的框');
          await tween(0.4, (k) => {
            g.setRotationFromAxisAngle(axis, -tilt * (1 - k));
            g.rotation.z = rotZ;
          }, { ease: Ease.inOutQuad });
          c.sfx.play('WOOD_SLIDE', { gain: 0.4, pitch: 3 });

          if (guided) c.hud.setHint('③ <em>落下去</em>，下端进浅槽');
          await tween(0.35, (k) => { g.position.z = home.z + lift * (1 - k); }, { ease: Ease.inQuad });
          await tween(0.1, (k) => { g.position.z = home.z + Math.sin(k * Math.PI) * 0.5; });
          g.position.copy(home);
          g.rotation.set(0, 0, rotZ);
          p.installed = true;

          c.sfx.play('PANEL_SEAT', { pitch: seated * 2 });
          c.fx.ripples.emit(home.clone().setZ(C.UPPER_Z0), out, { color: PALETTE.MORTISE, size: 12 });
          seated++;
          c.hud.setHint(`格心 <em>${seated}</em> / 4`);
        };

        const one = async (btn) => {
          if (btn) btn.disabled = true;
          const pid = PANELS[seated];
          if (!pid) return;
          if (seated === 0) { c.lantern.setSection(['UB-A1'], true); c.sfx.play('SLICE_SOFT'); }
          await install(pid, seated === 0);
          c.lantern.setSection(null, false);
          if (seated >= 4) {
            await tween(0.3, (k) => { c.lantern.root.position.z = -1 * Math.sin(k * Math.PI); });
            c.lantern.root.position.z = 0;
            c.sfx.play('WOOD_SETTLE', { gain: 0.5 });
            c.sfx.play('SUCCESS_MID', { delay: 0.15 });
            c.hud.toast('四片都装好了', { gold: true });
            c.hud.setAlts([]);
            engine.unlock();
            return;
          }
          engine.override = () => one();
          c.hud.setNext({ label: `装第 ${seated + 1} 片`, enabled: true });
        };

        engine.override = () => one();
        c.hud.setNext({ label: '装第 1 片', enabled: true });
        c.hud.setAlts([{ label: '四片一起装', onClick: async () => {
          c.hud.setNext({ enabled: false });
          while (seated < 4) await install(PANELS[seated], false);
          c.hud.toast('四片都装好了', { gold: true });
          engine.override = null;
          engine.unlock();
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
      id: 'D3', phase: 4, phaseRatio: 0.55,
      title: '糊纸，贴花，上锁',
      mood: 'studio',
      cam: { az: 55, el: 16, dist: 430, target: [0, 0, 96], snap: true },
      gate: true,
      narration: `接下来是灯笼的「皮」。
先在里面糊一层绵纸。纸要糊在内侧 —— 它挡在灯和木头之间，把硬邦邦的光揉软。
然后在外面贴窗花。红纸剪的：福字、鲤鱼、莲花、蝙蝠。
一层纸，一层红。木头做的架子，到这一刻，才终于像一盏灯笼。
（气口）
最后装四样东西。
先是祥云牙子 —— 四个角各一个。看着是云头花纹，其实它有个正经名字，叫「角牙」。
它插进角上的小槽里，把这个角撑住，让方框不容易变歪。
（气口）
然后是龙纹角花，装在顶上四个角。
这个更要紧 —— 你看它落下来的时候：一边把小舌头插进槽里，一边正好盖住立柱的头。
刚才立柱是靠自己咬紧的；现在，它被从上面压死了。
两道锁，一道咬，一道压。
（停顿 0.8 s）
在中国的木作里，好看的东西，往往同时是有用的。
最后 —— 顶上一个中国结，底下一串红流苏。`,
      note: {
        title: '好看的东西，往往有用',
        body: '角上的云头不是花 —— 它撑着这个角，让方框不容易变歪。'
            + '顶上的角花更要紧：它<em>压住柱头</em>，柱子就再也拔不出来了。',
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
                await tween(0.36, (k) => { m.opacity = 0.72 * k; });
                c.sfx.play('PAPER_SMOOTH', { pitch: i * 1.5 });
              }
              c.hud.setHint('纸糊在<em>内侧</em> —— 它把硬光揉软');
            },
          },
          {
            label: '贴窗花',
            run: async () => {
              for (const [i, g] of c.lantern.decor.cutpapers.entries()) {
                g.visible = true;
                g.scale.setScalar(0.6);
                await tween(0.4, (k) => g.scale.setScalar(0.6 + 0.4 * Ease.outBack(k)));
                g.scale.setScalar(1);
                c.sfx.play('PAPER_STICK', { pitch: i * 2 });
              }
              c.sfx.play('SHIMMER_WARM', { delay: 0.2 });
              c.hud.setHint('福到 · 年年有余 · 连年如意 · 福气临门');
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
                await tween(0.34, (k) => b.position.lerpVectors(from, home, Ease.outCubic(k)));
                b.position.copy(home);
                c.sfx.play('WOOD_TAP', { pitch: i * 2 });
              }
              c.hud.setHint('四个角，各撑一个');
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
                  c.sfx.play('SLICE_SOFT');
                  c.hud.toast('一边插进槽里，一边盖住柱头', { dur: 2600 });
                }
                await tween(i === 0 ? 0.9 : 0.3, (k) => {
                  p.position.z = home.z + a(2.5) * (1 - Ease.inQuad(k));
                });
                p.position.copy(home);
                c.sfx.play('SNAP_LOCK_SOFT', { pitch: i * 2 });
                const col = `PL-0${i + 1}`;
                c.lantern.highlight(col, PALETTE.TENON, 0.8);
                c.sfx.play('SHIMMER_SHORT', { gain: 0.6 });
                setTimeout(() => c.lantern.highlight(col, 0, 0), 600);
                if (i === 0) { await wait(0.8); c.lantern.setSection(null, false); }
              }
              c.hud.setHint('两道锁 —— 一道咬，一道压');
            },
          },
          {
            label: '挂结与流苏',
            run: async () => {
              c.lantern.knot.visible = true;
              c.lantern.tassel.visible = true;
              c.sfx.play('KNOT_SWING');
              c.sfx.play('TASSEL_SWAY', { delay: 0.3 });
              c.sfx.play('SUCCESS_MID', { delay: 0.4 });
              c.hud.setHint('风一吹，它就动了');
            },
          },
        ];

        const step = async () => {
          if (phase >= steps.length) { engine.override = null; engine.unlock(); return; }
          const s = steps[phase];
          await s.run();
          phase++;
          if (phase >= steps.length) { engine.override = null; engine.unlock(); return; }
          engine.override = step;
          c.hud.setNext({ label: steps[phase].label, enabled: true });
        };
        engine.override = step;
        c.hud.setNext({ label: steps[0].label, enabled: true });
      },
      exit(c) { junk.clear(); c.lantern.setSection(null, false); c.lantern.clearHighlights(); },
    },

    // ══════════════════════════════════════════════════════
    // 静默点 ②
    // ══════════════════════════════════════════════════════
    {
      id: 'D4', phase: 4, phaseRatio: 0.72,
      title: '灯芯就位',
      mood: 'dark',
      bgm: 'BGM_C_FESTIVE', bgmLevel: 0.4,
      cam: { az: 200, el: 12, dist: 450, target: [0, 0, 96], snap: true, ease: 0.16 },
      narration: `最后，把灯芯放进去。`,
      async enter(c, engine) {
        junk.clear();
        framed(c);
        c.lantern.showPanels(true);
        for (const id of PANELS) c.lantern.parts.get(id).installed = true;
        c.lantern.applyAssembly();
        c.lantern.showDecor(true);
        c.lantern.core.visible = true;
        c.lantern.setLit(0);           // 还不点亮

        const home = c.lantern.core.userData.home || c.lantern.core.position.clone();
        c.lantern.core.userData.home = home;
        c.lantern.core.position.z = home.z - a(4);
        await tween(0.9, (k) => { c.lantern.core.position.z = home.z - a(4) * (1 - Ease.outCubic(k)); });
        c.lantern.core.position.copy(home);
        c.sfx.play('WOOD_TAP', { pitch: -4 });

        // 十二秒，什么都不说
        await wait(1.4);
        c.hud.quiet(true);
        c.bgm.setLevel(0.28, 2.0);
        engine.lock();
        let ang = 0;
        const upd = (dt) => {
          ang += dt * (Math.PI / 4);
          c.stage.setRecommended({
            az: 200 + (ang * 180) / Math.PI, el: 12 + Math.sin(ang * 0.5) * 6,
            dist: 450, target: V(0, 0, 96), ease: 0.5,
          });
        };
        c.stage.updaters.add(upd);
        junk.add({ dispose: () => c.stage.updaters.delete(upd) });

        c.tourTimer = setTimeout(() => {
          c.stage.updaters.delete(upd);
          c.hud.quiet(false);
          c.bgm.setLevel(1, 1.5);
          c.voice.play('D4b', `十三根木条，三十二个零件。
没有用一根钉子，也没有用一滴胶水。`, { cps: 3.6 });
          c.hud.setNote({
            title: '做完了',
            num: [['木构件', '13'], ['装饰件', '10'], ['格心与纸', '12'], ['灯芯', '1']],
            body: '合计 <em>36</em> 件，榫卯节点 26 处。',
            tiny: '钉子 0 · 胶水 0',
          });
          c.sfx.play('UI_TICK');
          engine.unlock();
        }, 12000);
      },
      exit(c) { clearTimeout(c.tourTimer); junk.clear(); c.hud.quiet(false); },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'D5', phase: 4, phaseRatio: 0.88,
      title: '拆开看一遍',
      mood: 'dark',
      cam: { az: 48, el: 22, dist: 660, target: [0, 0, 96], snap: true },
      cps: 3.9,
      narration: `我们把它拆开看一遍。
最底下，是下枨框 —— 四根木条穿成井字，中间横着一根中梁。
往上，是一模一样的上枨框，只是没有中梁。
中间，四根立柱把上下两个框夹住。
然后是四片格心、里外两层纸。
最后是那些看着像花、其实在干活的装饰件。
（气口）
五层。三十六件。
每一件都只做一件事，但每一件都不能少。
这就是榫卯 —— 不是某一个巧妙的接头，是一整套让零件互相成全的办法。`,
      async enter(c) {
        junk.clear();
        framed(c);
        c.lantern.showPanels(true);
        for (const id of PANELS) c.lantern.parts.get(id).installed = true;
        c.lantern.applyAssembly();
        c.lantern.showDecor(true);
        c.lantern.core.visible = true;

        c.hud.showOverlay(`<div class="dock">
          <div class="layers">${EXPLODE_LAYERS.map((l) =>
            `<button class="layer" data-l="${l.id}">${l.name} · ${l.count}</button>`).join('')}
          </div>
          <div class="slider"><span>拆开</span><input type="range" min="0" max="100" value="0"></div>
        </div>`, { veil: false, onMount: (o) => {
          o.querySelectorAll('.layer').forEach((b) => {
            b.addEventListener('click', () => {
              const on = !b.classList.contains('on');
              o.querySelectorAll('.layer').forEach((x) => x.classList.remove('on'));
              if (on) b.classList.add('on');
              c.lantern.focusLayer(on ? +b.dataset.l : null);
              c.lantern.setExplode(c.lantern.explodeT, 'layered');
              c.sfx.play('UI_CARD');
            });
          });
          const rng = o.querySelector('input');
          let last = 0;
          rng.addEventListener('input', () => {
            const t = rng.value / 100;
            c.lantern.setExplode(t, 'layered');
            const s = Math.floor(t * 5);
            if (s !== last) { last = s; c.sfx.play('LAYER_SEPARATE', { pitch: s * 2, gain: 0.5 }); }
          });
          c.explodeRange = rng;
        } });

        await wait(0.8);
        await tween(3.5, (k) => {
          c.lantern.setExplode(k, 'layered');
          if (c.explodeRange) c.explodeRange.value = k * 100;
        }, { ease: Ease.inOutCubic });

        c.hud.setAlts([{ label: '合回去', onClick: async () => {
          await tween(2.5, (k) => {
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
      id: 'D6', phase: 4, phaseRatio: 1,
      title: '过年该做的事',
      mood: 'night',
      bgm: 'BGM_C_FESTIVE_LOOP',
      cam: { az: 50, el: 14, dist: 500, target: [0, 0, 96], snap: true },
      hideNext: true,
      narration: `灯笼做好了。
接下来，是过年该做的事。
点上它，猜几个灯谜，写一句愿望；
把它挂到你家门口，再放一场烟花。
（停顿 0.8 s）
不着急，想先做哪个都行。`,
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
