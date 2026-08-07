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
export const PHASES = ['开场', '认识榫卯', '做骨架', '装点年味'];

/** 怎么操作。前四条是第一次进来就该知道的，后两条留给完整版。touch 是触屏机型的替换句 */
const GUIDE = [
  { k: ['back', 'forward'], t: '翻到上一步、下一步。键盘 <em>←</em> <em>→</em> 一样管用',
    touch: '点两侧箭头，翻到上一步、下一步' },
  { k: ['drag'], t: '按住画面拖，换个角度看；滚轮缩放。松开手，镜头会自己转回来',
    touch: '按住画面拖，换个角度看；双指开合缩放。松开手，镜头会自己转回来' },
  { k: ['layers'], t: '顶上一格就是一步，点一下直接跳过去' },
  { k: ['more'], t: '深色、声音、字幕，都在右上角' },
  { k: ['X'], t: '随时把灯笼拆开、调透明，看看里面', full: true },
  { k: ['spark'], t: '不想自己动手，就选旁边的「帮我加工」「帮我装上」', full: true },
];

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

/** 键帽：认得的名字画成线稿图标，认不得的直接印字 */
const cap = (name) => `<span class="kbd">${icon(name) || name}</span>`;

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
    this.hasVoice = false;
    this._toastTimer = null;
    this._menu = null;
    this._tip = null;
    this._noteOpen = false;
    this._escape = null;
    this._returnFocus = null;
    this.steps = [];
    this._safe = { top: 0, bottom: 0 };

    this.el.menu.innerHTML = icon('more');
    this.el.prev.innerHTML = icon('back');
    this.el.next.innerHTML = icon('forward');

    this.el.prev.addEventListener('click', () => this.onPrev?.());
    this.el.next.addEventListener('click', () => this.onNext?.());
    this.el.task.addEventListener('click', () => this.onTask?.());
    this.el.menu.addEventListener('click', (e) => { e.stopPropagation(); this.toggleMenu(); });
    this.el.noteTab.addEventListener('click', () => this.toggleNote());

    // Esc 一次退一层：先收菜单，再关当前的卷
    addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (this._menu) { this.closeMenu(); return; }
      if (this._escape) { const fn = this._escape; this._escape = null; fn(); }
    });

    // 底部这一摞（讲述、行动、坞）高度一变，画面的取景就得跟着让位
    this._ro = new ResizeObserver(() => this.#syncSafe());
    this._ro.observe(this.el.narration);
    this._ro.observe(this.el.topbar);
    addEventListener('resize', () => this.#syncSafe());
  }

  /**
   * 量一下界面实际占掉了画面的哪两条边。
   *
   * 这不是装饰性的细节：底部摊开五张卡片时，如果三维不知道自己只剩上面那半块，
   * 灯笼就会被卡片压掉一截 —— 而这一步的全部意义正是"看这盏灯"。
   */
  #syncSafe() {
    const vh = innerHeight;
    // 用 getClientRects 判"有没有被画出来"：常驻界面是 fixed 定位，offsetParent 一律是 null
    const box = (el) => (el && !el.hidden && el.getClientRects().length ? el.getBoundingClientRect() : null);

    let top = 0;
    const tb = box(this.el.topbar);
    if (tb && this.el.topbar.dataset.quiet !== '1') top = tb.bottom;

    let bottom = 0;
    const rise = (el) => { const r = box(el); if (r && r.height) bottom = Math.max(bottom, vh - r.top); };
    if (this.el.bottom.dataset.quiet !== '1') { rise(this.el.cue); rise(this.el.narration); rise(this.el.alts.parentElement); }
    this.el.overlay.querySelectorAll('.dock').forEach(rise);

    const next = { top: Math.round(top), bottom: Math.round(bottom) };
    if (next.top === this._safe.top && next.bottom === this._safe.bottom) return;
    this._safe = next;
    this.onSafeArea?.(next);
    // 坞摊开时把讲述抬到它上面 —— 两层文字压在一起，谁都读不成
    document.documentElement.style.setProperty('--dock-h', `${this.#dockHeight()}px`);
  }

  #dockHeight() {
    let h = 0;
    this.el.overlay.querySelectorAll('.dock').forEach((d) => {
      const r = d.getBoundingClientRect();
      if (r.height) h = Math.max(h, innerHeight - r.top);
    });
    return h;
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
    if (on) { this.setNote(null); this.clearSpots(); }
    this.#syncSafe();
  }

  // ══════════════ 更多菜单 ══════════════

  toggleMenu() {
    if (this._menu) { this.closeMenu(); return; }
    const toggles = [
      { k: 'theme', ico: 'moon', off: 'sun', label: '深色', theme: true },
      { k: 'sound', ico: 'sound', off: 'mute', label: '声音' },
      { k: 'captions', ico: 'caption', label: '字幕' },
      // 没有配音文件时这一项什么也控制不了，索性不出现
      ...(this.hasVoice ? [{ k: 'voice', ico: 'voice', label: '旁白朗读' }] : []),
    ];
    const read = (t) => (t.theme ? this.state.theme === 'dark' : !!this.state[t.k]);

    const m = document.createElement('div');
    m.className = 'menu';
    m.setAttribute('role', 'menu');
    m.innerHTML = `<button role="menuitem" data-k="help">${icon('book')}<span>怎么操作</span></button>`
      + '<div class="sep"></div>'
      + toggles.map((t) => {
        const on = read(t);
        return `<button role="menuitemcheckbox" aria-checked="${on}" data-k="${t.k}">
          ${icon(on || !t.off ? t.ico : t.off)}<span>${t.label}</span><i class="sw"></i></button>`;
      }).join('')
      + '<div class="sep"></div>'
      + `<button role="menuitem" data-k="inspect">${icon('cube')}<span>拆开看看</span></button>`
      + `<button role="menuitem" data-k="check">${icon('ruler')}<span>尺寸对照</span></button>`
      + '<div class="sep"></div>'
      + `<button role="menuitem" data-k="restart">${icon('refresh')}<span>从头再来</span></button>`;

    document.body.appendChild(m);
    this._menu = m;
    this.el.menu.setAttribute('aria-expanded', 'true');
    m.querySelector('button')?.focus();

    // 键盘：上下移焦；Tab 移出菜单即收起 —— 菜单不该悬在已失焦的页面上
    m.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const bs = [...m.querySelectorAll('button')];
      const i = bs.indexOf(document.activeElement);
      bs[(i + (e.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length]?.focus();
    });
    m.addEventListener('focusout', (e) => {
      if (this._menu === m && !m.contains(e.relatedTarget)) this.closeMenu();
    });

    m.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const t = toggles.find((x) => x.k === b.dataset.k);
      if (t) {
        const v = !read(t);
        if (t.theme) this.setTheme(v ? 'dark' : 'light');
        else this.state[t.k] = v;
        b.setAttribute('aria-checked', String(v));
        if (t.off) b.querySelector('svg').outerHTML = icon(v ? t.ico : t.off);
        if (t.k === 'sound') this.onSound?.(v);
        if (t.k === 'captions' && !v) this.setNarration('');
        return;
      }
      this.closeMenu();
      if (b.dataset.k === 'help') this.guide({ full: true });
      if (b.dataset.k === 'inspect') this.onInspect?.();
      if (b.dataset.k === 'check') this.onCheck?.();
      if (b.dataset.k === 'restart') this.onRestart?.();
    });

    // 点到菜单以外才收起 —— 点在菜单自己身上不能收，否则开关根本按不动
    this._away = (e) => { if (!m.contains(e.target)) this.closeMenu(); };
    addEventListener('pointerdown', this._away, true);
  }

  closeMenu() {
    if (!this._menu) return;
    // 先置空再移除：移除会同步触发 focusout，其监听里还会再叫 closeMenu
    const m = this._menu;
    this._menu = null;
    const hadFocus = m.contains(document.activeElement);
    m.remove();
    this.el.menu.setAttribute('aria-expanded', 'false');
    if (this._away) { removeEventListener('pointerdown', this._away, true); this._away = null; }
    // 焦点若还在菜单里，关掉后送回菜单按钮 —— 否则直接掉到 body
    if (hadFocus) this.el.menu.focus();
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

  // ══════════════ 怎么操作 ══════════════

  /**
   * 第一次进来给四条，右上角菜单里给六条。
   * @param {{full?:boolean, label?:string, onClose?:Function}} o
   */
  guide({ full = false, label = '知道了', onClose } = {}) {
    const rows = GUIDE.filter((r) => full || !r.full);
    const touch = matchMedia('(pointer: coarse)').matches;
    const done = () => { this.hideOverlay(); onClose?.(); };
    this.sheet({
      title: '怎么操作',
      body: `<div class="guide">${rows.map((r) => `
        <div class="guide-row">
          <div class="guide-k">${r.k.map(cap).join('')}</div>
          <div class="guide-t">${(touch && r.touch) || r.t}</div>
        </div>`).join('')}</div>`,
      actions: [{ label, kind: 'primary', on: done }],
      onEsc: done,
    });
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
      // 标签贴近右缘时翻到左侧展开，并夹在视口里 —— 不夹取，
      // 窄屏上的教学要点会被屏幕边裁掉（同文件 tick-tip 的老规矩）
      const flip = x > innerWidth - 200;
      s.lb.dataset.side = flip ? 'left' : 'right';
      s.lb.style.left = `${flip ? x - 14 : x + 14}px`;
      s.lb.style.top = `${Math.min(Math.max(y, 56), innerHeight - 72)}px`;
    }
  }

  // ══════════════ 覆盖层 ══════════════

  showOverlay(html, { veil = true, onMount, onEsc } = {}) {
    const o = this.el.overlay;
    if (o.hidden) this._returnFocus = document.activeElement;
    o.hidden = false;
    o.className = `overlay ${veil ? 'veil' : 'bare'}`;
    o.innerHTML = html;
    this._escape = onEsc || null;
    onMount?.(o);
    // 卷盖住了画面，焦点跟着进去；坞不夺焦点，手还在画面上
    if (veil) {
      (o.querySelector('.btn-primary:not([hidden]):not(:disabled)')
        || o.querySelector('button:not([hidden]):not(:disabled)'))?.focus();
    }
    const dock = o.querySelector('.dock');
    if (dock) this._ro.observe(dock);
    // 卷盖住了画面，背后那些还能被 Tab 走到的按钮就不该再存在
    this.#setChromeInert(veil);
    this.#syncSafe();
    return o;
  }

  /** 模态打开时，背后的常驻界面退出无障碍树与 Tab 序列 */
  #setChromeInert(on) {
    for (const el of [this.el.topbar, this.el.bottom, this.el.prev, this.el.next, this.el.noteTab]) {
      if (el) el.inert = on;
    }
  }

  /** 卷：盖住画面的一页 */
  sheet({ eyebrow, title, lede, body, actions = [], veil = true, onMount, onEsc } = {}) {
    const html = `<div class="sheet scroll" role="dialog" aria-modal="true">
      ${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ''}
      ${title ? `<h2 class="sheet-title">${title}</h2>` : ''}
      ${lede ? `<p class="sheet-lede">${lede}</p>` : ''}
      ${body ? `<div class="sheet-body">${body}</div>` : ''}
      ${actions.length ? `<div class="sheet-act">${actions.map(actionHTML).join('')}</div>` : ''}
    </div>`;
    return this.showOverlay(html, {
      veil, onEsc,
      onMount: (o) => { bindActions(o, actions); onMount?.(o); },
    });
  }

  /** 坞：停在底部的一排控件，画面完整让出来 */
  dock({ body, actions = [], hint, onMount, onEsc } = {}) {
    const html = `<div class="dock">
      ${body || ''}
      ${actions.length ? `<div class="dock-row">${actions.map(actionHTML).join('')}</div>` : ''}
      ${hint ? `<p class="dock-hint">${hint}</p>` : ''}
    </div>`;
    return this.showOverlay(html, {
      veil: false, onEsc,
      onMount: (o) => { bindActions(o, actions); onMount?.(o); },
    });
  }

  hideOverlay() {
    if (this.el.overlay.hidden) return;
    this.el.overlay.querySelectorAll('.dock').forEach((d) => this._ro.unobserve(d));
    this.el.overlay.hidden = true;
    this.el.overlay.innerHTML = '';
    this.#setChromeInert(false);
    this._escape = null;
    if (this._returnFocus?.isConnected) this._returnFocus.focus();
    this._returnFocus = null;
    this.#syncSafe();
  }

  get overlayOpen() { return !this.el.overlay.hidden; }
  /** 盖住画面的那一种。此时方向键不该在背后翻页 */
  get modalOpen() { return this.overlayOpen && this.el.overlay.classList.contains('veil'); }

  showChrome(v) {
    this.el.bottom.hidden = !v;
    this.el.topbar.hidden = !v;
    this.el.prev.hidden = !v;
    this.el.next.hidden = !v;
    this.#syncSafe();
  }

  get navVisible() { return !this.el.next.hidden; }
}

