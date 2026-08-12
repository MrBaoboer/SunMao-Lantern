/**
 * 做骨架（8 步）—— 从十三根方料到框架合龙
 */

import * as THREE from 'three';
import {
  V, a, av, C, M, J2, J3, J4, PALETTE, Junk, BENCH_Z, BENCH_TOP, ghostBox, outlineBox,
  FIT_RING, FIT_BENCH, AIM_BENCH,
} from './util.js';
import { OP } from '../core/parts.js';
import { tween, Ease, wait } from '../util/tween.js';

const junk = new Junk(null);

const bench = (c, id, rot) => c.lantern.detach(id, { pos: [0, 0, BENCH_Z], rot });

function only(c, ids) {
  c.lantern.showOnly(ids);
  c.lantern.showPanels(false);
}

export function act3(ctx) {
  junk.scene = ctx.stage.scene;
  const LOWER = ['LB-A1', 'LB-A2', 'LB-C1', 'LB-B1', 'LB-B2'];
  const UPPER = ['UB-A1', 'UB-A2', 'UB-B1', 'UB-B2'];
  const COLS = ['PL-01', 'PL-02', 'PL-03', 'PL-04'];

  /** 拖歪时的提示：三把刀各有各的使法，通用那句「沿着槽」对锯和刨都不对 */
  const WRONG_CUT = {
    saw: '锯要顺着锯缝来回拉',
    chisel: '凿子要顺着槽来回推',
    plane: '刨子顺着槽一直往前推',
  };

  /** 起一个走刀任务，并附上「帮我加工」 */
  function cut(c, o) {
    c.mach.begin({ wrongHint: WRONG_CUT[o.tool], ...o });
    c.hud.setAlts([{ label: '帮我加工', ico: 'spark', onClick: () => c.mach.autoRun() }]);
  }

  return [
    // ══════════════════════════════════════════════════════
    {
      id: 'C1', phase: 2,
      title: '十三根木条',
      mood: 'studio',
      bgm: 'BGM_B_CRAFT',
      cam: { az: -84, el: 38, dist: 560, target: [0, -48, 96], snap: true, fit: { r: 210, h: 92 } },
      narration: `木料都在这儿了，截面都是方的。
九根短料，用来做上下两个框；四根长料，是灯笼的柱子。
（气口）
先做下面这个框，也就是灯笼的底盘。`,
      note: {
        title: '只有一个尺寸',
        body: '木条截面 <em>12 × 12 毫米</em>。整盏灯的长度、深浅、间距，都是这个数的整数倍。',
        foot: '一套尺寸贯穿到底，零件才可能严丝合缝。',
      },
      async enter(c) {
        junk.clear();
        c.lantern.attachAll();
        c.lantern.allBlank();
        only(c, [...LOWER, ...UPPER, ...COLS]);

        // 十三根构件的天然轴向各不相同，陈列时统一转到沿 X 平铺。
        // 短料铺成三列三行，长料单独一摞排在下方 —— 九根与四根要一眼数得出来
        const flat = (id) => {
          if (id.startsWith('PL')) return [0, Math.PI / 2, 0];
          if (id.includes('-B') || id === 'LB-C1') return [0, 0, -Math.PI / 2];
          return [0, 0, 0];
        };
        const shorts = [...LOWER, ...UPPER];
        COLS.forEach((id, i) => {
          c.lantern.detach(id, { pos: [0, a(5) - i * a(3), BENCH_Z], rot: flat(id) });
        });
        shorts.forEach((id, i) => {
          const col = i % 3, row = Math.floor(i / 3);
          c.lantern.detach(id, { pos: [(col - 1) * a(11), -a(7) - row * a(3), BENCH_Z], rot: flat(id) });
        });

        for (const [i, id] of [...COLS, ...shorts].entries()) {
          const p = c.lantern.parts.get(id);
          const z0 = p.mesh.position.z;
          p.mesh.position.z = z0 + a(2);
          // 用 wait 而不是裸 setTimeout：快速翻页时 cancelAll 才掐得断，
          // 否则这一批位移会打在下一步的画面上
          wait(i * 0.06).then(() => {
            tween(0.22, (k) => { p.mesh.position.z = z0 + a(2) * (1 - Ease.outBack(k)); });
            // 落到台面上一根一记。十三下依次响过去，「一共十三根」这句话
            // 就不只是字幕上的一个数字。长料压低两个半音，听得出比短料沉
            c.sfx.play('WOOD_DROP', {
              pitch: (id.startsWith('PL') ? -2 : 1.5) + ((i * 7) % 5) * 0.6,
              gain: 0.55,
            });
          });
        }
        c.hud.setCue('短料 <b>9</b> 根 · 长料 <b>4</b> 根');
      },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'C2', phase: 2,
      title: '开槽，开叉',
      mood: 'craft',
      // 槽是自 −Y 侧面向里开的盲槽 —— 相机站到 −Y 这一侧，
      // 凿出来的缺口才朝着用户，而不是背过去
      cam: { az: -64, el: 26, dist: 150, target: AIM_BENCH, snap: true, fit: FIT_BENCH },
      cue: { ico: 'drag', text: '<em>拖动凿子</em>，沿着槽来回走' },
      narration: `先从两根顺枨开始。枨，chéng，就是框子上的横木。
在它的顶面凿两条平行的槽。
中间留下的那一条不能削掉 —— 那就是榫舌。
（气口）
再做中梁：两头截短，各开一个叉口，正好卡住那条榫舌。
两头的下半截，还要各切掉一块，切出一个平面。
这叫承重面 —— 叉口负责咬住，它负责托住。`,
      note: {
        title: '槽为什么开在顶面',
        spec: [['槽宽', '料厚的 1/3'], ['槽深', '到一半']],
        body: '因为中梁要<em>从上往下</em>落进来。开在底面，它就只能靠摩擦挂着，迟早会掉。',
      },
      async enter(c, engine) {
        junk.clear();
        only(c, ['LB-A1', 'LB-A2']);
        c.lantern.setOps('LB-A1', 'blank');
        c.lantern.setOps('LB-A2', 'blank');
        bench(c, 'LB-A1', [0, 0, 0]);
        c.lantern.detach('LB-A2', { pos: [0, av(2.6), BENCH_Z], rot: [0, 0, 0] });
        c.lantern.parts.get('LB-A2').mesh.visible = false;

        junk.add(outlineBox(c.stage.scene, {
          size: [a(1), a(1), a(1) + 1], pos: [0, 0, BENCH_Z], color: PALETTE.MORTISE,
        }));

        // ── 第二段：中梁 ──
        const beam = () => {
          junk.clear();
          only(c, ['LB-C1']);
          c.lantern.setOps('LB-C1', 'blank');
          bench(c, 'LB-C1', [0, 0, 0]);
          /*
           * 三道工序，各有各的刀、各有各的走法、各有各的机位。
           *
           * 三道原先共用一条「沿 X 横跨 ±26」的走刀线。对截短是对的（横切要跨过料宽），
           * 对另外两道就完全不对：叉口只有 4 mm 宽，刀却在料外飞出两个身位；
           * 承重面在端头的**下半段**，从顶面进刀等于要先穿过上半段还在的料。
           * 于是动作与结果对不上 —— 手往一个方向拉，料在另一个地方少。
           *
           * 陈列后中梁占 x∈[−6,6]、y∈[−60,60]、z∈[90,102]，活都在 +Y 那一头：
           *   截短    锯自顶面切下，横跨料宽（travel X，攻角 −Z）
           *   开叉口  凿自端面顺着槽往里剔（travel Y，攻角 −Z）—— 叉口是开在端面上的
           *   切承重面 凿自端面横着推（travel X，攻角 −Y）—— 去的是端头下半段
           */
          const END = J2.BEAM_LEN / 2;            // +Y 那一头的端面 y = 48
          const seq = [
            {
              op: OP.SHORTEN, name: '截短', tool: 'saw', sfx: 'SAW', verb: '锯', tip: '另一头同样一锯',
              from: V(-av(1.5), END, BENCH_Z), to: V(av(1.5), END, BENCH_Z),
              normal: V(0, 0, -1), chip: V(0, 0, 1),
              cam: { az: 56, el: 20, dist: 170, target: [0, 40, BENCH_Z + 8], fit: { r: 54, h: 34 } },
            },
            {
              op: OP.FORK, name: '开叉口', tool: 'chisel', sfx: 'CHISEL', verb: '凿子',
              tip: '另一头同样一个叉口',
              from: V(0, av(4.8), BENCH_TOP - J2.SLOT_D / 2),
              to: V(0, av(3.2), BENCH_TOP - J2.SLOT_D / 2),
              normal: V(0, 0, -1), chip: V(0, 0, 1),
              cam: { az: 62, el: 16, dist: 118, target: [0, 44, BENCH_Z + 18], fit: { r: 26, h: 30 } },
            },
            {
              op: OP.BEAR_SHOULDER, name: '切承重面', tool: 'chisel', sfx: 'CHISEL', verb: '凿子',
              tip: '另一头同样一刀',
              from: V(-av(1.2), END - a(1 / 4), BENCH_Z - a(1 / 4)),
              to: V(av(1.2), END - a(1 / 4), BENCH_Z - a(1 / 4)),
              normal: V(0, -1, 0), chip: V(0, 1, 0),
              cam: { az: 34, el: 12, dist: 150, target: [0, 52, BENCH_Z + 4], fit: { r: 42, h: 28 } },
            },
          ];
          let i = 0;
          const run = () => {
            const s = seq[i];
            c.stage.setRecommended({ ...s.cam, target: V(...s.cam.target) });
            c.hud.setCue(`<em>拖动${s.verb}</em>${s.name} · 第 <b>${i + 1}</b> 道 / 共 3 道`, 'drag');
            cut(c, {
              tool: s.tool,
              from: s.from,
              to: s.to,
              faceNormal: s.normal,
              strokes: 2,
              sfx: s.sfx,
              chipDir: s.chip,
              carve: { parts: ['LB-C1'], tag: s.op },
              onDone: async () => {
                c.lantern.addOp('LB-C1', s.op);     // 两头对称，另一头随之成形
                if (s.tip) c.hud.toast(s.tip, { dur: 1600 });
                i++;
                if (i < seq.length) { await wait(0.6); run(); return; }
                c.hud.setCue('中梁做好了');
                c.hud.toast('端头那个平面，等会儿要坐在槽底上', { gold: true });
                engine.done();
              },
            });
          };
          run();
        };

        // ── 第一段：顺枨顶面两条槽 ──
        // 一条槽一趟刀。以前是走一趟、出两条 —— 刀在这一条上来回，另一条却自己开好了，
        // 这正是「动作和加工结果对不上」最扎眼的一处。
        // 槽的长向是 Y（自内侧面向外的盲槽），凿子须顺着槽走；沿 X 走会横着碾过榫舌。
        // 陈列后槽落在 y ∈ [−6, 0]、深至顶面下 6：走刀线取槽的半深，前后各留余量。
        const SLOT_X = a(1 / 3);          // 两条槽的中心线 x = ∓4
        const groove = (i) => {
          const x = i === 0 ? -SLOT_X : SLOT_X;
          c.hud.setCue(`<em>拖动凿子</em>凿第 <b>${i + 1}</b> 条槽 · 共 2 条`, 'drag');
          cut(c, {
            tool: 'chisel',
            from: V(x, -a(5 / 6), BENCH_TOP - J2.SLOT_D / 2),
            to: V(x, a(1 / 3), BENCH_TOP - J2.SLOT_D / 2),
            faceNormal: V(0, 0, -1),
            strokes: 2,
            sfx: 'CHISEL',
            chipDir: V(0, 0, 1),
            carve: { parts: ['LB-A1'], tag: OP.BEAM_SLOT },
            onStroke: (n, total) => c.hud.setCue(
              `第 ${i + 1} 条槽 · 第 <b>${n}</b> 刀 / 共 ${total} 刀`, 'drag', { quiet: true }),
            onDone: async () => {
              if (i === 0) {
                c.hud.toast('一条好了，旁边再来一条', { dur: 1600 });
                await wait(0.7);
                groove(1);
                return;
              }
              c.lantern.addOp('LB-A1', OP.BEAM_SLOT);
              c.lantern.addOp('LB-A2', OP.BEAM_SLOT);
              c.hud.toast('中间留下的这一条，是榫舌', { gold: true });
              const p2 = c.lantern.parts.get('LB-A2');
              p2.mesh.visible = true;
              await tween(1.0, (k) => c.lantern.setCutReveal('LB-A2', k));
              c.hud.setCue('两根顺枨都开好了 · 接着做中梁');
              await wait(0.9);
              beam();
            },
          });
        };
        groove(0);
      },
      // 揭示动画被翻页掐断时，切面显现度会停在半路 —— 这一根往后每一步都会
      // 少一档切面提亮。收尾时无条件还原。
      exit(c) { junk.clear(); c.lantern.setCutReveal('LB-A2', 1); },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'C3', phase: 2,
      title: '落下去，成「工」字',
      mood: 'craft',
      cam: { az: 46, el: 34, dist: 280, target: [0, 0, C.LOWER_Z1], snap: true, fit: { r: 76, h: 52 } },
      cue: { ico: 'pull', text: '<em>向下拖动</em>中梁，两端一起落' },
      narration: `刚才练的夹榫，现在用真的来一次。
中梁从上往下落，两端的叉口同时咬住两根顺枨。
（气口）
三根木条，一个「工」字 —— 这是整个底盘的骨。
最后放进去的灯芯，就装在这根中梁上。`,
      async enter(c, engine) {
        junk.clear();
        c.lantern.attachAll();
        only(c, ['LB-A1', 'LB-A2', 'LB-C1']);
        c.lantern.setOps('LB-A1', new Set([OP.BEAM_SLOT]));
        c.lantern.setOps('LB-A2', new Set([OP.BEAM_SLOT]));
        c.lantern.setOps('LB-C1', new Set([OP.SHORTEN, OP.FORK, OP.BEAR_SHOULDER]));
        for (const id of ['LB-A1', 'LB-A2']) c.lantern.parts.get(id).installed = true;
        c.lantern.applyAssembly();

        const peek = async () => {
          c.lantern.setSection(['LB-A1'], true);
          await wait(2.4);
          c.lantern.setSection(null, false);
        };

        c.drag.begin({
          parts: ['LB-C1'], snap: 6, double: true, seatSfx: 'SNAP_IN',
          wrongHint: '中梁只能从上往下落 —— 竖着往下拖',
          onAll: async () => {
            c.fx.ripples.emit(V(0, C.INNER_FACE, C.LOWER_Z1), V(0, 0, 1));
            c.fx.ripples.emit(V(0, -C.INNER_FACE, C.LOWER_Z1), V(0, 0, 1));
            c.hud.setCue('底盘 <b>3</b> / 5 件');
            c.hud.toast('「工」字成了', { gold: true });
            engine.done();
            c.hud.setAlts([{ label: '看看内部', ico: 'cube', onClick: peek }]);
          },
        });
        c.hud.setAlts([{ label: '帮我装上', ico: 'spark', onClick: () => c.drag.autoSeatAll() }]);
      },
      exit(c) { c.lantern.setSection(null, false); },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'C4', phase: 2,
      title: '切榫头，凿透眼',
      mood: 'craft',
      cam: { az: 30, el: 30, dist: 320, target: [0, 0, C.LOWER_Z1], snap: true, fit: { r: 80, h: 54 } },
      cue: { ico: 'drag', text: '<em>拖动锯</em>，沿榫肩线切下去' },
      narration: `四个端头，各锯出一个榫头。
榫头不开在正中间，要往里偏一点。
外侧留出的那一半，是给柱子的。
（气口）
再取两根短料，做横枨。
一，凿两个透眼 —— 孔要一直凿穿，榫头才能整根穿出去。
二，外侧再凿两个方口，那是柱子的窝。
三，顶面刨一条又长又浅的装板槽，格心最后插在这儿。`,
      note: {
        title: '榫头为什么不居中',
        spec: [['内侧肩', '2 毫米'], ['榫头厚', '4 毫米'], ['外侧肩', '6 毫米']],
        body: '居中的榫头看着规整，但挖柱窝时会正好挖穿它。',
      },
      async enter(c, engine) {
        junk.clear();
        only(c, ['LB-A1', 'LB-A2', 'LB-C1']);
        for (const id of ['LB-A1', 'LB-A2']) {
          c.lantern.setOps(id, new Set([OP.BEAM_SLOT]));
          c.lantern.parts.get(id).installed = true;
        }
        c.lantern.parts.get('LB-C1').installed = true;
        c.lantern.applyAssembly();

        // ── 第二段：横枨三道工序 ──
        const rails = () => {
          junk.clear();
          c.hud.clearSpots();
          only(c, ['LB-B1', 'LB-B2']);
          c.lantern.setOps('LB-B1', 'blank');
          c.lantern.setOps('LB-B2', 'blank');
          bench(c, 'LB-B1', [0, 0, 0]);
          // 另一根摆在旁边、先藏着。三道工序只在这一根上走，走完再把它揭出来 ——
          // 原先它一直待在框那边的待装位上，最后凭空一亮，「两根都好了」
          // 这句话在画面里没有落点。现在同样三道口子一起摊在台上。
          c.lantern.detach('LB-B2', { pos: [av(2.4), 0, BENCH_Z], rot: [0, 0, 0] });
          c.lantern.parts.get('LB-B2').mesh.visible = false;
          c.lantern.setCutReveal('LB-B2', 0);
          /*
           * 三道工序各有各的位置与进刀方向：透眼与柱窝的开口都在侧面，
           * 刀得横着进 —— 立在顶面剁，孔却在侧面出现，画面就说不通了。
           * 陈列后这根横枨占 x ∈ [−6, 6]：柱窝挖掉的是 x ∈ [0, 6] 那半边，
           * 所以刀一律从 +X 侧进，刃线落在被挖掉的那半边里。
           *
           * **一处一趟刀。** 透眼与柱窝各有两个，隔着大半根料。原先一趟刀
           * 扫完 110 mm 全长，最后只掉下两个 4 mm 的小孔 —— 手上走的距离
           * 和少掉的料完全不成比例，看着就是「动作和结果没关系」。
           * 现在一个孔一趟，走刀线只跨过那个孔本身。通长的装板槽仍是一刨到底，
           * 因为它本来就是一条通长的槽。
           */
          const seq = [
            { op: OP.MORTISE, name: '凿孔', unit: '个孔', tool: 'chisel', sfx: 'CHISEL',
              verb: '凿子', done: '两个孔都凿穿了',
              normal: V(-1, 0, 0), chip: V(1, 0, 0),
              cam: { az: 25, el: 24, dist: 158, fit: { r: 46, h: 34 } },
              lanes: [
                [V(a(1 / 6), av(3.2), BENCH_Z), V(a(1 / 6), av(4.5), BENCH_Z)],
                [V(a(1 / 6), -av(4.5), BENCH_Z), V(a(1 / 6), -av(3.2), BENCH_Z)],
              ] },
            { op: OP.SOCKET, name: '凿柱窝', unit: '个窝', tool: 'chisel', sfx: 'CHISEL',
              verb: '凿子', done: '两个柱窝都好了',
              normal: V(-1, 0, 0), chip: V(1, 0, 0),
              cam: { az: 25, el: 24, dist: 158, fit: { r: 46, h: 34 } },
              lanes: [
                [V(J3.SOCKET_DX / 2, av(3.8), BENCH_Z), V(J3.SOCKET_DX / 2, av(4.9), BENCH_Z)],
                [V(J3.SOCKET_DX / 2, -av(4.9), BENCH_Z), V(J3.SOCKET_DX / 2, -av(3.8), BENCH_Z)],
              ] },
            { op: OP.PANEL_SLOT, name: '刨装板槽', unit: '', tool: 'plane', sfx: 'PLANE_SHAVE',
              verb: '刨子', done: '装板槽好了',
              normal: V(0, 0, -1), chip: V(0, 0, 1),
              cam: { az: 30, el: 30, dist: 200, fit: { r: 58, h: 34 } },
              lanes: [[
                V(3, -av(3.8), BENCH_TOP - J4.SLOT_LOW_D / 2),
                V(3, av(3.8), BENCH_TOP - J4.SLOT_LOW_D / 2),
              ]] },
          ];
          let i = 0;
          let lane = 0;
          const run = () => {
            const s = seq[i];
            const [from, to] = s.lanes[lane];
            const many = s.lanes.length > 1;
            // 机位跟着这一趟的活走 —— 两个孔在料的两头，盯着料中心看不清任何一个
            const mid = from.clone().add(to).multiplyScalar(0.5);
            c.stage.setRecommended({ ...s.cam, target: V(0, mid.y, BENCH_Z + 14) });
            c.hud.setCue(many
              ? `<em>拖动${s.verb}</em>${s.name} · 第 <b>${lane + 1}</b> ${s.unit} / 共 ${s.lanes.length}`
              : `<em>拖动${s.verb}</em>${s.name} · 第 <b>${i + 1}</b> 道 / 共 3 道`, 'drag');
            cut(c, {
              tool: s.tool,
              from,
              to,
              faceNormal: s.normal,
              strokes: 2,
              sfx: s.sfx,
              chipDir: s.chip,
              carve: { parts: ['LB-B1'], tag: s.op },
              onDone: async () => {
                lane++;
                if (lane < s.lanes.length) { await wait(0.5); run(); return; }
                lane = 0;
                c.lantern.addOp('LB-B1', s.op);
                c.lantern.addOp('LB-B2', s.op);
                c.hud.toast(s.done, { gold: true, dur: 1400 });

                if (s.op === OP.SOCKET) {
                  const gh = ghostBox(c.stage.scene, {
                    size: [J3.NECK, J3.NECK, M.SEC],
                    pos: [a(4), C.COL_AXIS - J3.SOCKET_DY / 2, BENCH_Z],
                    color: PALETTE.SOCKET, opacity: 0.5,
                  });
                  junk.add(gh);
                  await tween(1.0, (k) => { gh.position.x = a(4) - av(3.5) * k; }, { ease: Ease.inOutCubic });
                  c.hud.toast('柱子会这样横着推进来', { dur: 1600 });
                  await wait(0.6);
                  c.stage.scene.remove(gh);
                }

                i++;
                if (i < seq.length) { run(); return; }
                // 退开一档，把台上两根一起收进画面，再揭出另一根
                c.stage.setRecommended({
                  az: 28, el: 26, dist: 260,
                  target: V(av(1.2), 0, BENCH_Z + 12), fit: { r: 78, h: 42 },
                });
                await wait(0.5);
                c.lantern.parts.get('LB-B2').mesh.visible = true;
                c.sfx.play('WOOD_SLIDE', { gain: 0.45 });
                c.hud.setCue('另一根横枨 · 同样三道工序');
                await tween(1.1, (k) => c.lantern.setCutReveal('LB-B2', k));
                c.hud.setCue('两根横枨都好了');
                engine.done();
              },
            });
          };
          run();
        };

        // ── 第一段：切四个榫头 ──
        // 在榫肩线（x = 内口边界）横切下去，锯身与顺枨垂直；刃线取枨料的半高。
        // 行程跨过顺枨中心线前后各一个模数 —— 拉得比料宽长一点是锯的常态，
        // 但不能像原先那样一路荡到料外两个身位，那会让开镜第一眼就是"锯悬在半空"
        //
        // 机位得凑到这个角上。这一步是整章唯一一段沿用步骤级全景走刀的：
        // 320 mm 外看整个 120 见方的底盘，锯掉的是 18×4×12 的一小条，
        // 画面上几乎看不出少了什么。act3 其余六段加工都各自推近过。
        c.stage.setRecommended({
          az: 24, el: 26, dist: 175,
          target: V(C.RAIL_B_X, C.RAIL_A_Y, C.LOWER_Z1 + 4),
          fit: { r: 58, h: 36 },
        });
        cut(c, {
          tool: 'saw',
          from: V(C.INNER_FACE, C.RAIL_A_Y - a(1), (C.LOWER_Z0 + C.LOWER_Z1) / 2),
          to: V(C.INNER_FACE, C.RAIL_A_Y + a(1), (C.LOWER_Z0 + C.LOWER_Z1) / 2),
          faceNormal: V(0, 0, -1),
          strokes: 3,
          sfx: 'SAW',
          chipDir: V(0, 0, 1),
          carve: { parts: ['LB-A1'], tag: OP.TENON },
          onStroke: (n, total) => c.hud.setCue(`第 <b>${n}</b> 刀 / 共 ${total} 刀`, 'drag', { quiet: true }),
          onDone: async () => {
            c.lantern.addOp('LB-A1', OP.TENON);
            c.lantern.addOp('LB-A2', OP.TENON);
            c.hud.toast('四个端头，同样四锯', { dur: 1600 });
            c.hud.setCue('四个榫头都切好了');

            // 四个柱窝的位置要一眼看全 —— 退回这一步的全景
            c.stage.setRecommended({
              az: 30, el: 30, dist: 320, target: V(0, 0, C.LOWER_Z1), fit: { r: 80, h: 54 },
            });
            await wait(0.9);
            for (const sy of [1, -1]) for (const sx of [1, -1]) {
              junk.add(ghostBox(c.stage.scene, {
                size: [J3.SOCKET_DX, J3.SOCKET_DY, M.SEC],
                pos: [sx * (C.RAIL_B_X + J3.SOCKET_DX / 2), sy * (C.COL_AXIS - J3.SOCKET_DY / 2),
                  (C.LOWER_Z0 + C.LOWER_Z1) / 2],
                color: PALETTE.SOCKET, opacity: 0.55,
              }));
            }
            c.hud.addSpot({
              pos: V(C.RAIL_B_X + 3, C.COL_AXIS - 3, C.LOWER_Z1),
              badge: '窝', label: '这块留给柱子', sub: '紫色的位置，等会儿要挖空',
              color: 'var(--violet)', active: true,
            });
            await wait(2.0);
            rails();
          },
        });
      },
      exit(c) { junk.clear(); c.hud.clearSpots(); c.lantern.setCutReveal('LB-B2', 1); },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'C5', phase: 2,
      title: '底盘做好了',
      mood: 'craft',
      cam: { az: 40, el: 30, dist: 320, target: [0, 0, C.LOWER_Z1], snap: true, fit: FIT_RING },
      cue: { ico: 'drag', text: '<em>拖动横枨</em>，套住两个榫头' },
      narration: `两根横枨套上去。
一根横枨，两个孔 —— 要同时对准两个榫头，推到底。
（气口）
装好之后回头看：四个榫头，都从另一边穿了出来。
两根横枨的四个端头，也各探出一截。
数一数，四边一圈，八处出头。`,
      note: {
        title: '出头',
        spec: [['露出长度', '6 mm'], ['出头处', '4 边 8 头']],
        body: '穿透之后多留的这一截不锯平，接头的受力面就更宽。',
      },
      async enter(c, engine) {
        junk.clear();
        c.lantern.attachAll();
        only(c, LOWER);
        for (const id of LOWER) c.lantern.setOps(id, 'all');
        for (const id of ['LB-A1', 'LB-A2', 'LB-C1']) c.lantern.parts.get(id).installed = true;
        c.lantern.applyAssembly();
        c.hud.setCue('底盘 <b>3</b> / 5 件');

        c.drag.begin({
          parts: ['LB-B1', 'LB-B2'], snap: 6, seatSfx: 'SNAP_IN',
          wrongHint: '横枨要横着平推进去，让榫头穿过孔',
          onSeat: (id, n) => {
            c.hud.setCue(`底盘 <b>${3 + n}</b> / 5 件`, null, { quiet: true });
            // 涟漪打在**这一根**穿出来的两个榫头上 —— 装的是 −X 侧那根时，
            // 反馈跑到对面就没人看得见了
            const sx = id === 'LB-B1' ? 1 : -1;
            for (const sy of [1, -1]) {
              c.fx.ripples.emit(
                V(sx * C.EDGE, sy * C.RAIL_A_Y, (C.LOWER_Z0 + C.LOWER_Z1) / 2), V(sx, 0, 0), { size: 14 },
              );
            }
          },
          onAll: () => {
            c.sfx.play('WOOD_SETTLE', { gain: 0.5 });
            c.hud.setCue('底盘 <b>5</b> / 5 件 · 四边出头');
            c.hud.toast('底盘做好了', { gold: true });
            engine.done();
          },
        });
        c.hud.setAlts([{ label: '帮我装上', ico: 'spark', onClick: () => c.drag.autoSeatAll() }]);
      },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'C6', phase: 2,
      title: '上面的框：中间一刀都不动',
      mood: 'craft',
      cam: { az: 34, el: 26, dist: 340, target: [0, 0, 96], snap: true, fit: { r: 100, h: 104 } },
      cps: 3.8,
      narration: `上面的框，做法几乎照搬底盘 —— 但有一处，照搬就错了。
底盘中间架着中梁，所以那两根顺枨要开槽。
上面这个框没有中梁 —— 那两条槽，一条都不能开。
（气口）
其余的照做：切榫头、凿孔、凿柱窝。
这回翻过来，装板槽刨在底面。
格心是从下往上顶进去的。
最后还有两种浅槽，一种在底面，一种在顶面。
后面那些装饰件，靠小舌卡在这儿。`,
      note: {
        title: '差别只有一处',
        body: '开了那两条槽，就是四个白挖的洞，白白削掉一截强度。',
        foot: '装板槽也换了面：底盘开在顶面，上面的框开在底面。',
      },
      task: {
        label: '明白了，开工',
        async onClick(c, engine) {
          c.hud.setTask(null);
          c.hud.clearSpots();
          c.lantern.clearHighlights();
          junk.clear();

          const ops = [OP.TENON, OP.MORTISE, OP.SOCKET, OP.PANEL_SLOT, OP.CORNER_SLOT, OP.PRESS_SLOT];
          const names = ['切榫头', '凿孔', '凿柱窝', '底面刨装板槽', '底面开角牙槽', '顶面留压槽'];
          for (const [i, op] of ops.entries()) {
            for (const id of UPPER) c.lantern.addOp(id, op);
            c.hud.setCue(`${names[i]} · <b>${i + 1}</b> / 6`);
            c.sfx.play(['SAW', 'CHISEL', 'CHISEL', 'PLANE_SHAVE', 'CHISEL', 'CHISEL'][i], { pitch: i * 1.2, gain: 0.6 });
            await wait(0.5);
          }

          // 做好了就直接装上去
          c.hud.setCue('<em>拖动横枨</em>，套住两个榫头', 'drag');
          for (const id of ['UB-A1', 'UB-A2']) c.lantern.parts.get(id).installed = true;
          c.lantern.applyAssembly();
          c.stage.setRecommended({ az: 40, el: 40, dist: 350, target: V(0, 0, 96), fit: { r: 104, h: 126 } });

          c.drag.begin({
            parts: ['UB-B1', 'UB-B2'], snap: 6, seatSfx: 'SNAP_IN',
            wrongHint: '横枨要横着平推进去，让榫头穿过孔',
            onSeat: (id, n) => c.hud.setCue(`上面的框 <b>${2 + n}</b> / 4 件`, null, { quiet: true }),
            onAll: () => {
              c.hud.toast('一个「井」字，八处出头', { gold: true });
              for (const sx of [1, -1]) for (const sy of [1, -1]) {
                const beam = new THREE.Mesh(
                  new THREE.CylinderGeometry(3, 3, M.CLEAR, 8, 1, true),
                  new THREE.MeshBasicMaterial({
                    color: PALETTE.TENON, transparent: true, opacity: 0.26,
                    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
                  }),
                );
                beam.rotation.x = Math.PI / 2;
                beam.position.set(sx * C.COL_AXIS, sy * C.COL_AXIS, (C.LOWER_Z1 + C.UPPER_Z0) / 2);
                junk.add(beam);
                c.stage.scene.add(beam);
              }
              c.hud.setCue('四根柱子，就立在这四道光的位置');
              engine.done();
            },
          });
          c.hud.setAlts([{ label: '帮我装上', ico: 'spark', onClick: () => c.drag.autoSeatAll() }]);
        },
      },
      async enter(c) {
        junk.clear();
        c.lantern.attachAll();
        only(c, [...LOWER, ...UPPER]);
        for (const id of LOWER) { c.lantern.setOps(id, 'all'); c.lantern.parts.get(id).installed = true; }
        for (const id of UPPER) { c.lantern.setOps(id, 'blank'); c.lantern.parts.get(id).installed = true; }
        c.lantern.applyAssembly();

        c.lantern.highlight('LB-A1', PALETTE.MORTISE, 0.6);
        await wait(0.5);
        junk.add(ghostBox(c.stage.scene, {
          size: [a(1.5), a(1.5), 1], pos: [0, C.RAIL_A_Y, C.UPPER_Z1 + 2],
          color: PALETTE.ALERT, opacity: 0.8,
        }));
        c.hud.addSpot({
          pos: V(0, C.RAIL_A_Y, C.UPPER_Z1 + a(1)),
          ico: 'cross', label: '这一段不动', sub: '上面没有中梁，不需要槽',
          color: 'var(--seal)', active: true,
        });
        c.hud.setCue('下面那根开了槽 · 上面这根<em>不开</em>');
      },
      exit(c) { junk.clear(); c.hud.clearSpots(); c.lantern.clearHighlights(); },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'C7', phase: 2,
      title: '柱子：削掉四分之三',
      mood: 'craft',
      cam: { az: 50, el: 12, dist: 300, target: [0, 0, 96], snap: true, fit: { r: 62, h: 104 } },
      cue: { ico: 'drag', text: '<em>拖动凿子</em>，一层一层削到底' },
      narration: `最后四根长料，做柱子。
柱子要把上下两个框连起来，还得让它们上下分不开。
怎么做到？
（气口）
柱子上有两处，正对着两个框。
这两处各削掉四分之三的截面，只留一小段细颈。
细颈卡进框里，上下两头的柱身还是粗的。
一上一下，正好把框夹住 —— 像夹子。`,
      note: {
        title: '像夹子一样',
        body: '柱子不是穿过框，是<em>夹住</em>框。',
        foot: '细颈最里面两毫米略胖一点，推到底会咬紧。',
      },
      async enter(c, engine) {
        junk.clear();
        only(c, ['PL-01']);
        c.lantern.setOps('PL-01', 'blank');
        c.lantern.detach('PL-01', { pos: [0, 0, 96], rot: [0, 0, 0] });

        // 两处细颈的位置先标出来 —— 半透的实体比虚线看得清，
        // 而这一步的关键恰恰是"哪两段要削、其余都不动"
        const marks = [J3.SEG.NECK2, J3.SEG.NECK1].map(([z0, z1]) => junk.add(ghostBox(c.stage.scene, {
          size: [M.SEC + 3, M.SEC + 3, z1 - z0],
          pos: [0, 0, (z0 + z1) / 2 - M.HEIGHT / 2 + 96],
          color: PALETTE.SOCKET, opacity: 0.26,
        })));

        // 两个枨框的轮廓也画出来。旁白要说的是"这两处正对着上下两个框"——
        // 与其在柱子上贴一张写着这句话的标签（它正好压住柱子和刀），
        // 不如把框摆在它该在的高度上，让画面自己说。
        // 顺带填满了这一步的横向空场：一根 12 见方的柱子撑不起 16:9。
        for (const [z0, z1] of [J3.SEG.NECK2, J3.SEG.NECK1]) {
          junk.add(outlineBox(c.stage.scene, {
            size: [M.OUTER, M.OUTER, z1 - z0],
            pos: [0, 0, (z0 + z1) / 2 - M.HEIGHT / 2 + 96],
            color: PALETTE.MORTISE,
          }));
        }

        const ops = [OP.NECK2, OP.NECK1];
        let stage = 0;
        const neck = () => {
          const seg = stage === 0 ? J3.SEG.NECK2 : J3.SEG.NECK1;
          const zw = (seg[0] + seg[1]) / 2 - M.HEIGHT / 2 + 96;
          // 整根柱子都得在画面里。细颈只有 12 mm，凑近了看确实清楚，
          // 但"三段两颈"这件事一旦裁掉柱身就说不成立了。
          c.stage.setRecommended({ az: 50, el: 10, dist: 300, target: V(0, 0, 96), fit: { r: 62, h: 104 } });
          marks.forEach((m, i) => { m.material.opacity = i === stage ? 0.5 : 0.16; });
          c.hud.setCue(`<em>拖动凿子</em>削第 <b>${stage + 1}</b> 处细颈 · 共 2 处 · 一层一层削到底`, 'drag');
          // 刀从柱子外侧横着走。走在轴线上会让刀身穿进柱子里，
          // 既看不见刀，也看不出它在削哪一面。
          // 保留的是 −X/−Y 那个象限，要削掉的料在 +Y 一侧 ——
          // 刀必须从 +Y 进，否则它得先穿过留下来的那一段才够得着。
          cut(c, {
            tool: 'chisel',
            from: V(-av(1.4), J3.NECK / 2, zw), to: V(av(1.4), J3.NECK / 2, zw),
            faceNormal: V(0, -1, 0),
            strokes: 3, sfx: 'CHISEL', chipDir: V(0, 1, 0),
            carve: { parts: ['PL-01'], tag: ops[stage] },
            // 一刀去一层，三刀到底 —— 三个象限是一起变浅的，不是一刀一个角。
            // 说「一个角一刀」，画面上看到的却是一层皮
            onStroke: (n, total) => c.hud.setCue(
              `第 ${stage + 1} 处细颈 · 削到第 <b>${n}</b> 层 / 共 ${total} 层`, 'drag', { quiet: true }),
            onDone: async () => {
              for (const id of COLS) c.lantern.addOp(id, ops[stage]);
              stage++;
              if (stage < 2) {
                c.hud.toast('还有一处，在上面的框那个高度', { dur: 2000 });
                await wait(1.0);
                neck();
                return;
              }
              c.hud.clearSpots();
              for (const m of marks) { m.material.opacity = 0.14; }
              c.hud.setCue('三段柱身，两处细颈');
              c.hud.toast('推到底会咬住 —— 不用钉子也掉不了', { gold: true });
              engine.done();
            },
          });
        };
        neck();
      },
      exit(c) { junk.clear(); c.hud.clearSpots(); },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'C8', phase: 2,
      title: '四柱推入，合龙',
      mood: 'craft',
      cam: { az: 42, el: 26, dist: 540, target: [0, 0, 96], snap: true, fit: { r: 132, h: 108 } },
      cue: { ico: 'drag', text: '沿着箭头，<em>横着推</em>进去' },
      narration: `注意方向 —— 柱子不能从上往下放。
柱身比细颈粗，竖着落下去，只会架在框上。
要从外面横着推进来，上下两个细颈同时滑进两个柱窝。
最后两毫米会发紧 —— 别停，推到底。
（气口）
四根都推完，十三根木条就全部到位了。
（停顿 1.0 s）
造桥时，最后一段接上，叫「合龙」。
这四根柱子推进去，就是这盏灯的合龙。`,
      note: {
        title: '为什么只能横着推',
        body: '柱窝是从框的<em>外侧面</em>向里挖的。竖直方向根本没有路。',
        foot: '推到底之后，柱身与柱脚从上下两面夹住框 —— 这才是它拆不下来的原因。',
      },
      async enter(c, engine) {
        junk.clear();
        c.lantern.attachAll();
        only(c, [...LOWER, ...UPPER, ...COLS]);
        for (const id of [...LOWER, ...UPPER, ...COLS]) c.lantern.setOps(id, 'all');
        for (const id of [...LOWER, ...UPPER]) c.lantern.parts.get(id).installed = true;
        c.lantern.applyAssembly();

        c.hud.setCue('柱子 <b>0</b> / 4');

        c.drag.begin({
          parts: COLS, snap: 5, wedge: true, seatSfx: 'SNAP_LOCK',
          wrongHint: '柱子不能从上往下放 —— 沿着箭头，从外面横着推',
          onSeat: (id, n) => c.hud.setCue(`柱子 <b>${n}</b> / 4`, null, { quiet: true }),
          onAll: async () => {
            c.guides.clear();
            await tween(0.5, (k) => { c.lantern.root.position.z = -1 * Math.sin(k * Math.PI); });
            c.lantern.root.position.z = 0;
            c.sfx.play('WOOD_SETTLE');
            c.fx.ring.sweep({ z0: 0, z1: M.HEIGHT, dur: 1.2 });
            c.hud.setCue('十三根木条 · <em>全部到位</em>');
            c.hud.toast('框架，合龙了', { gold: true, dur: 3000 });
            engine.done();
          },
        });
        c.hud.setAlts([{ label: '帮我装上', ico: 'spark', onClick: () => c.drag.autoSeatAll() }]);
      },
      exit(c) { junk.clear(); c.guides.clear(); },
    },
  ];
}
