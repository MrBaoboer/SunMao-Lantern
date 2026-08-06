/**
 * 全片旁白生成（MiniMax T2A）
 *
 * 用法：
 *   1. 确保 .env.local 中有 MINIMAX_API_KEY（该文件已在 .gitignore，不会入库）
 *   2. npm run gen:voice            生成缺失的
 *      npm run gen:voice -- --force 全部重生成
 *      npm run gen:voice -- A1 C11  只生成指定几条
 *
 * §12.3 配音规范落实：
 *   · 音色：温润男声（避开「播报男声」—— 规范明令不使用播音腔）
 *   · 抒情段落（lyric）改用抒情男声并放慢语速
 *   · 「（气口）」→ 0.5 s 停顿；「（停顿 n s）」→ 严格 n 秒
 *     两者都转成 MiniMax 的 <#x#> 停顿标记
 *   · 语速由各步的 cps 折算（基准 4.0 字/秒）
 *
 * 生成后会写出 public/audio/vo/manifest.json，运行时据此决定是否加载配音；
 * 未生成时字幕独立走完全同一套内容（§7 降级后知识点零损失）。
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'public', 'audio', 'vo');
const MANIFEST = path.join(ROOT, 'tools', 'vo-manifest.json');

// ── 密钥 ──
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
    .split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const KEY = env.MINIMAX_API_KEY;
const BASE = env.MINIMAX_BASE_URL || 'https://api.minimaxi.com';
if (!KEY) { console.error('缺少 MINIMAX_API_KEY'); process.exit(1); }

// ── §12.3 音色 ──
const VOICE_MAIN = 'Chinese (Mandarin)_Gentleman';       // 温润男声：温厚、有讲述感
const VOICE_LYRIC = 'Chinese (Mandarin)_Lyrical_Voice';  // 抒情男声：静默点与抒情段
const BASE_CPS = 4.0;

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));

/**
 * 旁白脚本 → MiniMax 文本。
 * 括注不朗读；气口与停顿转成 <#x#> 停顿标记。
 */
function toSpeech(text) {
  const out = [];
  for (let raw of String(text).split('\n')) {
    raw = raw.trim();
    if (!raw) continue;
    const hold = raw.match(/^（停顿\s*([\d.]+)\s*s?）$/);
    if (hold) { out.push(`<#${clampPause(parseFloat(hold[1]))}#>`); continue; }
    if (/^（气口）$/.test(raw)) { out.push('<#0.5#>'); continue; }
    const clean = raw.replace(/（[^）]*）/g, '').replace(/「|」/g, '').trim();
    if (clean) out.push(clean, '<#0.3#>');
  }
  return out.join('');
}
const clampPause = (v) => Math.min(99.99, Math.max(0.01, v)).toFixed(2);

async function synth(item) {
  const speed = Math.max(0.5, Math.min(2, (item.cps ?? BASE_CPS) / BASE_CPS));
  const body = {
    model: 'speech-2.6-hd',
    text: toSpeech(item.text),
    stream: false,
    language_boost: 'Chinese',
    voice_setting: {
      voice_id: item.lyric ? VOICE_LYRIC : VOICE_MAIN,
      speed: Number(speed.toFixed(2)),
      vol: 1.0,
      pitch: 0,
      emotion: item.lyric ? 'calm' : 'fluent',
    },
    audio_setting: { format: 'mp3', sample_rate: 32000, bitrate: 128000, channel: 1 },
    output_format: 'hex',
  };
  const res = await fetch(`${BASE}/v1/t2a_v2`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (j?.base_resp?.status_code !== 0) {
    throw new Error(`${j?.base_resp?.status_code} ${j?.base_resp?.status_msg}`);
  }
  return Buffer.from(j.data.audio, 'hex');
}

async function main() {
  if (!fs.existsSync(MANIFEST)) {
    console.error(`未找到 ${MANIFEST}\n请先 npm run dev，在控制台执行 __exportVO() 生成清单。`);
    process.exit(1);
  }
  const { items } = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  fs.mkdirSync(OUT, { recursive: true });

  const todo = items.filter((it) => {
    if (only.length && !only.includes(it.id)) return false;
    if (force) return true;
    return !fs.existsSync(path.join(OUT, `${it.id}.mp3`));
  });

  console.log(`清单 ${items.length} 条，待生成 ${todo.length} 条`);
  const done = [];
  let chars = 0;
  for (const [i, it] of todo.entries()) {
    process.stdout.write(`[${i + 1}/${todo.length}] ${it.id.padEnd(8)} ${it.title || ''} … `);
    try {
      const buf = await synth(it);
      fs.writeFileSync(path.join(OUT, `${it.id}.mp3`), buf);
      chars += [...toSpeech(it.text)].length;
      done.push(it.id);
      console.log(`✓ ${(buf.length / 1024).toFixed(0)} KB`);
    } catch (e) {
      console.log(`✗ ${e.message}`);
      if (/insufficient balance/i.test(e.message)) {
        console.error('\n账户余额不足 —— 充值后重跑本命令即可，已生成的不会重复扣费。');
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 350)); // 轻微限速
  }

  // 运行时据此决定是否加载配音
  const have = items.map((it) => it.id).filter((id) => fs.existsSync(path.join(OUT, `${id}.mp3`)));
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ ids: have }, null, 2));
  console.log(`\n本次新增 ${done.length} 条，累计可用 ${have.length}/${items.length}，约 ${chars} 字`);
}

main();
