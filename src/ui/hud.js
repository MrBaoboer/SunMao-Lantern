/**
 * §12.5 UI 组件清单 + 排版纪律
 *   字幕单行 ≤ 18 字；提示文案单行 ≤ 14 字；尺寸标注一律「模数倍数（毫米）」双写。
 *
 * 静默点（S08 / S30）通过 quiet() 整体降 UI —— 这是导演红线的实现点：
 * 「任何『填满』的冲动都会毁掉它」。
 */

import * as THREE from 'three';

const $ = (id) => document.getElementById(id);

/** §1.1 三幕四段 → 顶部 5 段进度条（§12.5 段名） */
export const PHASES = [
  { id: 0, name: '起兴' },
  { id: 1, name: '明理' },
  { id: 2, name: '下枨框' },
  { id: 3, name: '上枨框与立柱' },
  { id: 4, name: '装点年味' },
];

export class HUD {
  constructor(state) {
    this.state = state;
    this.el = {
      topbar: $('topbar'), progress: $('progress'), steptitle: $('steptitle'),
      slots: $('slots'), counter: $('counter'), cards: $('cards'), toast: $('toast'),
      bottom: $('bottom'), hint: $('hint'), subtitle: $('subtitle'),
      actions: $('actions'), next: $('btn-next'), back: $('btn-back'),
      overlay: $('overlay'),
      sound: $('btn-sound'), cc: $('btn-cc'), inspect: $('btn-inspect'), verify: $('btn-verify'),
    };
    this.hotspots = [];
    this.#buildProgress();
    this.#bindToggles();
    this._toastTimer = null;
  }

