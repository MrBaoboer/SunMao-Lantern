/**
 * 界面层
 *
 * 翻页在两侧，章节在顶上，底部只留讲述和这一步的任务。
 * 任何一步都可以随时往前翻 —— 旁白没念完也不拦着。
 *
 * 覆盖层只有两种形态：
 *   卷 sheet —— 盖住画面，讲一件需要专心看的事；
 *   坞 dock  —— 停在底部，把画面完整让出来。
 */

import * as THREE from 'three';
import { icon } from './icons.js';

const $ = (id) => document.getElementById(id);

/** 四章 */
export const PHASES = ['起兴', '明理', '做骨架', '装点年味'];

/**
 * 把一份行动声明渲染成按钮。
 * @param {{label:string, kind?:'primary'|'quiet'|'text', ico?:string, id?:string,
 *          href?:string, download?:string, disabled?:boolean, hidden?:boolean, on?:Function}} a
 */
function actionHTML(a, i) {
  const cls = a.kind === 'primary' ? 'btn btn-primary'
    : a.kind === 'quiet' ? 'btn btn-quiet'
      : 'btn btn-text';
  const body = (a.ico ? icon(a.ico) : '') + `<span>${a.label}</span>`;
  const tag = a.href ? 'a' : 'button';
  const attr = a.href ? `href="${a.href}" download="${a.download || ''}"` : 'type="button"';
  return `<${tag} class="${cls}" data-act="${i}" ${attr}
    ${a.id ? `id="${a.id}"` : ''} ${a.disabled ? 'disabled' : ''} ${a.hidden ? 'hidden' : ''}
    >${body}</${tag}>`;
}

function bindActions(root, list) {
  root.querySelectorAll('[data-act]').forEach((b) => {
    const a = list[+b.dataset.act];
    if (a?.on) b.addEventListener('click', (e) => a.on(e, b));
  });
}

export class HUD {
  constructor(state) {
    this.state = state;
    this.el = {
      topbar: $('topbar'), chapters: $('chapters'), stepno: $('stepno'), steptitle: $('steptitle'),
      prev: $('nav-prev'), next: $('nav-next'),
      note: $('note'), noteTab: $('note-tab'), toast: $('toast'),
      bottom: $('bottom'), cue: $('cue'), narration: $('narration'),
      alts: $('alts'), task: $('btn-task'),
      menu: $('btn-menu'), overlay: $('overlay'),
    };
    this.spots = [];
    this._toastTimer = null;
    this._menu = null;
    this._tip = null;
    this._noteOpen = false;
    this.steps = [];

    this.el.menu.innerHTML = icon('more');
    this.el.prev.innerHTML = icon('back');
    this.el.next.innerHTML = icon('forward');

    this.el.prev.addEventListener('click', () => this.onPrev?.());
    this.el.next.addEventListener('click', () => this.onNext?.());
    this.el.task.addEventListener('click', () => this.onTask?.());
    this.el.menu.addEventListener('click', (e) => { e.stopPropagation(); this.toggleMenu(); });
    this.el.noteTab.addEventListener('click', () => this.toggleNote());
  }

  // ══════════════ 章节 ══════════════

  /** 用步骤表铺出顶部的章节导航：每一章一段，每一步一格，格子都能点 */
  setChapters(steps) {
    this.steps = steps;
    const byPhase = PHASES.map(() => []);
    steps.forEach((s, i) => byPhase[s.phase ?? 0].push({ i, s }));

    this.el.chapters.innerHTML = byPhase.map((list, p) => `
      <div class="ch" data-p="${p}">
        <div class="ch-ticks">${list.map(({ i, s }) => `
          <button class="tick" type="button" data-i="${i}"
                  aria-label="第 ${i + 1} 步 ${s.title}"></button>`).join('')}
        </div>
        <span class="ch-nm">${PHASES[p]}</span>
      </div>`).join('');

    this.el.chapters.addEventListener('click', (e) => {
      const t = e.target.closest('.tick');
      if (t) this.onJump?.(+t.dataset.i);
    });
    this.el.chapters.addEventListener('pointerover', (e) => {
      const t = e.target.closest('.tick');
      if (t) this.#showTip(t);
    });
    this.el.chapters.addEventListener('pointerout', (e) => {
      if (e.target.closest('.tick')) this.#hideTip();
    });
  }

