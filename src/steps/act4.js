/**
 * 第四幕 · 团圆（S26–S32 → 6 步）
 *
 * 涉及的修正与红线：
 *   D1  ★S26 纹样选择是全片唯一的个性化，state.patternId 必须贯穿到底
 *   D2  ★V-21/V-22 三段式落堂装板（导演红线：不可简化为一次性吸附）
 *   D3  ★V-12 内外分层 ／ ★V-20/V-25 角牙与角花承担真实结构职能
 *        （导演红线：首个角花必须手动安装并播放剖切演示）
 *   D4  ★静默点② 12 秒巡礼全清屏；灯芯装入但**不点亮**（点亮是 M1 的专属高潮）
 *   D5  ★S31 分层爆炸严格按 §6 装配序列逆序，与 S02 统一爆炸为两套独立数据
 */

import * as THREE from 'three';
import { V, a, dim, C, J4, PALETTE, Junk } from './util.js';
import { PATTERNS, buildPatternTexture } from '../render/lattice.js';
import { EXPLODE_LAYERS } from '../render/lantern.js';
import { CUTOUT_MOTIFS } from '../render/decor.js';
import { tween, Ease, wait } from '../util/tween.js';

const junk = new Junk(null);

export function act4(ctx) {
  junk.scene = ctx.stage.scene;
  const WOOD = [
    'LB-A1', 'LB-A2', 'LB-C1', 'LB-B1', 'LB-B2',
    'UB-A1', 'UB-A2', 'UB-B1', 'UB-B2', 'PL-01', 'PL-02', 'PL-03', 'PL-04',
  ];
  const PANELS = ['LT-01', 'LT-02', 'LT-03', 'LT-04'];

  const framePose = (c) => {
    c.lantern.attachAll();
    c.lantern.showOnly(null);
    for (const id of WOOD) { c.lantern.setOps(id, 'all'); c.lantern.parts.get(id).installed = true; }
    c.lantern.applyAssembly();
  };

  return [
    // ══════════════════════════════════════════════════════
    // D1 · 格心工艺与纹样选择 ★唯一外观个性化入口
    // ══════════════════════════════════════════════════════
    {
      id: 'D1', phase: 4, phaseRatio: 0.15,
      title: '选择你的格心纹样',
      mood: 'studio',
      bgm: 'BGM_C_FESTIVE',
      cam: { az: 90, el: 4, dist: 300, target: [0, 0, 96], snap: true },
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
      cards: [{
        title: '格心规格', tag: 'LT-01~04',
        rows: [
          ['尺寸', `${dim(8)} × ${dim(10)}`],
          ['厚度', `${dim(1 / 3)}（＝槽宽，无榫舌）`],
          ['全高', '125 mm'],
          ['数量', '4 片'],
        ],
        note: '此选择将保留至最终成品，并作用于地面光斑、许愿海报与 AR 灯笼。',
      }],
      async enter(c, engine) {
        junk.clear();
        framePose(c);
        c.lantern.showPanels(false);
        c.lantern.showDecor(false);
        c.lantern.core.visible = false;

        const html = `<div class="panel">
          <h2>选择你的格心纹样</h2>
          <p class="lead">全片唯一的外观个性化 · 将保留至最终成品</p>
          <div class="pickers">${PATTERNS.map((p) => `
            <button class="picker ${p.id === c.state.patternId ? 'sel' : ''}" data-id="${p.id}">
              <span class="chk">✓</span>
              <canvas width="220" height="220" data-cv="${p.id}"></canvas>
              <div class="meta">
                <div class="nm">${p.name}</div>
                <div class="ds">${p.sub}</div>
                <div class="mn">${p.meaning}</div>
              </div>
            </button>`).join('')}</div>
        </div>`;

        c.hud.showOverlay(html, { solid: false, onMount: (o) => {
          o.classList.add('clear');
          // 用同一份棂条数据烘出缩略图，保证「所见即所得」
          for (const p of PATTERNS) {
            const cv = o.querySelector(`[data-cv="${p.id}"]`);
            const tex = buildPatternTexture(p.id, 220);
            const g = cv.getContext('2d');
            g.fillStyle = '#100d0a'; g.fillRect(0, 0, 220, 220);
            g.globalCompositeOperation = 'lighter';
            g.drawImage(tex.image, 0, 0, 220, 220);
            tex.dispose();
          }
          o.querySelectorAll('.picker').forEach((btn) => {
            btn.addEventListener('click', () => {
              o.querySelectorAll('.picker').forEach((b) => b.classList.remove('sel'));
              btn.classList.add('sel');
              const id = btn.dataset.id;
              c.state.patternId = id;
              c.lantern.setPattern(id);
              c.lantern.showPanels(true);
              for (const pid of PANELS) c.lantern.parts.get(pid).installed = true;
              c.lantern.applyAssembly();
              c.sfx.play('UI_TAP_WOOD');
              c.hud.toast(`已选：${PATTERNS.find((x) => x.id === id).name}`, { dur: 1400 });
              engine.unlock('就用这个 ▸');
            });
          });
        } });
      },
      exit(c) { c.hud.hideOverlay(); junk.clear(); },
      nextLabel: '就用这个 ▸',
    },

    // ══════════════════════════════════════════════════════
    // D2 · 四片格心三段式落堂装板 ★V-21 / V-22（导演红线）
    // ══════════════════════════════════════════════════════
    {
      id: 'D2', phase: 4, phaseRatio: 0.32,
      title: '落堂装板 · 三段式',
      mood: 'studio',
      cam: { az: 90, el: 6, dist: 330, target: [0, 0, 96], snap: true },
      gate: true,
      hint: '① 斜着推 → ② 摆正 → ③ 往下落', hintPulse: true,
      narration: `装板，是木作里的第三种基本功 —— 不靠榫，也不靠胶。
上下两道槽，把板夹住，就完了。
可是问题来了：板比空腔还高一点，怎么塞进去？
（气口）
老办法是这样的：
先斜着，把板顶进上面那道深槽 —— 上槽特意做得深，就是留这个余量的。
顶到底，再摆正。
然后往下一落 —— 下端正好掉进下面那道浅槽。
上面留四分之一，下面咬六分之一，两头都吃住了，板就再也出不来。
（停顿 0.8 s）
不粘、不钉。木头会热胀冷缩，这样留着余地，它才不会开裂。`,
      cards: [{
        title: '三段式装法', tag: 'J-4',
        rows: [
          ['上槽深', `${dim(1 / 2)}（特意加深）`],
          ['下槽深', dim(1 / 6)],
          ['板厚', dim(1 / 3)],
          ['① 斜置', `倾 ${J4.TILT_DEG}°，顶入上槽至底`],
          ['② 摆正', '下端恰好让过下枨框 1 mm'],
          ['③ 下落', `${dim(1 / 4)} → 上咬 ${dim(1 / 4)}、下咬 ${dim(1 / 6)}`],
        ],
        warn: '若沿用上槽深 a/4，则 a/4 < a/4 + a/6 —— 格心在**数学上**装不进去（V-21）。',
      }, {
        title: '为什么上槽比下槽深三倍？', tag: '知识卡', fold: true,
        note: '为了「塞得进去」。这是装板的通用做法：上槽预留的余量，正好等于下槽的咬合量加上让位间隙。',
      }],
      async enter(c, engine) {
        junk.clear();
        framePose(c);
        c.lantern.showPanels(true);
        c.lantern.showDecor(false);
        c.lantern.core.visible = false;
        for (const id of PANELS) c.lantern.parts.get(id).installed = false;
        c.lantern.applyAssembly();
        c.hud.setCounter('格心 0/4');

        let seated = 0;
        /** 三段式落位动画（★不可简化为一次性吸附） */
        const install = async (pid, guided) => {
          const p = c.lantern.parts.get(pid);
          const g = p.mesh;
          const home = p.home.clone();
          const out = new THREE.Vector3(...p.placement.outward);
          const tilt = (J4.TILT_DEG * Math.PI) / 180;
          const baseRotZ = p.placement.rotZ;

          // ① 斜置 + 顶入上槽至底（吃进 a/2）
          if (guided) c.hud.setHint('① 斜着推 —— 把上端顶进上槽', { pulse: true });
          const lift = J4.SLOT_UP_D - J4.BITE_UP; // 3 mm
          await tween(0.5, (k) => {
            const axis = new THREE.Vector3(out.y, -out.x, 0).normalize();
            g.setRotationFromAxisAngle(axis, -tilt * k);
            g.rotateZ?.(0);
            g.rotation.z = baseRotZ;
            g.position.copy(home).addScaledVector(out, -a(1) * (1 - k)).setZ(home.z + lift * k);
          }, { ease: Ease.outQuad });
          c.sfx.play('WOOD_SLIDE', { gain: 0.6 });

          // ② 摆正
          if (guided) c.hud.setHint('② 摆正 —— 让下端越过下枨框', { pulse: true });
          await tween(0.4, (k) => {
            const axis = new THREE.Vector3(out.y, -out.x, 0).normalize();
            g.setRotationFromAxisAngle(axis, -tilt * (1 - k));
            g.rotation.z = baseRotZ;
          }, { ease: Ease.inOutQuad });
          c.sfx.play('WOOD_SLIDE', { gain: 0.4, pitch: 3 });

          // ③ 整片下落 a/4，下端落入下槽 a/6
          if (guided) c.hud.setHint('③ 往下落 —— 下端进入下槽', { pulse: true });
          await tween(0.35, (k) => { g.position.z = home.z + lift * (1 - k); }, { ease: Ease.inQuad });
          await tween(0.1, (k) => { g.position.z = home.z + Math.sin(k * Math.PI) * 0.5; });
          g.position.copy(home);
          g.rotation.set(0, 0, baseRotZ);
          p.installed = true;

          c.sfx.play('PANEL_SEAT', { pitch: seated * 2 });
          c.fx.ripples.emit(home.clone().setZ(C.UPPER_Z0), out, { color: PALETTE.MORTISE, size: 12 });
          seated++;
          c.hud.setCounter(`格心 ${seated}/4`);
        };

        // 首片为引导式操作（教学镜头，不可跳过），其后单击即可
        c.hud.setActions([
          { label: '安装这一片', kind: 'main', onClick: async (btn) => {
            btn.disabled = true;
            const pid = PANELS[seated];
            if (!pid) return;
            if (seated === 0) {
              c.lantern.setSection(['UB-A1'], true);
              c.sfx.play('SLICE_SOFT');
            }
            await install(pid, seated === 0);
            c.lantern.setSection(null, false);
            c.hud.setHint('');
            if (seated >= 4) {
              await tween(0.3, (k) => { c.lantern.root.position.z = -1 * Math.sin(k * Math.PI); });
              c.lantern.root.position.z = 0;
              c.sfx.play('WOOD_SETTLE', { gain: 0.5 });
              c.sfx.play('SUCCESS_MID', { delay: 0.15 });
              c.hud.toast('✓ 格心 4/4 · 落堂装板完成');
              c.hud.setActions([]);
              engine.unlock();
            } else {
              btn.disabled = false;
              btn.textContent = `安装第 ${seated + 1} 片`;
            }
          } },
          { label: '四片一起装（降级）', kind: 'alt', onClick: async () => {
            while (seated < 4) await install(PANELS[seated], false);
            c.hud.toast('✓ 格心 4/4 · 落堂装板完成');
            engine.unlock();
          } },
        ]);
      },
      exit(c) {
        junk.clear(); c.hud.setCounter(''); c.lantern.setSection(null, false);
        for (const id of PANELS) c.lantern.parts.get(id).installed = true;
        c.lantern.applyAssembly();
      },
    },

    // ══════════════════════════════════════════════════════
    // D3 · 糊绵纸 · 贴窗花 · 装饰件（含结构副锁）★V-12 / V-20 / V-25
    // ══════════════════════════════════════════════════════
    {
      id: 'D3', phase: 4, phaseRatio: 0.55,
      title: '灯笼的皮 · 与两道锁',
      mood: 'studio',
      cam: { az: 55, el: 16, dist: 400, target: [0, 0, 96], snap: true },
      gate: true,
      narration: `接下来是灯笼的「皮」。
先在里面糊一层绵纸。纸要糊在内侧 —— 它挡在灯和木头之间，把硬邦邦的光揉软。
然后在外面贴窗花。红纸剪的：福字、鲤鱼、莲花、蝙蝠 —— 福到、年年有余、连年如意、福气临门。
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
      cards: [{
        title: '三层关系（贴反即返工）', tag: '★V-12',
        html: `<div class="row"><span>外</span><b>窗花 DC-CUT</b></div>
               <div class="row"><span>中</span><b>格心 LT</b></div>
               <div class="row"><span>内</span><b>绵纸 DC-PAPER</b></div>`,
        note: '绵纸在内、窗花在外、格心居中。绵纸 transmission 0.45 是全片光效的基准值。',
      }, {
        title: '龙纹角花 = 装饰 + 柱头压片', tag: '结构件',
        rows: [['压舌', `高 ${dim(1 / 6)}，落入顶面压槽`], ['外挡边', `出挑 ${dim(1 / 6)}`], ['功能', '阻止立柱径向外拔']],
        warn: '★V-27（本版校验新增）：原 J-6「内腔套住柱头段上部」在高度上够不到 z=14a 的压槽。本实现改为带外挡边的方形盖板 —— 柱头外拔时会撞上挡边，副锁才真正成立。',
      }],
      async enter(c, engine) {
        junk.clear();
        framePose(c);
        c.lantern.showPanels(true);
        for (const id of PANELS) c.lantern.parts.get(id).installed = true;
        c.lantern.applyAssembly();
        c.lantern.showDecor(false);
        c.lantern.core.visible = false;

        let phase = 0;
        const steps = [
          {
            label: '糊绵纸（内侧）',
            run: async () => {
              for (const [i, g] of c.lantern.decor.papers.entries()) {
                g.visible = true;
                const m = g.children[0].material;
                m.opacity = 0;
                await tween(0.36, (k) => { m.opacity = 0.72 * k; });
                c.sfx.play('PAPER_SMOOTH', { pitch: i * 1.5 });
              }
              c.hud.toast('✓ 绵纸 4/4 —— 糊在内侧，把硬邦邦的光揉软');
            },
          },
          {
            label: '贴窗花（外侧）',
            run: async () => {
              for (const [i, g] of c.lantern.decor.cutpapers.entries()) {
                g.visible = true;
                g.scale.setScalar(0.6);
                await tween(0.4, (k) => g.scale.setScalar(0.6 + 0.4 * Ease.outBack(k)));
                g.scale.setScalar(1);
                c.sfx.play('PAPER_STICK', { pitch: i * 2 });
              }
              c.sfx.play('SHIMMER_WARM', { delay: 0.2 });
              const names = CUTOUT_MOTIFS.map((m) => `${m.name}·${m.bless}`).join(' · ');
              c.hud.toast(`✓ 窗花 4/4 —— ${names}`, { dur: 2600 });
            },
          },
          {
            label: '装祥云牙子（角牙）',
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
              c.hud.toast('✓ 角牙 4/4 —— 插进角上的小槽，把转角撑住');
            },
          },
          {
            label: '装龙纹角花（锁柱）',
            run: async () => {
              // ★导演红线：首个角花必须手动安装并播放剖切演示
              const plates = c.lantern.decor.plates;
              for (const [i, p] of plates.entries()) {
                p.visible = true;
                const home = p.position.clone();
                p.position.z = home.z + a(2.5);
                if (i === 0) {
                  c.lantern.setSection(['UB-B1'], true);
                  c.sfx.play('SLICE_SOFT');
                  c.hud.toast('看它落下来：一边把舌头插进槽里，一边盖住立柱的头', { dur: 2400 });
                }
                await tween(i === 0 ? 0.9 : 0.3, (k) => { p.position.z = home.z + a(2.5) * (1 - Ease.inQuad(k)); });
                p.position.copy(home);
                c.sfx.play('SNAP_LOCK_SOFT', { pitch: i * 2 });
                // 立柱以暖金色自上而下闪过一道光
                const colId = `PL-0${i + 1}`;
                c.lantern.highlight(colId, PALETTE.TENON, 0.8);
                c.sfx.play('SHIMMER_SHORT', { gain: 0.6 });
                setTimeout(() => c.lantern.highlight(colId, 0, 0), 600);
                if (i === 0) { await wait(0.8); c.lantern.setSection(null, false); }
              }
              c.hud.toast('✓ 立柱两级锁定完成 —— 一咬，一压', { dur: 2600 });
            },
          },
          {
            label: '挂中国结与红流苏',
            run: async () => {
              c.lantern.knot.visible = true;
              c.lantern.tassel.visible = true;
              c.sfx.play('KNOT_SWING');
              c.sfx.play('TASSEL_SWAY', { delay: 0.3 });
              c.hud.toast('✓ 装饰件 10/10');
              c.sfx.play('SUCCESS_MID', { delay: 0.4 });
            },
          },
        ];

        const mkBtn = () => {
          if (phase >= steps.length) { c.hud.setActions([]); engine.unlock(); return; }
          c.hud.setActions([{
            label: steps[phase].label, kind: 'main', onClick: async (btn) => {
              btn.disabled = true;
              await steps[phase].run();
              phase++;
              mkBtn();
            },
          }]);
        };
        mkBtn();
      },
      exit(c) { junk.clear(); c.lantern.setSection(null, false); c.lantern.clearHighlights(); },
    },

    // ══════════════════════════════════════════════════════
    // D4 · 灯芯就位与成品巡礼 ★★ 静默点②（导演红线）
    // ══════════════════════════════════════════════════════
    {
      id: 'D4', phase: 4, phaseRatio: 0.72,
      title: '成品巡礼',
      mood: 'dark',
      bgm: 'BGM_C_FESTIVE', bgmLevel: 0.4,
      cam: { az: 200, el: 12, dist: 430, target: [0, 0, 96], snap: true, ease: 0.16 },
      narration: `最后，把灯芯放进去。`,
      async enter(c, engine) {
        junk.clear();
        framePose(c);
        c.lantern.showPanels(true);
        for (const id of PANELS) c.lantern.parts.get(id).installed = true;
        c.lantern.applyAssembly();
        c.lantern.showDecor(true);
        c.lantern.core.visible = true;
        c.lantern.setLit(0);   // ★S30 灯芯不提前点亮 —— 点亮是 M1 的专属高潮

        // 灯芯自底部升入
        const home = c.lantern.core.userData.home || c.lantern.core.position.clone();
        c.lantern.core.userData.home = home;
        c.lantern.core.position.z = home.z - a(4);
        await tween(0.9, (k) => { c.lantern.core.position.z = home.z - a(4) * (1 - Ease.outCubic(k)); });
        c.lantern.core.position.copy(home);
        c.sfx.play('WOOD_TAP', { pitch: -4 });

        // ── 静默段 12 秒：彻底清屏，无 UI、无音效、无成就弹窗 ──
        await wait(1.4);
        c.hud.quiet(true);
        c.bgm.setLevel(0.28, 2.0);
        engine.lock();
        let ang = 0;
        const upd = (dt) => {
          ang += dt * (360 / 8) * (Math.PI / 180);       // 8 s 匀速一周，无加减速
          c.stage.setRecommended({
            az: 200 + (ang * 180) / Math.PI, el: 12 + Math.sin(ang * 0.5) * 6,
            dist: 430, target: V(0, 0, 96), ease: 0.5,
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
          c.hud.setCards([{
            title: '成果结算', tag: 'BOM',
            html: `<div class="bom">
              <div class="r"><span>木构件</span><span>13</span></div>
              <div class="r"><span>装饰件</span><span>10</span></div>
              <div class="r"><span>面板类</span><span>8</span></div>
              <div class="r"><span>窗　花</span><span>4</span></div>
              <div class="r"><span>灯　芯</span><span>1</span></div>
              <div class="total r"><span>合　计</span><span>36 件</span></div>
              <div class="r"><span>榫卯节点</span><span>26 处</span></div>
              <div class="r"><span>钉 与 胶</span><span>0</span></div>
            </div>`,
          }]);
          c.sfx.play('UI_TICK');
          engine.unlock();
        }, 12000);
      },
      exit(c) { clearTimeout(c.tourTimer); junk.clear(); c.hud.quiet(false); },
    },

    // ══════════════════════════════════════════════════════
    // D5 · 分层爆炸复盘
    // ══════════════════════════════════════════════════════
    {
      id: 'D5', phase: 4, phaseRatio: 0.88,
      title: '结构回溯 · 分层爆炸',
      mood: 'dark',
      cam: { az: 48, el: 22, dist: 620, target: [0, 0, 96], snap: true },
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
        framePose(c);
        c.lantern.showPanels(true);
        for (const id of PANELS) c.lantern.parts.get(id).installed = true;
        c.lantern.applyAssembly();
        c.lantern.showDecor(true);
        c.lantern.core.visible = true;

        // 分层控制条
        const bar = document.createElement('div');
        bar.className = 'layers';
        bar.innerHTML = EXPLODE_LAYERS.map((l) =>
          `<button class="layer-btn" data-l="${l.id}">${l.id}. ${l.name}<i>${l.count} 件</i></button>`).join('');
        document.body.appendChild(bar);
        junk.add({ dispose: () => bar.remove() });
        bar.querySelectorAll('.layer-btn').forEach((b) => {
          b.addEventListener('click', () => {
            const on = !b.classList.contains('on');
            bar.querySelectorAll('.layer-btn').forEach((x) => x.classList.remove('on'));
            if (on) b.classList.add('on');
            c.lantern.focusLayer(on ? +b.dataset.l : null);
            c.lantern.setExplode(c.lantern.explodeT, 'layered');
            c.sfx.play('UI_CARD');
          });
        });

        // 爆炸滑杆
        const wrap = document.createElement('div');
        wrap.className = 'slider-wrap';
        wrap.innerHTML = '<span>拖动查看结构分层</span><input type="range" min="0" max="100" value="0">';
        c.hud.el.actions.appendChild(wrap);
        const rng = wrap.querySelector('input');
        let lastStep = 0;
        rng.addEventListener('input', () => {
          const t = rng.value / 100;
          c.lantern.setExplode(t, 'layered');
          const s = Math.floor(t * 5);
          if (s !== lastStep) { lastStep = s; c.sfx.play('LAYER_SEPARATE', { pitch: s * 2, gain: 0.5 }); }
        });

        // ★严格按 §6 装配序列逆序自动展开一次（非径向外扩）
        await wait(0.8);
        await tween(3.5, (k) => { c.lantern.setExplode(k, 'layered'); rng.value = k * 100; }, { ease: Ease.inOutCubic });
        c.hud.setActions([]);
        c.hud.el.actions.appendChild(wrap);
        c.hud.setActions([{ label: '回到成品', kind: 'alt', onClick: async () => {
          await tween(2.5, (k) => { c.lantern.setExplode(1 - k, 'layered'); rng.value = (1 - k) * 100; }, { ease: Ease.inOutCubic });
          c.sfx.play('SNAP_IN');
          c.hud.toast('✓ 已复原');
        } }]);
        c.hud.el.actions.appendChild(wrap);
      },
      exit(c) {
        junk.clear();
        c.lantern.focusLayer(null);
        c.lantern.setExplode(0, 'layered');
      },
    },

    // ══════════════════════════════════════════════════════
    // D6 · 互动模块枢纽
    // ══════════════════════════════════════════════════════
    {
      id: 'D6', phase: 4, phaseRatio: 1,
      title: '过年该做的事',
      mood: 'night',
      bgm: 'BGM_C_FESTIVE_LOOP',
      cam: { az: 50, el: 14, dist: 480, target: [0, 0, 96], snap: true },
      hideNext: true,
      narration: `灯笼做好了。
接下来，是过年该做的事。
点上它，猜几个灯谜，写一句愿望；
把它挂到你家门口，再放一场烟花。
（停顿 0.8 s）
不着急，想先做哪个都行。`,
      async enter(c) {
        junk.clear();
        framePose(c);
        c.lantern.showPanels(true);
        for (const id of PANELS) c.lantern.parts.get(id).installed = true;
        c.lantern.applyAssembly();
        c.lantern.showDecor(true);
        c.lantern.core.visible = true;
        c.lantern.setLit(c.state.lit ? Math.min(1, 0.6 + c.state.riddleScore * 0.08) : 0);
        c.openHub();
      },
      exit() { junk.clear(); },
    },
  ];
}