/** 空间方向引导（立柱推入方向、装板轨迹） */
export class Arrows {
  constructor() { this.items = []; }

  /** 传 dir（世界方向向量）则屏幕角度每帧按相机投影求出；只传 rot 则用固定角度 */
  set(list) {
    this.clear();
    for (const it of list) {
      const el = document.createElement('div');
      el.className = 'arrow';
      el.innerHTML = icon(it.ico || 'right');
      el.style.transform = `translate(-50%,-50%) rotate(${it.rot || 0}deg)`;
      document.body.appendChild(el);
      this.items.push({ el, pos: it.pos.clone(), dir: it.dir ? it.dir.clone().normalize() : null });
    }
  }

  clear() { for (const i of this.items) i.el.remove(); this.items = []; }

  update(camera) {
    if (!this.items.length) return;
    const v = new THREE.Vector3();
    const v2 = new THREE.Vector3();
    for (const it of this.items) {
      v.copy(it.pos).project(camera);
      it.el.style.display = v.z > 1 ? 'none' : '';
      it.el.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`;
      it.el.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`;
      if (it.dir) {
        // 把 pos 与 pos+dir 两点都投到屏幕上求夹角 —— 写死的角度换个机位就是反的
        v2.copy(it.pos).addScaledVector(it.dir, 30).project(camera);
        const deg = (Math.atan2(-(v2.y - v.y) * innerHeight, (v2.x - v.x) * innerWidth) * 180) / Math.PI;
        it.el.style.transform = `translate(-50%,-50%) rotate(${deg}deg)`;
      }
    }
  }
}
