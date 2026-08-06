/**
 * 第三幕 · 匠作（S13–S25 → 11 步）
 *
 * 本幕**一步不减**。它是全片价值核心，也是程序化几何最能发挥的地方：
 * 每一道工序都由 CSG 内核按 §5 节点参数精确生成，新切面自动亮一档。
 *
 * 涉及的修正点：
 *   C2  ★V-19 顺枨双开口槽自顶面向下
 *   C3  ★V-23 中梁截至 8a ／ ★V-26 端部下半段横切，切出承重肩
 *   C5  ★V-04 榫头细长（长厚比 4.5:1）／ ★V-17 榫头偏内侧，外留 a/2 给柱窝
 *   C6  ★V-05 透眼贯穿 ／ ★V-08 柱窝为新增工序 ／ ★V-21 装板槽实际出现
 *   C8  ★★V-02/V-03 上枨框中部不开槽（全片最重要的修正，对比动画不可删）
 *   C10 ★V-07/V-24 三段两颈与绝对高度基准 ／ ★V-20 楔紧段
 *   C11 ★V-18 立柱垂直于横枨水平推入（非 45°、非竖直下落）
 */

import * as THREE from 'three';
import { V, a, av, dim, C, M, J3, J4, PALETTE, Junk, BENCH_Z, ghostBox, outlineBox } from './util.js';
import { OP } from '../core/parts.js';
import { tween, Ease, wait } from '../util/tween.js';

const junk = new Junk(null);

/** 陈列到工作台中心 */
const bench = (c, id, rot) => c.lantern.detach(id, { pos: [0, 0, BENCH_Z], rot });

/** 让某组构件按当前工序集合显示，其余隐藏 */
function stageParts(c, ids) {
  c.lantern.showOnly(ids);
  c.lantern.showPanels(false);
}

