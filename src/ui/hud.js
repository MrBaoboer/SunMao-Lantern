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
  { k: ['drag'], t: '按住画面拖，换个角度看；滚轮缩放。转到哪儿就停在哪儿',
    touch: '按住画面拖，换个角度看；双指开合缩放。转到哪儿就停在哪儿' },
  { k: ['layers'], t: '顶上一格就是一步，点一下直接跳过去' },
  { k: ['more'], t: '深色、声音、字幕，都在右上角' },
  { k: ['X'], t: '没有卷或坞挡着时，按 X 把灯笼拆开、调透明，看看里面',
    touch: '右上角的「拆开看看」，把灯笼拆开、调透明', full: true },
  { k: ['spark'], t: '不想自己动手，就选旁边的「帮我加工」「帮我装上」；按下一步，也会替你做一段',
    full: true },
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
      note: $('note'), noteTab: $('note-tab'), toast: $('toast'), srStep: $('sr-step'),
      bottom: $('bottom'), cue: $('cue'), narration: $('narration'),
      alts: $('alts'), task: $('btn-task'),
      menu: $('btn-menu'), overlay: $('overlay'), cover: $('cover'),
      back: $('btn-back'),
    };
    this.spots = [];
    this.hasVoice = false;
    this._toastTimer = null;
    this._menu = null;
    this._tip = null;
    this._noteOpen = false;
    this._escape = null;
    this._returnFocus = null;
    this._base = null;
    this._top = null;
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
    this.el.back.innerHTML = `${icon('back')}<span>返回</span>`;
    this.el.back.addEventListener('click', () => this._onBack?.());

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
    addEventListener('resize', () => { this.#syncSafe(); this.#layoutNote(); });
    // 手机横过来时 resize 未必先到，orientationchange 补一道
    addEventListener('orientationchange', () => { this.#syncSafe(); this.#layoutNote(); });
  }

  /**
   * 量一下界面实际占掉了画面的哪两条边。
   *
   * 这不是装饰性的细节：底部摊开五张卡片时，如果三维不知道自己只剩上面那半块，
   * 灯笼就会被卡片压掉一截 —— 而这一步的全部意义正是"看这盏灯"。
   */
  #syncSafe() {
    /*
     * 先把坞的高度写下去，再去量位置。
     *
     * 底部那一摞（讲述、行动）据 --dock-h 整体上让，所以量必须排在它生效之后，
     * 量到的才是让位之后的真实位置。
     *
     * 这一句也不能排在下面那道「安全区没变就不必往下走」的早退之后 ——
     * 坞高与安全区是两件事：安全区取的是「底部那一摞」与「坞」两者的大者，
     * 坞比那一摞矮时它根本不变。于是在 A1 这类没有任务按钮的步骤上按 X，
     * 早退让 --dock-h 一直停在 0，「拆开看看」的两根滑杆就和旁白叠在一起。
     */
    const dockH = this.#dockHeight();
    if (dockH !== this._dockH) {
      this._dockH = dockH;
      document.documentElement.style.setProperty('--dock-h', `${dockH}px`);
    }

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
          <button class="tick" type="button" data-i="${i}" tabindex="${i ? -1 : 0}"
                  aria-label="第 ${i + 1} 步 ${s.title}"></button>`).join('')}
        </div>
        <span class="ch-nm">${PHASES[p]}</span>
      </div>`).join('');

    // 每一章按它有几步分宽度。四章等宽的话，做骨架那八步会挤成 7px 一格 ——
    // 手机上点不中，而「点一下跳到那一步」正是引导里写着的用法。
    // 只能走 CSSOM：产物带的 CSP 是 `style-src 'self'`，模板里写 style="…"
    // 会被当场挡下（属性形式的内联样式不吃 hash）
    this.el.chapters.querySelectorAll('.ch').forEach((el, p) => {
      el.style.flexGrow = String(byPhase[p].length || 1);
    });

    this.el.chapters.addEventListener('click', (e) => {
      const t = e.target.closest('.tick');
      if (t) this.onJump?.(+t.dataset.i);
    });
    /*
     * 十八格只占一个 Tab 位。
     *
     * 一格一个 Tab 位的话，键盘用户从页首走到「下一步」要按十九下 —— 而这一排
     * 是导航，不是十八个各自独立的目标。所以走通行的做法：当前那一格 tabindex=0、
     * 其余 −1，进来之后用左右键在格子间移动，Home / End 直达两头，回车跳过去。
     * 引擎的翻页键在焦点落到控件上时本来就不接管，两边不打架。
     */
    this.el.chapters.addEventListener('keydown', (e) => {
      if (!e.target.closest('.tick')) return;
      const ticks = [...this.el.chapters.querySelectorAll('.tick')];
      const at = ticks.indexOf(document.activeElement);
      const to = { ArrowRight: at + 1, ArrowDown: at + 1, ArrowLeft: at - 1, ArrowUp: at - 1,
        Home: 0, End: ticks.length - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      this.#focusTick(Math.max(0, Math.min(ticks.length - 1, to)));
    });

    // 悬停与键盘焦点都要给出步名 —— 这一排格子只有 2px 高，看不出哪一格是哪一步
    for (const ev of ['pointerover', 'focusin']) {
      this.el.chapters.addEventListener(ev, (e) => {
        const t = e.target.closest('.tick');
        if (t) this.#showTip(t);
      });
    }
    for (const ev of ['pointerout', 'focusout']) {
      this.el.chapters.addEventListener(ev, (e) => {
        if (e.target.closest('.tick')) this.#hideTip();
      });
    }
  }

  /** 把 Tab 位挪到第 n 格并落焦点 */
  #focusTick(n) {
    const ticks = [...this.el.chapters.querySelectorAll('.tick')];
    ticks.forEach((t, i) => { t.tabIndex = i === n ? 0 : -1; });
    ticks[n]?.focus();
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
    // 顶部那两行是视觉上的「走到哪了」，读屏看不见它变化 —— 单独报一句。
    // 字幕关掉时这是唯一的翻页信号
    this.el.srStep.textContent = index >= 0 ? `第 ${index + 1} 步，共 ${total} 步：${title || ''}` : '';
    // 格子的三种状态只有颜色高低之分，读屏读不出来 —— 名字里带上状态，
    // 当下那一格再挂 aria-current
    this.el.chapters.querySelectorAll('.tick').forEach((t) => {
      const i = +t.dataset.i;
      const state = i < index ? 'done' : i === index ? 'now' : 'next';
      const status = state === 'done' ? '已走过' : state === 'now' ? '当前' : '还没到';
      t.dataset.state = state;
      t.setAttribute('aria-label', `第 ${i + 1} 步 ${this.steps[i].title}，${status}`);
      // Tab 进来时落在「现在这一步」上，而不是永远从第一格开始
      t.tabIndex = state === 'now' ? 0 : -1;
      if (state === 'now') t.setAttribute('aria-current', 'step');
      else t.removeAttribute('aria-current');
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
   *
   * 这一行是读屏用户唯一能听到「现在该做什么」的地方，所以它是个 live region。
   * 但走刀与装配的计数（「第 2 刀 / 共 3 刀」）每一下都会改它 —— 一步能改十几次，
   * 全播出来就成了噪音。计数类的更新传 `quiet`：照常写进 DOM 给眼睛看，
   * 写的那一下把播报关掉。
   *
   * @param {string} html
   * @param {string} [ico] 图标名，见 ui/icons.js
   * @param {{quiet?:boolean}} [o]
   */
  setCue(html, ico, { quiet = false } = {}) {
    const e = this.el.cue;
    e.setAttribute('aria-live', quiet ? 'off' : 'polite');
    e.innerHTML = html ? (ico ? icon(ico) : '') + `<span>${html}</span>` : '';
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

  /**
   * 上一步的余音：完成的短提示还挂着、右箭头还亮着提醒 —— 都是说给上一步听的。
   * 做完一步紧接着翻页时，它们会盖在下一步的开场上（「合龙了」压在选花纹上），
   * 引擎每翻一步收一次。
   */
  clearTransient() {
    clearTimeout(this._toastTimer);
    this.el.toast.hidden = true;
    clearTimeout(this._readyT);
    this.el.next.classList.remove('ready');
  }

  // ══════════════ 工艺笔记 ══════════════

  /** @param {null | {title?:string, spec?:Array<[string,string]>, body?:string, foot?:string}} n */
  setNote(n) {
    const { note, noteTab } = this.el;
    if (!n) {
      note.hidden = true; noteTab.hidden = true; note.innerHTML = '';
      this._noteOpen = false;
      this._note = null;
      this.#dropNoteRect();
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

    this._note = n;
    this.#layoutNote(true);
    note.style.animation = 'none'; void note.offsetWidth; note.style.animation = '';
  }

  /**
   * 宽屏摊开、窄屏折成一枚纸角。
   *
   * 这一判断必须能重跑：原先只在 setNote 时判一次，横过屏幕之后页签留在
   * 宽屏的隐藏态，笔记既打不开也关不掉 —— 而整步的教学要点就在里面。
   */
  #layoutNote(reset = false) {
    const { note, noteTab } = this.el;
    if (!this._note) return;
    const narrow = matchMedia('(max-width: 680px)').matches;
    if (reset || this._noteNarrow !== narrow) this._noteOpen = !narrow;
    this._noteNarrow = narrow;
    note.hidden = !this._noteOpen;
    noteTab.hidden = !narrow;
    this.#paintNoteTab();
    this.#dropNoteRect();
  }

  #paintNoteTab() {
    const { noteTab } = this.el;
    noteTab.textContent = this._noteOpen ? '收起' : '笔记';
    noteTab.setAttribute('aria-expanded', String(this._noteOpen));
    noteTab.setAttribute('aria-label', this._noteOpen ? '收起工艺笔记' : '展开工艺笔记');
  }

  toggleNote() {
    this._noteOpen = !this._noteOpen;
    this.el.note.hidden = !this._noteOpen;
    this.#paintNoteTab();
    this.#dropNoteRect();
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
    // 夜色场景里界面被临时压成深色，这时按「深色」看不出变化 ——
    // 开关照旧存下选择，但得说一句为什么现在没反应
    const forced = this._tone === 'dark';
    m.innerHTML = `<button role="menuitem" data-k="help">${icon('book')}<span>怎么操作</span></button>`
      + '<div class="sep"></div>'
      + toggles.map((t) => {
        const on = read(t);
        const row = `<button role="menuitemcheckbox" aria-checked="${on}" data-k="${t.k}">
          ${icon(on || !t.off ? t.ico : t.off)}<span>${t.label}</span><i class="sw"></i></button>`;
        return t.theme && forced
          ? `${row}<p class="menu-note">这几步是夜里的场景，界面先跟着暗下来</p>`
          : row;
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
    // 地址栏配色跟着令牌走，不写死两个色值 —— 改 --bg 时这里会自己跟上
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
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
      top: true,                 // 盖在这一步自己的坞上面，收起时把它交还
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
    el.inert = this.modalOpen;
    const h = { el, lb, pos: pos.clone(), active };
    el.addEventListener('click', () => {
      h.active = !h.active;
      // 一次只摊开一张。
      // 「榫的三个部位」这类步骤会连点三枚圆点，三张两行标签在屏幕上只差几十像素，
      // 后点开的那张还会被更早创建的压在下面 —— 点了没反应，比拥挤更糟。
      if (h.active) {
        for (const s of this.spots) {
          if (s === h || !s.active) continue;
          s.active = false;
          s.el.setAttribute('aria-pressed', 'false');
          s.lb.style.display = 'none';
        }
      }
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

  /** 笔记那张纸的矩形变了（换步、折叠、改画幅）—— 下一帧重新量 */
  #dropNoteRect() { this._noteRect = undefined; }

  updateSpots(camera) {
    if (!this.spots.length) return;
    // 右上角那张工艺笔记是一张不透明的纸，层级还压过标注 ——
    // 只避视口右缘不够，标签会被它整块吃掉。把它的实际矩形当成右边界。
    //
    // 量一次就存着：原先每帧都 getClientRects + getBoundingClientRect，
    // 而这个函数紧接着就要写十几个元素的 style —— 读写交替，每帧强制一次重排。
    // 这张纸在一步之内是不动的。
    if (this._noteRect === undefined) {
      this._noteRect = (!this.el.note.hidden && this.el.note.getClientRects().length)
        ? this.el.note.getBoundingClientRect() : null;
    }
    const nb = this._noteRect;
    /*
     * 标注压在底部暗角之上（`--z-nav`），否则它指的那个东西被整块糊掉。
     * 代价是它现在也压在任务按钮之上，而标注是真按钮 —— 一旦投影落进界面
     * 占掉的那两条边里，它就会替按钮把点击吃掉。落进去就藏起来：
     * 那块地方本来就被界面盖着，看不见的标注也点不着。
     * 藏了也不会卡住任何一步 —— 翻页从来不被拦。
     */
    const ceil = this._safe.top + 8;
    const floor = innerHeight - this._safe.bottom - 8;
    const v = new THREE.Vector3();
    for (const s of this.spots) {
      v.copy(s.pos).project(camera);
      const x = (v.x * 0.5 + 0.5) * innerWidth;
      const y = (-v.y * 0.5 + 0.5) * innerHeight;
      const behind = v.z > 1 || y < ceil || y > floor;
      s.el.style.display = behind ? 'none' : '';
      s.lb.style.display = behind || !s.active ? 'none' : '';
      s.el.style.left = `${x}px`; s.el.style.top = `${y}px`;
      // 标签贴近右缘时翻到左侧展开，并夹在视口里 —— 不夹取，
      // 窄屏上的教学要点会被屏幕边裁掉（同文件 tick-tip 的老规矩）。
      // 纵向与笔记卡重叠时，右边界收到卡的左沿
      const limit = (nb && y > nb.top - 24 && y < nb.bottom + 24) ? nb.left - 12 : innerWidth;
      const flip = x > limit - 200;
      s.lb.dataset.side = flip ? 'left' : 'right';
      s.lb.style.left = `${flip ? x - 14 : x + 14}px`;
      s.lb.style.top = `${Math.min(Math.max(y, 56), innerHeight - 72)}px`;
    }
  }

  // ══════════════ 覆盖层 ══════════════

  /*
   * 覆盖层分两层。
   *
   * 底层归这一步自己：选花纹的坞、分层拆解的坞、四扇门。
   * 上层归随时可能盖上来的那一页：怎么操作、尺寸对照、拆开看看。
   *
   * 上层收起时底层原样回来。少了这一条，在「选一个花纹」那一步打开菜单看一眼
   * 怎么操作，回来花纹就没了 —— 而那个坞是这一步唯一的前进入口，底部提示
   * 还在说「点一个花纹」。四扇门与分层拆解也各有一条同样的死路。
   *
   * @param {{veil?:boolean, onMount?:Function, onEsc?:Function, onGone?:Function,
   *          top?:boolean}} o
   *   top：盖在这一步自己的坞之上，收起时把它交还
   *   onGone：这一层不在了（被收起、被同层的另一页顶掉、或整个清空）时调一次。
   *     「拆开看看」靠它把爆炸与半透还原 —— 上层是可以被另一个上层直接顶掉的
   *     （坞不夺焦点也不挡菜单，摊着它照样能点右上角），顶掉时没人通知它，
   *     状态就会卡在「以为自己还开着」，而它的控件已经没了。
   */
  showOverlay(html, { veil = true, onMount, onEsc, onGone, top = false } = {}) {
    // 每一层各记各的「从哪儿来的」：上层收起时焦点要回到打开它的那个控件
    // （多半是右上角的菜单），而不是掉到 body 上
    const layer = { html, veil, onMount, onEsc, onGone, from: document.activeElement };
    const gone = top ? [this._top] : [this._top, this._base];
    if (top) this._top = layer;
    else { this._base = layer; this._top = null; }
    for (const l of gone) l?.onGone?.();
    return this.#paintOverlay();
  }

  #paintOverlay() {
    const layer = this._top || this._base;
    const o = this.el.overlay;
    if (!layer) return this.#dropOverlay();
    if (o.hidden) this._returnFocus = document.activeElement;
    o.querySelectorAll('.dock').forEach((d) => this._ro.unobserve(d));
    o.hidden = false;
    o.className = `overlay ${layer.veil ? 'veil' : 'bare'}`;
    o.innerHTML = layer.html;
    this._escape = layer.onEsc || null;
    layer.onMount?.(o);
    // 卷盖住了画面，焦点跟着进去；坞不夺焦点，手还在画面上
    if (layer.veil) {
      (o.querySelector('.btn-primary:not([hidden]):not(:disabled)')
        || o.querySelector('button:not([hidden]):not(:disabled)'))?.focus();
    }
    const dock = o.querySelector('.dock');
    if (dock) this._ro.observe(dock);
    // 卷盖住了画面，背后那些还能被 Tab 走到的按钮就不该再存在
    this.#setChromeInert(layer.veil);
    this.#syncSafe();
    return o;
  }

  #dropOverlay() {
    const o = this.el.overlay;
    if (o.hidden) return o;
    o.querySelectorAll('.dock').forEach((d) => this._ro.unobserve(d));
    o.hidden = true;
    o.innerHTML = '';
    this.#setChromeInert(false);
    this._escape = null;
    if (this._returnFocus?.isConnected) this._returnFocus.focus();
    this._returnFocus = null;
    this.#syncSafe();
    return o;
  }

  /**
   * 模态打开时，背后的常驻界面退出无障碍树与 Tab 序列。
   *
   * 名单里必须带上封面与三维标注：
   *   · 封面上的「怎么操作」开卷时封面还没隐藏，Tab 两下就能按到背后的「开始做灯」；
   *   · 标注是挂在 body 末尾的真按钮，DOM 顺序还排在覆盖层之后 ——
   *     从卷里的「知道了」按一下 Tab 就落到它们身上，回车还能把标签切出来。
   */
  #setChromeInert(on) {
    for (const el of [this.el.topbar, this.el.bottom, this.el.prev, this.el.next,
      this.el.noteTab, this.el.cover]) {
      if (el) el.inert = on;
    }
    for (const s of this.spots) s.el.inert = on;
  }

  /**
   * 卷：盖住画面的一页。
   *
   * `aria-label` 走标题；三处没有标题的卷（落笔、海报、片尾）自己传 label ——
   * 一个没有名字的 dialog，读屏只会报一句「对话框」。
   */
  sheet({ eyebrow, title, lede, body, actions = [], veil = true, label, top, onMount, onEsc } = {}) {
    const name = label || title || eyebrow;
    const html = `<div class="sheet scroll" role="dialog" aria-modal="true"
      ${name ? `aria-label="${name.replace(/<[^>]+>/g, '')}"` : ''}>
      ${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ''}
      ${title ? `<h2 class="sheet-title">${title}</h2>` : ''}
      ${lede ? `<p class="sheet-lede">${lede}</p>` : ''}
      ${body ? `<div class="sheet-body">${body}</div>` : ''}
      ${actions.length ? `<div class="sheet-act">${actions.map(actionHTML).join('')}</div>` : ''}
    </div>`;
    return this.showOverlay(html, {
      veil, onEsc, top,
      onMount: (o) => { bindActions(o, actions); onMount?.(o); },
    });
  }

  /** 坞：停在底部的一排控件，画面完整让出来 */
  dock({ body, actions = [], hint, top, onMount, onEsc } = {}) {
    const html = `<div class="dock">
      ${body || ''}
      ${actions.length ? `<div class="dock-row">${actions.map(actionHTML).join('')}</div>` : ''}
      ${hint ? `<p class="dock-hint">${hint}</p>` : ''}
    </div>`;
    return this.showOverlay(html, {
      veil: false, onEsc, top,
      onMount: (o) => { bindActions(o, actions); onMount?.(o); },
    });
  }

  /** 收起最上面那一层；底下压着的那一步自己的坞会原样回来 */
  hideOverlay() {
    if (this._top) {
      const l = this._top;
      this._top = null;
      this.#paintOverlay();
      l.onGone?.();
      if (l.from?.isConnected) l.from.focus();
      return;
    }
    const l = this._base;
    this._base = null;
    this.#dropOverlay();
    l?.onGone?.();
  }

  /** 两层一起收干净 —— 翻页，以及从四扇门进互动模块时 */
  closeOverlays() {
    const gone = [this._top, this._base];
    this._top = null;
    this._base = null;
    this.#dropOverlay();
    for (const l of gone) l?.onGone?.();
  }

  get overlayOpen() { return !this.el.overlay.hidden; }
  /** 盖住画面的那一种。此时方向键不该在背后翻页 */
  get modalOpen() { return this.overlayOpen && this.el.overlay.classList.contains('veil'); }

  /**
   * 左上角那枚返回。互动模块进来时挂上，走时传 null 摘掉。
   *
   * 它有意不进 #setChromeInert 的名单：卷是模态的，但「退出这个模块」
   * 恰恰是模态里唯一还该按得动的东西。
   * @param {Function|null} fn
   */
  setBack(fn) {
    this._onBack = fn || null;
    this.el.back.hidden = !fn;
  }

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
