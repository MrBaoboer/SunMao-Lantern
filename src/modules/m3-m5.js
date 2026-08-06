/**
 * M3 新春许愿 · M4 AR 挂灯笼 · M5 烟花庆祝
 */

import * as THREE from 'three';
import { V, C, Junk, buildNightSky } from '../steps/util.js';
import { buildPatternTexture, PATTERNS } from '../render/lattice.js';
import { makePosterNo } from '../core/state.js';
import { tween, Ease, wait } from '../util/tween.js';

const junk = new Junk(null);

// ══════════════════════════════════════════════════════════
// M3 · 新春许愿
//   ★隐私红线：默认不采集任何个人信息、不上传愿望内容、不登录。
//     海报编号为**本地生成的随机码**，不含用户标识、不可反查。
//     海报在设备本地用 Canvas 合成，天然满足隐私要求。
// ══════════════════════════════════════════════════════════
const WISHES = [
  '岁岁平安', '万事顺遂', '身体康健',
  '阖家团圆', '前程似锦', '心想事成',
  '财源广进', '学业有成', '喜乐无忧',
  '所求皆如愿', '所行化坦途', '往事清零，来年可期',
];
const COMBO = [
  { k: '对象', v: ['家人', '朋友', '自己', '大家'] },
  { k: '领域', v: ['身体', '事业', '学业', '生活'] },
  { k: '程度', v: ['平平安安', '顺顺利利', '红红火火', '长长久久'] },
  { k: '收尾', v: ['新年快乐', '万事胜意', '福气满满', '岁岁如今朝'] },
];

