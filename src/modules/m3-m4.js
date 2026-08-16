/**
 * 写心愿 · 挂起来
 */

import * as THREE from 'three';
import { V, Junk, buildNightSky, AIM_LANTERN, FIT_LANTERN } from '../steps/util.js';
import { playVO } from './vo.js';
import { buildPatternTexture } from '../render/lattice.js';
import { makePosterNo } from '../core/state.js';
import { tween, wait, reducedMotion } from '../util/tween.js';

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
/*
 * 四组词任意搭配都得读得通。
 *
 * 原先第二组是「身体 / 事业 / 学业 / 生活」，第三组是「平平安安 / 顺顺利利 /
 * 红红火火 / 长长久久」—— 交叉起来会凑出「愿自己身体红红火火」这种句子。
 * 现在第二组换成整句，四组之间只用逗号相连，任何一种组合都成话。
 */
const COMBO = [
  { k: '给谁', v: ['家人', '朋友', '自己', '大家'] },
  { k: '愿什么', v: ['身体康健', '事事顺遂', '学业进步', '日子红火'] },
  { k: '再添一句', v: ['平平安安', '顺顺利利', '长长久久', '岁岁如今朝'] },
  { k: '收个尾', v: ['新年快乐', '万事胜意', '福气满满', '喜乐无忧'] },
];

