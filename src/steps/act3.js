/**
 * 做骨架（8 步）—— 从十三根方料到框架合龙
 */

import * as THREE from 'three';
import {
  V, a, av, C, M, J3, J4, PALETTE, Junk, BENCH_Z, ghostBox, outlineBox,
  FIT_FRAME, FIT_RING, FIT_BENCH,
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

  /** 起一个走刀任务，并附上「帮我加工」 */
  function cut(c, o) {
    c.mach.begin(o);
    c.hud.setAlts([{ label: '帮我加工', ico: 'spark', onClick: () => c.mach.autoRun() }]);
  }

  return [
    // ══════════════════════════════════════════════════════
    {
      id: 'C1', phase: 2,
      title: '十三根木条',
      mood: 'studio',
      bgm: 'BGM_B_CRAFT',
      cam: { az: 58, el: 46, dist: 560, target: [0, 0, 96], snap: true, fit: { r: 222, h: 146 } },
      narration: `一共十三根木条，截面都是方的。
九根短的，用来做上下两个框；四根长的，是灯笼的柱子。
（气口）
先做下面这个框，也就是灯笼的底盘。`,
      note: {
        title: '只有一个尺寸',
        spec: [['木条截面', '12 × 12 mm'], ['短料 / 长料', '9 / 4 根']],
        body: '整盏灯的长度、深浅、间距，都是这 <em>12 毫米</em>的整数倍。',
        foot: '一套尺寸贯穿到底，零件才可能严丝合缝。',
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
        c.hud.setCue('短料 <b>9</b> 根 · 长料 <b>4</b> 根');
      },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'C2', phase: 2,
      title: '开槽，开叉',
      mood: 'craft',
      cam: { az: 62, el: 46, dist: 190, target: [0, 0, BENCH_Z], snap: true, fit: FIT_BENCH },
      cue: { ico: 'drag', text: '<em>拖动刻刀</em>，沿着槽来回走' },
      narration: `先从两根顺枨开始：在顶面铣两条平行的槽。
中间留下的这一小条不是废料，是榫舌。
（气口）
再做中梁：两头截短，各开一个叉口，正好卡住刚才那条榫舌。`,
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
          c.stage.setRecommended({ az: 8, el: 20, dist: 200, target: V(0, 0, BENCH_Z), fit: FIT_BENCH });
          c.hud.setCue('<em>拖动锯</em>，沿线来回锯', 'drag');

          const ops = [OP.SHORTEN, OP.FORK, OP.BEAR_SHOULDER];
          const names = ['截短', '开叉口', '切出承重面'];
          let stage = 0;
          cut(c, {
            tool: 'saw',
            from: V(0, -av(4.6), BENCH_Z + av(1.2)),
            to: V(0, av(4.6), BENCH_Z + av(1.2)),
            faceNormal: V(0, 0, -1),
            strokes: 3,
            sfx: 'SAW',
            chipDir: V(0, 0, 1),
            onStroke: (n) => {
              c.lantern.addOp('LB-C1', ops[stage++]);
              c.hud.setCue(`${names[n - 1]} · <b>${n}</b> / 3`);
            },
            onDone: () => {
              c.hud.setCue('中梁做好了');
              c.hud.toast('端头那个平面，等会儿要坐在槽底上', { gold: true });
              engine.done();
            },
          });
        };

        // ── 第一段：两根顺枨开槽 ──
        cut(c, {
          tool: 'chisel',
          from: V(-av(1.6), 0, BENCH_Z + av(1.2)),
          to: V(av(1.6), 0, BENCH_Z + av(1.2)),
          faceNormal: V(0, 0, -1),
          strokes: 3,
          sfx: 'CHISEL',
          chipDir: V(0, 0, 1),
          onStroke: (n, total) => {
            c.hud.setCue(`第 <b>${n}</b> 刀 / 共 ${total} 刀`);
            c.lantern.setCutReveal('LB-A1', n / total);
          },
          onDone: async () => {
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
      },
      exit() { junk.clear(); },
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
「工」字形，成了 —— 这是整个底盘的骨。`,
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
      cam: { az: 30, el: 40, dist: 320, target: [0, 0, C.LOWER_Z1], snap: true, fit: { r: 80, h: 54 } },
      cue: { ico: 'drag', text: '<em>拖动锯</em>，切出四个榫头' },
      narration: `四个端头切出榫头。榫头要细而长，才穿得过整根木条。
这里有个容易忽略的地方：榫头不居中，要往里偏一点 —— 外侧留出的那一半，是给柱子留的位置。
（气口）
再取两根新料做横枨。三道工序：把孔凿穿，让榫头整根穿出去；外侧铣一个方口，那是柱子的窝；顶面再开一条又长又浅的槽，格心最后就插在这儿。`,
      note: {
        title: '榫头为什么不居中',
        body: '往里偏，外侧就空出一半的厚度。那半边不是浪费 —— 是留给<em>柱子</em>的。',
        foot: '居中的榫头看着规整，但挖柱窝时会正好挖穿它。',
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
          c.lantern.parts.get('LB-B2').mesh.visible = false;
          c.stage.setRecommended({ az: 70, el: 26, dist: 210, target: V(0, 0, BENCH_Z), fit: FIT_BENCH });

          const seq = [
            { op: OP.MORTISE, name: '凿孔', tool: 'chisel', sfx: 'CHISEL', done: '凿穿了' },
            { op: OP.SOCKET, name: '铣柱窝', tool: 'router', sfx: 'ROUTER', done: '柱窝好了' },
            { op: OP.PANEL_SLOT, name: '开装板槽', tool: 'router', sfx: 'ROUTER', done: '装板槽好了' },
          ];
          let i = 0;
          const run = () => {
            const s = seq[i];
            c.hud.setCue(`${s.name} · 第 <b>${i + 1}</b> 道 / 共 3 道`, 'drag');
            cut(c, {
              tool: s.tool,
              from: V(0, -a(4), BENCH_Z + av(1.4)),
              to: V(0, a(4), BENCH_Z + av(1.4)),
              faceNormal: V(0, 0, -1),
              strokes: 2,
              sfx: s.sfx,
              chipDir: V(0, 0, 1),
              onDone: async () => {
                c.lantern.addOp('LB-B1', s.op);
                c.lantern.addOp('LB-B2', s.op);
                c.hud.toast(s.done, { gold: true, dur: 1400 });

                if (s.op === OP.SOCKET) {
                  const gh = ghostBox(c.stage.scene, {
                    size: [J3.NECK, J3.NECK, M.SEC], pos: [a(4), a(3), BENCH_Z],
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
                c.lantern.parts.get('LB-B2').mesh.visible = true;
                c.hud.setCue('两根横枨都好了');
                engine.done();
              },
            });
          };
          run();
        };

        // ── 第一段：切四个榫头 ──
        cut(c, {
          tool: 'saw',
          from: V(av(3.2), a(4), C.LOWER_Z1 + a(1)),
          to: V(av(5.4), a(4), C.LOWER_Z1 + a(1)),
          faceNormal: V(0, 0, -1),
          strokes: 3,
          sfx: 'SAW',
          chipDir: V(0, 0, 1),
          onStroke: (n, total) => c.hud.setCue(`第 <b>${n}</b> 刀 / 共 ${total} 刀`, 'drag'),
          onDone: async () => {
            c.lantern.addOp('LB-A1', OP.TENON);
            c.lantern.addOp('LB-A2', OP.TENON);
            c.hud.setCue('四个榫头都切好了');

            await wait(0.4);
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
      exit(c) { junk.clear(); c.hud.clearSpots(); },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'C5', phase: 2,
      title: '底盘做好了',
      mood: 'craft',
      cam: { az: 40, el: 36, dist: 320, target: [0, 0, C.LOWER_Z1], snap: true, fit: FIT_RING },
      cue: { ico: 'drag', text: '<em>拖动横枨</em>，套住两个榫头' },
      narration: `两根横枨套上去，两个榫头同时穿进两个孔，推到底。
看四边 —— 榫头都穿出来了，各露出一小截。
这不是做工粗糙，是中式木作故意留下的样子：更牢，也更好看。`,
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
          onSeat: (id, n) => {
            c.hud.setCue(`底盘 <b>${3 + n}</b> / 5 件`);
            for (const sy of [1, -1]) {
              c.fx.ripples.emit(
                V(C.EDGE, sy * C.RAIL_A_Y, (C.LOWER_Z0 + C.LOWER_Z1) / 2), V(1, 0, 0), { size: 14 },
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
      title: '上面那个框：中间一刀都不动',
      mood: 'craft',
      cam: { az: 34, el: 26, dist: 340, target: [0, 0, C.UPPER_Z0], snap: true, fit: { r: 100, h: 140 } },
      cps: 3.8,
      narration: `上面这个框，做法几乎一样，但有一处必须不一样。
下面那个框中间架着中梁，所以顺枨要开槽。
上面这个框没有中梁 —— 那两条槽，一条都不能开。开了就是四个白挖的洞。
（气口）
其余的照做：切榫头、凿孔、铣柱窝，再翻过来在底面开装板槽，因为格心是从下往上顶进去的。`,
      note: {
        title: '差别只有一处',
        body: '下面那个框中间架着中梁，要开槽让它落进来。上面这个框<em>没有中梁</em>。',
        foot: '开了就是四个空洞，白白削掉一截强度。',
      },
      task: {
        label: '明白了，开工',
        async onClick(c, engine) {
          c.hud.setTask(null);
          c.hud.clearSpots();
          c.lantern.clearHighlights();
          junk.clear();

          const ops = [OP.TENON, OP.MORTISE, OP.SOCKET, OP.PANEL_SLOT, OP.CORNER_SLOT, OP.PRESS_SLOT];
          const names = ['切榫头', '凿孔', '铣柱窝', '底面开装板槽', '底面开角牙槽', '顶面留压槽'];
          for (const [i, op] of ops.entries()) {
            for (const id of UPPER) c.lantern.addOp(id, op);
            c.hud.setCue(`${names[i]} · <b>${i + 1}</b> / 6`);
            c.sfx.play(i < 3 ? 'SAW' : 'ROUTER', { pitch: i * 1.2, gain: 0.6 });
            await wait(0.5);
          }

          // 做好了就直接装上去
          c.hud.setCue('<em>拖动横枨</em>，套住两个榫头', 'drag');
          for (const id of ['UB-A1', 'UB-A2']) c.lantern.parts.get(id).installed = true;
          c.lantern.applyAssembly();
          c.stage.setRecommended({ az: 40, el: 40, dist: 350, target: V(0, 0, C.UPPER_Z0), fit: { r: 104, h: 140 } });

          c.drag.begin({
            parts: ['UB-B1', 'UB-B2'], snap: 6, seatSfx: 'SNAP_IN',
            onSeat: (id, n) => c.hud.setCue(`上面这个框 <b>${2 + n}</b> / 4 件`),
            onAll: () => {
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
      cam: { az: 26, el: 8, dist: 300, target: [0, 0, 96], snap: true, fit: { r: 46, h: 104 } },
      cue: { ico: 'drag', text: '<em>拖动铣刀</em>，一次削掉一个角' },
      narration: `最后四根长料，做柱子。
柱子要同时扣住上下两个框，还得让框拆不下来。怎么做到？
（气口）
在两个高度上，各削掉四分之三，只留一小段细颈。
细颈卡进框里，上下两段完整的柱身正好压在框的上面和下面 —— 像夹子一样，把框夹住。`,
      note: {
        title: '像夹子一样',
        body: '细颈卡进框的厚度里，上下两段柱身压住框的上下两面。柱子不是穿过框，是<em>夹住</em>框。',
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

        const ops = [OP.NECK2, OP.NECK1];
        let stage = 0;
        const neck = () => {
          const seg = stage === 0 ? J3.SEG.NECK2 : J3.SEG.NECK1;
          const zw = (seg[0] + seg[1]) / 2 - M.HEIGHT / 2 + 96;
          // 整根柱子都得在画面里。细颈只有 12 mm，凑近了看确实清楚，
          // 但"三段两颈"这件事一旦裁掉柱身就说不成立了。
          c.stage.setRecommended({ az: 26, el: 6, dist: 300, target: V(0, 0, 96), fit: { r: 46, h: 104 } });
          marks.forEach((m, i) => { m.material.opacity = i === stage ? 0.5 : 0.16; });
          c.hud.clearSpots();
          c.hud.addSpot({
            pos: V(0, 0, zw), badge: stage + 1,
            label: stage === 0 ? '这一处对着下面那个框' : '这一处对着上面那个框',
            color: 'var(--violet)', active: true,
          });
          c.hud.setCue(`第 <b>${stage + 1}</b> 处细颈 / 共 2 处`, 'drag');
          // 刀从柱子外侧横着走。走在轴线上会让刀身穿进柱子里，
          // 既看不见刀，也看不出它在削哪一面
          cut(c, {
            tool: 'router',
            from: V(-av(1.4), -av(1.6), zw), to: V(av(1.4), -av(1.6), zw),
            faceNormal: V(0, 1, 0),
            strokes: 3, sfx: 'ROUTER', chipDir: V(0, -1, 0),
            onStroke: (n, total) => c.hud.setCue(`第 ${stage + 1} 处细颈 · 削掉 <b>${n}</b> / ${total} 个角`, 'drag'),
            onDone: async () => {
              for (const id of COLS) c.lantern.addOp(id, ops[stage]);
              stage++;
              if (stage < 2) {
                c.hud.toast('还有一处，在上面那个框的高度', { dur: 2000 });
                await wait(1.0);
                neck();
                return;
              }
              c.hud.clearSpots();
              for (const m of marks) { m.material.opacity = 0.14; }
              c.hud.setCue('三段柱身，两处细颈');
              c.hud.toast('推到底会咬住 —— 不用钉子也掉不了', { gold: true });
              c.stage.setRecommended({ az: 30, el: 12, dist: 300, target: V(0, 0, 96), fit: { r: 46, h: 104 } });
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
      narration: `注意方向 —— 柱子不能从上往下放。细颈太细，掉不进去，也卡不住。
要从外面横着推进来，上下两个细颈同时滑进两个窝。
推到最后会有点紧，别停，推到底。
（气口）
十三根木条，全部到位。框架，合龙了。`,
      note: {
        title: '不能从上往下放',
        body: '细颈比柱身细。竖着放，柱身会架在框上，下不去。',
        foot: '横着推，两个细颈才会同时滑进上下两个窝。',
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
            ico: 'right', rot: d[0] > 0 ? 0 : 180,
          };
        }));
        c.hud.setCue('柱子 <b>0</b> / 4');

        c.drag.begin({
          parts: COLS, snap: 5, wedge: true, seatSfx: 'SNAP_LOCK',
          onSeat: (id, n) => c.hud.setCue(`柱子 <b>${n}</b> / 4`),
          onAll: async () => {
            c.guides.clear();
            await tween(0.5, (k) => { c.lantern.root.position.z = -1 * Math.sin(k * Math.PI); });
            c.lantern.root.position.z = 0;
            c.sfx.play('WOOD_SETTLE');
            c.fx.ring.sweep({ z0: 0, z1: M.HEIGHT, dur: 1.2 });
            c.hud.setCue('十三根木条 · <em>全部到位</em>');
            c.hud.toast('框架，合龙了', { gold: true, dur: 3000 });
            c.stage.setRecommended({ az: 42, el: 18, dist: 520, target: V(0, 0, 96), fit: FIT_FRAME });
            engine.done();
          },
        });
        c.hud.setAlts([{ label: '帮我装上', ico: 'spark', onClick: () => c.drag.autoSeatAll() }]);
      },
      exit(c) { junk.clear(); c.guides.clear(); },
    },
  ];
}