  #showTip(tick) {
    this.#hideTip();
    const i = +tick.dataset.i;
    const s = this.steps[i];
    if (!s) return;
    const tip = document.createElement('div');
    tip.className = 'tick-tip';
    tip.innerHTML = `<b>${String(i + 1).padStart(2, '0')}</b>${s.title}`;
    document.body.appendChild(tip);
    const r = tick.getBoundingClientRect();
    tip.style.left = `${Math.min(Math.max(r.left + r.width / 2, 80), innerWidth - 80)}px`;
    tip.style.top = `${r.bottom + 8}px`;
    this._tip = tip;
  }

  #hideTip() { this._tip?.remove(); this._tip = null; }

  /** 高亮当前所在的章与步 */
  setStep(index, total, title) {
    this.el.stepno.textContent = index >= 0 ? `${String(index + 1).padStart(2, '0')}／${total}` : '';
    this.el.steptitle.textContent = title || '';
    this.el.chapters.querySelectorAll('.tick').forEach((t) => {
      const i = +t.dataset.i;
      t.dataset.state = i < index ? 'done' : i === index ? 'now' : 'next';
    });
    const phase = this.steps[index]?.phase ?? 0;
    this.el.chapters.querySelectorAll('.ch').forEach((ch) => {
      const p = +ch.dataset.p;
      ch.dataset.on = p === phase ? '1' : '0';
      ch.dataset.done = p < phase ? '1' : '0';
    });
    this.el.prev.disabled = index <= 0;
    this.el.next.disabled = index >= total - 1;
  }

  // ══════════════ 旁白与提示 ══════════════

  setNarration(text, { lyric = false } = {}) {
    const e = this.el.narration;
    if (!this.state.captions) { e.textContent = ''; return; }
    e.dataset.lyric = lyric ? '1' : '0';
    e.textContent = text || '';
  }

  /**
   * 操作提示：告诉手该做什么。<em> 标动作词，<b> 标计数。
   * @param {string} html
   * @param {string} [ico] 图标名，见 ui/icons.js
   */
  setCue(html, ico) {
    this.el.cue.innerHTML = html ? (ico ? icon(ico) : '') + `<span>${html}</span>` : '';
  }

  toast(text, { gold = false, dur = 2200 } = {}) {
    clearTimeout(this._toastTimer);
    const e = this.el.toast;
    e.hidden = false;
    e.className = `toast${gold ? ' gold' : ''}`;
    e.textContent = text;
    e.style.animation = 'none'; void e.offsetWidth; e.style.animation = '';
    this._toastTimer = setTimeout(() => { e.hidden = true; }, dur);
  }

  // ══════════════ 工艺笔记 ══════════════

  /** @param {null | {title?:string, spec?:Array<[string,string]>, body?:string, foot?:string}} n */
  setNote(n) {
    const { note, noteTab } = this.el;
    if (!n) {
      note.hidden = true; noteTab.hidden = true; note.innerHTML = '';
      this._noteOpen = false;
      return;
    }
    const spec = (n.spec || []).length
      ? `<div class="note-spec">${n.spec.map(([k, v]) =>
        `<div class="sp"><span>${k}</span><i></i><b>${v}</b></div>`).join('')}</div>`
      : '';
    note.innerHTML = [
      n.title ? `<div class="note-hd">${n.title}</div>` : '',
      spec,
      n.body ? `<p>${n.body}</p>` : '',
      n.foot ? `<div class="note-foot">${n.foot}</div>` : '',
    ].join('');

    const narrow = matchMedia('(max-width: 680px)').matches;
    this._noteOpen = !narrow;
    note.hidden = narrow;
    noteTab.hidden = !narrow;
    noteTab.textContent = '笔记';
    note.style.animation = 'none'; void note.offsetWidth; note.style.animation = '';
  }

  toggleNote() {
    this._noteOpen = !this._noteOpen;
    this.el.note.hidden = !this._noteOpen;
    this.el.noteTab.textContent = this._noteOpen ? '收起' : '笔记';
  }

  // ══════════════ 这一步的任务 ══════════════

  /** 底部中央那一个按钮。只有需要动手的步骤才有，翻页不靠它 */
  setTask(label, onClick) {
    const b = this.el.task;
    if (!label) { b.hidden = true; this.onTask = null; return; }
    b.innerHTML = `<span>${label}</span>`;
    b.hidden = false;
    b.disabled = false;
    this.onTask = onClick;
  }

  /** 任务做完了：右边那枚箭头亮一下，告诉你可以走了 */
  readyNext() {
    const b = this.el.next;
    b.classList.remove('ready'); void b.offsetWidth; b.classList.add('ready');
    clearTimeout(this._readyT);
    this._readyT = setTimeout(() => b.classList.remove('ready'), 4200);
  }

  /** 次要行动一律是无框文字，最多两个 */
  setAlts(list) {
    const box = this.el.alts;
    box.innerHTML = '';
    for (const a of (list || []).slice(0, 2)) {
      const b = document.createElement('button');
      b.className = 'btn btn-text';
      b.type = 'button';
      b.innerHTML = (a.ico ? icon(a.ico) : '') + `<span>${a.label}</span>`;
      b.addEventListener('click', () => a.onClick?.(b));
      box.appendChild(b);
    }
  }

  /** 静默：整层界面退场 */
  quiet(on) {
    this.el.topbar.dataset.quiet = on ? '1' : '0';
    this.el.bottom.dataset.quiet = on ? '1' : '0';
    this.el.prev.style.opacity = on ? '0' : '';
    this.el.next.style.opacity = on ? '0' : '';
    if (on) { this.setNote(null); this.clearSpots(); }
  }

  // ══════════════ 设置菜单 ══════════════

  toggleMenu() {
    if (this._menu) { this.closeMenu(); return; }
    const toggles = [
      { k: 'theme', ico: 'sun', off: 'moon', label: '浅色模式', theme: true },
      { k: 'sound', ico: 'sound', off: 'mute', label: '声音' },
      { k: 'captions', ico: 'caption', label: '字幕' },
      { k: 'voice', ico: 'voice', label: '旁白朗读' },
    ];
    const read = (t) => (t.theme ? this.state.theme !== 'dark' : !!this.state[t.k]);

    const m = document.createElement('div');
    m.className = 'menu';
    m.setAttribute('role', 'menu');
    m.innerHTML = toggles.map((t) => {
      const on = read(t);
      return `<button role="menuitemcheckbox" aria-checked="${on}" data-k="${t.k}">
        ${icon(on || !t.off ? t.ico : t.off)}<span>${t.label}</span><i class="sw"></i></button>`;
    }).join('')
      + '<div class="sep"></div>'
      + `<button role="menuitem" data-k="inspect">${icon('cube')}<span>拆开看看</span></button>`
      + `<button role="menuitem" data-k="check">${icon('ruler')}<span>尺寸对照</span></button>`;

    document.body.appendChild(m);
    this._menu = m;
    this.el.menu.setAttribute('aria-expanded', 'true');

    m.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const t = toggles.find((x) => x.k === b.dataset.k);
      if (t) {
        const v = !read(t);
        if (t.theme) this.setTheme(v ? 'light' : 'dark');
        else this.state[t.k] = v;
        b.setAttribute('aria-checked', String(v));
        if (t.off) b.querySelector('svg').outerHTML = icon(v ? t.ico : t.off);
        if (t.k === 'sound') this.onSound?.(v);
        if (t.k === 'captions' && !v) this.setNarration('');
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
    this.el.menu.setAttribute('aria-expanded', 'false');
    if (this._away) removeEventListener('pointerdown', this._away);
  }

  setTheme(mode) {
    const v = mode === 'dark' ? 'dark' : 'light';
    this.state.theme = v;
    this.#paint();
    this.onTheme?.(v);
  }

  /**
   * 场景压过主题。
   * 夜色场景里界面必须跟着变暗，否则文字压在黑画面上根本读不出来 ——
   * 这不改用户的选择，只是暂时借用另一套颜色。
   */
  setTone(tone) {
    this._tone = tone || null;
    this.#paint();
  }

  #paint() {
    const v = this._tone || this.state.theme || 'light';
    document.documentElement.dataset.theme = v;
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', v === 'dark' ? '#0a0908' : '#f4efe3');
  }

  // ══════════════ 三维锚定标注 ══════════════

  addSpot({ pos, label, sub, badge = '', ico, color = 'var(--accent)', onClick, active = false }) {
    const el = document.createElement('button');
    el.className = 'spot';
    el.type = 'button';
    el.innerHTML = ico ? icon(ico) : `<span>${badge}</span>`;
    el.style.color = color;
    el.setAttribute('aria-pressed', String(active));
    el.setAttribute('aria-label', label);

    const lb = document.createElement('div');
    lb.className = 'spot-label';
    lb.innerHTML = `${label}${sub ? `<small>${sub}</small>` : ''}`;
    lb.style.display = active ? '' : 'none';

    document.body.append(el, lb);
    const h = { el, lb, pos: pos.clone(), active };
    el.addEventListener('click', () => {
      h.active = !h.active;
      el.setAttribute('aria-pressed', String(h.active));
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

  // ══════════════ 覆盖层 ══════════════

  showOverlay(html, { veil = true, onMount } = {}) {
    const o = this.el.overlay;
    o.hidden = false;
    o.className = `overlay ${veil ? 'veil' : 'bare'}`;
    o.innerHTML = html;
    onMount?.(o);
    return o;
  }

  /** 卷：盖住画面的一页 */
  sheet({ eyebrow, title, lede, body, actions = [], veil = true, onMount } = {}) {
    const html = `<div class="sheet scroll">
      ${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ''}
      ${title ? `<h2 class="sheet-title">${title}</h2>` : ''}
      ${lede ? `<p class="sheet-lede">${lede}</p>` : ''}
      ${body ? `<div class="sheet-body">${body}</div>` : ''}
      ${actions.length ? `<div class="sheet-act">${actions.map(actionHTML).join('')}</div>` : ''}
    </div>`;
    return this.showOverlay(html, { veil, onMount: (o) => { bindActions(o, actions); onMount?.(o); } });
  }

  /** 坞：停在底部的一排控件，画面完整让出来 */
  dock({ body, actions = [], hint, onMount } = {}) {
    const html = `<div class="dock">
      ${body || ''}
      ${actions.length ? `<div class="dock-row">${actions.map(actionHTML).join('')}</div>` : ''}
      ${hint ? `<p class="dock-hint">${hint}</p>` : ''}
    </div>`;
    return this.showOverlay(html, { veil: false, onMount: (o) => { bindActions(o, actions); onMount?.(o); } });
  }

  hideOverlay() { this.el.overlay.hidden = true; this.el.overlay.innerHTML = ''; }
  get overlayOpen() { return !this.el.overlay.hidden; }

  showChrome(v) {
    this.el.bottom.hidden = !v;
    this.el.topbar.hidden = !v;
    this.el.prev.hidden = !v;
    this.el.next.hidden = !v;
  }

  get navVisible() { return !this.el.next.hidden; }
}

/** 空间方向引导（立柱推入方向、装板轨迹） */
export class Arrows {
  constructor() { this.items = []; }

  set(list) {
    this.clear();
    for (const it of list) {
      const el = document.createElement('div');
      el.className = 'arrow';
      el.innerHTML = icon(it.ico || 'right');
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
