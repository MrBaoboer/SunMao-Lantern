/**
 * 起兴（2 步）+ 明理（3 步）
 */

import {
  V, a, av, J1, J2, PALETTE, Junk, buildLanternRiver, AIM_LANTERN, FIT_LANTERN,
  box, demoSolid,
} from './util.js';
import { tween, Ease, wait } from '../util/tween.js';

const junk = new Junk(null);

export function act1(ctx) {
  junk.scene = ctx.stage.scene;

  return [
    // ══════════════════════════════════════════════════════
    {
      id: 'A1', phase: 0,
      title: '一盏灯，为一年收尾',
      mood: 'dusk',
      bgm: 'BGM_A_OPENING',
      cam: { az: 62, el: 12, dist: 470, target: AIM_LANTERN, fit: FIT_LANTERN },
      cps: 3.6,
      cue: { ico: 'drag', text: '拖动画面，换个角度看' },
      narration: `每到岁末，中国人都要点一盏灯，为一年收尾。
红灯笼一挂，年就来了。
（气口）
可你想过没有 ——
这样一盏灯，一根钉子不用，一滴胶水不抹，
木头搭着木头，它凭什么立得住？`,
      async enter(c) {
        c.lantern.attachAll();
        c.lantern.showOnly(null);
        c.lantern.allFinished();
        for (const p of c.lantern.parts.values()) p.installed = true;
        c.lantern.applyAssembly();
        c.lantern.showPanels(true);
        c.lantern.showDecor(true);
        c.lantern.core.visible = true;
        c.lantern.setLit(0);            // 主角始终不亮
        junk.clear();
        const river = junk.add(buildLanternRiver(c.stage.scene));
        wait(0.8).then(() => river.wave());
      },
      exit() { junk.clear(); },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'A2', phase: 0,
      title: '要做的就是它',
      mood: 'studio',
      bgm: 'BGM_B_CRAFT',
      // 与 A1 同一个机位家族：还是那盏灯，只是换了口气讲。
      // 没有理由绕过去 —— 这一步的看点是它拆开又合回来，不是镜头
      cam: { az: 68, el: 16, dist: 480, fit: { r: 230, h: 172 } },
      narration: `这就是我们要做的 —— 一盏榫卯灯笼。
（气口）
十三根木条，四片格心。
拆得开，也装得回去。
现在，一根一根，把它做出来。`,
      note: {
        title: '一盏灯的全部',
        spec: [['木条', '13 根'], ['格心', '4 片'], ['钉子', '0'], ['成品', '120 × 120 × 192 mm']],
        body: '它能被完整拆开，再装回去。',
      },
      async enter(c) {
        // 每一步都得自己把台子摆好。上一步可能是 B1 —— 那一步把整盏灯藏了个干净，
        // 从它翻回来时若只改亮度，画面上就一件东西也没有
        c.lantern.attachAll();
        c.lantern.showOnly(null);
        c.lantern.allFinished();
        for (const p of c.lantern.parts.values()) p.installed = true;
        c.lantern.applyAssembly();
        c.lantern.showPanels(true);
        c.lantern.showDecor(true);
        c.lantern.core.visible = true;
        c.lantern.setLit(0);
        const preview = async () => {
          await tween(1.2, (k) => c.lantern.setExplode(k, 'unified'), { ease: Ease.outCubic });
          c.sfx.play('WOOD_SLIDE', { gain: 0.5 });
          await wait(1.0);
          await tween(0.9, (k) => c.lantern.setExplode(1 - k, 'unified'), { ease: Ease.inOutCubic });
          c.sfx.play('SNAP_IN');
          c.lantern.setExplode(0, 'unified');
        };
        c.hud.setAlts([{ label: '再拆一次', ico: 'refresh', onClick: preview }]);
        // 前摇给到 0.8 就够：这一步的看点是拆开那一下，不是等它开始
        wait(0.8).then(preview);
      },
      exit(c) { c.lantern.setExplode(0, 'unified'); },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'B1', phase: 1,
      title: '凸的叫榫，凹的叫卯',
      mood: 'craft',
      // 左卯右榫，且要看得见卯眼。卯是自左端面向里挖的盲眼，开口朝 −X ——
      // 相机得站到 −X 那一侧才看得进去；同时方位角要落在 (90°, 180°) 里，
      // 屏幕右方才是 −X，凸出来的那根才在右边。
      // 120 而不是 128：往 A2 那边靠一点，进场就少绕八度。再往 90 靠孔就看成一条缝了
      cam: { az: 120, el: 14, dist: 210, target: [0, 0, 96], fit: { r: 82, h: 44 } },
      cps: 3.6,
      // 画面随时可以被拖着转，所以指代一律按「长什么样」，不按左右
      cue: { ico: 'drag', text: '<em>拖动</em>凸出来的那一块，推进对面的孔里' },
      narration: `榫卯，sǔn mǎo。
中国人用它连木头，连了七千年 ——
浙江河姆渡挖出来的那几件，比文字还早。
（气口）
看这两块木头。
凸出来的叫榫，凹进去的叫卯。
推到一起 —— 形状咬住形状，就连上了。
（气口）
你来试试：把榫整根推进卯里。`,
      note: {
        title: '卯分三种',
        body: '凿穿两面的孔叫<em>透眼</em>，榫头能整根穿出去；'
            + '从边上敞开的槽叫<em>开口槽</em>，另一根木条可以直接落进来；'
            + '又长又浅的叫<em>装板槽</em>，它接的不是木条，是板子。',
        foot: '这盏灯三种都要用上。',
      },
      async enter(c, engine) {
        junk.clear();
        c.lantern.showOnly([]);
        c.lantern.showDecor(false);
        c.lantern.core.visible = false;
        const Z = 96;
        // 两块料都由毛坯减切除盒生成，卯眼是真的挖出来的 —— 见 demoSolid()
        const TN = { len: a(1.5), ty: a(1 / 3), tz: a(1 / 2) };  // 榫头：长 18，半厚 4，半高 6
        const A = demoSolid({
          at: [-a(4), 0, Z],
          edge: PALETTE.TENON,          // 榫件描暖金，卯件描青灰 —— 全片统一的语义色
          blank: box(-a(2), -a(1), -a(1), a(2) + TN.len, a(1), a(1)),
          cuts: [
            box(a(2), -a(1), -a(1), a(2) + TN.len, -TN.ty, a(1)),
            box(a(2), TN.ty, -a(1), a(2) + TN.len, a(1), a(1)),
            box(a(2), -TN.ty, -a(1), a(2) + TN.len, TN.ty, -TN.tz),
            box(a(2), -TN.ty, TN.tz, a(2) + TN.len, TN.ty, a(1)),
          ],
        });
        const B = demoSolid({
          at: [av(3.2), 0, Z],
          tone: 0.18,
          edge: PALETTE.MORTISE,
          // 盲眼：自左端面向里挖 19 mm，比榫头长 1 mm，推到底不顶死
          blank: box(-a(2), -a(1), -a(1), a(2), a(1), a(1)),
          cuts: [box(-a(2), -TN.ty, -TN.tz, -a(2) + TN.len + 1, TN.ty, TN.tz)],
        });
        junk.add(A, B);
        c.stage.scene.add(A, B);

        let done = false;
        const SEATED = -av(0.8);      // 两块木头端面贴齐，榫头整根没入卯眼
        const seat = async () => {
          if (done) return;
          done = true;
          c.guides.clear();
          c.hud.setCue('');
          const x0 = A.position.x;
          await tween(0.35, (k) => { A.position.x = x0 + (SEATED - x0) * k; }, { ease: Ease.inCubic });
          A.position.x = SEATED;
          c.sfx.play('SNAP_IN');
          c.fx.ripples.emit(V(av(1.2), 0, Z), V(1, 0, 0));
          c.hud.toast('咬住了', { gold: true });
          anatomy();
        };
        // 拖歪了要说一句 —— 原先是静默弹回原位，读出来像「按不动」
        c.simpleDrag(A, V(1, 0, 0), a(4) + SEATED, Z, seat,
          () => c.hud.toast('对着孔平推过去'), junk);
        c.hud.setAlts([{ label: '帮我装上', ico: 'spark', onClick: seat }]);

        // 咬合之后再讲解剖 —— 先有手感，再有名词。
        // 榫头这会儿已经整根进去了，所以把卯件调透，让它在里面看得见。
        const anatomy = async () => {
          /*
           * 咬合之后换一次机位 —— 这一下是有事要办的，不是为了动而动。
           *
           * 进场那个机位（az 120）是为了「看得进卯眼」定的，X 轴被压掉两成；
           * 而榫的三个部位全排在 X 上，只跨 17 mm —— 三枚圆点于是叠成一坨，
           * 谁指着谁根本看不出来。转到接近 90° 就把 X 完全摊开在屏幕上，
           * 再推近一档、把目标挪到合拢后那一段的中心，三处才各就各位。
           */
          c.stage.setRecommended({
            az: 96, el: 22, dist: 155, target: V(av(1.2), 0, Z + 4), fit: { r: 56, h: 30 },
          });
          const bm = B.userData.mat;
          bm.transparent = true;
          bm.depthWrite = false;
          bm.needsUpdate = true;
          await tween(0.5, (k) => { bm.opacity = 1 - 0.55 * k; });
          c.hud.setCue('点开三个圆点，看看榫的三个部位', 'tap');
          const seen = new Set();
          const spot = (pos, badge, label, sub) => c.hud.addSpot({
            pos, badge, label, sub,
            onClick: (on) => {
              if (!on) return;
              seen.add(badge);
              c.sfx.play('WOOD_TAP', { gain: 0.5 });
              if (seen.size < 3) return;
              c.hud.setCue('');
              engine.done();
            },
          });
          // 三处都在一根 18 mm 的榫头上，横着排开只够几十像素 —— 圆点会挨在一起。
          // 所以「颊」钉在颊面偏下、「肩」钉在肩台偏上：三枚在屏幕上分成三个方向，
          // 而每一枚仍然贴着它指的那个面
          const dots = [
            spot(V(av(2.6), 0, Z), '头', '榫头', '伸出去、插进卯里的那一截'),
            spot(V(av(2.0), av(0.34), Z - av(0.42)), '颊', '榫颊', '两侧的面，决定松紧'),
            spot(V(av(1.2), 0, Z + av(0.72)), '肩', '榫肩', '根部的台阶，把力传过去'),
          ];
          // 推进去只是这一步的前半段 —— 按「下一步」时一下点开一个部位。
          //
          // 按次序走，不能挑「现在没开的那一枚」：一次只摊开一张，点开第二枚时
          // 第一枚会被自动收起，于是「没开的第一枚」永远在前两枚之间来回，第三枚一辈子轮不到。
          // 已经自己点开过的那一枚跳过 —— 再点一下是收起，反倒不算数
          let opened = 0;
          const openOne = () => {
            while (opened < dots.length) {
              const d = dots[opened++];
              if (d.active) continue;
              d.el.click();
              break;
            }
            if (opened < dots.length) engine.assist(openOne);
          };
          engine.assist(openOne);
        };
      },
      exit(c) { junk.clear(); c.hud.clearSpots(); },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'B2', phase: 1,
      title: '直榫：穿过去，露一截',
      mood: 'craft',
      cam: { az: 112, el: 14, dist: 200, target: [0, 0, 96], fit: { r: 78, h: 40 } },
      cue: { ico: 'drag', text: '<em>拖动</em>带榫头的那根，把榫头推进孔里' },
      narration: `第一种，直榫 —— 最基础，也最常见。
这盏灯用的是穿透的那种，叫「透榫」。
榫头穿过整根木条，从另一头露出一小截。
这一小截，就叫「出头」。
（气口）
该你了 —— 推到看见出头，才算到底。`,
      note: {
        title: '透榫',
        spec: [['榫头长', '18 mm'], ['榫头厚', '4 mm']],
        body: '长是厚的四倍半。<em>细而长</em>，才穿得过整根木条。',
        foot: '做成小方块就既穿不透，也咬不牢。',
      },
      async enter(c, engine) {
        junk.clear();
        c.lantern.showOnly([]);
        const Z = 96;
        const half = a(1 / 2), ty = J1.THICK / 2, tz = J1.HIGH / 2;
        const A = demoSolid({
          at: [-av(3.6), 0, Z],
          edge: PALETTE.TENON,
          blank: box(-a(2), -half, -half, a(2) + J1.LEN, half, half),
          cuts: [
            box(a(2), -half, -half, a(2) + J1.LEN, -ty, half),
            box(a(2), ty, -half, a(2) + J1.LEN, half, half),
            box(a(2), -ty, -half, a(2) + J1.LEN, ty, -tz),
            box(a(2), -ty, tz, a(2) + J1.LEN, ty, half),
          ],
        });
        // 透眼：贯穿整根横料，榫头要从另一头整根出来
        const B = demoSolid({
          at: [av(1.2), 0, Z],
          tone: 0.18,
          edge: PALETTE.MORTISE,
          blank: box(-half, -a(1.5), -half, half, a(1.5), half),
          cuts: [box(-half, -ty, -tz, half, ty, tz)],
        });
        junk.add(A, B);
        c.stage.scene.add(A, B);

        // 「定」那枚圆点原先钉在横料上方 2a 处 —— 悬在空中，与它指的那根木条之间
        // 没有任何视觉联系，签又是收起的，看到的只是一个不知所指的圆圈。
        // 哪一根该动，操作提示里「带榫头的那根」已经说死了。
        let done = false;
        const SEATED = -av(1.3);   // 端面抵住横料，榫头正好露出 6 mm
        const seat = async () => {
          if (done) return;
          done = true;
          c.guides.clear();
          c.hud.setCue('');
          const x0 = A.position.x;
          await tween(0.4, (k) => { A.position.x = x0 + (SEATED - x0) * k; }, { ease: Ease.inCubic });
          A.position.x = SEATED;
          c.sfx.play('SNAP_IN');
          c.fx.ripples.emit(V(av(1.8), 0, Z), V(1, 0, 0));
          /*
           * 转到出头那一侧去。
           *
           * 进场机位站在 −X（为了看清榫头还没插进去的样子），而榫头是朝 +X 穿出来的 ——
           * 「出头」这六毫米正好落在背面，一句「看，穿出来了」说完，画面上什么也没发生。
           * 所以到位之后绕到 +X 这一侧，把合拢后的整根摆到画面中央，出头朝着人。
           */
          c.stage.setRecommended({
            az: 48, el: 16, dist: 150, target: V(-av(0.55), 0, Z), fit: { r: 46, h: 22 },
          });
          c.hud.toast('看，穿出来了', { gold: true });
          engine.done();
        };
        c.simpleDrag(A, V(1, 0, 0), av(3.6) + SEATED, Z, seat,
          () => c.hud.toast('对着孔平推过去，让榫头穿出另一头'), junk);
        c.hud.setAlts([{ label: '帮我装上', ico: 'spark', onClick: seat }]);
      },
      exit(c) { junk.clear(); c.hud.clearSpots(); },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'B3', phase: 1,
      title: '夹榫：从上往下落',
      mood: 'craft',
      /*
       * 两条槽沿 Y 走，方位角越接近 0 越正对着看 —— 14 比原先的 38 更正。
       *
       * 它同时是 B2（要站 −X 才看得见孔，az 112）与 C1（料沿 X 铺开，只能站 ±90°，
       * 而 C2 又把它钉在 −84）之间唯一的一步。两头相隔一百六十多度，
       * 无论 B3 站哪儿，这两跳的和都是定值 —— 能选的只有「怎么分」。
       * 14 让四个方向（前翻、后翻各两跳）的最大一跳同时落到 98°，是峰值最小的那一档。
       */
      cam: { az: 14, el: 28, dist: 190, target: [0, 0, 108], fit: { r: 60, h: 52 } },
      cue: { ico: 'pull', text: '<em>向下拖动</em>，把叉口落进两条槽' },
      narration: `第二种，夹榫。
这回，不是一根插进另一根。
下面这根，顶面两条槽，中间剩一条榫舌。
上面这根，底面一个叉口。
（气口）
往下一落，叉口进槽，榫舌同时卡进叉口。
你夹住我，我也夹住你。
（气口）
夹榫只能从上往下落。
拖到底 —— 重力会帮你压住它。`,
      async enter(c, engine) {
        junk.clear();
        c.lantern.showOnly([]);
        const Z = 96;
        // 尺寸取自真节点 J-2：槽宽 4、榫舌 4、槽深 6，一根 12 见方的料正好三等分。
        // 两块料都用 CSG 挖出来 —— 拿实心块拼出「槽」，槽底就是不透光的实体面，
        // 看起来是贴上去的，不是掏出来的。
        const half = a(1 / 2), t = J2.TONGUE / 2, d = J2.SLOT_D;

        // 下面这根：顶面凿两条槽，中间留下的一条就是榫舌
        const D1 = demoSolid({
          at: [0, 0, Z],
          edge: PALETTE.MORTISE,
          blank: box(-half, -a(2), -half, half, a(2), half),
          cuts: [
            box(-half, -a(2), half - d, -t, a(2), half),
            box(t, -a(2), half - d, half, a(2), half),
          ],
        });
        // 上面这根：底面开一条同宽的口，两侧剩下的就是叉口
        const D2 = demoSolid({
          at: [0, 0, Z + a(2.5)],
          tone: 0.2,
          edge: PALETTE.TENON,
          blank: box(-half, -a(1.5), -half, half, a(1.5), half),
          cuts: [box(-t, -a(1.5), -half, t, a(1.5), -half + d)],
        });
        junk.add(D1, D2);
        c.stage.scene.add(D1, D2);

        // 这里曾经钉着两枚常开标注（「叉口落进槽」「榫舌卡回叉口」）。
        // 两张签相距不到 20 mm，在屏幕上直接叠在一起，而且正好盖住要拖进去的那道槽 ——
        // 说的又是旁白刚念过的同一句话。到位后的双记咬合音与「两个方向，同时锁住」
        // 已经把这件事讲完了，签留着只剩遮挡。
        let done = false;
        // 落到底：叉口顶到槽底，同时榫舌顶到叉口的顶 —— 两个面同时贴上
        const SEATED = Z + d;
        const seat = async () => {
          if (done) return;
          done = true;
          c.guides.clear();
          c.hud.setCue('');
          const z0 = D2.position.z;
          await tween(0.4, (k) => { D2.position.z = z0 + (SEATED - z0) * k; }, { ease: Ease.inCubic });
          D2.position.z = SEATED;
          c.sfx.playDouble('SNAP_IN');
          c.fx.ripples.emit(V(-av(0.75), 0, Z + half), V(0, 0, 1));
          c.fx.ripples.emit(V(av(0.75), 0, Z + half), V(0, 0, 1));
          c.hud.toast('两声 —— 两个方向，同时锁住', { gold: true });
          engine.done();
        };
        // 一枚就够。原先在槽的两侧各钉一枚，读起来像「两处都要按」——
        // 而这一步只有一个方向、一件要动的东西。默认那一枚正落在上面这根的正上方
        c.simpleDrag(D2, V(0, 0, -1), a(2.5) - d, Z, seat,
          () => c.hud.toast('夹榫只能从上往下落 —— 竖着往下拖'), junk);
        c.hud.setAlts([{ label: '帮我装上', ico: 'spark', onClick: seat }]);
      },
      exit(c) { junk.clear(); c.hud.clearSpots(); },
    },
  ];
}
