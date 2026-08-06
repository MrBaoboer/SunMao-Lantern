/**
 * 把运行时导出的旁白清单排成一份可直接交给配音的稿子。
 *
 *   npm run dev  →  控制台执行 __exportVO()  →  node tools/make-script.mjs
 *
 * 输出 旁白解说稿.md：分段、断句、标好停顿与语速。
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'tools', 'vo-manifest.json');
const OUT = path.join(ROOT, '旁白解说稿.md');

const ACTS = [
  { at: 'A1', name: '第一幕 · 起兴', note: '静 → 好奇。慢，重氛围。' },
  { at: 'B1', name: '第二幕 · 明理', note: '好奇 → 会意。清晰、耐心，讲解的口气。' },
  { at: 'C1', name: '第三幕 · 匠作', note: '专注 → 沉浸。手上有活的语气，节拍稳定。' },
  { at: 'D1', name: '第四幕 · 团圆', note: '暖 → 燃。放缓，转入审美与情感。' },
  { at: 'M1', name: '互动模块', note: '轻松、生活化，把话语权交回给用户。' },
];

const TITLES = {
  A1: '一盏灯，为一年收尾', A2: '要做的就是它',
  B1: '七千年', B2: '凸的叫榫，凹的叫卯', B3: '榫为阳，卯为阴',
  B4: '第一种榫型 · 直榫', B5: '第二种榫型 · 夹榫',
  C1: '十三根木条', C2: '开两条槽', C3: '中梁：截短，开叉',
  C4: '落下去，成「工」字', C5: '切榫头', C6: '凿透眼，铣柱窝',
  C7: '下枨框成了', C8: '上枨框：中间一刀都不动', C9: '上枨框成了',
  C10: '立柱：削掉四分之三', C11: '四柱推入，合龙',
  D1: '选一个花纹', D2: '把板子装进去', D3: '糊纸，贴花，上锁',
  D4: '灯芯就位', D4b: '巡礼收束', D5: '拆开看一遍', D6: '过年该做的事',
  M1: '点亮之后', M4: '把它挂起来', M5: '放烟花',
  'M2-fin': '猜灯谜 · 最后一题答对之后',
  'M5-fu': '放出「福」字时', 'M5-outro': '片尾',
};

const RIDDLE = /^M2-\d$/;

function segment(text) {
  const out = [];
  for (let raw of String(text).split('\n')) {
    raw = raw.trim();
    if (!raw) continue;
    const hold = raw.match(/^（停顿\s*([\d.]+)\s*s?）$/);
    if (hold) { out.push({ pause: parseFloat(hold[1]) }); continue; }
    if (/^（气口）$/.test(raw)) { out.push({ pause: 0.5, breath: true }); continue; }
    const dir = [...raw.matchAll(/（([^）]*)）/g)].map((m) => m[1]).join(' · ');
    const line = raw.replace(/（[^）]*）/g, '').trim();
    if (line) out.push({ line, dir: dir || null });
    else if (dir) out.push({ dirOnly: dir });
  }
  return out;
}

const chars = (s) => [...s.replace(/[，。？！、：；「」—…\s·]/g, '')].length;

const { items } = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const md = [];
let totalChars = 0;
let totalSec = 0;

md.push('# 《榫卯灯笼 · 国风流光》旁白解说稿');
md.push('');
md.push('> 全片旁白全文，与线上逐字一致。');
md.push('> 已分好段、断好句，标注了语速与停顿，可直接交给配音或语音合成。');
md.push('');
md.push('## 怎么用');
md.push('');
md.push('- 每条旁白对应一个**编号**。录好后按 `编号.mp3` 命名，放进 `public/audio/vo/`。');
md.push('- 同目录新建 `manifest.json`，把已录好的编号列进去：`{ "ids": ["A1", "A2", ...] }`。');
md.push('- 页面会自动按音频时长重新校准字幕节奏；没录的那些，字幕照常独立播完。');
md.push('');
md.push('## 语气总纲');
md.push('');
md.push('- 中年男声或女声，温厚，有讲述感。**不要播音腔，也不要综艺腔。**');
md.push('- 基准语速 4.0 字/秒；标注了语速的段落按标注放慢。');
md.push('- `⏸ 0.5″` 是气口，实实在在停住；`⏸ 1.5″` 按标注的秒数停。');
md.push('- 加粗的词是重音。');
md.push('- 知识点后面不要加语气词（「哦」「呢」），抒情段落不要拖尾音。');
md.push('');
md.push('---');
md.push('');

let actIdx = -1;
for (const it of items) {
  const nextAct = ACTS.findIndex((a) => a.at === it.id);
  if (nextAct >= 0 && nextAct !== actIdx) {
    actIdx = nextAct;
    md.push(`# ${ACTS[actIdx].name}`);
    md.push('');
    md.push(`> ${ACTS[actIdx].note}`);
    md.push('');
  }

  const title = TITLES[it.id] || it.title || '';
  const segs = segment(it.text);
  const n = segs.filter((s) => s.line).reduce((a, s) => a + chars(s.line), 0);
  const pause = segs.reduce((a, s) => a + (s.pause || 0), 0);
  const sec = n / (it.cps || 4) + pause + segs.filter((s) => s.line).length * 0.3;
  totalChars += n;
  totalSec += sec;

  md.push(`## ${it.id}　${title}`);
  md.push('');
  const meta = [`语速 ${it.cps || 4.0} 字/秒`, `约 ${n} 字`, `约 ${Math.round(sec)} 秒`];
  if (it.lyric) meta.push('**抒情段，最慢的一段**');
  if (RIDDLE.test(it.id)) meta.push('念谜面，读完停一秒');
  md.push(`\`${meta.join('　·　')}\``);
  md.push('');

  for (const s of segs) {
    if (s.pause) { md.push(`　　⏸ ${s.pause.toFixed(1)}″${s.breath ? '（气口）' : ''}`); md.push(''); continue; }
    if (s.dirOnly) { md.push(`　　*（${s.dirOnly}）*`); md.push(''); continue; }
    md.push(s.dir ? `${s.line}　*（${s.dir}）*` : s.line);
    md.push('');
  }
  md.push('---');
  md.push('');
}

md.push('# 合计');
md.push('');
md.push(`- 条目 **${items.length}** 条`);
md.push(`- 正文 **${totalChars}** 字`);
md.push(`- 估算总时长 **约 ${Math.round(totalSec / 60)} 分 ${Math.round(totalSec % 60)} 秒**`);
md.push('');

fs.writeFileSync(OUT, md.join('\n'), 'utf8');
console.log(`已写出 ${OUT}`);
console.log(`${items.length} 条 · ${totalChars} 字 · 约 ${Math.round(totalSec / 60)} 分 ${Math.round(totalSec % 60)} 秒`);
