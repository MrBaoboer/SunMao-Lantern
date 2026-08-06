/**
 * 界面层
 *
 * 只有四样东西会同时出现在屏幕上：进度、步骤名、旁白、一个主行动。
 * 其余全部按需出现、用完即走。
 */

import * as THREE from 'three';

const $ = (id) => document.getElementById(id);

/** 五个阶段 */
export const PHASES = ['起兴', '明理', '下枨框', '立起框架', '装点年味'];

export class HUD {
  constructor(state) {
    this.state = state;
    this.el = {
      topbar: $('topbar'), progress: $('progress'), steptitle: $('steptitle'),
      note: $('note'), toast: $('toast'),
      bottom: $('bottom'), hint: $('hint'), subtitle: $('subtitle'),
      alts: $('alts'), next: $('btn-next'), back: $('btn-back'),
      menu: $('btn-menu'), overlay: $('overlay'),
    };
    this.spots = [];
    this._toastTimer = null;
    this._menu = null;

    this.el.progress.innerHTML = PHASES.map((p) => `<div class="seg" title="${p}"><i></i></div>`).join('');
    this.el.next.addEventListener('click', () => this.onNext?.());
    this.el.back.addEventListener('click', () => this.onBack?.());
    this.el.menu.addEventListener('click', (e) => { e.stopPropagation(); this.toggleMenu(); });
  }

  // ── 顶部 ──
  setPhase(phase, ratio = 1) {
    [...this.el.progress.children].forEach((seg, i) => {
      seg.querySelector('i').style.width =
        i < phase ? '100%' : i === phase ? `${Math.round(ratio * 100)}%` : '0';
    });
  }

  setTitle(text) { this.el.steptitle.textContent = text || ''; }

  // ── 旁白与提示 ──
  setSubtitle(text, { lyric = false } = {}) {
    const e = this.el.subtitle;
    if (!this.state.captions) { e.textContent = ''; return; }
    e.dataset.lyric = lyric ? '1' : '0';
    e.textContent = text || '';
  }

  /** 一行提示。用 <em> 标出关键动作词 */
  setHint(html) { this.el.hint.innerHTML = html || ''; }

  toast(text, { gold = false, dur = 2400 } = {}) {
    clearTimeout(this._toastTimer);
    const e = this.el.toast;
    e.hidden = false;
    e.className = `toast${gold ? ' gold' : ''}`;
    e.textContent = text;
    e.style.animation = 'none'; void e.offsetWidth; e.style.animation = '';
    this._toastTimer = setTimeout(() => { e.hidden = true; }, dur);
  }

  // ── 便签：一次只有一张，只写值得写的 ──
  /**
   * @param {null | {title?:string, body?:string, num?:Array<[string,string]>, tiny?:string}} n
   */
  setNote(n) {
    const el = this.el.note;
    if (!n) { el.hidden = true; el.innerHTML = ''; return; }
    const nums = (n.num || [])
      .map(([k, v]) => `<p>${k}　<span class="num">${v}</span></p>`).join('');
    el.innerHTML = [
      n.title ? `<h4>${n.title}</h4>` : '',
      nums,
      n.body ? `<p>${n.body}</p>` : '',
      n.tiny ? `<div class="rule"></div><p class="tiny">${n.tiny}</p>` : '',
    ].join('');
    el.hidden = false;
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  }

  // ── 行动区 ──
  /** 次要行动：一律是无框文字按钮，最多两个 */
  setAlts(list) {
    const box = this.el.alts;
    box.innerHTML = '';
    for (const a of (list || []).slice(0, 2)) {
      const b = document.createElement('button');
      b.className = 'ghost';
      b.textContent = a.label;
      b.addEventListener('click', () => a.onClick?.(b));
      box.appendChild(b);
    }
  }

  /** 不传 label 就保留当前文字 —— 禁用按钮时不该把标题也一并冲掉 */
  setNext({ label, enabled = true, hidden = false } = {}) {
    if (label !== undefined) this.el.next.textContent = label;
    this.el.next.disabled = !enabled;
    this.el.next.style.display = hidden ? 'none' : '';
  }

  setBack({ enabled = true } = {}) { this.el.back.disabled = !enabled; }

  /** 静默：整层界面退场 */
  quiet(on) {
    this.el.topbar.dataset.quiet = on ? '1' : '0';
    this.el.bottom.dataset.quiet = on ? '1' : '0';
    if (on) { this.setNote(null); this.clearSpots(); }
  }