export function act3(ctx) {
  junk.scene = ctx.stage.scene;
  const LOWER = ['LB-A1', 'LB-A2', 'LB-C1', 'LB-B1', 'LB-B2'];
  const UPPER = ['UB-A1', 'UB-A2', 'UB-B1', 'UB-B2'];
  const COLS = ['PL-01', 'PL-02', 'PL-03', 'PL-04'];

  /** 加工步的通用装配：起一个走刀任务 + 降级按钮 */
  function machineJob(c, engine, o) {
    const job = c.mach.begin(o);
    c.hud.setActions([
      { label: '开始加工（自动）⏩', kind: 'alt', onClick: () => c.mach.autoRun() },
    ]);
    void engine;
    return job;
  }

  return [
    // ══════════════════════════════════════════════════════
    // C1 · 十三根木料 · 取料
    // ══════════════════════════════════════════════════════
    {
      id: 'C1', phase: 2, phaseRatio: 0.1,
      title: '十三根木料',
      mood: 'studio',
      bgm: 'BGM_B_CRAFT',
      cam: { az: 55, el: 42, dist: 460, target: [0, 0, 96], snap: true },
      narration: `正式开工。
一共十三根木条，截面都是方的。
九根短的 —— 上下两个枨框要用；四根长的 —— 是灯笼的柱子。
木料用梨木：纹理细密，不易变形，是做小木作最稳妥的选择。
（气口）
先做下枨框 —— 灯笼的底盘。
取三根短料：两根做顺枨，横着摆；一根做中梁，架在它们中间。
这三根，要用夹榫接成一个「工」字。`,
      cards: [
        {
          title: '木料 BOM', tag: '§4.1',
          rows: [
            ['短料 ×9', `${dim(10)} × ${dim(1)} × ${dim(1)}`],
            ['长料 ×4', `${dim(16)} × ${dim(1)} × ${dim(1)}`],
            ['合计', '13 根 · 金属件 0 · 胶水 0'],
          ],
          note: '9 短 = 下枨框 5 + 上枨框 4；4 长 = 四根立柱。',
        },
        {
          title: '本组取料', tag: '下枨框',
          html: `<div class="row"><span>BLK-S01</span><b>→ 顺枨 LB-A1</b></div>
                 <div class="row"><span>BLK-S02</span><b>→ 顺枨 LB-A2</b></div>
                 <div class="row"><span>BLK-S03</span><b>→ 中梁 LB-C1</b></div>`,
        },
      ],
      async enter(c) {
        junk.clear();
        c.lantern.attachAll();
        c.lantern.allBlank();
        stageParts(c, [...LOWER, ...UPPER, ...COLS]);

        // 13 根构件的天然轴向各不相同（顺枨沿 X、横枨与中梁沿 Y、立柱沿 Z），
        // 陈列时统一旋转到沿 X，才能像真实工作台上那样平铺。
        const layFlat = (id) => {
          if (id.startsWith('PL')) return [0, Math.PI / 2, 0];          // Z → X
          if (id.includes('-B') || id === 'LB-C1') return [0, 0, -Math.PI / 2]; // Y → X
          return [0, 0, 0];
        };
        // 前排 9 根短料 3×3
        const shorts = [...LOWER, ...UPPER];
        shorts.forEach((id, i) => {
          const col = i % 3, rowI = Math.floor(i / 3);
          c.lantern.detach(id, {
            pos: [(col - 1) * a(11), a(3) - rowI * a(2), BENCH_Z],
            rot: layFlat(id),
          });
        });
        // 后排 4 根长料横向一排
        COLS.forEach((id, i) => {
          c.lantern.detach(id, { pos: [0, -a(3) - i * a(2), BENCH_Z], rot: layFlat(id) });
        });
        // 依次「落台」
        for (const [i, id] of [...shorts, ...COLS].entries()) {
          const p = c.lantern.parts.get(id);
          const z0 = p.mesh.position.z;
          p.mesh.position.z = z0 + a(2);
          setTimeout(() => {
            tween(0.22, (k) => { p.mesh.position.z = z0 + a(2) * (1 - Ease.outBack(k)); });
            c.sfx.play('WOOD_DROP', { pitch: (Math.random() - 0.5) * 4 });
          }, i * 60);
        }
        c.hud.setCounter('13 根 · 金属件 0 · 胶水 0');
      },
      exit(c) { c.hud.setCounter(''); },
    },

    // ══════════════════════════════════════════════════════
    // C2 · 加工① 顺枨中部自顶面铣双开口槽 ★V-19
    // ══════════════════════════════════════════════════════
    {
      id: 'C2', phase: 2, phaseRatio: 0.2,
      title: '加工① · 顺枨顶面铣双开口槽',
      mood: 'craft',
      cam: { az: 62, el: 46, dist: 190, target: [0, 0, BENCH_Z], snap: true },
      gate: true,
      hint: '拖动刻刀，沿槽来回走刀', hintPulse: true,
      narration: `从顶面下刀。
在中间铣两条平行的槽，槽宽是木料厚度的三分之一，深度到一半，往里只铣半个模数就停。
注意 —— 两条槽之间留下的这一小条，不是废料，是榫舌。
还有槽底这个面，别小看它：等会儿中梁落下来，就坐在这上面。`,
      cards: [{
        title: '加工参数卡', tag: 'J-2',
        rows: [
          ['槽宽', dim(1 / 3)], ['槽深', `${dim(1 / 2)}（自顶面向下）`],
          ['槽长', `${dim(1 / 2)}（自内侧面向外，盲端）`],
          ['榫舌厚', dim(1 / 3)],
        ],
        warn: '★槽的方向已由「自底面向上」修正为「自顶面向下」（V-19）。自底面开槽时中梁靠摩擦悬挂，重力会使其脱落，且节点处无承重面。',
      }],
      async enter(c, engine) {
        junk.clear();
        stageParts(c, ['LB-A1', 'LB-A2']);
        c.lantern.setOps('LB-A1', 'blank');
        c.lantern.setOps('LB-A2', 'blank');
        bench(c, 'LB-A1', [0, 0, 0]);
        c.lantern.detach('LB-A2', { pos: [0, av(2.6), BENCH_Z], rot: [0, 0, 0] });
        c.lantern.parts.get('LB-A2').mesh.visible = false;

        // 加工位标注
        junk.add(outlineBox(c.stage.scene, {
          size: [a(1), a(1), a(1) + 1], pos: [0, 0, BENCH_Z], color: PALETTE.MORTISE,
        }));

        machineJob(c, engine, {
          tool: 'chisel',
          from: V(-av(1.6), 0, BENCH_Z + av(1.2)),
          to: V(av(1.6), 0, BENCH_Z + av(1.2)),
          faceNormal: V(0, 0, -1),
          strokes: 3,
          sfx: 'CHISEL_STROKE',
          chipDir: V(0, 0, 1),
          wrongHint: '沿着槽的方向来回拉',
          onStroke: (n, total) => {
            c.hud.setCounter(`开口槽 · ${n}/${total} 刀`);
            c.lantern.setCutReveal('LB-A1', n / total);
          },
          onDone: async () => {
            c.lantern.addOp('LB-A1', OP.BEAM_SLOT);
            c.lantern.addOp('LB-A2', OP.BEAM_SLOT);
            c.sfx.play('SUCCESS_SOFT');
            c.hud.toast('✓ 开口槽 ×2 完成 —— 中间留下的这一条，是榫舌');
            c.hud.setCounter('');
            // 第二根同工艺快速完成（重复劳动消耗耐心，但必须让用户看到两根都做了）
            const p2 = c.lantern.parts.get('LB-A2');
            p2.mesh.visible = true;
            c.sfx.play('UI_FLIP');
            await tween(1.2, (k) => { c.lantern.setCutReveal('LB-A2', k); });
            c.hud.toast('✓ LB-A1 / LB-A2 两根顺枨就绪');
            c.hud.setActions([]);
            engine.unlock();
          },
        });
      },
      exit() { junk.clear(); },
    },

    // ══════════════════════════════════════════════════════
    // C3 · 加工② 中梁截短至 8a + 开叉双榫 + 承重肩 ★V-23 / ★V-26
    // ══════════════════════════════════════════════════════
    {
      id: 'C3', phase: 2, phaseRatio: 0.28,
      title: '加工② · 中梁截短与开叉双榫',
      mood: 'craft',
      cam: { az: 8, el: 20, dist: 200, target: [0, 0, BENCH_Z], snap: true },
      gate: true,
      hint: '拖动锯，沿线来回锯切', hintPulse: true,
      narration: `中梁要先截短。
因为它两端的榫头只需要顶到顺枨的中心线，不必穿出去。
截到八个模数长，然后两端各开一个叉口 —— 两个平行的榫头，中间留一道口子，这道口子就是留给刚才那条榫舌的。
（气口）
还要在端头下半段横着切一刀，留出一个肩。
为什么？因为等它落进槽里，全靠这个肩坐在槽底上受力。`,
      cards: [{
        title: '加工参数卡', tag: 'LB-C1',
        rows: [
          ['全长', `由 ${dim(10)} 截至 ${dim(8)}（两端各去 ${dim(1)}）`],
          ['双榫', `各厚 ${dim(1 / 3)}、长 ${dim(1 / 2)}、高 ${dim(1 / 2)}`],
          ['开口', `宽 ${dim(1 / 3)}、深 ${dim(1 / 2)}`],
          ['承重肩', `下半段横切 ${dim(1 / 2)} 高 × ${dim(1 / 2)} 长`],
        ],
        warn: [
          '中梁是 13 根中唯一被截短的构件（V-23）。中心距修正为 8a 后，肩距 7a ＋ 两端榫各 a/2 ＝ 8a。',
          '★V-26（本版校验新增）：原 §5 J-2 写「端部下半段保留为肩」，与 S16「横切去除」冲突。经验算，下半段必须**去除**，否则与顺枨槽底余料干涉；切出的水平面即承重面。',
        ],
      }],
      async enter(c, engine) {
        junk.clear();
        stageParts(c, ['LB-C1']);
        c.lantern.setOps('LB-C1', 'blank');
        bench(c, 'LB-C1', [0, 0, 0]);

        const ops = [OP.SHORTEN, OP.FORK, OP.BEAR_SHOULDER];
        let stage = 0;
        machineJob(c, engine, {
          tool: 'saw',
          from: V(0, -av(4.6), BENCH_Z + av(1.2)),
          to: V(0, av(4.6), BENCH_Z + av(1.2)),
          faceNormal: V(0, 0, -1),
          strokes: 3,
          sfx: 'SAW_CUT_SHORT',
          chipDir: V(0, 0, 1),
          onStroke: (n) => {
            c.lantern.addOp('LB-C1', ops[stage++]);
            const names = ['截短至 8a', '开叉形双榫', '横切承重肩'];
            c.hud.toast(`✓ ${names[n - 1]}`, { dur: 1200 });
            c.sfx.play(n === 1 ? 'SAW_CUT_LONG' : 'SAW_CUT_SHORT', { pitch: n * 1.5 });
            if (n === 1) c.sfx.play('WOOD_DROP', { delay: 0.8, pitch: -3 });
            c.hud.setCounter(`工序 ${n}/3`);
          },
          onDone: () => {
            c.hud.setCounter('全长 8a（96 mm）· 唯一异长构件');
            c.sfx.play('SUCCESS_SOFT');
            c.hud.setActions([]);
            engine.unlock();
          },
        });
      },
      exit(c) { junk.clear(); c.hud.setCounter(''); },
    },

    // ══════════════════════════════════════════════════════
    // C4 · 夹榫自上而下落入 → 工字形
    // ══════════════════════════════════════════════════════
    {
      id: 'C4', phase: 2, phaseRatio: 0.36,
      title: '夹榫落入 → 「工」字形',
      mood: 'craft',
      cam: { az: 46, el: 34, dist: 260, target: [0, 0, C.LOWER_Z1], snap: true },
      gate: true,
      hint: '向下拖动中梁，两端同时落入', hintPulse: true,
      narration: `还记得刚才练的夹榫吗？现在用真的来一次。
中梁从上往下落，两端的叉口同时咬住两根顺枨的榫舌。
—— 「工」字形，成了。
这是整个下枨框的骨。`,
      async enter(c, engine) {
        junk.clear();
        c.lantern.attachAll();
        stageParts(c, ['LB-A1', 'LB-A2', 'LB-C1']);
        c.lantern.setOps('LB-A1', new Set([OP.BEAM_SLOT]));
        c.lantern.setOps('LB-A2', new Set([OP.BEAM_SLOT]));
        c.lantern.setOps('LB-C1', new Set([OP.SHORTEN, OP.FORK, OP.BEAR_SHOULDER]));
        for (const id of ['LB-A1', 'LB-A2']) c.lantern.parts.get(id).installed = true;
        c.lantern.applyAssembly();
        c.hud.setCounter('下枨框 2/5 件');

        c.drag.begin({
          parts: ['LB-C1'], snap: 6, double: true, seatSfx: 'SNAP_IN',
          wrongHint: '夹榫要从上往下落',
          onAll: async () => {
            c.sfx.play('WOOD_SETTLE', { gain: 0.6, delay: 0.08 });
            c.fx.ripples.emit(V(0, C.INNER_FACE, C.LOWER_Z1), V(0, 0, 1));
            c.fx.ripples.emit(V(0, -C.INNER_FACE, C.LOWER_Z1), V(0, 0, 1));
            c.hud.setCounter('下枨框 3/5 件');
            c.hud.toast('✓ 工字形组件完成（3/5 件）');
            c.sfx.play('SUCCESS_MID', { delay: 0.3 });
            // 半透剖切复看：重点展示承重肩与槽底贴合
            if (c.state.autoSection) {
              await wait(0.6);
              c.lantern.setSection(['LB-A1'], true);
              c.sfx.play('SLICE_SOFT');
              c.hud.toast('剖切复看：中梁端肩坐实于顺枨槽底', { dur: 1800 });
              await wait(1.8);
              c.lantern.setSection(null, false);
            }
            engine.unlock();
          },
        });
        c.hud.setActions([
          { label: '看看内部 ↻', kind: 'alt', onClick: async () => {
            c.lantern.setSection(['LB-A1'], true);
            c.sfx.play('SLICE_SOFT');
            await wait(2.2);
            c.lantern.setSection(null, false);
          } },
          { label: '自动装配（降级）', kind: 'alt', onClick: () => c.drag.autoSeatAll() },
        ]);
      },
      exit(c) { c.hud.setCounter(''); c.lantern.setSection(null, false); },
    },

    // ══════════════════════════════════════════════════════
    // C5 · 加工③ 顺枨两端切偏内侧透榫 ★V-04 / ★V-17
    // ══════════════════════════════════════════════════════
    {
      id: 'C5', phase: 2, phaseRatio: 0.46,
      title: '加工③ · 切偏内侧透榫',
      mood: 'craft',
      cam: { az: 30, el: 40, dist: 300, target: [0, 0, C.LOWER_Z1], snap: true },
      gate: true,
      hint: '拖动锯切出榫头', hintPulse: true,
      narration: `接下来在四个端头切榫。
第一个关键：榫头要细而长，不是一个小方块。长度一点五个模数 —— 因为它要穿过整根横枨，还要露出一小截。厚度只留三分之一。
（气口）
第二个关键，很容易被忽略：这个榫头不居中。
它要往里侧偏一点 —— 内侧留六分之一，外侧留一半。
为什么？因为外侧留出的这一半，等会儿要挖成柱窝，用来卡立柱。
榫头要是居中，柱窝一挖就把榫头挖破了。`,
      cards: [{
        title: '截面定位（本步为 V-04 / V-17 的执行点）', tag: '★★',
        rows: [
          ['榫头长', `${dim(1.5)}（穿透 ${dim(1)} ＋ 出头 ${dim(1 / 2)}）`],
          ['榫头厚', dim(1 / 3)], ['榫头高', `${dim(2 / 3)}（居中，上下各留 ${dim(1 / 6)}）`],
          ['厚度定位', `内肩 ${dim(1 / 6)} ｜ 榫 ${dim(1 / 3)} ｜ 外肩 ${dim(1 / 2)}`],
          ['长厚比', '4.5 : 1'],
        ],
        warn: [
          '榫头不是方块 —— 必须细长（V-04）。',
          '榫头必须偏内侧 —— 外侧那 a/2 是留给柱窝的（V-17）。这是本次修正中最容易被忽略、后果最严重的一条。',
        ],
      }],
      async enter(c, engine) {
        junk.clear();
        stageParts(c, ['LB-A1', 'LB-A2', 'LB-C1']);
        for (const id of ['LB-A1', 'LB-A2']) {
          c.lantern.setOps(id, new Set([OP.BEAM_SLOT]));
          c.lantern.parts.get(id).installed = true;
        }
        c.lantern.parts.get('LB-C1').installed = true;
        c.lantern.applyAssembly();

        machineJob(c, engine, {
          tool: 'saw',
          from: V(av(3.2), a(4), C.LOWER_Z1 + a(1)),
          to: V(av(5.4), a(4), C.LOWER_Z1 + a(1)),
          faceNormal: V(0, 0, -1),
          strokes: 3,
          sfx: 'SAW_CUT_SHORT',
          chipDir: V(0, 0, 1),
          onStroke: (n, total) => c.hud.setCounter(`榫头 ${n}/${total} 刀`),
          onDone: async () => {
            c.lantern.addOp('LB-A1', OP.TENON);
            c.lantern.addOp('LB-A2', OP.TENON);
            c.sfx.play('SUCCESS_SOFT');
            c.sfx.play('CHIME_WOOD', { delay: 0.35 });
            c.hud.setCounter('透榫 4/4');
            c.hud.toast('✓ 四个偏内侧透榫完成');

            // ★紫灰幻影：「这里留给柱窝」—— 把抽象的几何修正变成看得懂的因果关系
            await wait(0.5);
            for (const sy of [1, -1]) for (const sx of [1, -1]) {
              const g = ghostBox(c.stage.scene, {
                size: [J3.SOCKET_DX, J3.SOCKET_DY, M.SEC],
                pos: [sx * (C.RAIL_B_X + J3.SOCKET_DX / 2), sy * (C.COL_AXIS - J3.SOCKET_DY / 2), (C.LOWER_Z0 + C.LOWER_Z1) / 2],
                color: PALETTE.SOCKET, opacity: 0.55,
              });
              junk.add(g);
            }
            c.sfx.play('UI_HINT');
            c.hud.addHotspot({
              pos: V(C.RAIL_B_X + 3, C.COL_AXIS - 3, C.LOWER_Z1),
              badge: '?', label: '这里留给柱窝', sub: '若榫头居中，铣柱窝时必破榫',
              color: 'var(--socket)', active: true,
            });
            c.hud.setActions([]);
            engine.unlock();
          },
        });
      },
      exit(c) { junk.clear(); c.hud.setCounter(''); c.hud.clearHotspots(); },
    },

    // ══════════════════════════════════════════════════════
    // C6 · 加工④ 横枨凿透眼 + 铣柱窝 + 开装板槽 ★V-05 / ★V-08 / ★V-21
    // ══════════════════════════════════════════════════════
    {
      id: 'C6', phase: 2, phaseRatio: 0.58,
      title: '加工④ · 透眼 · 柱窝 · 装板槽',
      mood: 'craft',
      cam: { az: 70, el: 26, dist: 210, target: [0, 0, BENCH_Z], snap: true },
      gate: true,
      hint: '向下拖动凿刀，凿穿为止', hintPulse: true,
      narration: `取两根新的短料，做横枨。
两端各凿一个卯眼 —— 注意，这个眼必须凿穿。半截不行，因为顺枨的榫头要整根穿出去。
（气口）
第二道工序很容易被忽略：在每个端头的外侧面，再铣一个小方口。
它叫柱窝，是留给立柱的。看方向 —— 口子是朝外开的，立柱等会儿要从外面横着推进来。
（气口）
还有第三道：顺着顶面铣一条又长又浅的槽。这是装板槽，四片格心最后就插在这里。`,
      cards: [{
        title: '加工参数卡', tag: '三重修正点',
        rows: [
          ['透眼 ×4', `${dim(1 / 3)} × ${dim(2 / 3)}，贯穿全宽 ${dim(1)}`],
          ['柱窝 ×4', `${dim(1 / 2)} × ${dim(1 / 2)} × ${dim(1)}，端头外侧面`],
          ['装板槽 ×2', `宽 ${dim(1 / 3)}、深 ${dim(1 / 6)}、长 ${dim(7)}`],
        ],
        warn: [
          '卯眼必须贯穿，不可留底（V-05）。',
          '柱窝为原方案完全未定义的新增工序（V-08）。',
          '柱窝开口朝横枨外侧，不是对角线（V-18）。',
        ],
      }],
      async enter(c, engine) {
        junk.clear();
        stageParts(c, ['LB-B1', 'LB-B2']);
        c.lantern.setOps('LB-B1', 'blank');
        c.lantern.setOps('LB-B2', 'blank');
        bench(c, 'LB-B1', [0, 0, 0]);
        c.lantern.parts.get('LB-B2').mesh.visible = false;

        const seq = [
          { op: OP.MORTISE, name: '凿透眼', tool: 'chisel', sfx: 'CHISEL_STRIKE', tip: '✓ 已凿穿' },
          { op: OP.SOCKET, name: '铣柱窝', tool: 'router', sfx: 'ROUTER_MILL', tip: '✓ 柱窝完成' },
          { op: OP.PANEL_SLOT, name: '开装板槽', tool: 'router', sfx: 'ROUTER_LONG', tip: '✓ 装板槽完成' },
        ];
        let i = 0;
        const runStage = () => {
          const s = seq[i];
          c.hud.setCounter(`工序 ${i + 1}/3 · ${s.name}`);
          machineJob(c, engine, {
            tool: s.tool,
            from: V(0, -a(4), BENCH_Z + av(1.4)),
            to: V(0, a(4), BENCH_Z + av(1.4)),
            faceNormal: V(0, 0, -1),
            strokes: i === 0 ? 3 : 2,
            sfx: s.sfx,
            chipDir: V(0, 0, 1),
            onStroke: (n, total) => {
              if (i === 0 && n === total) c.sfx.play('CHISEL_STRIKE', { through: true, pitch: 2 });
              if (i === 0 && n === total) c.sfx.play('LIGHT_PIERCE', { delay: 0.05 });
            },
            onDone: async () => {
              c.lantern.addOp('LB-B1', s.op);
              c.lantern.addOp('LB-B2', s.op);
              c.hud.toast(s.tip, { dur: 1400 });

              // 柱窝完成后：立柱颈部幻影自外侧水平滑入，示意用途与推入方向
              if (s.op === OP.SOCKET) {
                const gh = ghostBox(c.stage.scene, {
                  size: [J3.NECK, J3.NECK, M.SEC],
                  pos: [a(4), a(3), BENCH_Z], color: PALETTE.SOCKET, opacity: 0.5,
                });
                junk.add(gh);
                c.sfx.play('UI_HINT');
                await tween(1.2, (k) => { gh.position.x = a(4) - a(3.5) * k; }, { ease: Ease.inOutCubic });
                c.hud.toast('立柱将自外侧水平推入柱窝', { dur: 1600 });
                await wait(0.8);
                c.stage.scene.remove(gh);
              }
              // 装板槽完成后：格心幻影自上方落入
              if (s.op === OP.PANEL_SLOT) {
                const gh = ghostBox(c.stage.scene, {
                  size: [J4.PANEL_T, a(7), a(3)], pos: [a(3.25), 0, BENCH_Z + a(3)],
                  color: PALETTE.MORTISE, opacity: 0.4,
                });
                junk.add(gh);
                await tween(0.8, (k) => { gh.position.z = BENCH_Z + a(3) - av(2.4) * k; }, { ease: Ease.outQuad });
                await wait(0.6);
                c.stage.scene.remove(gh);
              }

              i++;
              if (i < seq.length) { runStage(); }
              else {
                c.lantern.parts.get('LB-B2').mesh.visible = true;
                c.hud.setCounter('LB-B1 / LB-B2 就绪');
                c.sfx.play('SUCCESS_SOFT');
                c.hud.setActions([]);
                engine.unlock();
              }
            },
          });
        };
        runStage();
      },
      exit(c) { junk.clear(); c.hud.setCounter(''); },
    },

    // ══════════════════════════════════════════════════════
    // C7 · 透榫贯穿装配 → 下枨框完成
    // ══════════════════════════════════════════════════════
    {
      id: 'C7', phase: 2, phaseRatio: 1,
      title: '透榫贯穿 → 下枨框完成',
      mood: 'craft',
      cam: { az: 40, el: 36, dist: 300, target: [0, 0, C.LOWER_Z1], snap: true },
      gate: true,
      hint: '拖动横枨，套入两个榫头', hintPulse: true,
      narration: `最后两根横枨，套上去。
两个榫头同时穿进两个眼 —— 推到底。
看四边：榫头穿出来了，各露出半个模数。
这不是做工粗糙，这是透榫出头，中式木作故意留下的样子：结构更牢，也更好看。
下枨框，完成。`,
      cards: [{
        title: '进阶知识卡', tag: '可选', fold: true,
        note: '真实木作常在出头榫上加打「破头楔」锁死。本灯笼为可拆装设计，故不用。',
      }],
      async enter(c, engine) {
        junk.clear();
        c.lantern.attachAll();
        stageParts(c, LOWER);
        for (const id of LOWER) c.lantern.setOps(id, 'all');
        for (const id of ['LB-A1', 'LB-A2', 'LB-C1']) c.lantern.parts.get(id).installed = true;
        c.lantern.applyAssembly();
        c.hud.setCounter('下枨框 3/5 件');

        // 配对提示：四个榫头与四个透眼同色脉冲
        c.drag.begin({
          parts: ['LB-B1', 'LB-B2'], snap: 6, pitchBase: 0, seatSfx: 'SNAP_IN',
          wrongHint: '两个榫头要同时对准两个眼',
          onSeat: (id, n) => {
            c.hud.setCounter(`下枨框 ${3 + n}/5 件`);
            for (const sy of [1, -1]) {
              c.fx.ripples.emit(V(C.EDGE, sy * C.RAIL_A_Y, (C.LOWER_Z0 + C.LOWER_Z1) / 2), V(1, 0, 0), { size: 14 });
            }
          },
          onAll: async () => {
            // 整体沉降微动 —— 成本极低但物理可信度显著
            await tween(0.18, (k) => { c.lantern.root.position.z = -0.5 * Math.sin(k * Math.PI); });
            c.lantern.root.position.z = 0;
            c.sfx.play('SUCCESS_HIGH', { delay: 0.1 });
            c.sfx.play('WOOD_SETTLE', { gain: 0.5 });
            c.hud.toast('✓ 下枨框完成 · 5 件（顺枨 ×2 · 中梁 ×1 · 横枨 ×2）');
            c.hud.setCounter('下枨框 5/5 件 · 四边出头 0.5a');
            engine.unlock('阶段 ② 完成 · 下枨框 ▸');
          },
        });
        c.hud.setActions([{ label: '自动装配（降级）', kind: 'alt', onClick: () => c.drag.autoSeatAll() }]);
      },
      exit(c) { c.hud.setCounter(''); },
    },

    // ══════════════════════════════════════════════════════
    // C8 · 上枨框构件加工 ★★ 全片最重要的修正（V-02 / V-03 / V-21）
    // ══════════════════════════════════════════════════════
    {
      id: 'C8', phase: 3, phaseRatio: 0.3,
      title: '上枨框加工 · 中部一刀都不动',
      mood: 'craft',
      cam: { az: 34, el: 24, dist: 300, target: [0, 0, C.UPPER_Z0], snap: true },
      gate: true,
      cps: 3.8,
      narration: `上枨框，做法和下枨框几乎一样 —— 但有一处必须不一样。
下枨框中间有一根中梁，所以顺枨中部要开两条槽。
上枨框没有中梁 —— 那两条槽，就一条都不能开。
开了，就是四个白白挖出来的废槽，还会削弱强度。
（气口）
上枨框要做的是四件事：切透榫、凿透眼、铣柱窝，还有 —— 翻过来，在底面开装板槽。
为什么在底面？因为格心是从下面往上顶进去的。
另外顶面还要留四个小方槽，最后装角花时用来压住立柱。
中间那一段，一刀都不动。`,
      cards: [{
        title: '对比卡（建模团队重点）', tag: '★★',
        cols: [
          `<b>下枨框顺枨 LB-A</b><div class="diff">中部双开口槽（顶面）</div>两端透榫<br>顶面装板槽 a/6`,
          `<b>上枨框顺枨 UB-A</b><div class="diff">中部不加工 ✕</div>两端透榫<br>底面装板槽 a/2<br>顶面角花压槽`,
        ],
        warn: [
          '原方案「上底流程同 Step9-12」的表述有误，照做必然产生 4 个废槽（V-02/V-03）。',
          '上槽深 a/2、下槽深 a/6 —— 上深下浅，这是格心能装进去的前提（V-21）。',
        ],
        danger: '✕ 中部不加工 —— 这是全片唯一使用警示红的地方。',
      }],
      async enter(c, engine) {
        junk.clear();
        c.lantern.attachAll();
        stageParts(c, [...LOWER, ...UPPER]);
        for (const id of LOWER) { c.lantern.setOps(id, 'all'); c.lantern.parts.get(id).installed = true; }
        for (const id of UPPER) { c.lantern.setOps(id, 'blank'); c.lantern.parts.get(id).installed = true; }
        c.lantern.applyAssembly();

        // ── 对比阶段：LB-A1 幽灵的中部双槽高亮 → UB-A1 对应位置浮现红色 ✕ ──
        c.lantern.highlight('LB-A1', PALETTE.MORTISE, 0.6);
        c.sfx.play('UI_SWITCH_HARD');
        await wait(0.6);
        const cross = ghostBox(c.stage.scene, {
          size: [av(1.4), av(1.4), 1], pos: [0, C.RAIL_A_Y, C.UPPER_Z1 + 2],
          color: PALETTE.ALERT, opacity: 0.75,
        });
        junk.add(cross);
        c.sfx.play('UI_ALERT_SOFT');
        c.hud.addHotspot({
          pos: V(0, C.RAIL_A_Y, C.UPPER_Z1 + a(1)),
          badge: '✕', label: '中部不加工', sub: '上枨框无中梁，开槽即为废槽',
          color: 'var(--alert)', active: true,
        });
        c.hud.toast('上枨框中部：一刀都不动', { type: 'warn', dur: 2600 });

        c.hud.setActions([
          { label: '明白了，开始加工', kind: 'main', onClick: async (btn) => {
            btn.disabled = true;
            c.lantern.highlight('LB-A1', 0, 0);
            c.hud.clearHotspots();
            c.stage.scene.remove(cross);
            const ops = [OP.TENON, OP.MORTISE, OP.SOCKET, OP.PANEL_SLOT, OP.CORNER_SLOT, OP.PRESS_SLOT];
            const names = ['切透榫', '凿透眼', '铣柱窝', '底面装板槽', '底面角牙槽', '顶面角花压槽'];
            for (const [i, op] of ops.entries()) {
              for (const id of UPPER) c.lantern.addOp(id, op);
              c.hud.setCounter(`${i + 1}/6 · ${names[i]}`);
              c.sfx.play(i < 3 ? 'SAW_CUT_SHORT' : 'ROUTER_MILL', { pitch: i * 1.2, gain: 0.7 });
              if (i === 3) c.sfx.play('WOOD_FLIP', { delay: 0.1 });
              await wait(0.55);
            }
            c.hud.setCounter('上枨框 4 件就绪');
            c.hud.toast('✓ 上枨框 4 件就绪 —— 顶面 4 处压槽将在装饰步骤用于锁柱');
            c.sfx.play('SUCCESS_SOFT');
            engine.unlock();
          } },
        ]);
      },
      exit(c) { junk.clear(); c.hud.setCounter(''); c.hud.clearHotspots(); c.lantern.clearHighlights(); },
    },

    // ══════════════════════════════════════════════════════
    // C9 · 上枨框装配 → 「井」字完成
    // ══════════════════════════════════════════════════════
    {
      id: 'C9', phase: 3, phaseRatio: 0.5,
      title: '上枨框装配 → 「井」字',
      mood: 'craft',
      cam: { az: 40, el: 40, dist: 330, target: [0, 0, C.UPPER_Z0], snap: true },
      gate: true,
      hint: '拖动横枨，套入两个榫头', hintPulse: true,
      narration: `上枨框的装法，你已经会了。
两根横枨套上去 —— 完成。
俯视看，它是一个标准的「井」字：四根木条相互穿插，八个头全部出挑。
和下枨框比一比：一样的方框，只是它中间少了一道中梁。`,
      async enter(c, engine) {
        junk.clear();
        c.lantern.attachAll();
        stageParts(c, [...LOWER, ...UPPER]);
        for (const id of [...LOWER, ...UPPER]) c.lantern.setOps(id, 'all');
        for (const id of [...LOWER, 'UB-A1', 'UB-A2']) c.lantern.parts.get(id).installed = true;
        c.lantern.applyAssembly();
        c.hud.setCounter('上枨框 2/4 件');

        c.drag.begin({
          parts: ['UB-B1', 'UB-B2'], snap: 6, seatSfx: 'SNAP_IN',
          wrongHint: '两个榫头要同时对准两个眼',
          onSeat: (id, n) => c.hud.setCounter(`上枨框 ${2 + n}/4 件`),
          onAll: async () => {
            c.sfx.play('SUCCESS_MID', { delay: 0.15 });
            c.hud.toast('✓ 上枨框完成 · 4 件 —— 俯视为标准「井」字，八头出挑');
            // 光柱预告：四角连线，让用户在装柱之前就理解四根柱子的空间位置
            for (const sx of [1, -1]) for (const sy of [1, -1]) {
              const beam = new THREE.Mesh(
                new THREE.CylinderGeometry(3, 3, M.CLEAR, 8, 1, true),
                new THREE.MeshBasicMaterial({
                  color: PALETTE.TENON, transparent: true, opacity: 0.28,
                  blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
                }),
              );
              beam.rotation.x = Math.PI / 2;
              beam.position.set(sx * C.COL_AXIS, sy * C.COL_AXIS, (C.LOWER_Z1 + C.UPPER_Z0) / 2);
              junk.add(beam);
              c.stage.scene.add(beam);
            }
            c.sfx.play('LIGHT_RISE', { delay: 0.3 });
            c.hud.toast('四根立柱将立在这四个位置', { dur: 2000 });
            engine.unlock('阶段 ③ 完成 · 上枨框 ▸');
          },
        });
        c.hud.setActions([{ label: '自动装配（降级）', kind: 'alt', onClick: () => c.drag.autoSeatAll() }]);
      },
      exit(c) { junk.clear(); c.hud.setCounter(''); },
    },

    // ══════════════════════════════════════════════════════
    // C10 · 立柱备料与开颈 ★V-07 / ★V-20 / ★V-24
    // ══════════════════════════════════════════════════════
    {
      id: 'C10', phase: 3, phaseRatio: 0.75,
      title: '加工⑤ · 立柱开颈（三段两颈）',
      mood: 'craft',
      cam: { az: 26, el: 8, dist: 300, target: [0, 0, 96], snap: true },
      gate: true,
      hint: '拖动铣刀，逐个去除三个象限', hintPulse: true,
      narration: `最后四根长料，做立柱。
每根一十六个模数长 —— 比枨框高得多。
但这里有个问题：柱子要同时扣住上下两个枨框，还得让枨框卡得牢、拆不掉。怎么做到？
（停顿 1.0 s）
答案是：把柱子在两个高度上，各削掉四分之三。
只留下四分之一的截面 —— 一小段细颈。
这样一来，立柱就被分成了三段：上面一段、中间一段、下面一段，中间用两个细颈连着。
细颈卡进枨框，上下两段就分别压在枨框的上面和下面 —— 像夹子一样，把枨框夹住。
（气口）
还有个小心思：细颈最里面那两毫米，做得稍微胖一点点。
推到底的时候会有点紧 —— 这一紧，柱子就自己卡住了，不用钉子也不会掉。
注意，是两处，不是一处。上枨框一个，下枨框一个。`,
      cards: [{
        title: '立柱分段（自柱脚端面 0 起算）', tag: 'J-3',
        rows: [
          ['柱脚段', `0 – ${dim(2)}`],
          ['颈 2', `${dim(2)} – ${dim(3)}`],
          ['柱身段', `${dim(3)} – ${dim(13)}`],
          ['颈 1', `${dim(13)} – ${dim(14)}`],
          ['柱头段', `${dim(14)} – ${dim(16)}`],
          ['颈部截面', `${dim(1 / 2)} × ${dim(1 / 2)}（1/4 截面）`],
          ['楔紧段', '末段 2 mm，Y 向 +0.15 mm 过盈'],
        ],
        warn: [
          '每根立柱有 2 处颈部，勿只做 1 处（V-07：原策划只描述了一个节点）。',
          '四柱保留象限互为镜像，不可复制旋转。',
        ],
      }],
      async enter(c, engine) {
        junk.clear();
        stageParts(c, ['PL-01']);
        c.lantern.setOps('PL-01', 'blank');
        c.lantern.detach('PL-01', { pos: [0, 0, 96], rot: [0, 0, 0] });

        // 颈位标注
        for (const [z0, z1] of [J3.SEG.NECK2, J3.SEG.NECK1]) {
          junk.add(outlineBox(c.stage.scene, {
            size: [M.SEC + 2, M.SEC + 2, z1 - z0],
            pos: [0, 0, (z0 + z1) / 2 - M.HEIGHT / 2 + 96],
            color: PALETTE.SOCKET,
          }));
        }

        let stage = 0;
        const ops = [OP.NECK2, OP.NECK1];
        const runNeck = () => {
          const zc = stage === 0
            ? (J3.SEG.NECK2[0] + J3.SEG.NECK2[1]) / 2
            : (J3.SEG.NECK1[0] + J3.SEG.NECK1[1]) / 2;
          const zw = zc - M.HEIGHT / 2 + 96;
          c.stage.setRecommended({ az: 26, el: 6, dist: 150, target: V(0, 0, zw) });
          c.hud.setCounter(`颈部 ${stage + 1}/2`);
          machineJob(c, engine, {
            tool: 'router',
            from: V(-av(1.4), 0, zw),
            to: V(av(1.4), 0, zw),
            faceNormal: V(0, 0, -1),
            strokes: 3,
            sfx: 'ROUTER_MILL',
            chipDir: V(1, 0, 0),
            onStroke: (n, total) => c.hud.setCounter(`颈部 ${stage + 1}/2 · 象限 ${n}/${total}`),
            onDone: async () => {
              for (const id of COLS) c.lantern.addOp(id, ops[stage]);
              c.sfx.play('ROUTER_FINE', { delay: 0.1 });
              stage++;
              if (stage < 2) {
                c.sfx.play('UI_HINT');
                c.hud.toast('✓ 颈部 1/2 —— 还有一处，在上枨框的高度', { dur: 2200 });
                await wait(1.2);
                runNeck();
              } else {
                c.hud.setCounter('三段两颈 · 全长 16a（192 mm）');
                c.hud.toast('✓ 立柱完成 · 末段 2 mm 略胀 —— 推到底会「咬住」');
                c.sfx.play('SUCCESS_MID');
                c.stage.setRecommended({ az: 30, el: 12, dist: 300, target: V(0, 0, 96) });
                c.hud.setActions([]);
                engine.unlock();
              }
            },
          });
        };
        runNeck();
      },
      exit(c) { junk.clear(); c.hud.setCounter(''); },
    },

    // ══════════════════════════════════════════════════════
    // C11 · 四柱水平推入 → 框架合龙 ★★ 结构高潮（V-08 / V-18 / V-20）
    // ══════════════════════════════════════════════════════
    {
      id: 'C11', phase: 3, phaseRatio: 1,
      title: '四柱水平推入 → 框架合龙',
      mood: 'craft',
      cam: { az: 42, el: 26, dist: 520, target: [0, 0, 96], snap: true },
      gate: true,
      hint: '沿箭头方向，把立柱水平推入', hintPulse: true,
      narration: `现在，把四根柱子装上去。
注意方向 —— 柱子不能从上往下放。细颈比柱身细，掉不进去，也卡不住。
要从外面，横着推进来。
上下两个细颈，同时滑进上下两个柱窝。
推到最后会有点紧 —— 别停，推到底。
（气口）
听见没有？那是它自己咬住了。
上下两段柱身，一上一下，把枨框牢牢夹住。
（停顿 0.8 s）
四根柱子，十三根木条，全部到位。
框架，合龙了。`,
      cards: [{
        title: '结算卡', tag: '13/13',
        rows: [['顺枨', '×4'], ['横枨', '×4'], ['中梁', '×1'], ['立柱', '×4'], ['合计', '13 件']],
        warn: '立柱不可自上而下放入 —— 细颈会掉落、卡不住（V-18）。',
      }, {
        title: '知识卡', tag: '可选', fold: true,
        note: '现在立柱靠楔紧咬住。等装上龙纹角花，会再压一道 —— 那才算真锁上。',
      }],
      async enter(c, engine) {
        junk.clear();
        c.lantern.attachAll();
        stageParts(c, [...LOWER, ...UPPER, ...COLS]);
        for (const id of [...LOWER, ...UPPER, ...COLS]) c.lantern.setOps(id, 'all');
        for (const id of [...LOWER, ...UPPER]) c.lantern.parts.get(id).installed = true;
        c.lantern.applyAssembly();

        // 地面水平虚线箭头轨道 —— 必须在用户第一次触碰立柱前就显示
        c.guides.set(COLS.map((id) => {
          const p = c.lantern.parts.get(id);
          const d = p.assembly.dir;
          return {
            pos: V(p.home.x - d[0] * a(4), p.home.y, C.LOWER_Z0 - a(1)),
            glyph: '➜', rot: d[0] > 0 ? 0 : 180,
          };
        }));
        c.hud.setCounter('立柱 0/4');

        c.drag.begin({
          parts: COLS, snap: 5, wedge: true, seatSfx: 'SNAP_LOCK', pitchBase: 0,
          wrongHint: '立柱不能竖直放下 —— 要从外面水平推进去',
          onSeat: async (id, n) => {
            c.hud.setCounter(`立柱 ${n}/4`);
            // 该角枨框「被夹紧」的 0.3 mm 微沉 —— 让用户「感到」结构成立
            const p = c.lantern.parts.get(id);
            await tween(0.2, (k) => {
              const dz = -0.3 * Math.sin(k * Math.PI);
              for (const rid of ['LB-B1', 'LB-B2', 'UB-B1', 'UB-B2']) {
                const q = c.lantern.parts.get(rid);
                q.mesh.position.z = q.home.z + dz;
              }
            });
            for (const rid of ['LB-B1', 'LB-B2', 'UB-B1', 'UB-B2']) {
              const q = c.lantern.parts.get(rid);
              q.mesh.position.z = q.home.z;
            }
            void p;
          },
          onAll: async () => {
            c.guides.clear();
            // 整体沉降 + 回弹，一圈暖金能量环自下而上扫过整个框架
            await tween(0.5, (k) => { c.lantern.root.position.z = -1 * Math.sin(k * Math.PI); });
            c.lantern.root.position.z = 0;
            c.sfx.play('FRAME_COMPLETE');          // 全片最重的一击
            c.fx.ring.sweep({ z0: 0, z1: M.HEIGHT, dur: 1.2 });
            c.sfx.play('SHIMMER_RISE', { delay: 0.2 });
            c.hud.setCounter('木构件 13/13 · 框架合龙');
            c.hud.toast('✓ 框架合龙 · 十三根木条全部到位', { dur: 3000 });
            c.stage.setRecommended({ az: 42, el: 18, dist: 460, target: V(0, 0, 96) });
            engine.unlock('阶段 ④ 完成 · 框架合龙 ▸');
          },
        });
        c.hud.setActions([{ label: '自动装配（降级）', kind: 'alt', onClick: () => c.drag.autoSeatAll() }]);
      },
      exit(c) { junk.clear(); c.guides.clear(); c.hud.setCounter(''); },
    },
  ];
}
