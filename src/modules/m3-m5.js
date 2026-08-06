/**
 * 写心愿 · 挂起来 · 放烟花
 */

import * as THREE from 'three';
import { V, Junk, buildNightSky, FIT_LANTERN } from '../steps/util.js';
import { playVO } from './vo.js';
import { buildPatternTexture } from '../render/lattice.js';
import { makePosterNo } from '../core/state.js';
import { tween, Ease, wait } from '../util/tween.js';

const junk = new Junk(null);

// ══════════════════════════════════════════════════════════
// 写心愿
//   不要姓名、不要手机号、不用登录，愿望也不上传。
//   海报在本机合成，编号是本地随机生成的。
// ══════════════════════════════════════════════════════════
const WISHES = [
  '岁岁平安', '万事顺遂', '身体康健',
  '阖家团圆', '前程似锦', '心想事成',
  '财源广进', '学业有成', '喜乐无忧',
];
const COMBO = [
  { k: '给谁', v: ['家人', '朋友', '自己', '大家'] },
  { k: '哪方面', v: ['身体', '事业', '学业', '生活'] },
  { k: '怎么样', v: ['平平安安', '顺顺利利', '红红火火', '长长久久'] },
  { k: '收个尾', v: ['新年快乐', '万事胜意', '福气满满', '岁岁如今朝'] },
];