  #buildProgress() {
    this.el.progress.innerHTML = PHASES
      .map((p) => `<div class="seg" data-phase="${p.id}" title="${p.name}"><i></i></div>`).join('');
  }

  #bindToggles() {
    const bind = (btn, key, onChange) => {
      const sync = () => btn.dataset.on = this.state[key] ? '1' : '0';
      btn.addEventListener('click', () => {
        this.state[key] = !this.state[key];
        sync();
        onChange?.(this.state[key]);
      });
      sync();
    };
    this.onSoundToggle = null;
    bind(this.el.sound, 'sound', (v) => this.onSoundToggle?.(v));
    bind(this.el.cc, 'captions', (v) => { if (!v) this.setSubtitle(''); });
    this.el.inspect.addEventListener('click', () => this.onInspect?.());
    this.el.verify.addEventListener('click', () => this.onVerify?.());
    this.el.next.addEventListener('click', () => this.onNext?.());
    this.el.back.addEventListener('click', () => this.onBack?.());
  }

  // ── 顶部 ──────────────────────────────────────────
  setPhase(phase, ratio = 0) {
    [...this.el.progress.children].forEach((seg, i) => {
      const done = i < phase;
      seg.classList.toggle('active', i === phase);
      seg.querySelector('i').style.width = done ? '100%' : i === phase ? `${ratio * 100}%` : '0%';
    });
  }

  setTitle(id, title) {
    this.el.steptitle.innerHTML = id ? `<b>${id}</b>${title || ''}` : '';
  }

  // ── 字幕 / 提示 ───────────────────────────────────
  setSubtitle(text, { lyric = false } = {}) {
    const e = this.el.subtitle;
    if (!this.state.captions) { e.textContent = ''; return; }
    e.dataset.lyric = lyric ? '1' : '0';
    e.textContent = text || '';
  }

  setHint(text, { pulse = false } = {}) {
    this.el.hint.textContent = text || '';
    this.el.hint.classList.toggle('pulse', !!pulse && !!text);
  }

  toast(text, { type = 'ok', dur = 2000 } = {}) {
    clearTimeout(this._toastTimer);
    const e = this.el.toast;
    e.hidden = false;
    e.className = `toast ${type}`;
    e.innerHTML = text;
    // 重播入场动画
    e.style.animation = 'none';
    void e.offsetWidth;
    e.style.animation = '';
    this._toastTimer = setTimeout(() => { e.hidden = true; }, dur);
  }

  setCounter(text) {
    this.el.counter.hidden = !text;
    this.el.counter.textContent = text || '';
  }

  // ── 卡片 ──────────────────────────────────────────
  /**
   * @param {Array<{title?:string, tag?:string, rows?:Array<[string,string]>,
   *   note?:string, warn?:string|string[], danger?:string,
   *   cols?:[string,string], fold?:boolean, html?:string}>} cards
   */
  setCards(cards) {
    const box = this.el.cards;
    if (!cards || !cards.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.innerHTML = cards.map((c) => {
      const rows = (c.rows || []).map(([k, v]) => `<div class="row"><span>${k}</span><b>${v}</b></div>`).join('');
      const warns = [].concat(c.warn || []).filter(Boolean)
        .map((w) => `<div class="warn">⚠ ${w}</div>`).join('');
      const danger = c.danger ? `<div class="danger">${c.danger}</div>` : '';
      const cols = c.cols
        ? `<div class="cols"><div>${c.cols[0]}</div><div>${c.cols[1]}</div></div>` : '';
      const note = c.note ? `<p>${c.note}</p>` : '';
      const head = c.title
        ? `<h4 class="${c.fold ? 'foldhead' : ''}">${c.title}${c.tag ? `<span class="tag">${c.tag}</span>` : ''}</h4>`
        : '';
      return `<div class="card ${c.fold ? 'folded' : ''}">${head}
        <div class="foldbody">${c.html || ''}${rows}${cols}${note}${warns}${danger}</div></div>`;
    }).join('');
    box.querySelectorAll('.foldhead').forEach((h) => {
      h.addEventListener('click', () => h.closest('.card').classList.toggle('folded'));
    });
  }

  // ── 已掌握榫型槽位（知识回查入口）──────────────────
  setSlots(items) {
    const box = this.el.slots;
    if (!items || !items.length) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = items.map((s, i) =>
      `<div class="slot ${s.filled ? 'filled' : ''}" data-i="${i}" title="${s.tip || ''}">${s.label}</div>`).join('');
    box.querySelectorAll('.slot').forEach((el) => {
      el.addEventListener('click', () => {
        const it = items[+el.dataset.i];
        if (it.filled) it.onClick?.();
      });
    });
  }

  // ── 底部按钮 ──────────────────────────────────────
  setActions(actions) {
    const box = this.el.actions;
    box.innerHTML = '';
    for (const a of actions || []) {
      const b = document.createElement('button');
      b.className = a.kind === 'main' ? 'main-btn' : a.kind === 'alt' ? 'alt-btn' : 'ghost-btn';
      b.textContent = a.label;
      b.disabled = !!a.disabled;
      b.addEventListener('click', () => a.onClick?.(b));
      box.appendChild(b);
    }
  }

  setNext({ label = '继续 ▸', enabled = true, hidden = false } = {}) {
    this.el.next.textContent = label;
    this.el.next.disabled = !enabled;
    this.el.next.style.display = hidden ? 'none' : '';
  }

  setBack({ enabled = true, hidden = false } = {}) {
    this.el.back.disabled = !enabled;
    this.el.back.style.display = hidden ? 'none' : '';
  }

  /** 静默点清屏（导演红线）：隐藏进度条、按钮、提示，仅留极淡的退出角标 */
  quiet(on) {
    this.el.topbar.dataset.quiet = on ? '1' : '0';
    this.el.bottom.dataset.quiet = on ? '1' : '0';
    if (on) { this.setCards([]); this.setCounter(''); this.clearHotspots(); }
  }

  // ── 3D 锚定热点（引线式标注，须避让模型不穿模）──────
  addHotspot({ pos, label, sub, badge = '', color = 'var(--tenon)', onClick, active = false }) {
    const el = document.createElement('button');
    el.className = 'hotspot';
    el.textContent = badge;
    el.style.borderColor = color;
    el.style.color = color;
    if (active) el.classList.add('on');
    const lb = document.createElement('div');
    lb.className = 'hslabel';
    lb.innerHTML = `${label}${sub ? `<small>${sub}</small>` : ''}`;
    lb.style.display = active ? '' : 'none';
    document.body.append(el, lb);
    const h = { el, lb, pos: pos.clone(), onClick, active };
    el.addEventListener('click', () => {
      h.active = !h.active;
      el.classList.toggle('on', h.active);
      lb.style.display = h.active ? '' : 'none';
      onClick?.(h.active, h);
    });
    this.hotspots.push(h);
    return h;
  }

  clearHotspots() {
    for (const h of this.hotspots) { h.el.remove(); h.lb.remove(); }
    this.hotspots = [];
  }

  /** 每帧把 3D 锚点投影到屏幕 */
  updateHotspots(camera) {
    if (!this.hotspots.length) return;
    const v = new THREE.Vector3();
    const w = innerWidth, hgt = innerHeight;
    for (const h of this.hotspots) {
      v.copy(h.pos).project(camera);
      const behind = v.z > 1;
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * hgt;
      h.el.style.display = behind ? 'none' : '';
      h.lb.style.display = behind || !h.active ? 'none' : '';
      h.el.style.left = `${x}px`; h.el.style.top = `${y}px`;
      h.lb.style.left = `${x + 18}px`; h.lb.style.top = `${y}px`;
    }
  }

  // ── 覆盖层（模块 / 枢纽 / 海报）─────────────────────
  showOverlay(html, { solid = true, onMount } = {}) {
    const o = this.el.overlay;
    o.hidden = false;
    o.className = `overlay ${solid ? 'solid' : 'clear'}`;
    o.innerHTML = html;
    onMount?.(o);
    return o;
  }

  hideOverlay() {
    this.el.overlay.hidden = true;
    this.el.overlay.innerHTML = '';
  }

  get overlayVisible() { return !this.el.overlay.hidden; }

  showBottom(v) { this.el.bottom.hidden = !v; }
  showTop(v) { this.el.topbar.hidden = !v; }
}

/** 引导箭头（S25 地面轨道 / S27 三段轨迹）—— 须在首次触碰前显示 */
export class GuideArrows {
  constructor() { this.items = []; }
  set(list) {
    this.clear();
    for (const it of list) {
      const el = document.createElement('div');
      el.className = 'guide-arrow';
      el.textContent = it.glyph || '➜';
      el.style.transform = `translate(-50%,-50%) rotate(${it.rot || 0}deg)`;
      document.body.appendChild(el);
      this.items.push({ el, pos: it.pos.clone(), rot: it.rot || 0 });
    }
  }
  clear() { for (const i of this.items) i.el.remove(); this.items = []; }
  update(camera) {
    if (!this.items.length) return;
    const v = new THREE.Vector3();
    for (const it of this.items) {
      v.copy(it.pos).project(camera);
      const behind = v.z > 1;
      it.el.style.display = behind ? 'none' : '';
      it.el.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`;
      it.el.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`;
    }
  }
}
