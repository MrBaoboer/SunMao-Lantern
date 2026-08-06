/**
 * 起兴（2 步）+ 明理（5 步）
 */

import * as THREE from 'three';
import { V, a, av, C, J1, J2, PALETTE, Junk, buildLanternRiver } from './util.js';
import { tween, Ease, wait } from '../util/tween.js';

const junk = new Junk(null);

export function act1(ctx) {
  junk.scene = ctx.stage.scene;

  return [
    // ══════════════════════════════════════════════════════
    {
      id: 'A1', phase: 0, phaseRatio: 0.5,
      title: '一盏灯，为一年收尾',
      mood: 'dark',
      bgm: 'BGM_A_OPENING',
      cam: { az: 62, el: 12, dist: 470, snap: true },
      cps: 3.6,
      hint: '拖动画面，可以自由观看',
      narration: `每到岁末，中国人会用一盏灯，为一年收尾。
红灯笼一挂上去，年，就算是来了。
它照的不只是路 —— 是等人回家的那条路。
（气口）
可你有没有想过：这样一盏灯，如果不用一根钉子、一滴胶水，能立得起来吗？`,
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
        setTimeout(() => river.wave(c.sfx), 900);
        c.riverDim = setTimeout(() => {
          river.dimAll();
          c.sfx.play('CHIME_WOOD', { pitch: -4, gain: 0.5 });
        }, 21000);
      },
      exit(c) { clearTimeout(c.riverDim); junk.clear(); },
      nextLabel: '开始',
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'A2', phase: 0, phaseRatio: 1,
      title: '要做的就是它',
      mood: 'studio',
      bgm: 'BGM_B_CRAFT',
      cam: { az: 40, el: 16, dist: 480 },
      narration: `这就是我们要做的东西 —— 一盏榫卯灯笼。
十三根木条，四片格心，没有一颗钉子。
接下来的每一步，都由你亲手完成。
（气口）
先认识榫卯，再学两种最基本的榫型，
然后做下枨框、上枨框、立起框架，最后装上格心和年味。`,
      note: {
        title: '一盏灯的全部',
        num: [['木条', '13 根'], ['格心', '4 片'], ['钉子', '0']],
        body: '成品 120 × 120 × 192 毫米，高宽比接近黄金分割。',
        tiny: '它能被完整拆开，再装回去。',
      },
      async enter(c) {
        c.lantern.setLit(0);
        const preview = async () => {
          c.sfx.play('UI_TAP');
          await tween(1.2, (k) => c.lantern.setExplode(k, 'unified'), { ease: Ease.outCubic });
          c.sfx.play('WOOD_SLIDE', { gain: 0.5 });
          await wait(1.0);
          await tween(0.9, (k) => c.lantern.setExplode(1 - k, 'unified'), { ease: Ease.inOutCubic });
          c.sfx.play('SNAP_IN');
          await tween(0.15, (k) => c.lantern.setExplode(Math.sin(k * Math.PI) * 0.012, 'unified'));
          c.lantern.setExplode(0, 'unified');
        };
        c.hud.setAlts([{ label: '再拆一次', onClick: preview }]);
        setTimeout(preview, 2600);
      },
      exit(c) { c.lantern.setExplode(0, 'unified'); },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'B1', phase: 1, phaseRatio: 0.2,
      title: '七千年',
      mood: 'craft',
      bgm: 'BGM_A_OPENING',
      cam: { az: 24, el: 10, dist: 190, target: [0, 0, 96], snap: true },
      cps: 3.2,
      narration: `榫卯，sǔn mǎo。
它是中国古代木构建筑与家具的主要连接方式。
目前能追溯到的最早实物，出自距今约七千年前的河姆渡遗址 —— 比文字更早，比青铜更早。
七千年过去，它仍在被使用。`,
      note: {
        title: '最早的那一个',
        body: '河姆渡遗址出土的干栏式建筑木构件，一端削出凸榫。同样的道理，一直用到今天。',
        tiny: '此处为示意复原。',
      },
      async enter(c) {
        junk.clear();
        c.lantern.showOnly([]);
        c.lantern.showDecor(false);
        c.lantern.core.visible = false;

        const g = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0x8a7a63, roughness: 0.94 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(a(9), a(1.5), a(1.5)), mat);
        const tenon = new THREE.Mesh(new THREE.BoxGeometry(a(2), a(0.5), a(1)), mat);
        tenon.position.x = a(5.5);
        g.add(body, tenon);
        g.position.set(0, 0, 96);
        junk.add(g);
        c.stage.scene.add(g);

        c.hud.addSpot({
          pos: V(a(5.5), 0, 96), badge: '榫', label: '最早的榫', sub: '凸出去、要插进别处的那一段',
        });

        c.sfx.play('TIME_SCRUB', { gain: 0.6 });
        let last = 0;
        await tween(2.2, (k) => {
          const n = Math.round(Ease.outCubic(k) * 7000);
          if (n !== last) { last = n; c.hud.setHint(`距今 <em>${n}</em> 年`); }
        }, { ease: Ease.linear });
        c.hud.setHint('距今 <em>七千</em> 年');
      },
      exit() { junk.clear(); },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'B2', phase: 1, phaseRatio: 0.4,
      title: '凸的叫榫，凹的叫卯',
      mood: 'craft',
      cam: { az: 30, el: 14, dist: 210, target: [0, 0, 96], snap: true },
      gate: true,
      hint: '<em>拖动</em>左边的木条，把它推进右边',
      narration: `看这两块木头。
凸出来的这一块，叫榫。
凹进去的这一块，叫卯。
把它们推到一起 —— 榫进卯中，一咬合，连接就完成了。
不需要钉子，也不需要胶。`,
      async enter(c, engine) {
        junk.clear();
        c.lantern.showOnly([]);
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
          new THREE.MeshBasicMaterial({ color: 0x0d0b09 }),
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
          c.hud.setHint('');
          await tween(0.35, (k) => { A.position.x = -a(4) + av(2.4) * k; }, { ease: Ease.inCubic });
          await tween(0.1, (k) => { A.position.x = -av(1.6) - Math.sin(k * Math.PI) * 0.4; });
          A.position.x = -av(1.6);
          c.sfx.play('SNAP_IN');
          c.fx.ripples.emit(V(av(0.4), 0, Z), V(1, 0, 0));
          c.hud.toast('咬住了', { gold: true });
          c.hud.setAlts([]);
          anatomy();
        };
        c.simpleDrag(A, V(1, 0, 0), av(2.4), Z, seat, () => {
          c.hud.toast('沿着木条的方向推');
          c.sfx.play('UI_REJECT');
        }, junk);
        c.hud.setAlts([{ label: '帮我推', onClick: seat }]);

        // 咬合之后再讲解剖 —— 先有手感，再有名词
        const anatomy = () => {
          c.hud.setHint('点开三个圆点，认认榫的三个部位');
          const seen = new Set();
          const spot = (pos, badge, label, sub) => c.hud.addSpot({
            pos, badge, label, sub,
            onClick: (on) => {
              if (!on) return;
              seen.add(badge);
              c.sfx.play('UI_TAP_WOOD');
              if (seen.size < 3) return;
              c.sfx.play('SUCCESS_SOFT');
              c.hud.setHint('');
              c.hud.setNote({
                title: '卯也分三种',
                body: '凿穿两面的孔叫<em>透眼</em>，榫头可以整根穿出去；'
                    + '从边上敞开的槽叫<em>开口槽</em>，另一根木条能直接落进来；'
                    + '又长又浅的叫<em>装板槽</em>，它不接木条，接板子。',
                tiny: '这盏灯三种都要用上。',
              });
              engine.unlock();
            },
          });
          spot(V(av(0.4), 0, Z + a(0.5)), '头', '榫头', '伸出去、插进卯里的部分');
          spot(V(-av(0.6), av(0.4), Z), '颊', '榫颊', '两侧的面，决定松紧');
          spot(V(-av(1.7), 0, Z - av(0.6)), '肩', '榫肩', '根部的台阶，抵住对方、把力传过去');
        };
      },
      exit(c) { junk.clear(); c.hud.clearSpots(); },
    },

    // ══════════════════════════════════════════════════════
    // 静默点 ①
    // ══════════════════════════════════════════════════════
    {
      id: 'B3', phase: 1, phaseRatio: 0.55,
      title: '榫为阳，卯为阴',
      mood: 'ink',
      bgm: 'BGM_A_OPENING', bgmLevel: 0.35,
      cam: { az: 20, el: 8, dist: 175, target: [0, 0, 96], snap: true, ease: 0.18 },
      cps: 3.0,
      lyric: true,
      narration: `榫为阳，卯为阴。
一凸一凹，一进一让。
木头不去征服木头，而是彼此留出位置 ——
以制为衡，阴阳相生。
这是中国匠人对「和」的理解：
最结实的连接，往往来自最恰当的退让。`,
      async enter(c) {
        junk.clear();
        c.lantern.showOnly([]);
        const Z = 96;
        const mk = (color) => new THREE.MeshStandardMaterial({
          color, roughness: 0.55, emissive: new THREE.Color(color), emissiveIntensity: 0,
        });
        const g = new THREE.Group();
        const left = new THREE.Mesh(new THREE.BoxGeometry(a(4), a(2), a(2)), mk(0xc39a63));
        left.position.x = -av(1.6);
        const right = new THREE.Mesh(new THREE.BoxGeometry(a(4), a(2), a(2)), mk(0xc39a63));
        right.position.x = av(2.4);
        g.add(left, right);
        g.position.z = Z;
        junk.add(g);
        c.stage.scene.add(g);

        let t = 0;
        const upd = (dt) => {
          t += dt;
          const k = 0.5 + 0.5 * Math.sin(t * 0.55);
          left.material.emissive.setHex(PALETTE.TENON);
          right.material.emissive.setHex(PALETTE.MORTISE);
          left.material.emissiveIntensity = 0.12 + k * 0.2;
          right.material.emissiveIntensity = 0.12 + (1 - k) * 0.2;
          g.rotation.z = t * 0.06;
        };
        c.stage.updaters.add(upd);
        junk.add({ dispose: () => c.stage.updaters.delete(upd) });

        c.inkFade = setTimeout(async () => {
          await tween(2.0, (k) => {
            left.material.emissiveIntensity = 0.32 * (1 - k);
            right.material.emissiveIntensity = 0.32 * (1 - k);
          });
          await wait(1.5);
          c.sfx.play('PLANE_SHAVE', { gain: 0.6 });
        }, 15500);
      },
      exit(c) { clearTimeout(c.inkFade); junk.clear(); },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'B4', phase: 1, phaseRatio: 0.78,
      title: '第一种榫型 · 直榫',
      mood: 'craft',
      cam: { az: 34, el: 16, dist: 200, target: [0, 0, 96], snap: true },
      gate: true,
      hint: '<em>拖动</em>木条，把榫头推进孔里',
      narration: `第一种，直榫 —— 最基础，也最常见。
榫头方正，插进去含而不露。
我们这盏灯笼用的是它的贯穿做法，叫透榫：榫头要穿过整根木条，还要露出一小截头。
这一小截，既是结构上的加强，也是中式木作特有的样子。
（气口）
来，你来试试。把榫头对准孔，推进去。`,
      note: {
        title: '透榫',
        num: [['榫头长', '18 毫米'], ['榫头厚', '4 毫米']],
        body: '长是厚的四倍半。<em>细而长</em>，才穿得过整根木条，还能在另一头露出来。',
        tiny: '不是一个小方块 —— 方块既穿不透，也咬不牢。',
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
          new THREE.MeshBasicMaterial({ color: 0x0d0b09 }),
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
          c.hud.setHint('');
          await tween(0.4, (k) => { A.position.x = -av(3.6) + av(2.4) * k; }, { ease: Ease.inCubic });
          await tween(0.1, (k) => { A.position.x = -av(1.2) - Math.sin(k * Math.PI) * 0.5; });
          A.position.x = -av(1.2);
          c.sfx.play('SNAP_IN');
          c.sfx.play('SUCCESS_SOFT', { delay: 0.12 });
          c.fx.ripples.emit(V(av(0.7), 0, Z), V(1, 0, 0));
          c.hud.toast('看，穿出来了', { gold: true });
          c.stage.setRecommended({ az: 12, el: 10, dist: 100, target: V(av(2.2), 0, Z) });
          c.hud.setAlts([]);
          engine.unlock();
        };
        c.simpleDrag(A, V(1, 0, 0), av(2.4), Z, seat, () => {
          c.hud.toast('沿着木条的方向推');
          c.sfx.play('UI_REJECT');
        }, junk);
        c.hud.setAlts([{ label: '帮我推', onClick: seat }]);
      },
      exit(c) { junk.clear(); c.hud.clearSpots(); },
    },

    // ══════════════════════════════════════════════════════
    {
      id: 'B5', phase: 1, phaseRatio: 1,
      title: '第二种榫型 · 夹榫',
      mood: 'craft',
      cam: { az: 38, el: 28, dist: 190, target: [0, 0, 96], snap: true },
      gate: true,
      hint: '<em>向下拖动</em>，把叉口落进两条槽',
      narration: `第二种，夹榫，由直榫变形而来。
它有两个平行排列的榫头，中间夹着一道口子。
关键在这里 —— 不是一个插进另一个，而是互相嵌夹：
叉形的双榫落进两条槽，同时，中间那条榫舌也卡进双榫之间。
你夹住我，我也夹住你。
（气口）
还有一点很重要：它是从上往下落进去的。
这样重力帮你压住它，端头的肩还能坐实在槽底 —— 稳。`,
      note: {
        title: '夹榫',
        body: '两个方向同时锁住：叉口落进槽，槽中间的榫舌又卡回叉口里。',
        tiny: '它只能<em>从上往下</em>落。反过来做，重力就会把它拽下来。',
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

        c.hud.addSpot({ pos: V(-av(0.9), 0, Z + av(1.4)), badge: '↓', label: '叉口落进槽', active: true });
        c.hud.addSpot({ pos: V(av(0.9), 0, Z + av(1.4)), badge: '↑', label: '榫舌卡回叉口', color: 'var(--jade)', active: true });

        let done = false;
        const seat = async () => {
          if (done) return;
          done = true;
          c.hud.setHint('');
          const z0 = D2.position.z;
          await tween(0.4, (k) => { D2.position.z = z0 - (z0 - (Z + a(0.25))) * k; }, { ease: Ease.inCubic });
          await tween(0.12, (k) => { D2.position.z = Z + a(0.25) + Math.sin(k * Math.PI) * 0.9; });
          D2.position.z = Z + a(0.25) - 0.3;
          c.sfx.playDouble('SNAP_IN');
          c.sfx.play('WOOD_SETTLE', { gain: 0.5, delay: 0.1 });
          c.sfx.play('SUCCESS_MID', { delay: 0.3 });
          c.fx.ripples.emit(V(-av(0.9), 0, Z + a(0.5)), V(0, 0, 1));
          c.fx.ripples.emit(V(av(0.9), 0, Z + a(0.5)), V(0, 0, 1));
          c.hud.toast('两声。两个方向，同时锁住', { gold: true });
          c.hud.setAlts([]);
          engine.unlock('两种榫型都会了');
        };
        c.simpleDrag(D2, V(0, 0, -1), a(2.25), Z, seat, () => {
          c.hud.toast('夹榫要从上往下落');
          c.sfx.play('UI_REJECT');
        }, junk);
        c.hud.setAlts([{ label: '帮我落下', onClick: seat }]);
      },
      exit(c) { junk.clear(); c.hud.clearSpots(); },
    },
  ];
}