export function openM3(c, onExit) {
  junk.scene = c.stage.scene;
  junk.clear();
  c.stage.setMood('night');
  c.bgm.play('BGM_C_WISH');
  junk.add(buildNightSky(c.stage.scene));
  c.stage.setRecommended({ az: 52, el: 8, dist: 330, target: V(...AIM_LANTERN), fit: FIT_LANTERN });
  c.stage.snapToRecommended();

  let picked = c.state.wishText || '';
  let closed = false;
  const close = () => {
    closed = true; junk.clear(); c.hud.setBack(null); c.hud.hideOverlay(); c.voice.stop(); onExit?.();
  };
  c.hud.setBack(close);
  const phrase = (s) =>
    `愿${COMBO[0].v[s[0]]}${COMBO[1].v[s[1]]}，${COMBO[2].v[s[2]]}，${COMBO[3].v[s[3]]}`;

  const choose = () => {
    c.hud.sheet({
      title: '写一句话',
      lede: '从前过年，人们把心愿写在灯上。灯亮着，愿望就亮着。',
      body: `<div class="wishes">${WISHES.map((w) => `
        <button class="wish" type="button" data-w="${w}"
                aria-pressed="${w === picked}">${w}</button>`).join('')}</div>`,
      actions: [
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
      label: '正在写这句话',
      body: '<canvas id="ink" class="ink-pad" width="760" height="230"></canvas>',
      actions: [{ label: '写快一点', on: () => { fast = true; } }],
      onEsc: close,
    });
    const cv = document.getElementById('ink');
    const g = cv.getContext('2d');
    const chars = [...picked];
    const size = Math.min(112, 700 / chars.length);
    const y = 140;
    // 墨色跟着纸走。写死的 #1c1a17 压在夜色场景的深底上是 1.06:1 ——
    // 整段落笔看不见，只在最后描金那一下字才凭空冒出来
    const css = getComputedStyle(document.body);
    const ink = css.getPropertyValue('--slip-ink').trim() || '#241e15';
    const gold = css.getPropertyValue('--slip-mark').trim() || '#8a5a1e';

    c.sfx.play('BRUSH', { gain: 0.5 });
    await wait(0.4);
    g.font = `${size}px ${css.getPropertyValue('--serif')}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';

    // closed 守卫要贯穿整条链：中途按返回，笔声不该继续泼在四门页上
    for (const [ci, ch] of chars.entries()) {
      if (closed) return;
      const cx = (760 / chars.length) * (ci + 0.5);
      for (let s = 0; s < 4 && !fast && !closed; s++) {
        g.save();
        g.beginPath();
        const d = size * 1.25 * ((s + 1) / 4);
        g.rect(cx - size * 0.63, y - size * 0.63, d, d);
        g.clip();
        g.fillStyle = ink;
        g.fillText(ch, cx, y);
        g.restore();
        c.sfx.play('BRUSH');
        await wait(0.13);
      }
      if (fast) break;
    }
    if (closed) return;
    await tween(0.8, (t) => {
      g.clearRect(0, 0, 760, 230);
      g.fillStyle = mix(ink, gold, t);
      chars.forEach((ch, ci) => g.fillText(ch, (760 / chars.length) * (ci + 0.5), y));
    });
    if (closed) return;                 // 描金那 0.8 秒里按了返回，这一记就会落在四门页上
    c.sfx.play('SUCCESS', { gain: 0.6 });
    await wait(0.7);
    if (closed) return;
    poster();
  };

  const poster = () => {
    if (!c.state.posterNo) c.state.posterNo = makePosterNo();
    const url = drawPoster(c);
    c.state.modulesDone = { ...c.state.modulesDone, M3: true };
    c.sfx.play('SUCCESS');
    c.hud.sheet({
      label: '写好的海报',
      body: `<img class="poster" src="${url}" alt="写着「${c.state.wishText}」的灯笼海报">`,
      actions: [
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

  // 画布默认不保留绘制缓冲（preserveDrawingBuffer=false），
  // 必须先同步渲染一帧再取图 —— 否则从定时器进来时截到的是空白
  if (c.stage.bloomEnabled) c.stage.composer.render();
  else c.stage.renderer.render(c.stage.scene, c.stage.camera);

  g.textAlign = 'center';
  g.fillStyle = '#f2ece0';
  g.font = `72px ${serif}`;
  g.fillText('我做了一盏灯', W / 2, 180);
  g.font = '24px sans-serif';
  g.fillStyle = 'rgba(242,236,224,.42)';
  g.fillText('榫卯灯笼 · 国风流光', W / 2, 234);

  // 画框是竖的，只取灯笼所在的那一块。整幅贴进来的话，1440×900 会摊成一条 950×594 的
  // 横条：灯笼缩在正中一小块，两侧全是空背景，画框下面还空掉五百多像素。
  const shot = c.stage.renderer.domElement;
  const SLOT_Y = 320, SLOT_W = W * 0.88, SLOT_H = 1120;
  const box = subjectRect(c, shot);
  let sw = box.w, sh = box.h;
  if (sw / sh > SLOT_W / SLOT_H) sh = sw * SLOT_H / SLOT_W;   // 补到画框比例，只往外让
  else sw = sh * SLOT_W / SLOT_H;
  // 超出画布时两边同比收，分开钳会把刚补好的比例又拉歪 —— 结果还是一条横的
  const k = Math.min(1, shot.width / sw, shot.height / sh);
  sw *= k; sh *= k;
  const clamp = (v, hi) => Math.max(0, Math.min(v, hi));
  const sx = clamp(box.cx - sw / 2, shot.width - sw);
  const sy = clamp(box.cy - sh / 2, shot.height - sh);
  let dw = SLOT_W, dh = dw * (sh / sw);
  if (dh > SLOT_H) { dh = SLOT_H; dw = dh * (sw / sh); }
  g.drawImage(shot, sx, sy, sw, sh, (W - dw) / 2, SLOT_Y + (SLOT_H - dh) / 2, dw, dh);

  // 纹样脚线：整幅正好铺满六格（1080 / 6 = 180）。190 除不尽，右缘会切掉大半格。
  // 位置也让开心愿那一行 —— 整张海报最该看清的就是那一句，不该垫着一层棂条
  const TILE = W / 6;
  const tex = buildPatternTexture(c.state.patternId, 512);
  g.globalAlpha = 0.13;
  for (let i = 0; i < 6; i++) g.drawImage(tex.image, i * TILE, H - 450, TILE, TILE);
  g.globalAlpha = 1;
  tex.dispose();

  // 字号跟着字数缩。「自己凑一句」拼出来是十七个字，固定 86px 有一千四百多宽，
  // 而画布只有一千零八十 —— 两头都会被切掉
  const wish = [...c.state.wishText];
  g.fillStyle = '#d3aa63';
  g.font = `${Math.min(86, Math.floor((W - 160) / Math.max(1, wish.length)))}px ${serif}`;
  g.fillText(c.state.wishText, W / 2, H - 150);

  g.font = '22px monospace';
  g.fillStyle = 'rgba(242,236,224,.36)';
  g.textAlign = 'left';
  g.fillText(c.state.posterNo, 72, H - 62);
  g.textAlign = 'right';
  g.fillText('13 根木条 · 0 颗钉子', W - 72, H - 62);

  return cv.toDataURL('image/png');
}

/**
 * 灯笼在当前画面里的落点（画布像素，四周留两成）。
 * 取景是按 fit 反算的，同一盏灯在 1440×900 与 390×844 上占的比例并不一样，
 * 所以裁切范围要现测，不能按画幅写死。
 */
function subjectRect(c, cv) {
  const box = new THREE.Box3().setFromObject(c.lantern.root);
  const p = new THREE.Vector3();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    p.project(c.stage.camera);
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  return {
    cx: (0.5 + (x0 + x1) / 4) * cv.width,
    cy: (0.5 - (y0 + y1) / 4) * cv.height,
    w: (x1 - x0) * 0.6 * cv.width,
    h: (y1 - y0) * 0.6 * cv.height,
  };
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

  // 天球的极轴必须转到 +Z。SphereGeometry 的两极天生在 ±Y，而本项目是 Z 轴向上
  // （stage.js 改了 DEFAULT_UP）—— 不转这一下，整张远景是**竖着**贴上去的：
  // 地平线立起来，屋脊从侧面一个点呈放射状散开，读出来是几片米色的楔子。
  const skyGeo = new THREE.SphereGeometry(2600, 40, 24);
  skyGeo.rotateX(Math.PI / 2);
  const sky = new THREE.Mesh(
    skyGeo,
    // 低配档把天球减半：2048×1024 一张 8 MB，而它只是远处一排屋脊剪影
    new THREE.MeshBasicMaterial({ map: panorama(c.tier === 'low' ? 1024 : 2048), side: THREE.BackSide }),
  );
  c.stage.scene.add(sky);
  junk.add(sky);

  const placed = [];
  c.stage.setRecommended({ az: 60, el: 6, dist: 540, target: V(...AIM_LANTERN), fit: FIT_LANTERN });
  c.stage.snapToRecommended();

  const close = () => {
    junk.clear(); c.hud.setBack(null); c.hud.hideOverlay(); c.voice.stop(); onExit?.();
  };
  c.hud.setBack(close);

  const hang = () => {
    if (placed.length >= 6) { c.hud.toast('已经挂满六盏了。按「收起来」清空，再重新挂'); return; }
    const clone = c.lantern.root.clone(true);
    // root 底下挂着内光与纹样聚光灯，clone(true) 会把它们一并复制。
    // 挂六盏就是多出六组光源：总辐照远超 stage.js 定下的曝光上限，画面糊成一片奶白；
    // 灯数一变还会让全场材质重新编译着色器，每点一次都卡一下。
    // 远处的挂灯本来也不需要真光源 —— 纸面的自发光是材质上的，克隆体照样继承。
    const lights = [];
    clone.traverse((o) => { if (o.isLight) lights.push(o); });
    for (const l of lights) l.removeFromParent();
    // 挂在镜头正对的方向附近（±30°）—— 文案承诺「转一转视角，找个位置」，
    // 全随机方位会把灯挂到镜头背后去
    const cam = c.stage.camera.position;
    const th = Math.atan2(cam.y, cam.x) + Math.PI + (Math.random() - 0.5) * 1.1;
    const r = 280 + Math.random() * 440;
    clone.position.set(Math.cos(th) * r, Math.sin(th) * r, 40 + Math.random() * 280);
    clone.scale.setScalar(0.7 + Math.random() * 0.5);
    clone.userData.phase = Math.random() * 6;
    c.stage.scene.add(clone);
    placed.push(clone);
    c.sfx.play('WOOD_TAP', { pitch: placed.length * 1.5 });
    // 挂上第一盏才算做过这件事 —— 原先一进门就盖章，四门页上会凭空多一枚印，
    // 片尾也可能在人还没动手时就冒出来
    c.state.modulesDone = { ...c.state.modulesDone, M4: true };
    draw();
  };

  const shoot = () => {
    c.sfx.play('SHUTTER');
    // 与屏幕上看到的那一帧走同一条管线：低配档没有后处理，
    // 走 composer 会拍出一张和画面不一样的图
    if (c.stage.bloomEnabled) c.stage.composer.render();
    else c.stage.renderer.render(c.stage.scene, c.stage.camera);
    const link = document.createElement('a');
    link.href = c.stage.renderer.domElement.toDataURL('image/png');
    link.download = '榫卯灯笼.png';
    // 必须先进文档再点。Firefox 不给游离节点上的 download 触发下载 ——
    // 而 Firefox 113 在声明的浏览器基线之内（docs/DEVELOPMENT.md#环境）
    document.body.appendChild(link);
    link.click();
    link.remove();
    c.hud.toast('这一张已经存下来了', { gold: true });
  };

  const takeDown = () => {
    if (!placed.length) { c.hud.toast('还没挂上去过'); return; }
    for (const p of placed) c.stage.scene.remove(p);
    placed.length = 0;
    c.sfx.play('WOOD_SLIDE', { gain: 0.4 });
    draw();
  };

  const draw = () => c.hud.dock({
    actions: [
      { label: `挂一盏 ${placed.length}/6`, kind: 'primary', ico: 'plus', on: hang },
      { label: '拍下来', ico: 'camera', on: shoot },
      { label: '全部收起', ico: 'refresh', on: takeDown, disabled: !placed.length },
    ],
    hint: '转动画面找个位置，再挂一盏上去',
  });

  const sway = reducedMotion() ? 0 : 0.06;
  const upd = (dt, t) => {
    for (const p of placed) p.rotation.z = Math.sin(t * 0.6 + p.userData.phase) * sway;
    void dt;
  };
  c.stage.updaters.add(upd);
  // 挂上去的那几盏由 placed 一份名单管到底 —— 每挂一盏就往 junk 里塞一个
  // 只认那一盏的清理器，「全部收起」之后名单空了，清理器还留着一堆废引用
  junk.add({ dispose: () => {
    c.stage.updaters.delete(upd);
    for (const p of placed) c.stage.scene.remove(p);
    placed.length = 0;
  } });

  draw();
  playVO(c, 'M4');

  return close;
}

/**
 * 程序化的远景：夜里的一条街。
 *
 * 只有夜景一种 —— 这一步 `setMood('night')` 是写死的，灯没点亮时却给一张白天的天空，
 * 于是暗调的布光配着亮蓝的天，两边对不上。挂灯笼本来也是夜里的事。
 */
function panorama(W = 2048) {
  const H = W / 2;
  const k = W / 2048;                    // 所有尺寸按宽度等比缩放
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#05070e'); sky.addColorStop(0.55, '#121828'); sky.addColorStop(1, '#0a0906');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  g.fillStyle = '#04060a';
  const ridge = 700 * k;
  for (let x = 0; x < W; x += 128 * k) {
    const h = (120 + Math.sin((x / k) * 0.013) * 60) * k;
    g.beginPath();
    g.moveTo(x - 20 * k, ridge); g.lineTo(x + 64 * k, ridge - h); g.lineTo(x + 148 * k, ridge);
    g.closePath(); g.fill();
    g.fillRect(x + 10 * k, ridge, 108 * k, H - ridge);
  }
  // 远处别人家的窗火
  g.fillStyle = 'rgba(255,160,80,.45)';
  for (let i = 0; i < 40; i++) {
    g.beginPath();
    g.arc(Math.random() * W, (620 + Math.random() * 200) * k, (3 + Math.random() * 5) * k, 0, 7);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