  // ── 设置菜单 ──
  toggleMenu() {
    if (this._menu) { this.closeMenu(); return; }
    const m = document.createElement('div');
    m.className = 'menu';
    const items = [
      { k: 'sound', label: '声音', get: () => this.state.sound, set: (v) => { this.state.sound = v; this.onSound?.(v); } },
      { k: 'captions', label: '字幕', get: () => this.state.captions, set: (v) => { this.state.captions = v; if (!v) this.setSubtitle(''); } },
      { k: 'voice', label: '旁白朗读', get: () => this.state.voice, set: (v) => { this.state.voice = v; } },
    ];
    m.innerHTML = items.map((it) =>
      `<button data-k="${it.k}" class="${it.get() ? 'on' : ''}">${it.label}<i>${it.get() ? '开' : '关'}</i></button>`).join('')
      + '<div class="sep"></div>'
      + '<button data-k="inspect">拆开看看<i>X</i></button>'
      + '<button data-k="check">尺寸对照<i></i></button>';
    document.body.appendChild(m);
    this._menu = m;
    m.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const it = items.find((x) => x.k === b.dataset.k);
      if (it) {
        const v = !it.get();
        it.set(v);
        b.classList.toggle('on', v);
        b.querySelector('i').textContent = v ? '开' : '关';
        return;
      }
      this.closeMenu();
      if (b.dataset.k === 'inspect') this.onInspect?.();
      if (b.dataset.k === 'check') this.onCheck?.();
    });
    this._away = () => this.closeMenu();
    setTimeout(() => addEventListener('pointerdown', this._away, { once: true }), 0);
  }

  closeMenu() {
    this._menu?.remove();
    this._menu = null;
    if (this._away) removeEventListener('pointerdown', this._away);
  }

  // ── 3D 锚定标注 ──
  addSpot({ pos, label, sub, badge = '', color = 'var(--gold)', onClick, active = false }) {
    const el = document.createElement('button');
    el.className = 'spot';
    el.textContent = badge;
    el.style.color = color;
    if (active) el.classList.add('on');
    const lb = document.createElement('div');
    lb.className = 'spot-label';
    lb.innerHTML = `${label}${sub ? `<small>${sub}</small>` : ''}`;
    lb.style.display = active ? '' : 'none';
    document.body.append(el, lb);
    const h = { el, lb, pos: pos.clone(), active };
    el.addEventListener('click', () => {
      h.active = !h.active;
      el.classList.toggle('on', h.active);
      lb.style.display = h.active ? '' : 'none';
      onClick?.(h.active, h);
    });
    this.spots.push(h);
    return h;
  }

  clearSpots() {
    for (const s of this.spots) { s.el.remove(); s.lb.remove(); }
    this.spots = [];
  }

  updateSpots(camera) {
    if (!this.spots.length) return;
    const v = new THREE.Vector3();
    for (const s of this.spots) {
      v.copy(s.pos).project(camera);
      const behind = v.z > 1;
      const x = (v.x * 0.5 + 0.5) * innerWidth;
      const y = (-v.y * 0.5 + 0.5) * innerHeight;
      s.el.style.display = behind ? 'none' : '';
      s.lb.style.display = behind || !s.active ? 'none' : '';
      s.el.style.left = `${x}px`; s.el.style.top = `${y}px`;
      s.lb.style.left = `${x + 14}px`; s.lb.style.top = `${y}px`;
    }
  }

  // ── 覆盖层 ──
  showOverlay(html, { veil = true, onMount } = {}) {
    const o = this.el.overlay;
    o.hidden = false;
    o.className = `overlay ${veil ? 'veil' : 'bare'}`;
    o.innerHTML = html;
    onMount?.(o);
    return o;
  }

  hideOverlay() { this.el.overlay.hidden = true; this.el.overlay.innerHTML = ''; }
  get overlayOpen() { return !this.el.overlay.hidden; }

  showChrome(v) { this.el.bottom.hidden = !v; this.el.topbar.hidden = !v; }
}

/** 空间方向引导（立柱推入方向、装板轨迹） */
export class Arrows {
  constructor() { this.items = []; }
  set(list) {
    this.clear();
    for (const it of list) {
      const el = document.createElement('div');
      el.className = 'arrow';
      el.textContent = it.glyph || '→';
      el.style.transform = `translate(-50%,-50%) rotate(${it.rot || 0}deg)`;
      document.body.appendChild(el);
      this.items.push({ el, pos: it.pos.clone() });
    }
  }
  clear() { for (const i of this.items) i.el.remove(); this.items = []; }
  update(camera) {
    if (!this.items.length) return;
    const v = new THREE.Vector3();
    for (const it of this.items) {
      v.copy(it.pos).project(camera);
      it.el.style.display = v.z > 1 ? 'none' : '';
      it.el.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`;
      it.el.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`;
    }
  }
}