export function openM3(c, onExit) {
  junk.scene = c.stage.scene;
  junk.clear();
  c.stage.setMood('night');
  c.bgm.play('BGM_C_WISH');
  junk.add(buildNightSky(c.stage.scene));
  c.stage.setRecommended({ az: 90, el: 8, dist: 320, target: V(0, 0, 96) });
  c.stage.snapToRecommended();

  let picked = c.state.wishText || '';
  let page = 0;

  const select = () => {
    const list = page === 0 ? WISHES.slice(0, 9) : WISHES.slice(9);
    c.hud.showOverlay(`<div class="panel">
      <h2>写一句新春祝福</h2>
      <p class="lead">从前过年，人们把心愿写在灯上 · 灯亮着，愿望就一直亮着</p>
      <div class="wishes">
        ${list.map((w) => `<button class="wish ${w === picked ? 'sel' : ''}" data-w="${w}">${w}</button>`).join('')}
        ${page === 1 ? '<button class="wish" data-combo="1">自己组一句</button>' : ''}
      </div>
      <div style="margin-top:18px;display:flex;gap:10px;justify-content:center;align-items:center">
        <button id="m3-page" class="ghost-btn">${page === 0 ? '下一页 1/2 ▸' : '◂ 上一页 2/2'}</button>
        <button id="m3-write" class="main-btn" ${picked ? '' : 'disabled'}>写上去</button>
        <button id="m3-back" class="ghost-btn">返回</button>
      </div>
      <p class="lead" style="margin-top:18px;font-size:11px">本作品在你的设备上生成，未上传任何信息</p>
    </div>`, { onMount: (o) => {
      o.querySelectorAll('.wish').forEach((b) => b.addEventListener('click', () => {
        if (b.dataset.combo) { combo(); return; }
        picked = b.dataset.w;
        o.querySelectorAll('.wish').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
        o.querySelector('#m3-write').disabled = false;
        c.sfx.play('UI_SELECT_WARM' in {} ? 'UI_TAP' : 'UI_TAP');
      }));
      o.querySelector('#m3-page').addEventListener('click', () => { page = 1 - page; select(); });
      o.querySelector('#m3-write').addEventListener('click', () => {
        if (!picked) { c.hud.toast('先挑一句吧', { type: 'warn' }); return; }
        writing();
      });
      o.querySelector('#m3-back').addEventListener('click', close);
    } });
  };

  const combo = () => {
    const sel = [0, 0, 0, 0];
    const draw = () => c.hud.showOverlay(`<div class="panel">
      <h2>自己凑一句</h2>
      <p class="lead">挑四个词，凑成一句</p>
      ${COMBO.map((g, gi) => `<div style="margin-bottom:14px">
        <div style="font-size:12px;letter-spacing:.12em;color:var(--tenon);margin-bottom:8px">【${g.k}】</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${g.v.map((v, vi) => `<button class="wish ${sel[gi] === vi ? 'sel' : ''}" style="padding:10px 16px;font-size:15px" data-g="${gi}" data-v="${vi}">${v}</button>`).join('')}
        </div></div>`).join('')}
      <div style="margin-top:10px;text-align:center;font-family:var(--serif);font-size:20px;letter-spacing:.14em;color:var(--paper)">
        ${phrase(sel)}
      </div>
      <div style="margin-top:18px;display:flex;gap:10px;justify-content:center">
        <button id="m3-ok" class="main-btn">就写这句</button>
        <button id="m3-cancel" class="ghost-btn">返回九宫格</button>
      </div>
    </div>`, { onMount: (o) => {
      o.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => {
        sel[+b.dataset.g] = +b.dataset.v;
        c.sfx.play('UI_TAP');
        draw();
      }));
      o.querySelector('#m3-ok').addEventListener('click', () => { picked = phrase(sel); writing(); });
      o.querySelector('#m3-cancel').addEventListener('click', select);
    } });
    draw();
  };
  const phrase = (s) => `愿${COMBO[0].v[s[0]]}${COMBO[1].v[s[1]]}${COMBO[2].v[s[2]]}，${COMBO[3].v[s[3]]}`;

  const writing = async () => {
    c.state.wishText = picked;
    c.hud.showOverlay(`<div class="panel" style="text-align:center">
      <canvas id="m3-cv" width="720" height="220" style="max-width:100%;background:rgba(20,17,14,.5);border:1px solid var(--line);border-radius:8px"></canvas>
      <div style="margin-top:16px"><button id="m3-skip" class="ghost-btn">跳过书写</button></div>
    </div>`, { solid: true });
    const cv = document.getElementById('m3-cv');
    const g = cv.getContext('2d');
    const chars = [...picked];
    const size = Math.min(120, 660 / chars.length);
    const y = 140;
    let skipped = false;
    document.getElementById('m3-skip').addEventListener('click', () => { skipped = true; });

    c.sfx.play('INK_DIP');
    await wait(0.4);

    g.font = `${size}px ${getComputedStyle(document.body).getPropertyValue('--serif')}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';

    // 逐字、分段揭示 —— 以近似笔顺的方向推进（真实笔顺路径数据见 DESIGN.md 说明）
    for (const [ci, ch] of chars.entries()) {
      const cx = (720 / chars.length) * (ci + 0.5);
      const SEG = 4;
      for (let s = 0; s < SEG; s++) {
        if (skipped) break;
        g.save();
        g.beginPath();
        const w = (size * 1.2) * ((s + 1) / SEG);
        const h = (size * 1.2) * ((s + 1) / SEG);
        g.rect(cx - size * 0.6, y - size * 0.6, w, h);
        g.clip();
        g.fillStyle = '#1c1a17';
        g.fillText(ch, cx, y);
        g.restore();
        c.sfx.play('BRUSH_STROKE');
        await wait(0.13);
      }
      if (skipped) break;
    }
    // 收尾：整字补全，墨色渐变为暖金（寓意「心愿被灯照亮」）
    g.clearRect(0, 0, 720, 220);
    for (const [ci, ch] of chars.entries()) {
      g.fillStyle = '#1c1a17';
      g.fillText(ch, (720 / chars.length) * (ci + 0.5), y);
    }
    await tween(0.8, (k) => {
      g.clearRect(0, 0, 720, 220);
      const col = mixHex('#1c1a17', '#c8a063', k);
      g.fillStyle = col;
      for (const [ci, ch] of chars.entries()) {
        g.fillText(ch, (720 / chars.length) * (ci + 0.5), y);
      }
    });
    c.sfx.play('SHIMMER_WARM');
    c.hud.toast('✓ 已写在你的灯笼上');
    await wait(0.8);
    poster();
  };

  const poster = () => {
    if (!c.state.posterNo) c.state.posterNo = makePosterNo();
    const W = 1080, H = 1920;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');

    // 背景
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#1a1410'); grd.addColorStop(0.55, '#0d0b08'); grd.addColorStop(1, '#140f0a');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);

    // 上 1/6 标题
    g.fillStyle = '#ece5d8';
    g.textAlign = 'center';
    g.font = `600 78px ${getComputedStyle(document.body).getPropertyValue('--serif')}`;
    g.fillText('我做了一盏灯', W / 2, 190);
    g.font = '26px sans-serif';
    g.fillStyle = 'rgba(236,229,216,.55)';
    g.fillText('榫卯灯笼 · 国风流光', W / 2, 246);

    // 中 3/5 灯笼主视觉（3D 截帧）
    const shot = c.stage.renderer.domElement;
    const sw = shot.width, sh = shot.height;
    const dw = W * 0.86, dh = dw * (sh / sw);
    g.drawImage(shot, 0, 0, sw, sh, (W - dw) / 2, 330, dw, dh);

    // 下 1/4 愿望 + 纹样边框 + 编号
    const tex = buildPatternTexture(c.state.patternId, 512);
    const img = tex.image;
    g.globalAlpha = 0.16;
    for (let x = 0; x < W; x += 180) {
      g.drawImage(img, x, H - 470, 180, 180);
      g.drawImage(img, x, H - 100, 180, 100);
    }
    g.globalAlpha = 1;
    tex.dispose();

    g.fillStyle = '#c8a063';
    g.font = `600 92px ${getComputedStyle(document.body).getPropertyValue('--serif')}`;
    g.fillText(c.state.wishText, W / 2, H - 300);

    g.font = '24px monospace';
    g.textAlign = 'left';
    g.fillStyle = 'rgba(236,229,216,.5)';
    g.fillText(`编号 ${c.state.posterNo}`, 70, H - 60);
    g.textAlign = 'right';
    g.fillText('13 根木条 · 0 颗钉子', W - 70, H - 60);

    const url = cv.toDataURL('image/png');
    c.state.modulesDone = { ...c.state.modulesDone, M3: true };
    c.sfx.play('SUCCESS_SOFT');

    c.hud.showOverlay(`<div class="panel" style="text-align:center">
      <img src="${url}" style="max-height:62vh;border-radius:8px;border:1px solid var(--line)">
      <div style="margin-top:18px;display:flex;gap:10px;justify-content:center">
        <a id="m3-save" class="main-btn" style="text-decoration:none;display:inline-block"
           href="${url}" download="榫卯灯笼-${c.state.posterNo}.png">保存图片</a>
        <button id="m3-rewrite" class="alt-btn">换一句重写</button>
        <button id="m3-back2" class="ghost-btn">返回</button>
      </div>
      <p class="lead" style="margin-top:14px;font-size:11px">
        编号为本地随机生成，不含任何个人信息，未上传任何数据
      </p>
    </div>`, { onMount: (o) => {
      o.querySelector('#m3-rewrite').addEventListener('click', select);
      o.querySelector('#m3-back2').addEventListener('click', close);
      o.querySelector('#m3-save').addEventListener('click', () => c.hud.toast('已保存到下载'));
    } });
  };

  const close = () => { junk.clear(); c.hud.hideOverlay(); c.voice.stop(); onExit?.(); };
  select();
  return close;
}

function mixHex(a, b, k) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
  const m = (x, y) => Math.round(x + (y - x) * k);
  return `rgb(${m(r1, r2)},${m(g1, g2)},${m(b1, b2)})`;
}

// ══════════════════════════════════════════════════════════
// M4 · AR 挂灯笼
//   桌面 Chrome 无 WebXR AR 会话 → 直接进入全景模式，
//   且**不得把「不支持」表述为错误**（§M4.0 入口条件）。
// ══════════════════════════════════════════════════════════
export function openM4(c, onExit) {
  junk.scene = c.stage.scene;
  junk.clear();
  c.bgm.stop();

  const check = async () => {
    if (!navigator.xr) return false;
    try { return await navigator.xr.isSessionSupported('immersive-ar'); } catch { return false; }
  };

  const panorama = () => {
    c.stage.setMood('night');
    junk.add(buildNightSky(c.stage.scene));
    // 全景背景：白天庭院 / 夜晚街巷，与 state.lit 联动
    const night = c.state.lit;
    const bg = makePanorama(night);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(2600, 40, 24),
      new THREE.MeshBasicMaterial({ map: bg, side: THREE.BackSide }),
    );
    c.stage.scene.add(sky);
    junk.add(sky);

    const placed = [];
    c.stage.setRecommended({ az: 60, el: 6, dist: 520, target: V(0, 0, 96) });
    c.stage.snapToRecommended();

    const render = () => c.hud.showOverlay(`<div class="panel" style="text-align:center;pointer-events:auto">
      <h2>把它挂起来</h2>
      <p class="lead">
        ${c.arSupported ? '你的设备支持 AR —— 也可以先在全景里试试' : '全景模式 · 转动视角选位置，点一下放上去'}
      </p>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <button id="m4-place" class="main-btn">再挂一盏（${placed.length}/6）</button>
        <button id="m4-clear" class="alt-btn">清空</button>
        <button id="m4-shot" class="alt-btn">拍照</button>
        <button id="m4-back" class="ghost-btn">返回</button>
      </div>
    </div>`, { solid: false, onMount: (o) => {
      o.classList.add('clear');
      o.querySelector('#m4-place').addEventListener('click', () => {
        if (placed.length >= 6) { c.hud.toast('已经很热闹了（6/6）'); return; }
        const clone = c.lantern.root.clone(true);
        const th = Math.random() * Math.PI * 2;
        const r = 260 + Math.random() * 420;
        clone.position.set(Math.cos(th) * r, Math.sin(th) * r, 40 + Math.random() * 260);
        clone.scale.setScalar(0.7 + Math.random() * 0.5);
        clone.userData.phase = Math.random() * 6;   // 相位错开，避免同步感
        c.stage.scene.add(clone);
        placed.push(clone);
        junk.add(clone);
        c.sfx.play('LANTERN_PLACE', { pitch: placed.length * 1.5 });
        render();
      });
      o.querySelector('#m4-clear').addEventListener('click', () => {
        for (const p of placed) c.stage.scene.remove(p);
        placed.length = 0;
        render();
      });
      o.querySelector('#m4-shot').addEventListener('click', () => {
        c.sfx.play('SHUTTER');
        c.stage.composer.render();
        const a = document.createElement('a');
        a.href = c.stage.renderer.domElement.toDataURL('image/png');
        a.download = '榫卯灯笼-挂灯.png';
        a.click();
        c.hud.toast('已保存到下载');
      });
      o.querySelector('#m4-back').addEventListener('click', close);
    } });

    const upd = (dt, t) => {
      for (const p of placed) p.rotation.z = Math.sin(t * 0.6 + p.userData.phase) * 0.06;
      void dt;
    };
    c.stage.updaters.add(upd);
    junk.add({ dispose: () => c.stage.updaters.delete(upd) });
    render();
    c.state.modulesDone = { ...c.state.modulesDone, M4: true };
    c.voice.play('M4', `最后一步 —— 把它挂起来。
转动视角，找一个位置，点一下就挂上去。
挂墙上，它自己会垂下来晃；放桌上，它就稳稳地立着。
（气口）
想挂几盏都行。绕着走一圈看看 —— 从不同角度看，它是不一样的。
拍张照吧。这是你做的。`, { cps: 3.8 });
  };

  check().then((ok) => { c.arSupported = ok; panorama(); });

  const close = () => { junk.clear(); c.hud.hideOverlay(); c.voice.stop(); onExit?.(); };
  return close;
}

/** 程序化全景底图（白天庭院 / 夜晚街巷） */
function makePanorama(night) {
  const cv = document.createElement('canvas');
  cv.width = 2048; cv.height = 1024;
  const g = cv.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 1024);
  if (night) { sky.addColorStop(0, '#060912'); sky.addColorStop(0.55, '#141a2c'); sky.addColorStop(1, '#0b0a08'); }
  else { sky.addColorStop(0, '#8fa9c4'); sky.addColorStop(0.55, '#cfd6cf'); sky.addColorStop(1, '#6b5a44'); }
  g.fillStyle = sky; g.fillRect(0, 0, 2048, 1024);
  // 远景屋檐剪影
  g.fillStyle = night ? '#05070c' : '#4a3b2c';
  for (let x = 0; x < 2048; x += 128) {
    const h = 120 + Math.sin(x * 0.013) * 60;
    g.beginPath();
    g.moveTo(x - 20, 700);
    g.lineTo(x + 64, 700 - h);
    g.lineTo(x + 148, 700);
    g.closePath(); g.fill();
    g.fillRect(x + 10, 700, 108, 324);
  }
  if (night) {
    g.fillStyle = 'rgba(255,160,80,.5)';
    for (let i = 0; i < 40; i++) {
      g.beginPath();
      g.arc(Math.random() * 2048, 620 + Math.random() * 200, 3 + Math.random() * 5, 0, 7);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

// ══════════════════════════════════════════════════════════
// M5 · 烟花庆祝
//   ★最重要的真实感细节：爆炸声延迟 0.25 s 才响起（模拟声速）。
//     触觉/视觉反馈须与**延迟后的声音**同步，而非与视觉同步。
//     这一条比任何粒子特效的提升都更能让人「信」。不可省略、不可调为 0。
//   ★第二重要：每次爆炸对灯笼做一次 0.3 s 的亮度与色温脉冲 ——
//     没有这一条，烟花和灯笼就是两张贴在一起的图。
// ══════════════════════════════════════════════════════════
const SOUND_DELAY = 0.25;

export function openM5(c, onExit) {
  junk.scene = c.stage.scene;
  junk.clear();
  c.stage.setMood('night');
  c.bgm.play('BGM_C_FINALE');
  junk.add(buildNightSky(c.stage.scene));
  c.stage.setRecommended({ az: 60, el: 16, dist: 900, target: V(0, 0, 420) });
  c.stage.snapToRecommended();

  let count = 0;
  const COLORS = [0xffd166, 0xff5f6d, 0x7ee8fa, 0xffa3d1, 0xc8ffb0, 0xffe9a8];

  const launch = (type, sx, sy) => {
    const at = new THREE.Vector3(sx, 240 + Math.random() * 160, 380 + sy);
    const color = new THREE.Color(COLORS[Math.floor(Math.random() * COLORS.length)]);
    c.sfx.play('FIREWORK_LAUNCH', { pitch: (Math.random() - 0.5) * 4 });
    const dur = 0.6 + Math.random() * 0.3;
    // 升空拖尾
    tween(dur, (k) => {
      if (k > 0.98) return;
      c.fx.fireworks.parts.push({
        x: at.x, y: at.y, z: 30 + (at.z - 30) * k,
        vx: 0, vy: 0, vz: 0, r: 1, g: 0.75, b: 0.4, life: 0.35, age: 0, drag: 0.8,
      });
    }, { ease: Ease.outQuad, onDone: () => {
      const variant = { peony: 0, double: 1, willow: 2, ring: 3, fu: 4 }[type] ?? 0;
      c.fx.fireworks.burst(type, at, color);
      count++;
      // ★声画延迟 0.25 s
      c.sfx.play(type === 'fu' ? 'FIREWORK_FU' : 'FIREWORK_BURST', { delay: SOUND_DELAY, variant });
      c.sfx.play('FIREWORK_CRACKLE', { delay: SOUND_DELAY + 0.15, gain: 0.7 });
      // ★烟花对灯笼的动态照明：0.3 s 的亮度与色温脉冲，颜色取自该发主色
      const base = c.state.lit ? 1 : 0;
      tween(0.3, (k) => {
        const pulse = Math.sin(k * Math.PI) * 0.55;
        c.lantern.innerLight.color.lerpColors(new THREE.Color(0xffa54f), color, pulse * 0.6);
        c.lantern.setLit(base + pulse * (base ? 0.35 : 0.28));
      }, { onDone: () => { c.lantern.setLit(base); c.lantern.innerLight.color.setHex(0xffa54f); } });
      if (type === 'fu') {
        c.voice.play('M5-fu', '哎 —— 是个「福」字。', { cps: 4.2 });
      }
      if (count === 12) c.hud.toast('可以放压轴了 ✦', { dur: 1800 });
    } });
  };

  // 手势识别 —— 识别失败一律静默降级为牡丹，绝不出现「手势未识别」提示
  let down = null, path = [];
  const canvas = c.stage.canvas;
  const onDown = (e) => {
    if (c.hud.overlayVisible && e.target.closest('.panel')) return;
    down = { t: performance.now(), x: e.clientX, y: e.clientY, multi: e.isPrimary === false };
    path = [[e.clientX, e.clientY]];
  };
  const onMove = (e) => { if (down) path.push([e.clientX, e.clientY]); };
  const onUp = (e) => {
    if (!down) return;
    const dt = (performance.now() - down.t) / 1000;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    const dist = Math.hypot(dx, dy);
    let type = 'peony';
    if (dt > 1.0 && dist < 40) type = 'fu';                    // 长按 1 s 后松手
    else if (isCircle(path)) type = 'ring';                    // 画圆
    else if (dy < -70 && Math.abs(dx) < Math.abs(dy)) type = 'willow'; // 向上滑
    else if (e.shiftKey) type = 'double';                      // 桌面端替代「双指同时点」
    const w = innerWidth, h = innerHeight;
    launch(type, ((down.x / w) - 0.5) * 900, -((down.y / h) - 0.5) * 260);
    if (type === 'double') setTimeout(() => launch('peony', ((down.x / w) - 0.5) * 900 + 120, 40), 400);
    down = null;
  };
  canvas.addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove);
  addEventListener('pointerup', onUp);
  junk.add({ dispose: () => {
    canvas.removeEventListener('pointerdown', onDown);
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerup', onUp);
  } });

  const finale = async () => {
    c.hud.toast('压轴 ✦', { dur: 1200 });
    for (let i = 0; i < 18; i++) {
      const t = ['peony', 'willow', 'ring', 'double'][i % 4];
      launch(i === 6 || i === 14 ? 'fu' : t, (Math.random() - 0.5) * 900, (Math.random() - 0.5) * 200);
      await wait(0.24 + Math.max(0, 0.3 - i * 0.02));
    }
    await wait(1.6);
    outro();
  };

  const outro = async () => {
    c.state.modulesDone = { ...c.state.modulesDone, M5: true };
    c.stage.setRecommended({ az: 55, el: 8, dist: 340, target: V(0, 0, 96), ease: 0.35 });
    c.voice.play('M5-outro', `烟花放完了，灯还亮着。
（停顿 1.0 s）
十三根木条，零颗钉子。
这套办法，我们用了七千年。
（停顿 1.5 s）
新年快乐。`, { cps: 3.3 });
    await wait(7.5);
    // ★片尾卡 —— 与开场钩子「不用一根钉子、一滴胶水」形成全片闭环，不可改写为通用祝福语
    c.hud.showOverlay(`<div class="panel" style="text-align:center">
      <div style="font-family:var(--serif);font-size:clamp(26px,4vw,44px);letter-spacing:.2em;line-height:2.4;color:var(--paper)">
        <div class="fl">13 根木条</div>
        <div class="fl">0 颗钉子</div>
        <div class="fl">7000 年</div>
      </div>
      <div style="margin-top:34px"><button id="m5-back" class="main-btn">返回</button></div>
    </div>`, { onMount: (o) => {
      o.querySelectorAll('.fl').forEach((el, i) => {
        el.style.opacity = 0;
        setTimeout(() => tween(0.6, (k) => { el.style.opacity = k; }), i * 800);
      });
      o.querySelector('#m5-back').addEventListener('click', close);
    } });
  };

  c.hud.showOverlay(`<div class="panel" style="pointer-events:none">
    <div style="position:fixed;left:50%;top:16%;transform:translateX(-50%);text-align:center;pointer-events:none">
      <div class="card" style="pointer-events:auto" id="m5-tips">
        <h4>手势对应花型</h4>
        <div class="row"><span>点一下</span><b>牡丹</b></div>
        <div class="row"><span>往上划</span><b>升空柳</b></div>
        <div class="row"><span>画个圈</span><b>环形花</b></div>
        <div class="row"><span>长按后松手</span><b>「福」字</b></div>
        <div class="row"><span>Shift + 点</span><b>双响</b></div>
        <div class="warn">许多城市禁止或限制燃放烟花爆竹，请遵守当地规定</div>
      </div>
    </div>
    <div style="position:fixed;right:var(--safe);bottom:var(--safe);display:flex;gap:10px;pointer-events:auto">
      <button id="m5-final" class="main-btn">压轴 ✦</button>
      <button id="m5-back0" class="ghost-btn">返回</button>
    </div>
  </div>`, { solid: false, onMount: (o) => {
    o.classList.add('clear');
    setTimeout(() => { const t = o.querySelector('#m5-tips'); if (t) t.style.display = 'none'; }, 4000);
    o.querySelector('#m5-final').addEventListener('click', finale);
    o.querySelector('#m5-back0').addEventListener('click', close);
  } });

  c.voice.play('M5', `最后 —— 放烟花。
在屏幕上点一下，划一下，画个圈，都能放出不一样的花。
试试看。`, { cps: 3.8 });

  const close = () => {
    c.fx.fireworks.clear();
    junk.clear();
    c.hud.hideOverlay();
    c.voice.stop();
    onExit?.();
  };
  return close;
}

/** 画圆判定：路径首尾接近且累计转角接近 2π */
function isCircle(path) {
  if (path.length < 12) return false;
  const [x0, y0] = path[0];
  const [x1, y1] = path[path.length - 1];
  if (Math.hypot(x1 - x0, y1 - y0) > 90) return false;
  let turn = 0;
  for (let i = 2; i < path.length; i++) {
    const a1 = Math.atan2(path[i - 1][1] - path[i - 2][1], path[i - 1][0] - path[i - 2][0]);
    const a2 = Math.atan2(path[i][1] - path[i - 1][1], path[i][0] - path[i - 1][0]);
    let d = a2 - a1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    turn += d;
  }
  return Math.abs(turn) > 4.2;
}

export { PATTERNS, C };
