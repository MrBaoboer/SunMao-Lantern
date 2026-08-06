/**
 * 匠作（11 步）—— 从十三根方料到框架合龙
 */

import * as THREE from 'three';
import { V, a, av, C, M, J3, J4, PALETTE, Junk, BENCH_Z, ghostBox, outlineBox } from './util.js';
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

  /** 起一个走刀任务，并附上「帮我加工」 */
  function cut(c, o) {
    c.mach.begin(o);
    c.hud.setAlts([{ label: '帮我加工', onClick: () => c.mach.autoRun() }]);
  }

  return [
    // ══════════════════════════════════════════════════════
    {
      id: 'C1', phase: 2, phaseRatio: 0.1,
      title: '十三根木条',
      mood: 'studio',
      bgm: 'BGM_B_CRAFT',
      cam: { az: 58, el: 46, dist: 560, target: [0, 0, 96], snap: true },
      narration: `正式开工。
一共十三根木条，截面都是方的。
九根短的 —— 上下两个枨框要用；四根长的 —— 是灯笼的柱子。
木料用梨木：纹理细密，不易变形，是做小木作最稳妥的选择。
（气口）
先做下枨框，也就是灯笼的底盘。
取三根短料：两根横着摆，叫顺枨；一根架在它们中间，叫中梁。
这三根，要用夹榫接成一个「工」字。`,
      note: {
        title: '只有一个尺寸',
        body: '木条截面 <em>12 × 12 毫米</em>。整盏灯所有的长度、深浅、间距，'
            + '都是这 12 毫米的整数倍 —— 或者它的十二分之一。',
        tiny: '一套尺寸贯穿到底，零件才可能严丝合缝。',
      },
      async enter(c) {
        junk.clear();
        c.lantern.attachAll();
        c.lantern.allBlank();
        only(c, [...LOWER, ...UPPER, ...COLS]);

        // 十三根构件的天然轴向各不相同，陈列时统一转到沿 X 平铺
        const flat = (id) => {
          if (id.startsWith('PL')) return [0, Math.PI / 2, 0];
          if (id.includes('-B') || id === 'LB-C1') return [0, 0, -Math.PI / 2];
          return [0, 0, 0];
        };
        const shorts = [...LOWER, ...UPPER];
        shorts.forEach((id, i) => {
          const col = i % 3, row = Math.floor(i / 3);
          c.lantern.detach(id, { pos: [(col - 1) * a(11), a(3) - row * a(2), BENCH_Z], rot: flat(id) });
        });
        COLS.forEach((id, i) => {
          c.lantern.detach(id, { pos: [0, -a(3) - i * a(2), BENCH_Z], rot: flat(id) });
        });

        for (const [i, id] of [...shorts, ...COLS].entries()) {
          const p = c.lantern.parts.get(id);
          const z0 = p.mesh.position.z;
          p.mesh.position.z = z0 + a(2);
          setTimeout(() => {
            tween(0.22, (k) => { p.mesh.position.z = z0 + a(2) * (1 - Ease.outBack(k)); });
            c.sfx.play('WOOD_DROP', { pitch: (Math.random() - 0.5) * 4 });
          }, i * 60);
        }
        c.hud.setHint('短料 <em>9</em> 根 · 长料 <em>4</em> 根');
      },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'C2', phase: 2, phaseRatio: 0.2,
      title: '开两条槽',
      mood: 'craft',
      cam: { az: 62, el: 46, dist: 190, target: [0, 0, BENCH_Z], snap: true },
      gate: true,
      hint: '<em>拖动刻刀</em>，沿着槽来回走',
      narration: `从顶面下刀。
在中间铣两条平行的槽，槽宽是木料厚度的三分之一，深度到一半。
注意 —— 两条槽之间留下的这一小条，不是废料，是榫舌。
还有槽底这个面，别小看它：等会儿中梁落下来，就坐在这上面。`,
      note: {
        title: '槽为什么开在顶面',
        body: '因为中梁要<em>从上往下</em>落进来。开在底面，它就只能靠摩擦挂着，迟早会掉。',
        tiny: '槽底剩下的那层料，就是中梁将来的落脚点。',
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

        cut(c, {
          tool: 'chisel',
          from: V(-av(1.6), 0, BENCH_Z + av(1.2)),
          to: V(av(1.6), 0, BENCH_Z + av(1.2)),
          faceNormal: V(0, 0, -1),
          strokes: 3,
          sfx: 'CHISEL_STROKE',
          chipDir: V(0, 0, 1),
          wrongHint: '沿着槽的方向来回拉',
          onStroke: (n, total) => {
            c.hud.setHint(`第 <em>${n}</em> 刀 / 共 ${total} 刀`);
            c.lantern.setCutReveal('LB-A1', n / total);
          },
          onDone: async () => {
            c.lantern.addOp('LB-A1', OP.BEAM_SLOT);
            c.lantern.addOp('LB-A2', OP.BEAM_SLOT);
            c.sfx.play('SUCCESS_SOFT');
            c.hud.toast('中间留下的这一条，是榫舌', { gold: true });
            c.hud.setHint('');
            const p2 = c.lantern.parts.get('LB-A2');
            p2.mesh.visible = true;
            c.sfx.play('UI_FLIP');
            await tween(1.2, (k) => c.lantern.setCutReveal('LB-A2', k));
            c.hud.setHint('两根顺枨都开好了');
            c.hud.setAlts([]);
            engine.unlock();
          },
        });
      },
      exit() { junk.clear(); },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'C3', phase: 2, phaseRatio: 0.28,
      title: '中梁：截短，开叉',
      mood: 'craft',
      cam: { az: 8, el: 20, dist: 200, target: [0, 0, BENCH_Z], snap: true },
      gate: true,
      hint: '<em>拖动锯</em>，沿线来回锯',
      narration: `中梁要先截短。
因为它两端的榫头只需要顶到顺枨的中心线，不必穿出去。
然后两端各开一个叉口 —— 两个平行的榫头，中间留一道口子，这道口子就是留给刚才那条榫舌的。
（气口）
还要在端头下半段横着切一刀。
为什么？因为等它落进槽里，全靠切出来的这个面坐在槽底上受力。`,
      note: {
        title: '唯一被截短的一根',
        body: '其余十二根都是原长。只有中梁短了两头，'
            + '因为它的榫头顶到顺枨中心线就够了，不用穿出去。',
      },
      async enter(c, engine) {
        junk.clear();
        only(c, ['LB-C1']);
        c.lantern.setOps('LB-C1', 'blank');
        bench(c, 'LB-C1', [0, 0, 0]);

        const ops = [OP.SHORTEN, OP.FORK, OP.BEAR_SHOULDER];
        const names = ['截短', '开叉口', '切出承重面'];
        let stage = 0;
        cut(c, {
          tool: 'saw',
          from: V(0, -av(4.6), BENCH_Z + av(1.2)),
          to: V(0, av(4.6), BENCH_Z + av(1.2)),
          faceNormal: V(0, 0, -1),
          strokes: 3,
          sfx: 'SAW_CUT_SHORT',
          chipDir: V(0, 0, 1),
          onStroke: (n) => {
            c.lantern.addOp('LB-C1', ops[stage++]);
            c.hud.setHint(`${names[n - 1]} · <em>${n}</em> / 3`);
            c.sfx.play(n === 1 ? 'SAW_CUT_LONG' : 'SAW_CUT_SHORT', { pitch: n * 1.5 });
            if (n === 1) c.sfx.play('WOOD_DROP', { delay: 0.8, pitch: -3 });
          },
          onDone: () => {
            c.hud.setHint('中梁做好了');
            c.hud.toast('端头那个平面，等会儿要坐在槽底上', { gold: true });
            c.sfx.play('SUCCESS_SOFT');
            c.hud.setAlts([]);
            engine.unlock();
          },
        });
      },
      exit() { junk.clear(); },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'C4', phase: 2, phaseRatio: 0.36,
      title: '落下去，成「工」字',
      mood: 'craft',
      cam: { az: 46, el: 34, dist: 280, target: [0, 0, C.LOWER_Z1], snap: true },
      gate: true,
      hint: '<em>向下拖动</em>中梁，两端一起落',
      narration: `还记得刚才练的夹榫吗？现在用真的来一次。
中梁从上往下落，两端的叉口同时咬住两根顺枨的榫舌。
—— 「工」字形，成了。
这是整个下枨框的骨。`,
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
          c.sfx.play('SLICE_SOFT');
          await wait(2.4);
          c.lantern.setSection(null, false);
        };

        c.drag.begin({
          parts: ['LB-C1'], snap: 6, double: true, seatSfx: 'SNAP_IN',
          wrongHint: '夹榫要从上往下落',
          onAll: async () => {
            c.sfx.play('WOOD_SETTLE', { gain: 0.6, delay: 0.08 });
            c.fx.ripples.emit(V(0, C.INNER_FACE, C.LOWER_Z1), V(0, 0, 1));
            c.fx.ripples.emit(V(0, -C.INNER_FACE, C.LOWER_Z1), V(0, 0, 1));
            c.hud.setHint('下枨框 <em>3</em> / 5 件');
            c.hud.toast('「工」字成了', { gold: true });
            c.sfx.play('SUCCESS_MID', { delay: 0.3 });
            if (c.state.autoSection) { await wait(0.6); await peek(); }
            c.hud.setAlts([{ label: '再看看内部', onClick: peek }]);
            engine.unlock();
          },
        });
        c.hud.setAlts([{ label: '帮我装上', onClick: () => c.drag.autoSeatAll() }]);
      },
      exit(c) { c.lantern.setSection(null, false); },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'C5', phase: 2, phaseRatio: 0.46,
      title: '切榫头',
      mood: 'craft',
      cam: { az: 30, el: 40, dist: 320, target: [0, 0, C.LOWER_Z1], snap: true },
      gate: true,
      hint: '<em>拖动锯</em>，切出第一个榫头',
      narration: `接下来在四个端头切榫。
第一个关键：榫头要细而长，不是一个小方块。
它要穿过整根横枨，还要露出一小截，所以长度是厚度的四倍半。
（气口）
第二个关键，很容易被忽略：这个榫头不居中。
它要往里侧偏一点，外侧留出一半。
为什么？因为外侧留出的这一半，等会儿要挖成一个窝，用来卡立柱。
榫头要是居中，窝一挖就把榫头挖破了。`,
      note: {
        title: '为什么不居中',
        body: '榫头往里偏，外侧空出一半的厚度。'
            + '那半边不是浪费 —— 是留给<em>柱子</em>的位置。',
        tiny: '居中的榫头看起来更规整，但挖柱窝时会正好挖穿它。',
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

        cut(c, {
          tool: 'saw',
          from: V(av(3.2), a(4), C.LOWER_Z1 + a(1)),
          to: V(av(5.4), a(4), C.LOWER_Z1 + a(1)),
          faceNormal: V(0, 0, -1),
          strokes: 3,
          sfx: 'SAW_CUT_SHORT',
          chipDir: V(0, 0, 1),
          onStroke: (n, total) => c.hud.setHint(`第 <em>${n}</em> 刀 / 共 ${total} 刀`),
          onDone: async () => {
            c.lantern.addOp('LB-A1', OP.TENON);
            c.lantern.addOp('LB-A2', OP.TENON);
            c.sfx.play('SUCCESS_SOFT');
            c.sfx.play('CHIME_WOOD', { delay: 0.35 });
            c.hud.setHint('四个榫头都切好了');
            c.hud.setAlts([]);

            await wait(0.5);
            for (const sy of [1, -1]) for (const sx of [1, -1]) {
              junk.add(ghostBox(c.stage.scene, {
                size: [J3.SOCKET_DX, J3.SOCKET_DY, M.SEC],
                pos: [sx * (C.RAIL_B_X + J3.SOCKET_DX / 2), sy * (C.COL_AXIS - J3.SOCKET_DY / 2),
                  (C.LOWER_Z0 + C.LOWER_Z1) / 2],
                color: PALETTE.SOCKET, opacity: 0.55,
              }));
            }
            c.sfx.play('UI_HINT');
            c.hud.addSpot({
              pos: V(C.RAIL_B_X + 3, C.COL_AXIS - 3, C.LOWER_Z1),
              badge: '窝', label: '这块留给柱子', sub: '紫色的位置，等会儿要挖空',
              color: 'var(--violet)', active: true,
            });
            engine.unlock();
          },
        });
      },
      exit(c) { junk.clear(); c.hud.clearSpots(); },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'C6', phase: 2, phaseRatio: 0.58,
      title: '凿透眼，铣柱窝',
      mood: 'craft',
      cam: { az: 70, el: 26, dist: 210, target: [0, 0, BENCH_Z], snap: true },
      gate: true,
      hint: '<em>向下拖动凿刀</em>，一直凿到穿',
      narration: `取两根新的短料，做横枨。
两端各凿一个孔 —— 注意，这个孔必须凿穿。半截不行，因为顺枨的榫头要整根穿出去。
（气口）
第二道工序很容易被忽略：在每个端头的外侧面，再铣一个小方口。
它叫柱窝，是留给立柱的。看方向 —— 口子是朝外开的，立柱等会儿要从外面横着推进来。
（气口）
还有第三道：顺着顶面铣一条又长又浅的槽。
这是装板槽，四片格心最后就插在这里。`,
      note: {
        title: '三道工序',
        body: '<em>凿穿</em>的孔，让榫头整根穿出去；<em>朝外开</em>的方口，'
            + '让柱子横着推进来；<em>又长又浅</em>的槽，接的不是木条，是板子。',
      },
      async enter(c, engine) {
        junk.clear();
        only(c, ['LB-B1', 'LB-B2']);
        c.lantern.setOps('LB-B1', 'blank');
        c.lantern.setOps('LB-B2', 'blank');
        bench(c, 'LB-B1', [0, 0, 0]);
        c.lantern.parts.get('LB-B2').mesh.visible = false;

        const seq = [
          { op: OP.MORTISE, name: '凿孔', tool: 'chisel', sfx: 'CHISEL_STRIKE', done: '凿穿了' },
          { op: OP.SOCKET, name: '铣柱窝', tool: 'router', sfx: 'ROUTER_MILL', done: '柱窝好了' },
          { op: OP.PANEL_SLOT, name: '开装板槽', tool: 'router', sfx: 'ROUTER_LONG', done: '装板槽好了' },
        ];
        let i = 0;
        const run = () => {
          const s = seq[i];
          c.hud.setHint(`${s.name} · 第 <em>${i + 1}</em> 道 / 共 3 道`);
          cut(c, {
            tool: s.tool,
            from: V(0, -a(4), BENCH_Z + av(1.4)),
            to: V(0, a(4), BENCH_Z + av(1.4)),
            faceNormal: V(0, 0, -1),
            strokes: i === 0 ? 3 : 2,
            sfx: s.sfx,
            chipDir: V(0, 0, 1),
            onStroke: (n, total) => {
              if (i === 0 && n === total) {
                c.sfx.play('CHISEL_STRIKE', { through: true, pitch: 2 });
                c.sfx.play('LIGHT_PIERCE', { delay: 0.05 });
              }
            },
            onDone: async () => {
              c.lantern.addOp('LB-B1', s.op);
              c.lantern.addOp('LB-B2', s.op);
              c.hud.toast(s.done, { gold: true, dur: 1500 });

              if (s.op === OP.SOCKET) {
                const gh = ghostBox(c.stage.scene, {
                  size: [J3.NECK, J3.NECK, M.SEC], pos: [a(4), a(3), BENCH_Z],
                  color: PALETTE.SOCKET, opacity: 0.5,
                });
                junk.add(gh);
                c.sfx.play('UI_HINT');
                await tween(1.2, (k) => { gh.position.x = a(4) - av(3.5) * k; }, { ease: Ease.inOutCubic });
                c.hud.toast('柱子会这样横着推进来', { dur: 1800 });
                await wait(0.8);
                c.stage.scene.remove(gh);
              }
              if (s.op === OP.PANEL_SLOT) {
                const gh = ghostBox(c.stage.scene, {
                  size: [J4.PANEL_T, a(7), a(3)], pos: [av(3.25), 0, BENCH_Z + a(3)],
                  color: PALETTE.MORTISE, opacity: 0.4,
                });
                junk.add(gh);
                await tween(0.8, (k) => { gh.position.z = BENCH_Z + a(3) - av(2.4) * k; }, { ease: Ease.outQuad });
                await wait(0.6);
                c.stage.scene.remove(gh);
              }

              i++;
              if (i < seq.length) { run(); return; }
              c.lantern.parts.get('LB-B2').mesh.visible = true;
              c.hud.setHint('两根横枨都好了');
              c.sfx.play('SUCCESS_SOFT');
              c.hud.setAlts([]);
              engine.unlock();
            },
          });
        };
        run();
      },
      exit() { junk.clear(); },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'C7', phase: 2, phaseRatio: 1,
      title: '下枨框成了',
      mood: 'craft',
      cam: { az: 40, el: 36, dist: 320, target: [0, 0, C.LOWER_Z1], snap: true },
      gate: true,
      hint: '<em>拖动横枨</em>，套住两个榫头',
      narration: `最后两根横枨，套上去。
两个榫头同时穿进两个孔 —— 推到底。
看四边：榫头穿出来了，各露出一小截。
这不是做工粗糙，是中式木作故意留下的样子：结构更牢，也更好看。
下枨框，完成。`,
      note: {
        title: '露在外面的那一截',
        body: '榫头穿透以后特意多留一段，不锯平。'
            + '它把接头的受力面加宽，也成了中式家具一眼可辨的样子。',
      },
      async enter(c, engine) {
        junk.clear();
        c.lantern.attachAll();
        only(c, LOWER);
        for (const id of LOWER) c.lantern.setOps(id, 'all');
        for (const id of ['LB-A1', 'LB-A2', 'LB-C1']) c.lantern.parts.get(id).installed = true;
        c.lantern.applyAssembly();
        c.hud.setHint('下枨框 <em>3</em> / 5 件');

        c.drag.begin({
          parts: ['LB-B1', 'LB-B2'], snap: 6, seatSfx: 'SNAP_IN',
          wrongHint: '两个榫头要同时对准两个孔',
          onSeat: (id, n) => {
            c.hud.setHint(`下枨框 <em>${3 + n}</em> / 5 件`);
            for (const sy of [1, -1]) {
              c.fx.ripples.emit(
                V(C.EDGE, sy * C.RAIL_A_Y, (C.LOWER_Z0 + C.LOWER_Z1) / 2), V(1, 0, 0), { size: 14 },
              );
            }
          },
          onAll: async () => {
            await tween(0.18, (k) => { c.lantern.root.position.z = -0.5 * Math.sin(k * Math.PI); });
            c.lantern.root.position.z = 0;
            c.sfx.play('SUCCESS_HIGH', { delay: 0.1 });
            c.sfx.play('WOOD_SETTLE', { gain: 0.5 });
            c.hud.setHint('下枨框 <em>5</em> / 5 件 · 四边出头');
            c.hud.toast('底盘做好了', { gold: true });
            engine.unlock('往上盖');
          },
        });
        c.hud.setAlts([{ label: '帮我装上', onClick: () => c.drag.autoSeatAll() }]);
      },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'C8', phase: 3, phaseRatio: 0.3,
      title: '上枨框：中间一刀都不动',
      mood: 'craft',
      cam: { az: 34, el: 24, dist: 330, target: [0, 0, C.UPPER_Z0], snap: true },
      gate: true,
      cps: 3.8,
      narration: `上枨框，做法和下枨框几乎一样 —— 但有一处必须不一样。
下枨框中间有一根中梁，所以顺枨中部要开两条槽。
上枨框没有中梁 —— 那两条槽，就一条都不能开。
开了，就是四个白白挖出来的洞，还会削弱强度。
（气口）
上枨框要做的是四件事：切榫头、凿孔、铣柱窝，还有 —— 翻过来，在底面开装板槽。
为什么在底面？因为格心是从下面往上顶进去的。
另外顶面还要留四个小方槽，最后装角花时用来压住立柱。
中间那一段，一刀都不动。`,
      note: {
        title: '差别只有一处',
        body: '下面那个框中间架着中梁，所以要开槽让它落进来。'
            + '上面这个框<em>没有中梁</em> —— 中间那两条槽，一条都不能开。',
        tiny: '开了就是四个空洞，白白削掉一截强度。',
      },
      async enter(c, engine) {
        junk.clear();
        c.lantern.attachAll();
        only(c, [...LOWER, ...UPPER]);
        for (const id of LOWER) { c.lantern.setOps(id, 'all'); c.lantern.parts.get(id).installed = true; }
        for (const id of UPPER) { c.lantern.setOps(id, 'blank'); c.lantern.parts.get(id).installed = true; }
        c.lantern.applyAssembly();

        c.lantern.highlight('LB-A1', PALETTE.MORTISE, 0.6);
        c.sfx.play('UI_SWITCH_HARD');
        await wait(0.6);
        const cross = ghostBox(c.stage.scene, {
          size: [a(1.5), a(1.5), 1], pos: [0, C.RAIL_A_Y, C.UPPER_Z1 + 2],
          color: PALETTE.ALERT, opacity: 0.8,
        });
        junk.add(cross);
        c.sfx.play('UI_ALERT_SOFT');
        c.hud.addSpot({
          pos: V(0, C.RAIL_A_Y, C.UPPER_Z1 + a(1)),
          badge: '✕', label: '这一段不动', sub: '上面没有中梁，不需要槽',
          color: 'var(--red)', active: true,
        });
        c.hud.setHint('下面那根开了槽 · 上面这根<em>不开</em>');
        c.crossMark = cross;
        void engine;
      },
      primary: {
        label: '明白了，开工',
        onClick: async (c, engine) => {
          c.lantern.highlight('LB-A1', 0, 0);
          c.hud.clearSpots();
          if (c.crossMark) c.stage.scene.remove(c.crossMark);
          const ops = [OP.TENON, OP.MORTISE, OP.SOCKET, OP.PANEL_SLOT, OP.CORNER_SLOT, OP.PRESS_SLOT];
          const names = ['切榫头', '凿孔', '铣柱窝', '底面开装板槽', '底面开角牙槽', '顶面留压槽'];
          const UP = ['UB-A1', 'UB-A2', 'UB-B1', 'UB-B2'];
          for (const [i, op] of ops.entries()) {
            for (const id of UP) c.lantern.addOp(id, op);
            c.hud.setHint(`${names[i]} · <em>${i + 1}</em> / 6`);
            c.sfx.play(i < 3 ? 'SAW_CUT_SHORT' : 'ROUTER_MILL', { pitch: i * 1.2, gain: 0.7 });
            if (i === 3) c.sfx.play('WOOD_FLIP', { delay: 0.1 });
            await wait(0.55);
          }
          c.hud.setHint('上枨框四件就绪');
          c.sfx.play('SUCCESS_SOFT');
          engine.unlock();
        },
      },
      exit(c) { junk.clear(); c.hud.clearSpots(); c.lantern.clearHighlights(); },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'C9', phase: 3, phaseRatio: 0.5,
      title: '上枨框成了',
      mood: 'craft',
      cam: { az: 40, el: 40, dist: 350, target: [0, 0, C.UPPER_Z0], snap: true },
      gate: true,
      hint: '<em>拖动横枨</em>，套住两个榫头',
      narration: `上枨框的装法，你已经会了。
两根横枨套上去 —— 完成。
俯视看，它是一个标准的「井」字：四根木条相互穿插，八个头全部出挑。
和下枨框比一比：一样的方框，只是它中间少了一道中梁。`,
      async enter(c, engine) {
        junk.clear();
        c.lantern.attachAll();
        only(c, [...LOWER, ...UPPER]);
        for (const id of [...LOWER, ...UPPER]) c.lantern.setOps(id, 'all');
        for (const id of [...LOWER, 'UB-A1', 'UB-A2']) c.lantern.parts.get(id).installed = true;
        c.lantern.applyAssembly();
        c.hud.setHint('上枨框 <em>2</em> / 4 件');

        c.drag.begin({
          parts: ['UB-B1', 'UB-B2'], snap: 6, seatSfx: 'SNAP_IN',
          wrongHint: '两个榫头要同时对准两个孔',
          onSeat: (id, n) => c.hud.setHint(`上枨框 <em>${2 + n}</em> / 4 件`),
          onAll: async () => {
            c.sfx.play('SUCCESS_MID', { delay: 0.15 });
            c.hud.toast('一个「井」字，八头出挑', { gold: true });
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
            c.sfx.play('LIGHT_RISE', { delay: 0.3 });
            c.hud.setHint('四根柱子，就立在这四道光的位置');
            engine.unlock('去立柱子');
          },
        });
        c.hud.setAlts([{ label: '帮我装上', onClick: () => c.drag.autoSeatAll() }]);
      },
      exit() { junk.clear(); },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'C10', phase: 3, phaseRatio: 0.75,
      title: '立柱：削掉四分之三',
      mood: 'craft',
      cam: { az: 26, el: 8, dist: 300, target: [0, 0, 96], snap: true },
      gate: true,
      hint: '<em>拖动铣刀</em>，一次削掉一个角',
      narration: `最后四根长料，做立柱。
每根都比枨框高得多。
但这里有个问题：柱子要同时扣住上下两个枨框，还得让枨框卡得牢、拆不掉。怎么做到？
（停顿 1.0 s）
答案是：把柱子在两个高度上，各削掉四分之三。
只留下四分之一的截面 —— 一小段细颈。
这样一来，立柱就被分成了三段，中间用两个细颈连着。
细颈卡进枨框，上下两段就分别压在枨框的上面和下面 —— 像夹子一样，把枨框夹住。
（气口）
还有个小心思：细颈最里面那两毫米，做得稍微胖一点点。
推到底的时候会有点紧 —— 这一紧，柱子就自己卡住了，不用钉子也不会掉。
注意，是两处，不是一处。上枨框一个，下枨框一个。`,
      note: {
        title: '像夹子一样',
        body: '细颈卡进枨框的厚度里，上下两段完整的柱身正好压在框的上面和下面。'
            + '柱子不是穿过框，是<em>夹住</em>框。',
        tiny: '细颈最里面两毫米略胖一点点，推到底会咬紧。',
      },
      async enter(c, engine) {
        junk.clear();
        only(c, ['PL-01']);
        c.lantern.setOps('PL-01', 'blank');
        c.lantern.detach('PL-01', { pos: [0, 0, 96], rot: [0, 0, 0] });

        for (const [z0, z1] of [J3.SEG.NECK2, J3.SEG.NECK1]) {
          junk.add(outlineBox(c.stage.scene, {
            size: [M.SEC + 2, M.SEC + 2, z1 - z0],
            pos: [0, 0, (z0 + z1) / 2 - M.HEIGHT / 2 + 96],
            color: PALETTE.SOCKET,
          }));
        }

        const ops = [OP.NECK2, OP.NECK1];
        let stage = 0;
        const neck = () => {
          const seg = stage === 0 ? J3.SEG.NECK2 : J3.SEG.NECK1;
          const zw = (seg[0] + seg[1]) / 2 - M.HEIGHT / 2 + 96;
          c.stage.setRecommended({ az: 26, el: 6, dist: 150, target: V(0, 0, zw) });
          c.hud.setHint(`第 <em>${stage + 1}</em> 处细颈 / 共 2 处`);
          cut(c, {
            tool: 'router',
            from: V(-av(1.4), 0, zw), to: V(av(1.4), 0, zw),
            faceNormal: V(0, 0, -1),
            strokes: 3, sfx: 'ROUTER_MILL', chipDir: V(1, 0, 0),
            onStroke: (n, total) => c.hud.setHint(`第 ${stage + 1} 处细颈 · 削掉 <em>${n}</em> / ${total} 个角`),
            onDone: async () => {
              for (const id of COLS) c.lantern.addOp(id, ops[stage]);
              c.sfx.play('ROUTER_FINE', { delay: 0.1 });
              stage++;
              if (stage < 2) {
                c.sfx.play('UI_HINT');
                c.hud.toast('还有一处，在上枨框的高度', { dur: 2200 });
                await wait(1.2);
                neck();
                return;
              }
              c.hud.setHint('三段，两颈');
              c.hud.toast('推到底会咬住 —— 不用钉子也掉不了', { gold: true });
              c.sfx.play('SUCCESS_MID');
              c.stage.setRecommended({ az: 30, el: 12, dist: 300, target: V(0, 0, 96) });
              c.hud.setAlts([]);
              engine.unlock();
            },
          });
        };
        neck();
      },
      exit() { junk.clear(); },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'C11', phase: 3, phaseRatio: 1,
      title: '四柱推入，合龙',
      mood: 'craft',
      cam: { az: 42, el: 26, dist: 540, target: [0, 0, 96], snap: true },
      gate: true,
      hint: '沿着箭头，<em>横着推</em>进去',
      narration: `现在，把四根柱子装上去。
注意方向 —— 柱子不能从上往下放。细颈比柱身细，掉不进去，也卡不住。
要从外面，横着推进来。
上下两个细颈，同时滑进上下两个窝。
推到最后会有点紧 —— 别停，推到底。
（气口）
听见没有？那是它自己咬住了。
上下两段柱身，一上一下，把枨框牢牢夹住。
（停顿 0.8 s）
四根柱子，十三根木条，全部到位。
框架，合龙了。`,
      note: {
        title: '不能从上往下放',
        body: '细颈比柱身细。竖着放，柱身会架在框上，下不去；'
            + '就算下去了，也没有东西挡住它。',
        tiny: '横着推，两个细颈才会同时滑进上下两个窝。',
      },
      async enter(c, engine) {
        junk.clear();
        c.lantern.attachAll();
        only(c, [...LOWER, ...UPPER, ...COLS]);
        for (const id of [...LOWER, ...UPPER, ...COLS]) c.lantern.setOps(id, 'all');
        for (const id of [...LOWER, ...UPPER]) c.lantern.parts.get(id).installed = true;
        c.lantern.applyAssembly();

        c.guides.set(COLS.map((id) => {
          const p = c.lantern.parts.get(id);
          const d = p.assembly.dir;
          return {
            pos: V(p.home.x - d[0] * a(4), p.home.y, C.LOWER_Z0 - a(1)),
            glyph: '→', rot: d[0] > 0 ? 0 : 180,
          };
        }));
        c.hud.setHint('立柱 <em>0</em> / 4');

        c.drag.begin({
          parts: COLS, snap: 5, wedge: true, seatSfx: 'SNAP_LOCK',
          wrongHint: '柱子不能竖着放 —— 从外面横着推',
          onSeat: async (id, n) => {
            c.hud.setHint(`立柱 <em>${n}</em> / 4`);
            await tween(0.2, (k) => {
              const dz = -0.3 * Math.sin(k * Math.PI);
              for (const r of ['LB-B1', 'LB-B2', 'UB-B1', 'UB-B2']) {
                const q = c.lantern.parts.get(r);
                q.mesh.position.z = q.home.z + dz;
              }
            });
            for (const r of ['LB-B1', 'LB-B2', 'UB-B1', 'UB-B2']) {
              const q = c.lantern.parts.get(r);
              q.mesh.position.z = q.home.z;
            }
          },
          onAll: async () => {
            c.guides.clear();
            await tween(0.5, (k) => { c.lantern.root.position.z = -1 * Math.sin(k * Math.PI); });
            c.lantern.root.position.z = 0;
            c.sfx.play('FRAME_COMPLETE');
            c.fx.ring.sweep({ z0: 0, z1: M.HEIGHT, dur: 1.2 });
            c.sfx.play('SHIMMER_RISE', { delay: 0.2 });
            c.hud.setHint('十三根木条 · <em>全部到位</em>');
            c.hud.toast('框架，合龙了', { gold: true, dur: 3200 });
            c.stage.setRecommended({ az: 42, el: 18, dist: 520, target: V(0, 0, 96) });
            engine.unlock('装点年味');
          },
        });
        c.hud.setAlts([{ label: '帮我装上', onClick: () => c.drag.autoSeatAll() }]);
      },
      exit(c) { junk.clear(); c.guides.clear(); },
    },
  ];
}
