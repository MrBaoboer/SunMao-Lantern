/**
 * 第一幕 · 起兴（S00–S03 → 2 步）+ 第二幕 · 明理（S04–S12 → 5 步）
 *
 * 合并说明：
 *   A1 = S00 封面 + S01 文化导入（老街改为抽象「灯河」，见 util.buildLanternRiver）
 *   A2 = S02 成品亮相与预拆解 + S03 路线图
 *   B2 = S05 榫与卯 + S06 榫的三要素 + S07 卯的三种规格（同一张解剖台上依次展开）
 *   B4 = S09 直榫讲解 + S10 装配练习
 *   B5 = S11 夹榫讲解 + S12 装配练习
 * ★ S08 静默点①完整保留，不与任何步骤合并（导演红线）。
 */

import * as THREE from 'three';
import { V, a, av, dim, C, J1, J2, PALETTE, Junk, buildLanternRiver } from './util.js';
import { tween, Ease, wait } from '../util/tween.js';
import { PATTERNS } from '../render/lattice.js';

const junk = new Junk(null);

export function act1(ctx) {
  junk.scene = ctx.stage.scene;

  return [
    // ══════════════════════════════════════════════════════
    // A1 · 封面与春节文化导入
    // ══════════════════════════════════════════════════════
    {
      id: 'A1', phase: 0, phaseRatio: 0.5,
      title: '一盏灯，为一年收尾',
      mood: 'dark',
      bgm: 'BGM_A_OPENING',
      cam: { az: 62, el: 12, dist: 460, snap: true },
      cps: 3.6,
      hint: '拖动可自由观看',
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
        c.lantern.setLit(0); // 主角始终不亮 —— 刻意留白，制造未完成感
        junk.clear();
        const river = junk.add(buildLanternRiver(c.stage.scene));
        c.river = river;
        setTimeout(() => river.wave(c.sfx), 900);
        // 末句落定 → 其余 12 盏同时熄灭：从民俗，进入结构
        c.riverDim = setTimeout(() => {
          river.dimAll();
          c.sfx.play('CHIME_WOOD', { pitch: -4, gain: 0.5 });
        }, 21000);
      },
      exit(c) { clearTimeout(c.riverDim); junk.clear(); },
      nextLabel: '开始制作 ▸',
    },

    // ══════════════════════════════════════════════════════
    // A2 · 成品亮相 · 预拆解 · 全流程路线图
    // ══════════════════════════════════════════════════════
    {
      id: 'A2', phase: 0, phaseRatio: 1,
      title: '这就是我们要做的东西',
      mood: 'studio',
      bgm: 'BGM_B_CRAFT',
      cam: { az: 40, el: 16, dist: 470 },
      narration: `这就是我们要做的东西 —— 一盏榫卯灯笼。
十三根木条，四片格心，没有一颗钉子。
接下来的每一步，都由你亲手完成。
（气口）
整个过程分五步：先认识榫卯，再学会两种最基本的榫型，
然后做下枨框、上枨框、立起框架，最后装上格心和年味。`,
      cards: [
        {
          title: '成品规格', tag: 'BOM',
          rows: [
            ['木构件', '13'], ['装饰格心', '4'], ['金属连接件', '0'],
            ['成品尺寸', '120 × 120 × 192 mm'],
            ['整体比例', '高 : 宽 = 16 : 10 ≈ 1.6'],
          ],
          note: '13 根木条 · 0 颗钉子 · 0 滴胶水 · 可完整拆装',
        },
        {
          title: '五个阶段', tag: '路线图',
          html: `<div class="row"><span>① 认识榫卯</span><b>凸为榫，凹为卯</b></div>
                 <div class="row"><span>② 掌握榫型</span><b>直榫 · 夹榫</b></div>
                 <div class="row"><span>③ 制作枨框</span><b>上下两个骨架</b></div>
                 <div class="row"><span>④ 立起框架</span><b>四柱合龙</b></div>
                 <div class="row"><span>⑤ 装点年味</span><b>格心 · 灯纸 · 流苏</b></div>`,
        },
      ],
      async enter(c, engine) {
        c.lantern.setLit(0);
        // 爆炸预演（S02 统一爆炸：快、散、统一径向 —— 与 S31 分层爆炸是两套数据）
        const preview = async () => {
          c.sfx.play('UI_TAP');
          await tween(1.2, (k) => c.lantern.setExplode(k, 'unified'), { ease: Ease.outCubic });
          c.sfx.play('WOOD_SLIDE', { gain: 0.5 });
          await wait(1.0);
          await tween(0.9, (k) => c.lantern.setExplode(1 - k, 'unified'), { ease: Ease.inOutCubic });
          // 合拢瞬间一次统一的「咬合抖动」+ 全片标志性音效
          c.sfx.play('SNAP_IN');
          await tween(0.15, (k) => c.lantern.setExplode(Math.sin(k * Math.PI) * 0.012, 'unified'));
          c.lantern.setExplode(0, 'unified');
        };
        c.hud.setActions([{ label: '再看一次拆解 ↻', kind: 'alt', onClick: preview }]);
        setTimeout(preview, 2600);
        void engine;
      },
      exit(c) { c.lantern.setExplode(0, 'unified'); },
      nextLabel: '开始 ▸',
    },

    // ══════════════════════════════════════════════════════
    // B1 · 榫卯是什么（七千年）
    // ══════════════════════════════════════════════════════
    {
      id: 'B1', phase: 1, phaseRatio: 0.2,
      title: '榫卯是什么',
      mood: 'craft',
      bgm: 'BGM_A_OPENING',
      cam: { az: 24, el: 10, dist: 190, target: [0, 0, 96], snap: true },
      cps: 3.2,
      narration: `榫卯，sǔn mǎo。
它是中国古代木构建筑与家具的主要连接方式。
目前能追溯到的最早实物，出自距今约七千年前的河姆渡遗址 —— 比文字更早，比青铜更早。
七千年过去，它仍在被使用。`,
      cards: [{
        title: '河姆渡遗址出土', tag: '示意复原',
        rows: [['年代', '约 7000 年前'], ['构件', '干栏式建筑木构件'], ['特征', '带凸榫的横梁段']],
        note: '本构件为示意复原，非考古测绘还原。',
      }],
      async enter(c) {
        junk.clear();
        c.lantern.showOnly([]);
        c.lantern.showDecor(false);
        c.lantern.core.visible = false;

        // 一件带凸榫的做旧横梁段 —— 用与主线同一套 CSG 参数，只是材质做旧
        const g = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0x8a7a63, roughness: 0.94 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(a(9), a(1.5), a(1.5)), mat);
        const tenon = new THREE.Mesh(new THREE.BoxGeometry(a(2), a(0.5), a(1)), mat);
        tenon.position.x = a(5.5);
        g.add(body, tenon);
        g.position.set(0, 0, 96);
        junk.add(g);
        c.stage.scene.add(g);

        c.hud.addHotspot({
          pos: V(a(5.5), 0, 96), badge: '1', label: '最早的「榫」',
          sub: '凸出插入的部分', color: 'var(--tenon)',
          onClick: (on) => on && c.sfx.play('UI_TAP_WOOD'),
        });

        // 年代刻度：数字由「今」滚回「约 7000 年前」
        c.sfx.play('TIME_SCRUB', { gain: 0.6 });
        let n = 0;
        const el = { v: 0 };
        await tween(2.0, (k) => {
          el.v = Math.round(k * 7000);
          if (el.v !== n) { n = el.v; c.hud.setCounter(`距今 约 ${n} 年`); }
        }, { ease: Ease.outCubic });
        c.hud.setCounter('距今 约 7000 年');
      },
      exit(c) { junk.clear(); c.hud.setCounter(''); },
    },

    // ══════════════════════════════════════════════════════
    // B2 · 榫卯解剖台（S05 凸凹 + S06 榫三要素 + S07 卯三类）
    // ══════════════════════════════════════════════════════
    {
      id: 'B2', phase: 1, phaseRatio: 0.4,
      title: '榫的三要素 · 卯的三种规格',
      mood: 'craft',
      cam: { az: 30, el: 14, dist: 210, target: [0, 0, 96], snap: true },
      gate: true,
      hint: '拖动左边的木条，把它推进右边', hintPulse: true,
      narration: `看这两块木头。
凸出来的这一块，叫榫。
凹进去的这一块，叫卯。
把它们推到一起 —— 榫进卯中，一咬合，连接就完成了。
不需要钉子，也不需要胶。`,
      cards: [{
        title: '语义色（全片一致）', tag: '§12.4',
        html: `<div class="row"><span style="color:var(--tenon)">榫 · 暖金 · 阳</span><b>凸 / 榫头</b></div>
               <div class="row"><span style="color:var(--mortise)">卯 · 青灰 · 阴</span><b>凹 / 卯眼</b></div>
               <div class="row"><span style="color:var(--socket)">柱窝 · 紫灰</span><b>容纳位</b></div>`,
        note: '你在这里学会「金＝榫、灰＝卯」，此后三十多步无需再解释。',
      }],
      async enter(c, engine) {
        junk.clear();
        c.lantern.showOnly([]);
        const Z = 96;

        // DEMO-A（榫件） / DEMO-B（卯件）
        const mk = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
        const woodC = 0xc39a63;
        const A = new THREE.Group();
        A.add(new THREE.Mesh(new THREE.BoxGeometry(a(4), a(2), a(2)), mk(woodC)));
        const tn = new THREE.Mesh(new THREE.BoxGeometry(a(1.5), a(2 / 3), a(1)), mk(0xd8b071));
        tn.position.x = a(2.75);
        A.add(tn);
        A.position.set(-a(4), 0, Z);
        const B = new THREE.Group();
        // 卯件：用 CSG 内核真挖一个透眼，剖切时能看见内腔
        const bodyGeo = new THREE.BoxGeometry(a(4), a(2), a(2));
        const bmesh = new THREE.Mesh(bodyGeo, mk(woodC));
        const hole = new THREE.Mesh(
          new THREE.BoxGeometry(av(1.6), a(2 / 3) + 0.4, a(1) + 0.4),
          new THREE.MeshBasicMaterial({ color: 0x120f0c }),
        );
        hole.position.x = -av(1.3);
        B.add(bmesh, hole);
        B.position.set(av(3.2), 0, Z);
        junk.add(A, B);
        c.stage.scene.add(A, B);

        // 语义色描边
        const edge = (obj, color) => {
          const e = new THREE.LineSegments(
            new THREE.EdgesGeometry(obj.children[0].geometry, 20),
            new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }),
          );
          obj.add(e);
        };
        edge(A, PALETTE.TENON);
        edge(B, PALETTE.MORTISE);

        // 首次动手：吸附范围放宽至 0.8a，确保首次成功率 > 95%
        let done = false;
        const seat = async () => {
          if (done) return;
          done = true;
          c.hud.setHint('');
          await tween(0.35, (k) => { A.position.x = -a(4) + av(2.4) * k; }, { ease: Ease.inCubic });
          await tween(0.1, (k) => { A.position.x = -av(1.6) - Math.sin(k * Math.PI) * 0.4; });
          c.sfx.play('SNAP_IN');
          c.fx.ripples.emit(V(av(0.4), 0, Z), V(1, 0, 0));
          c.hud.toast('✓ 榫卯咬合');
          c.hud.setHint('点击 ①②③ 认识榫的三个部位', { pulse: true });
          showAnatomy();
        };

        // 简易 1 自由度拖拽（教学件不入 BOM，用轻量实现）
        const ray = new THREE.Raycaster(), p2 = new THREE.Vector2();
        let drag = null;
        const onDown = (e) => {
          if (done) return;
          const r = c.stage.canvas.getBoundingClientRect();
          p2.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
          ray.setFromCamera(p2, c.stage.camera);
          if (!ray.intersectObject(A, true).length) return;
          const plane = new THREE.Plane(V(0, 0, 1), -Z);
          const pt = new THREE.Vector3();
          if (!ray.ray.intersectPlane(plane, pt)) return;
          drag = { x0: pt.x, px: A.position.x };
          c.stage.controls.enabled = false;
        };
        const onMove = (e) => {
          if (!drag) return;
          const r = c.stage.canvas.getBoundingClientRect();
          p2.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
          ray.setFromCamera(p2, c.stage.camera);
          const plane = new THREE.Plane(V(0, 0, 1), -Z);
          const pt = new THREE.Vector3();
          if (!ray.ray.intersectPlane(plane, pt)) return;
          A.position.x = Math.min(-av(1.6), Math.max(-a(6), drag.px + (pt.x - drag.x0)));
          if (A.position.x > -av(2.4)) { drag = null; c.stage.controls.enabled = true; seat(); }
        };
        const onUp = () => { drag = null; c.stage.controls.enabled = true; };
        c.stage.canvas.addEventListener('pointerdown', onDown);
        addEventListener('pointermove', onMove);
        addEventListener('pointerup', onUp);
        junk.add({ dispose: () => {
          c.stage.canvas.removeEventListener('pointerdown', onDown);
          removeEventListener('pointermove', onMove);
          removeEventListener('pointerup', onUp);
        } });

        c.hud.setActions([{ label: '自动装配（降级）', kind: 'alt', onClick: seat }]);

        // ── 榫的三要素 + 卯的三种规格 ──
        const showAnatomy = () => {
          const seen = new Set();
          const spot = (pos, badge, label, sub, color) => c.hud.addHotspot({
            pos, badge, label, sub, color,
            onClick: (on) => {
              if (on) { seen.add(badge); c.sfx.play('UI_TAP_WOOD'); }
              if (seen.size >= 3) {
                c.hud.toast('✓ 已认全三个部位');
                c.sfx.play('SUCCESS_SOFT');
                c.hud.setHint('卯按用途分三种：透眼 · 开口槽 · 装板槽');
                engine.unlock();
                showMortiseKinds();
              }
            },
          });
          spot(V(av(0.4), 0, Z + a(0.5)), '1', '① 榫头', '插入卯中的凸出部分', 'var(--tenon)');
          spot(V(-av(0.6), av(0.4), Z), '2', '② 榫颊', '配合面，间隙过大则松、过小则裂', 'var(--tenon)');
          spot(V(-av(1.7), 0, Z - av(0.6)), '3', '③ 榫肩', '受力面，保证接缝平齐', 'var(--tenon)');
        };

        const showMortiseKinds = () => {
          c.hud.setCards([
            {
              title: '卯的三种规格', tag: '§5',
              rows: [
                ['透眼', `${dim(1 / 3)} × ${dim(2 / 3)}，贯穿`],
                ['开口槽', `宽 ${dim(1 / 3)}、深 ${dim(1 / 2)}`],
                ['装板槽', `宽 ${dim(1 / 3)}、长 ${dim(7)}`],
              ],
              note: '本灯笼三种都要用：透眼负责穿插，开口槽负责嵌夹，装板槽负责装格心。',
            },
            {
              title: '将用于', tag: '前后呼应',
              html: `<div class="row"><span>透眼</span><b>C7 · 枨框穿插</b></div>
                     <div class="row"><span>开口槽</span><b>C4 · 夹榫嵌合</b></div>
                     <div class="row"><span>装板槽</span><b>D2 · 格心落堂</b></div>`,
            },
          ]);
        };
      },
      exit(c) { junk.clear(); c.hud.clearHotspots(); },
    },

    // ══════════════════════════════════════════════════════
    // B3 · 榫为阳，卯为阴 ★★ 静默点①（导演红线：不得删减）
    // ══════════════════════════════════════════════════════
    {
      id: 'B3', phase: 1, phaseRatio: 0.55,
      title: '榫为阳，卯为阴',
      mood: 'ink',
      bgm: 'BGM_A_OPENING', bgmLevel: 0.35, // 静默点①：减至仅剩单音铺底，无打击乐
      cam: { az: 20, el: 8, dist: 175, target: [0, 0, 96], snap: true, ease: 0.18 },
      cps: 3.0,
      lyric: true,
      hint: '轻触屏幕可自由观看',
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
          color, roughness: 0.55, emissive: new THREE.Color(color), emissiveIntensity: 0.0,
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

        // 两色光晕沿构件表面缓慢流动，接缝处交融
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

        // 末句时光晕收束回木料本色 —— 返璞归真
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
    // B4 · 直榫（透榫）讲解 + 装配练习
    // ══════════════════════════════════════════════════════
    {
      id: 'B4', phase: 1, phaseRatio: 0.78,
      title: '第一种榫型 · 直榫（透榫）',
      mood: 'craft',
      cam: { az: 34, el: 16, dist: 200, target: [0, 0, 96], snap: true },
      gate: true,
      hint: '拖动木条，把榫头推入透眼', hintPulse: true,
      narration: `第一种，直榫 —— 最基础，也最常见。
榫头方正，插入后含而不露，外形规整对称。
我们这盏灯笼用的是它的贯穿做法，叫透榫：榫头要穿过整根木条，还要露出一小截头。
这一小截，既是结构上的加强，也是中式木作特有的样子。
（气口）
来，你来试试。把榫头对准孔，推进去。`,
      cards: [{
        title: '透榫参数卡', tag: 'J-1',
        rows: [
          ['榫头长', dim(1.5)], ['榫头厚', dim(1 / 3)], ['榫头高', dim(2 / 3)],
          ['长厚比', '4.5 : 1'], ['出头量', dim(1 / 2)],
          ['透眼', `${dim(1 / 3)} × ${dim(2 / 3)}，贯穿全宽 ${dim(1)}`],
        ],
        warn: '榫头不是方块 —— 必须细长。原策划「像这样的正方体」为错误表述（V-04）。',
      }],
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
        const hole = new THREE.Mesh(
          new THREE.BoxGeometry(a(1) + 0.6, J1.THICK, J1.HIGH),
          new THREE.MeshBasicMaterial({ color: 0x120f0c }),
        );
        B.add(hole);
        A.position.set(-av(3.6), 0, Z);
        B.position.set(av(1.2), 0, Z);
        junk.add(A, B);
        c.stage.scene.add(A, B);

        // 「固定」锁形标记 —— 全项目装配交互的通用语言
        c.hud.addHotspot({ pos: V(av(1.2), 0, Z + a(2)), badge: '🔒', label: '固定件', color: 'var(--mortise)' });

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
          c.hud.toast('✓ 透榫装配完成 —— 看到穿出来的那一小截了吗？');
          // 成功后推近出头端特写（用户第一次亲眼看到「穿出来」，情绪高点，不可省）
          c.stage.setRecommended({ az: 12, el: 10, dist: 96, target: V(av(2.2), 0, Z) });
          engine.unlock();
        };
        c.simpleDrag(A, V(1, 0, 0), av(2.4), Z, seat, () => {
          c.hud.toast('沿着木条方向推进去', { type: 'warn' });
          c.sfx.play('UI_REJECT');
        }, junk);
        c.hud.setActions([{ label: '自动装配（降级）', kind: 'alt', onClick: seat }]);
      },
      exit(c) { junk.clear(); c.hud.clearHotspots(); },
    },

    // ══════════════════════════════════════════════════════
    // B5 · 夹榫（开口双榫）—— 双向嵌夹 + 自上而下落入 ★V-19
    // ══════════════════════════════════════════════════════
    {
      id: 'B5', phase: 1, phaseRatio: 1,
      title: '第二种榫型 · 夹榫（开口双榫）',
      mood: 'craft',
      cam: { az: 38, el: 28, dist: 190, target: [0, 0, 96], snap: true },
      gate: true,
      hint: '向下拖动，把双榫落进两条槽里', hintPulse: true,
      narration: `第二种，夹榫，由直榫变形而来。
它有两个平行排列的榫头和榫肩，形成丁字接合。
关键在这里 —— 不是一个插进另一个，而是互相嵌夹：
叉形的双榫落进两条槽，同时，中间那条榫舌也卡进双榫之间。
你夹住我，我也夹住你。
（气口）
还有一点很重要：它是从上往下落进去的。
这样重力帮你压住它，端头的肩还能坐实在槽底 —— 稳。`,
      cards: [{
        title: '开口双榫参数卡', tag: 'J-2',
        rows: [
          ['开口槽', `宽 ${dim(1 / 3)}、深 ${dim(1 / 2)}、长 ${dim(1 / 2)} ×2`],
          ['中央榫舌', `厚 ${dim(1 / 3)}`],
          ['叉形双榫', `各厚 ${dim(1 / 3)}、长 ${dim(1 / 2)}、高 ${dim(1 / 2)}`],
        ],
        warn: '★方向已由「自下而上顶入」修正为「自上而下落入」（V-19）。自底面开槽时中梁靠摩擦悬挂，重力会使其脱落。',
      }],
      async enter(c, engine) {
        junk.clear();
        c.lantern.showOnly([]);
        const Z = 96;
        const mk = (col) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 });
        // D1：开槽件（顶面两条开口槽 + 中央榫舌）
        const D1 = new THREE.Group();
        const w = J2.SLOT_W, tg = J2.TONGUE, d = J2.SLOT_D;
        const base = new THREE.Mesh(new THREE.BoxGeometry(a(1), a(4), a(1) - d), mk(0xc39a63));
        base.position.z = -d / 2;
        const tongue = new THREE.Mesh(new THREE.BoxGeometry(tg, a(4), d), mk(0xd8b071));
        tongue.position.z = (a(1) - d) / 2;
        const wallL = new THREE.Mesh(new THREE.BoxGeometry(w / 2, a(4), d), mk(0xc39a63));
        wallL.position.set(-(tg / 2 + w * 0.75), 0, (a(1) - d) / 2);
        const wallR = wallL.clone(); wallR.position.x *= -1;
        D1.add(base, tongue, wallL, wallR);
        D1.position.set(0, 0, Z);
        // D2：叉件（端部开口双榫 + 承重肩）
        const D2 = new THREE.Group();
        const forkL = new THREE.Mesh(new THREE.BoxGeometry(w, a(3), d), mk(0xd8b071));
        forkL.position.set(-(tg / 2 + w / 2), 0, 0);
        const forkR = forkL.clone(); forkR.position.x *= -1;
        const body = new THREE.Mesh(new THREE.BoxGeometry(a(1), av(1.2), a(1)), mk(0xc39a63));
        body.position.set(0, av(1.9), a(0.25));
        D2.add(forkL, forkR, body);
        D2.position.set(0, 0, Z + a(2.5));
        junk.add(D1, D2);
        c.stage.scene.add(D1, D2);

        // 双向箭头：向下暖金（榫的动作）/ 向上青灰（卯的动作）
        c.hud.addHotspot({ pos: V(-av(0.9), 0, Z + av(1.4)), badge: '↓', label: '双榫入槽', color: 'var(--tenon)', active: true });
        c.hud.addHotspot({ pos: V(av(0.9), 0, Z + av(1.4)), badge: '↑', label: '榫舌入口', color: 'var(--mortise)', active: true });
        c.hud.addHotspot({ pos: V(0, av(1.4), Z - av(0.3)), badge: '▪', label: '承重肩', sub: '中梁落下后坐实于此', color: 'var(--socket)' });

        let done = false;
        const seat = async () => {
          if (done) return;
          done = true;
          c.hud.setHint('');
          const z0 = D2.position.z;
          await tween(0.4, (k) => { D2.position.z = z0 - (z0 - (Z + a(0.25))) * k; }, { ease: Ease.inCubic });
          // 双段回弹（模拟两处同时到位）+ 0.3 mm 坐实微沉
          await tween(0.12, (k) => { D2.position.z = Z + a(0.25) + Math.sin(k * Math.PI) * 0.9; });
          D2.position.z = Z + a(0.25) - 0.3;
          c.sfx.playDouble('SNAP_IN');     // 两记极短促、间隔 60 ms —— 夹榫专属
          c.sfx.play('WOOD_SETTLE', { gain: 0.5, delay: 0.1 });
          c.sfx.play('SUCCESS_MID', { delay: 0.3 });
          c.fx.ripples.emit(V(-av(0.9), 0, Z + a(0.5)), V(0, 0, 1));
          c.fx.ripples.emit(V(av(0.9), 0, Z + a(0.5)), V(0, 0, 1));
          c.hud.toast('✓ 夹榫接合完成 —— 两声。两个方向，同时锁住。');
          c.hud.setSlots([
            { label: '直榫', filled: true, tip: '回看直榫讲解', onClick: () => c.engine.goToStep('B4') },
            { label: '夹榫', filled: true, tip: '回看夹榫讲解', onClick: () => c.engine.goToStep('B5') },
          ]);
          engine.unlock('你已掌握两种基本榫型 ▸');
        };
        c.simpleDrag(D2, V(0, 0, -1), a(2.25), Z, seat, () => {
          c.hud.toast('夹榫要从上往下落进去', { type: 'warn' });
          c.sfx.play('UI_REJECT');
        }, junk, { axisIsZ: true });
        c.hud.setActions([{ label: '自动装配（降级）', kind: 'alt', onClick: seat }]);
      },
      exit(c) { junk.clear(); c.hud.clearHotspots(); },
    },
  ];
}

export { PATTERNS };
