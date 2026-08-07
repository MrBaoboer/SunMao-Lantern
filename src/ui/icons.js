/**
 * 图标
 *
 * 全部是同一套线稿：24 格、1.25 描边、圆头圆角、只用 currentColor。
 * 不用 emoji —— 它们在每个系统上长得都不一样，也压不住这套界面的调子。
 */

const S = {
  // ── 导航与状态 ──
  more:     '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  back:     '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  forward:  '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
  close:    '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  check:    '<path d="M5 12.6l4.4 4.4L19 7.4"/>',
  cross:    '<path d="M7 7l10 10M17 7L7 17"/>',
  down:     '<path d="M12 5v13M6.5 12.5 12 18l5.5-5.5"/>',
  up:       '<path d="M12 19V6M6.5 11.5 12 6l5.5 5.5"/>',
  right:    '<path d="M5 12h13M12.5 6.5 18 12l-5.5 5.5"/>',
  plus:     '<path d="M12 6v12M6 12h12"/>',
  refresh:  '<path d="M19 9a7.5 7.5 0 1 0 .6 5"/><path d="M19.4 4.4V9h-4.6"/>',

  // ── 五道门 ──
  flame:    '<path d="M12 3.5c3.2 3.4 5.6 6 5.6 9.3A5.6 5.6 0 0 1 12 20.5a5.6 5.6 0 0 1-5.6-7.7C7 10 9.2 7.6 12 3.5Z"/>'
          + '<path d="M12 20.5a2.7 2.7 0 0 1-2.7-2.9c0-1.5 1.1-2.6 2.7-4.6 1.6 2 2.7 3.1 2.7 4.6a2.7 2.7 0 0 1-2.7 2.9Z"/>',
  slip:     '<path d="M8 3.5h8M12 3.5v2.2"/>'
          + '<rect x="6.5" y="5.7" width="11" height="14.8" rx="1.6"/>'
          + '<path d="M9.6 10h4.8M9.6 13.4h4.8M9.6 16.8h2.6"/>',
  brush:    '<path d="M18.8 4.1a1.9 1.9 0 0 0-2.7 0l-6.4 6.4 2.7 2.7 6.4-6.4a1.9 1.9 0 0 0 0-2.7Z"/>'
          + '<path d="M9.7 10.5 7 13.2c-1.5 1.5-1 3.2-1.7 4.4-.4.7-1 1.1-1.6 1.4 1.4.8 3.5 1.1 5.2.2 1.6-.9 2-2.4 2-3.6l1.5-1.5Z"/>',
  lantern:  '<path d="M12 2.6v2.1M12 19.3v2.1"/>'
          + '<path d="M7.6 4.7h8.8M8.6 19.3h6.8"/>'
          + '<path d="M12 4.7c3.4 0 5.4 3 5.4 7.3s-2 7.3-5.4 7.3-5.4-3-5.4-7.3S8.6 4.7 12 4.7Z"/>'
          + '<path d="M12 4.7v14.6"/>',

  // ── 设置 ──
  sun:      '<circle cx="12" cy="12" r="4.2"/>'
          + '<path d="M12 2.6v2.4M12 19v2.4M2.6 12h2.4M19 12h2.4M5.4 5.4l1.7 1.7M16.9 16.9l1.7 1.7M18.6 5.4l-1.7 1.7M7.1 16.9l-1.7 1.7"/>',
  moon:     '<path d="M20.4 14.6A8.6 8.6 0 0 1 9.4 3.6a8.6 8.6 0 1 0 11 11Z"/>',
  sound:'<path d="M5 9.5h3l4-3.2v11.4l-4-3.2H5z"/><path d="M15.5 9.4a3.6 3.6 0 0 1 0 5.2"/><path d="M17.9 7a7 7 0 0 1 0 10"/>',
  mute:     '<path d="M5 9.5h3l4-3.2v11.4l-4-3.2H5z"/><path d="M16 10l4 4M20 10l-4 4"/>',
  caption:  '<rect x="3.4" y="5.6" width="17.2" height="12.8" rx="2"/><path d="M9.6 10.8a2.6 2.6 0 1 0 0 4.4M17 10.8a2.6 2.6 0 1 0 0 4.4"/>',
  voice:    '<path d="M5 10.5v3M8.5 7.6v8.8M12 5.2v13.6M15.5 8.6v6.8M19 10.9v2.2"/>',
  cube:     '<path d="M12 3.2 20 7.6v8.8L12 20.8 4 16.4V7.6z"/><path d="M4 7.6 12 12l8-4.4M12 12v8.8"/>',
  ruler:    '<rect x="2.8" y="8.4" width="18.4" height="7.2" rx="1.4"/>'
          + '<path d="M7 8.4v3M11 8.4v4.4M15 8.4v3M19 8.4v4.4"/>',
  layers:   '<path d="M12 3.4 21 8l-9 4.6L3 8z"/><path d="M3 12.6 12 17l9-4.4M3 16.6 12 21l9-4.4"/>',

  // ── 手势 ──
  drag:     '<path d="M3.6 12h4M16.4 12h4"/><path d="M6.6 9 3.6 12l3 3M17.4 9l3 3-3 3"/><circle cx="12" cy="12" r="2.4"/>',
  press:    '<circle cx="12" cy="12" r="2.6"/><path d="M7.4 7.4a6.5 6.5 0 0 0 0 9.2M16.6 16.6a6.5 6.5 0 0 0 0-9.2"/>',
  pull:     '<path d="M12 20.4v-4M12 7.6v-4"/><path d="M9 17.4l3 3 3-3M15 6.6l-3-3-3 3"/><path d="M5.6 12h12.8"/>',
  tap:      '<circle cx="12" cy="12" r="2.6"/><path d="M12 4.6v2.2M12 17.2v2.2M4.6 12h2.2M17.2 12h2.2"/>',

  // ── 其他 ──
  camera:   '<path d="M3.6 8.4h3.2l1.5-2.2h7.4l1.5 2.2h3.2a1 1 0 0 1 1 1v8.2a1 1 0 0 1-1 1H3.6a1 1 0 0 1-1-1V9.4a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13.4" r="3.4"/>',
  save:     '<path d="M12 3.6v11M7.8 10.4 12 14.6l4.2-4.2"/><path d="M4.4 16.4v2.6a1.4 1.4 0 0 0 1.4 1.4h12.4a1.4 1.4 0 0 0 1.4-1.4v-2.6"/>',
  note:     '<path d="M5.4 3.8h9.2l4 4v12.4H5.4z"/><path d="M14.6 3.8v4h4"/><path d="M8.4 12h7.2M8.4 15.6h4.8"/>',
  book:     '<path d="M4 5.2h5.4A2.6 2.6 0 0 1 12 7.8v11a2.2 2.2 0 0 0-2.2-2.2H4z"/><path d="M20 5.2h-5.4A2.6 2.6 0 0 0 12 7.8v11a2.2 2.2 0 0 1 2.2-2.2H20z"/>',
  spark:    '<path d="M12 3.4c.7 4.3 1.9 5.5 6.2 6.2-4.3.7-5.5 1.9-6.2 6.2-.7-4.3-1.9-5.5-6.2-6.2 4.3-.7 5.5-1.9 6.2-6.2Z"/><path d="M17.6 16.2c.3 1.9.8 2.4 2.7 2.7-1.9.3-2.4.8-2.7 2.7-.3-1.9-.8-2.4-2.7-2.7 1.9-.3 2.4-.8 2.7-2.7Z"/>',
};

/**
 * 图标的 HTML 片段。尺寸由外层的 font-size / .ico 决定。
 * @param {keyof S} name
 * @param {string} [cls] 追加的类名
 */
export function icon(name, cls = '') {
  const d = S[name];
  if (!d) return '';
  return `<svg class="ico${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" stroke-width="1.25"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}

/** 同上，返回真实节点 */
export function iconEl(name, cls = '') {
  const t = document.createElement('template');
  t.innerHTML = icon(name, cls);
  return t.content.firstElementChild;
}

export const ICON_NAMES = Object.keys(S);
