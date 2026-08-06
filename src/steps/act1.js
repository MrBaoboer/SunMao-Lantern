/**
 * 起兴（2 步）+ 明理（3 步）
 */

import * as THREE from 'three';
import { V, a, av, J1, J2, PALETTE, Junk, buildLanternRiver } from './util.js';
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
      cam: { az: 62, el: 12, dist: 470, snap: true },
      cps: 3.6,
      cue: { ico: 'drag', text: '拖动画面，换个角度看' },
      narration: `每到岁末，中国人会用一盏灯，为一年收尾。
红灯笼一挂上去，年就算是来了。
（气口）
可你想过没有：这样一盏灯，不用一根钉子、一滴胶水，能立得起来吗？`,
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
      cam: { az: 40, el: 16, dist: 480 },
      narration: `这就是我们要做的东西 —— 一盏榫卯灯笼。
十三根木条，四片格心，一颗钉子也没有。
接下来的每一步，都由你亲手完成。`,
      note: {
        title: '一盏灯的全部',
        spec: [['木条', '13 根'], ['格心', '4 片'], ['钉子', '0'], ['成品', '120×120×192 mm']],
        body: '它能被完整拆开，再装回去。',
      },
      async enter(c) {
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
        wait(2.2).then(preview);
      },
      exit(c) { c.lantern.setExplode(0, 'unified'); },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'B1', phase: 1,
      title: '凸的叫榫，凹的叫卯',
      mood: 'craft',
      cam: { az: 30, el: 14, dist: 210, target: [0, 0, 96], snap: true },
      cps: 3.6,
      cue: { ico: 'drag', text: '<em>拖动</em>左边的木条，把它推进右边' },
      narration: `榫卯，sǔn mǎo。
中国人用它把木头连起来，已经连了七千年 —— 比文字还早。
（气口）
看这两块木头：凸出来的这一块叫榫，凹进去的这一块叫卯。
把它们推到一起，一咬合，连接就完成了。
不用钉子，也不用胶。`,
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
        const mk = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
        const woodC = 0xc39a63;

        const A = new THREE.Group();
        A.add(new THREE.Mesh(new THREE.BoxGeometry(a(4), a(2), a(2)), mk(woodC)));
        const tn = new THREE.Mesh(new THREE.BoxGeometry(a(1.5), a(2 / 3), a(1)), mk(0xd8b071));
        tn.position.x = a(2.75);
        A.add(tn);
        A.position.set(-a(4), 0, Z);

        const B = new THREE.Group();
        B.add(new THREE.Mesh(new THREE.BoxGeometry(a(4), a(2), a(2)), mk(woodC)));
        const hole = new THREE.Mesh(
          new THREE.BoxGeometry(av(1.6), a(2 / 3) + 0.4, a(1) + 0.4),
          new THREE.MeshBasicMaterial({ color: 0x201a12 }),
        );
        hole.position.x = -av(1.3);
        B.add(hole);
        B.position.set(av(3.2), 0, Z);
        junk.add(A, B);
        c.stage.scene.add(A, B);

        const edge = (obj, color) => obj.add(new THREE.LineSegments(
          new THREE.EdgesGeometry(obj.children[0].geometry, 20),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 }),
        ));
        edge(A, PALETTE.TENON);
        edge(B, PALETTE.MORTISE);

        let done = false;
        const seat = async () => {
          if (done) return;
          done = true;
          c.hud.setCue('');
          await tween(0.35, (k) => { A.position.x = -a(4) + av(2.4) * k; }, { ease: Ease.inCubic });
          A.position.x = -av(1.6);
          c.sfx.play('SNAP_IN');
          c.fx.ripples.emit(V(av(0.4), 0, Z), V(1, 0, 0));
          c.hud.toast('咬住了', { gold: true });
          anatomy();
        };
        c.simpleDrag(A, V(1, 0, 0), av(2.4), Z, seat, null, junk);
        c.hud.setAlts([{ label: '帮我推', ico: 'spark', onClick: seat }]);

        // 咬合之后再讲解剖 —— 先有手感，再有名词
        const anatomy = () => {
          c.hud.setCue('点开三个圆点，认认榫的三个部位', 'tap');
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
          spot(V(av(0.4), 0, Z + a(0.5)), '头', '榫头', '伸出去、插进卯里的部分');
          spot(V(-av(0.6), av(0.4), Z), '颊', '榫颊', '两侧的面，决定松紧');
          spot(V(-av(1.7), 0, Z - av(0.6)), '肩', '榫肩', '根部的台阶，把力传过去');
        };
      },
      exit(c) { junk.clear(); c.hud.clearSpots(); },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'B2', phase: 1,
      title: '直榫：穿过去，露一截',
      mood: 'craft',
      cam: { az: 34, el: 16, dist: 200, target: [0, 0, 96], snap: true },
      cue: { ico: 'drag', text: '<em>拖动</em>木条，把榫头推进孔里' },
      narration: `第一种，直榫 —— 最基础，也最常见。
我们这盏灯用的是它的贯穿做法：榫头要穿过整根木条，还要在另一头露出一小截。
这一小截既是加强，也是中式木作特有的样子。
（气口）
你来试试。`,
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
        const mk = (col) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 });
        const A = new THREE.Group();
        A.add(new THREE.Mesh(new THREE.BoxGeometry(a(4), a(1), a(1)), mk(0xc39a63)));
        const tn = new THREE.Mesh(new THREE.BoxGeometry(J1.LEN, J1.THICK, J1.HIGH), mk(0xd8b071));
        tn.position.x = a(2) + J1.LEN / 2;
        A.add(tn);
        const B = new THREE.Group();
        B.add(new THREE.Mesh(new THREE.BoxGeometry(a(1), a(3), a(1)), mk(0xc39a63)));
        B.add(new THREE.Mesh(
          new THREE.BoxGeometry(a(1) + 0.6, J1.THICK, J1.HIGH),
          new THREE.MeshBasicMaterial({ color: 0x201a12 }),
        ));
        A.position.set(-av(3.6), 0, Z);
        B.position.set(av(1.2), 0, Z);
        junk.add(A, B);
        c.stage.scene.add(A, B);

        c.hud.addSpot({ pos: V(av(1.2), 0, Z + a(2)), badge: '定', label: '这一根不动', color: 'var(--jade)' });

        let done = false;
        const seat = async () => {
          if (done) return;
          done = true;
          c.hud.setCue('');
          await tween(0.4, (k) => { A.position.x = -av(3.6) + av(2.4) * k; }, { ease: Ease.inCubic });
          A.position.x = -av(1.2);
          c.sfx.play('SNAP_IN');
          c.fx.ripples.emit(V(av(0.7), 0, Z), V(1, 0, 0));
          c.hud.toast('看，穿出来了', { gold: true });
          c.stage.setRecommended({ az: 12, el: 10, dist: 100, target: V(av(2.2), 0, Z) });
          engine.done();
        };
        c.simpleDrag(A, V(1, 0, 0), av(2.4), Z, seat, null, junk);
        c.hud.setAlts([{ label: '帮我推', ico: 'spark', onClick: seat }]);
      },
      exit(c) { junk.clear(); c.hud.clearSpots(); },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'B3', phase: 1,
      title: '夹榫：从上往下落',
      mood: 'craft',
      cam: { az: 38, el: 28, dist: 190, target: [0, 0, 96], snap: true },
      cue: { ico: 'pull', text: '<em>向下拖动</em>，把叉口落进两条槽' },
      narration: `第二种，夹榫。
它有两个平行的榫头，中间夹着一道口子。
不是一个插进另一个，而是互相嵌夹 —— 叉口落进槽，槽中间的榫舌又卡回叉口里。
你夹住我，我也夹住你。
（气口）
还有一点很重要：它只能从上往下落。这样重力会帮你压住它。`,
      note: {
        title: '夹榫',
        body: '两个方向同时锁住：叉口落进槽，槽中间的榫舌又卡回叉口里。',
        foot: '反过来做，重力就会把它拽下来。',
      },
      async enter(c, engine) {
        junk.clear();
        c.lantern.showOnly([]);
        const Z = 96;
        const mk = (col) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 });
        const w = J2.SLOT_W, tg = J2.TONGUE, d = J2.SLOT_D;

        const D1 = new THREE.Group();
        const base = new THREE.Mesh(new THREE.BoxGeometry(a(1), a(4), a(1) - d), mk(0xc39a63));
        base.position.z = -d / 2;
        const tongue = new THREE.Mesh(new THREE.BoxGeometry(tg, a(4), d), mk(0xd8b071));
        tongue.position.z = (a(1) - d) / 2;
        const wallL = new THREE.Mesh(new THREE.BoxGeometry(w / 2, a(4), d), mk(0xc39a63));
        wallL.position.set(-(tg / 2 + w * 0.75), 0, (a(1) - d) / 2);
        const wallR = wallL.clone(); wallR.position.x *= -1;
        D1.add(base, tongue, wallL, wallR);
        D1.position.set(0, 0, Z);

        const D2 = new THREE.Group();
        const forkL = new THREE.Mesh(new THREE.BoxGeometry(w, a(3), d), mk(0xd8b071));
        forkL.position.set(-(tg / 2 + w / 2), 0, 0);
        const forkR = forkL.clone(); forkR.position.x *= -1;
        const bodyM = new THREE.Mesh(new THREE.BoxGeometry(a(1), av(1.2), a(1)), mk(0xc39a63));
        bodyM.position.set(0, av(1.9), a(0.25));
        D2.add(forkL, forkR, bodyM);
        D2.position.set(0, 0, Z + a(2.5));
        junk.add(D1, D2);
        c.stage.scene.add(D1, D2);

        c.hud.addSpot({ pos: V(-av(0.9), 0, Z + av(1.4)), ico: 'down', label: '叉口落进槽', active: true });
        c.hud.addSpot({
          pos: V(av(0.9), 0, Z + av(1.4)), ico: 'up', label: '榫舌卡回叉口',
          color: 'var(--jade)', active: true,
        });

        let done = false;
        const seat = async () => {
          if (done) return;
          done = true;
          c.hud.setCue('');
          const z0 = D2.position.z;
          await tween(0.4, (k) => { D2.position.z = z0 - (z0 - (Z + a(0.25))) * k; }, { ease: Ease.inCubic });
          D2.position.z = Z + a(0.25) - 0.3;
          c.sfx.playDouble('SNAP_IN');
          c.fx.ripples.emit(V(-av(0.9), 0, Z + a(0.5)), V(0, 0, 1));
          c.fx.ripples.emit(V(av(0.9), 0, Z + a(0.5)), V(0, 0, 1));
          c.hud.toast('两声 —— 两个方向，同时锁住', { gold: true });
          engine.done();
        };
        c.simpleDrag(D2, V(0, 0, -1), a(2.25), Z, seat, null, junk);
        c.hud.setAlts([{ label: '帮我落下', ico: 'spark', onClick: seat }]);
      },
      exit(c) { junk.clear(); c.hud.clearSpots(); },
    },
  ];
}