export function openM3(c, onExit) {
  junk.scene = c.stage.scene;
  junk.clear();
  c.stage.setMood('night');
  c.bgm.play('BGM_C_WISH');
  junk.add(buildNightSky(c.stage.scene));
  c.stage.setRecommended({ az: 90, el: 8, dist: 330, target: V(0, 0, 96), fit: FIT_LANTERN });
  c.stage.snapToRecommended();

  let picked = c.state.wishText || '';
  const close = () => { junk.clear(); c.hud.hideOverlay(); c.voice.stop(); onExit?.(); };
  const phrase = (s) => `愿${COMBO[0].v[s[0]]}${COMBO[1].v[s[1]]}${COMBO[2].v[s[2]]}，${COMBO[3].v[s[3]]}`;

  const choose = () => {
    c.hud.sheet({
      title: '写一句话',
      lede: '从前过年，人们把心愿写在灯上。灯亮着，愿望就亮着。',
      body: `<div class="wishes">${WISHES.map((w) => `
        <button class="wish" type="button" data-w="${w}"
                aria-pressed="${w === picked}">${w}</button>`).join('')}</div>`,
      actions: [
        { label: '回去', on: close },
        { label: '自己凑一句', id: 'own' },
        { label: '写上去', kind: 'primary', ico: 'brush', id: 'go', disabled: !picked },
      ],
      onMount: (o) => {
        o.querySelectorAll('.wish').forEach((b) => b.addEventListener('click', () => {
          picked = b.dataset.w;
          o.querySelectorAll('.wish').forEach((x) => x.setAttribute('aria-pressed', 'false'));
          b.setAttribute('aria-pressed', 'true');
          o.querySelector('#go').disabled = false;
          c.sfx.play('UI_TAP');
        }));
        o.querySelector('#own').addEventListener('click', combo);
        o.querySelector('#go').addEventListener('click', () => picked && write());
      },
      onEsc: close,
    });
  };

  const combo = () => {
    const s = [0, 0, 0, 0];
    const draw = () => c.hud.sheet({
      title: '自己凑一句',
      lede: '挑四个词',
      body: `${COMBO.map((g, gi) => `<div class="combo-grp">
          <div class="combo-k">${g.k}</div>
          <div class="combo-row">${g.v.map((v, vi) => `
            <button class="wish" type="button" data-g="${gi}" data-v="${vi}"
                    aria-pressed="${s[gi] === vi}">${v}</button>`).join('')}</div>
        </div>`).join('')}
        <p class="combo-out">${phrase(s)}</p>`,
      actions: [
        { label: '还是挑现成的', on: choose },
        { label: '就写这句', kind: 'primary', ico: 'brush', on: () => { picked = phrase(s); write(); } },
      ],
      onMount: (o) => {
        o.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => {
          s[+b.dataset.g] = +b.dataset.v;
          c.sfx.play('UI_TAP');
          draw();
        }));
      },
      onEsc: choose,
    });
    draw();
  };

  const write = async () => {
    c.state.wishText = picked;
    let fast = false;
    c.hud.sheet({
      body: '<canvas id="ink" class="ink-pad" width="760" height="230"></canvas>',
      actions: [{ label: '写快一点', on: () => { fast = true; } }],
    });
    const cv = document.getElementById('ink');
    const g = cv.getContext('2d');
    const chars = [...picked];
    const size = Math.min(112, 700 / chars.length);
    const y = 140;

    c.sfx.play('BRUSH', { gain: 0.5 });
    await wait(0.4);
    g.font = `${size}px ${getComputedStyle(document.body).getPropertyValue('--serif')}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';

    for (const [ci, ch] of chars.entries()) {
      const cx = (760 / chars.length) * (ci + 0.5);
      for (let s = 0; s < 4 && !fast; s++) {
        g.save();
        g.beginPath();
        const d = size * 1.25 * ((s + 1) / 4);
        g.rect(cx - size * 0.63, y - size * 0.63, d, d);
        g.clip();
        g.fillStyle = '#1c1a17';
        g.fillText(ch, cx, y);
        g.restore();
        c.sfx.play('BRUSH');
        await wait(0.13);
      }
      if (fast) break;
    }
    await tween(0.8, (t) => {
      g.clearRect(0, 0, 760, 230);
      g.fillStyle = mix('#1c1a17', '#d3aa63', t);
      chars.forEach((ch, ci) => g.fillText(ch, (760 / chars.length) * (ci + 0.5), y));
    });
    c.sfx.play('SUCCESS', { gain: 0.6 });
    await wait(0.7);
    poster();
  };

  const poster = () => {
    if (!c.state.posterNo) c.state.posterNo = makePosterNo();
    const url = drawPoster(c);
    c.state.modulesDone = { ...c.state.modulesDone, M3: true };
    c.sfx.play('SUCCESS');
    c.hud.sheet({
      body: `<img class="poster" src="${url}" alt="写着「${c.state.wishText}」的灯笼海报">`,
      actions: [
        { label: '回去', on: close },
        { label: '换一句', ico: 'refresh', on: choose },
        {
          label: '存下来', kind: 'primary', ico: 'save',
          href: url, download: `榫卯灯笼-${c.state.posterNo}.png`,
        },
      ],
      onEsc: close,
    });
  };

  choose();
  return close;
}

/** 竖版海报：标题 + 当前画面 + 纹样脚线 + 心愿 + 编号 */
function drawPoster(c) {
  const W = 1080, H = 1920;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const serif = getComputedStyle(document.body).getPropertyValue('--serif');

  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#171310'); grd.addColorStop(0.55, '#0b0907'); grd.addColorStop(1, '#120e0a');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);

  g.textAlign = 'center';
  g.fillStyle = '#f2ece0';
  g.font = `72px ${serif}`;
  g.fillText('我做了一盏灯', W / 2, 180);
  g.font = '24px sans-serif';
  g.fillStyle = 'rgba(242,236,224,.42)';
  g.fillText('榫卯灯笼 · 国风流光', W / 2, 234);

  const shot = c.stage.renderer.domElement;
  const dw = W * 0.88, dh = dw * (shot.height / shot.width);
  g.drawImage(shot, 0, 0, shot.width, shot.height, (W - dw) / 2, 320, dw, dh);

  const tex = buildPatternTexture(c.state.patternId, 512);
  g.globalAlpha = 0.13;
  for (let x = 0; x < W; x += 190) g.drawImage(tex.image, x, H - 440, 190, 190);
  g.globalAlpha = 1;
  tex.dispose();

  g.fillStyle = '#d3aa63';
  g.font = `86px ${serif}`;
  g.fillText(c.state.wishText, W / 2, H - 250);

  g.font = '22px monospace';
  g.fillStyle = 'rgba(242,236,224,.36)';
  g.textAlign = 'left';
  g.fillText(c.state.posterNo, 72, H - 62);
  g.textAlign = 'right';
  g.fillText('13 根木条 · 0 颗钉子', W - 72, H - 62);

  return cv.toDataURL('image/png');
}

function mix(a, b, k) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
  const m = (x, y) => Math.round(x + (y - x) * k);
  return `rgb(${m(r1, r2)},${m(g1, g2)},${m(b1, b2)})`;
}

// ══════════════════════════════════════════════════════════
// 挂起来
// ══════════════════════════════════════════════════════════
export function openM4(c, onExit) {
  junk.scene = c.stage.scene;
  junk.clear();
  c.bgm.stop();
  c.stage.setMood('night');
  junk.add(buildNightSky(c.stage.scene));

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(2600, 40, 24),
    new THREE.MeshBasicMaterial({ map: panorama(c.state.lit), side: THREE.BackSide }),
  );
  c.stage.scene.add(sky);
  junk.add(sky);

  const placed = [];
  c.stage.setRecommended({ az: 60, el: 6, dist: 540, target: V(0, 0, 96), fit: FIT_LANTERN });
  c.stage.snapToRecommended();

  const close = () => { junk.clear(); c.hud.hideOverlay(); c.voice.stop(); onExit?.(); };

  const hang = () => {
    if (placed.length >= 6) { c.hud.toast('最多挂六盏 —— 想换位置，先收起来'); return; }
    const clone = c.lantern.root.clone(true);
    const th = Math.random() * Math.PI * 2;
    const r = 280 + Math.random() * 440;
    clone.position.set(Math.cos(th) * r, Math.sin(th) * r, 40 + Math.random() * 280);
    clone.scale.setScalar(0.7 + Math.random() * 0.5);
    clone.userData.phase = Math.random() * 6;
    c.stage.scene.add(clone);
    placed.push(clone);
    junk.add(clone);
    c.sfx.play('WOOD_TAP', { pitch: placed.length * 1.5 });
    draw();
  };

  const shoot = () => {
    c.sfx.play('SHUTTER');
    c.stage.composer.render();
    const link = document.createElement('a');
    link.href = c.stage.renderer.domElement.toDataURL('image/png');
    link.download = '榫卯灯笼.png';
    link.click();
    c.hud.toast('存下来了', { gold: true });
  };

  const takeDown = () => {
    for (const p of placed) c.stage.scene.remove(p);
    placed.length = 0;
    draw();
  };

  const draw = () => c.hud.dock({
    actions: [
      { label: `挂一盏 ${placed.length}/6`, kind: 'primary', ico: 'plus', on: hang },
      { label: '拍下来', ico: 'camera', on: shoot },
      { label: '收起来', ico: 'refresh', on: takeDown },
      { label: '回去', ico: 'back', on: close },
    ],
    hint: '转动画面找个位置，再挂一盏上去',
  });

  const upd = (dt, t) => {
    for (const p of placed) p.rotation.z = Math.sin(t * 0.6 + p.userData.phase) * 0.06;
    void dt;
  };
  c.stage.updaters.add(upd);
  junk.add({ dispose: () => c.stage.updaters.delete(upd) });

  draw();
  c.state.modulesDone = { ...c.state.modulesDone, M4: true };
  playVO(c, 'M4');

  return close;
}

/** 程序化的远景：白天的院子 / 夜里的街 */
function panorama(night) {
  const cv = document.createElement('canvas');
  cv.width = 2048; cv.height = 1024;
  const g = cv.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 1024);
  if (night) { sky.addColorStop(0, '#05070e'); sky.addColorStop(0.55, '#121828'); sky.addColorStop(1, '#0a0906'); }
  else { sky.addColorStop(0, '#8fa9c4'); sky.addColorStop(0.55, '#cfd6cf'); sky.addColorStop(1, '#6b5a44'); }
  g.fillStyle = sky; g.fillRect(0, 0, 2048, 1024);
  g.fillStyle = night ? '#04060a' : '#4a3b2c';
  for (let x = 0; x < 2048; x += 128) {
    const h = 120 + Math.sin(x * 0.013) * 60;
    g.beginPath();
    g.moveTo(x - 20, 700); g.lineTo(x + 64, 700 - h); g.lineTo(x + 148, 700);
    g.closePath(); g.fill();
    g.fillRect(x + 10, 700, 108, 324);
  }
  if (night) {
    g.fillStyle = 'rgba(255,160,80,.45)';
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
// 放烟花
//   炸开之后过 0.25 秒才响 —— 声音跑得比光慢。
//   这一条比任何粒子特效都更能让人觉得「是真的」。
// ══════════════════════════════════════════════════════════
const SOUND_LAG = 0.25;

export function openM5(c, onExit) {
  junk.scene = c.stage.scene;
  junk.clear();
  c.stage.setMood('night');
  c.bgm.play('BGM_C_FINALE');
  junk.add(buildNightSky(c.stage.scene));
  // 烟花在天上，但灯笼不能因此被切掉半截 —— 目标点压低到两者都装得下的位置
  c.stage.setRecommended({ az: 60, el: 14, dist: 900, target: V(0, 0, 300), fit: { r: 150, h: 300 } });
  c.stage.snapToRecommended();

  let count = 0;
  const COLORS = [0xffd166, 0xff5f6d, 0x7ee8fa, 0xffa3d1, 0xc8ffb0, 0xffe9a8];

  const launch = (type, sx, sy) => {
    const at = new THREE.Vector3(sx, 240 + Math.random() * 160, 380 + sy);
    const color = new THREE.Color(COLORS[Math.floor(Math.random() * COLORS.length)]);
    c.sfx.play('FIREWORK_LAUNCH', { pitch: (Math.random() - 0.5) * 4 });
    tween(0.6 + Math.random() * 0.3, (k) => {
      if (k > 0.98) return;
      c.fx.fireworks.parts.push({
        x: at.x, y: at.y, z: 30 + (at.z - 30) * k,
        vx: 0, vy: 0, vz: 0, r: 1, g: 0.75, b: 0.4, life: 0.35, age: 0, drag: 0.8,
      });
    }, { ease: Ease.outQuad, onDone: () => {
      c.fx.fireworks.burst(type, at, color);
      count++;
      c.sfx.play('FIREWORK_BURST', { delay: SOUND_LAG, pitch: type === 'fu' ? -3 : 0 });
      c.sfx.play('FIREWORK_CRACKLE', { delay: SOUND_LAG + 0.15, gain: 0.7 });
      // 每一发都照一下灯笼，颜色取自这一发 —— 否则烟花和灯笼像两张贴在一起的图
      const base = c.state.lit ? 1 : 0;
      tween(0.3, (k) => {
        const pulse = Math.sin(k * Math.PI) * 0.55;
        c.lantern.innerLight.color.lerpColors(new THREE.Color(0xffa54f), color, pulse * 0.6);
        c.lantern.setLit(base + pulse * (base ? 0.35 : 0.28));
      }, { onDone: () => { c.lantern.setLit(base); c.lantern.innerLight.color.setHex(0xffa54f); } });
      if (type === 'fu') playVO(c, 'M5-fu');
      if (count === 12) c.hud.toast('放了十二发了 —— 压轴的那串在下面', { gold: true });
    } });
  };

  let down = null, path = [];
  const canvas = c.stage.canvas;
  const onDown = (e) => {
    if (e.target.closest('.dock, .sheet')) return;
    down = { t: performance.now(), x: e.clientX, y: e.clientY };
    path = [[e.clientX, e.clientY]];
  };
  const onMove = (e) => { if (down) path.push([e.clientX, e.clientY]); };
  const onUp = (e) => {
    if (!down) return;
    const dt = (performance.now() - down.t) / 1000;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    let type = 'peony';
    if (dt > 1.0 && Math.hypot(dx, dy) < 40) type = 'fu';
    else if (isCircle(path)) type = 'ring';
    else if (dy < -70 && Math.abs(dx) < Math.abs(dy)) type = 'willow';
    else if (e.shiftKey) type = 'double';
    const x = ((down.x / innerWidth) - 0.5) * 900;
    const y = -((down.y / innerHeight) - 0.5) * 260;
    launch(type, x, y);
    if (type === 'double') setTimeout(() => launch('peony', x + 120, 40), 400);
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

  const close = () => {
    c.fx.fireworks.clear();
    junk.clear();
    c.hud.hideOverlay();
    c.voice.stop();
    onExit?.();
  };

  const finale = async () => {
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
    c.stage.setRecommended({ az: 55, el: 8, dist: 360, target: V(0, 0, 96), ease: 0.35, fit: FIT_LANTERN });
    playVO(c, 'M5-outro');
    await wait(7.5);
    c.hud.sheet({
      body: `<div class="finale">
        <div class="ln">13 根木条</div><div class="ln">0 颗钉子</div><div class="ln">7000 年</div>
      </div>`,
      actions: [{ label: '回去', kind: 'primary', on: close }],
      onEsc: close,
      onMount: (o) => {
        o.querySelectorAll('.ln').forEach((el, i) => {
          el.style.opacity = 0;
          setTimeout(() => tween(0.7, (k) => { el.style.opacity = k; }), i * 900);
        });
      },
    });
  };

  c.hud.dock({
    actions: [
      { label: '放一串压轴', kind: 'quiet', ico: 'spark', on: finale },
      { label: '回去', ico: 'back', on: close },
    ],
    hint: '点一下、往上划、画个圈、长按松手 —— 四种不一样的花',
  });
  playVO(c, 'M5');

  return close;
}

/** 画圆判定：首尾接近，累计转角接近一整圈 */
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
