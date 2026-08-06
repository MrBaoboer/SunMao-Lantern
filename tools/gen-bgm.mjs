/**
 * BGM 生成（MiniMax music_generation）
 *
 * 用法： npm run gen:bgm            生成缺失的
 *        npm run gen:bgm -- --force 全部重生成
 *        npm run gen:bgm -- b-craft 只生成指定曲目
 *
 * §12.1 曲目表与分层机制：三层打击乐按幕次逐层加入的效果，
 * 由运行时的音量分层（bgm.setLevel）与曲目切换共同实现；
 * 生成侧按每首各自的编制描述出稿。
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'public', 'audio', 'bgm');

const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
    .split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const KEY = env.MINIMAX_API_KEY;
const BASE = env.MINIMAX_BASE_URL || 'https://api.minimaxi.com';
if (!KEY) { console.error('缺少 MINIMAX_API_KEY'); process.exit(1); }

/** §12.1 曲目表 */
const TRACKS = [
  {
    file: 'a-opening', use: 'S00–S03 起兴',
    prompt: '中国传统器乐纯音乐，笛子主奏，辅以弦乐与铃铛，温暖、有年节感，情绪缓缓上扬；节奏舒缓，不用鼓点；适合春节夜晚的街巷氛围',
  },
  {
    file: 'b-craft', use: 'S04–S25 明理与匠作',
    prompt: '中国传统器乐纯音乐，古琴为主，配木质打击乐（木鱼、梆子）做轻微律动，专注、笃定、有手作节奏感；克制不喧宾夺主，适合长时间的木工制作过程',
  },
  {
    file: 'c-festive', use: 'S26–S32 团圆',
    prompt: '中国传统器乐纯音乐，笛子与琵琶交织，加入铃与轻打击乐，明亮、喜庆、温暖，带团圆感；比前段更有生气但不吵闹',
  },
  {
    file: 'c-lantern', use: 'M1 点灯',
    prompt: '极简中国风纯音乐，仅古琴独奏配极轻的低频铺底，安静、专注、有仪式感；留白多，适合一个人点亮一盏灯的时刻',
  },
  {
    file: 'c-fair', use: 'M2 猜灯谜',
    prompt: '中国民乐小品纯音乐，铃、木鱼与轻快的弹拨乐，热闹的元宵灯会氛围，带一点游戏感；轻盈不压耳',
  },
  {
    file: 'c-wish', use: 'M3 新春许愿',
    prompt: '中国风极简纯音乐，古琴独奏，全曲最安静最克制，几乎只有单音与泛音，适合提笔写字的静默时刻',
  },
  {
    file: 'c-finale', use: 'M5 烟花庆祝',
    prompt: '中国传统器乐齐奏纯音乐，笛、琵琶、大鼓与弦乐全编制，恢弘、热烈、情绪最高点，适合除夕夜的烟花场面',
  },
  {
    file: 'c-hub', use: 'S32 枢纽（无缝循环）',
    prompt: '中国风纯音乐循环段落，笛与琵琶轻奏，情绪平稳、无明确乐句终止感，适合作为菜单界面的无缝背景循环',
  },
];

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));

async function generate(t) {
  const res = await fetch(`${BASE}/v1/music_generation`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'music-3.0',
      prompt: t.prompt,
      is_instrumental: true,
      audio_setting: { sample_rate: 44100, bitrate: 128000, format: 'mp3' },
      output_format: 'hex',
    }),
  });
  const j = await res.json();
  if (j?.base_resp?.status_code !== 0) {
    throw new Error(`${j?.base_resp?.status_code} ${j?.base_resp?.status_msg}`);
  }
  if (!j?.data?.audio) throw new Error('响应无音频数据');
  return Buffer.from(j.data.audio, 'hex');
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const todo = TRACKS.filter((t) => {
    if (only.length && !only.includes(t.file)) return false;
    if (force) return true;
    return !fs.existsSync(path.join(OUT, `${t.file}.mp3`));
  });
  console.log(`曲目 ${TRACKS.length} 首，待生成 ${todo.length} 首`);

  for (const [i, t] of todo.entries()) {
    process.stdout.write(`[${i + 1}/${todo.length}] ${t.file.padEnd(12)} ${t.use} … `);
    try {
      const buf = await generate(t);
      fs.writeFileSync(path.join(OUT, `${t.file}.mp3`), buf);
      console.log(`✓ ${(buf.length / 1024 / 1024).toFixed(2)} MB`);
    } catch (e) {
      console.log(`✗ ${e.message}`);
      if (/insufficient balance/i.test(e.message)) {
        console.error('\n账户余额不足 —— 充值后重跑本命令即可。');
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 800));
  }

  const have = TRACKS.map((t) => t.file).filter((f) => fs.existsSync(path.join(OUT, `${f}.mp3`)));
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ files: have }, null, 2));
  console.log(`\n累计可用 ${have.length}/${TRACKS.length} 首`);
}

main();
