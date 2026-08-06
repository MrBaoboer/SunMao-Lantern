// 探针：验证 MiniMax T2A（配音）与 music_generation（BGM）是否可用。
// 用法： node tools/probe-minimax.mjs
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env.local');
const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const KEY = env.MINIMAX_API_KEY;
const BASE = env.MINIMAX_BASE_URL || 'https://api.minimaxi.com';
if (!KEY) throw new Error('MINIMAX_API_KEY 未找到');
console.log(`key 前缀 ${KEY.slice(0, 12)}…  长度 ${KEY.length}`);

async function post(pathname, body) {
  const res = await fetch(BASE + pathname, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 非 JSON */ }
  return { status: res.status, json, text };
}

// ---------- 1. T2A 同步语音合成 ----------
console.log('\n=== [1] T2A /v1/t2a_v2 ===');
const t2a = await post('/v1/t2a_v2', {
  model: 'speech-2.6-hd',
  text: '榫为阳，卯为阴。一凸一凹，一进一让。',
  stream: false,
  language_boost: 'Chinese',
  voice_setting: { voice_id: 'Chinese (Mandarin)_Lyrical_Voice', speed: 0.92, vol: 1.0, pitch: 0 },
  audio_setting: { format: 'mp3', sample_rate: 32000, bitrate: 128000, channel: 1 },
  output_format: 'hex',
});
console.log('HTTP', t2a.status);
if (t2a.json) {
  console.log('base_resp:', JSON.stringify(t2a.json.base_resp));
  const audioHex = t2a.json?.data?.audio;
  if (audioHex) {
    const buf = Buffer.from(audioHex, 'hex');
    fs.mkdirSync('tools/.audio-cache', { recursive: true });
    fs.writeFileSync('tools/.audio-cache/probe-vo.mp3', buf);
    console.log(`✓ 音频 ${buf.length} 字节 → tools/.audio-cache/probe-vo.mp3`);
    console.log('extra_info:', JSON.stringify(t2a.json.extra_info));
  } else {
    console.log('✗ 无音频。响应：', t2a.text.slice(0, 600));
  }
} else {
  console.log('✗ 非 JSON 响应：', t2a.text.slice(0, 600));
}

// ---------- 2. 查询系统音色列表 ----------
console.log('\n=== [2] 可用音色 /v1/get_voice ===');
const voices = await post('/v1/get_voice', { voice_type: 'system' });
console.log('HTTP', voices.status);
if (voices.json) {
  console.log('base_resp:', JSON.stringify(voices.json.base_resp));
  const sys = voices.json.system_voice || [];
  const zh = sys.filter((v) => /Chinese|Mandarin|中文|moss/i.test(`${v.voice_id} ${v.voice_name}`));
  console.log(`系统音色 ${sys.length} 个，中文相关 ${zh.length} 个，前 40：`);
  zh.slice(0, 40).forEach((v) => console.log(`   ${v.voice_id}  |  ${v.voice_name}`));
} else {
  console.log(voices.text.slice(0, 400));
}

// ---------- 3. 音乐生成 ----------
console.log('\n=== [3] music_generation /v1/music_generation ===');
const music = await post('/v1/music_generation', {
  model: 'music-3.0',
  prompt: '中国传统器乐，古琴独奏为主，辅以极轻的低频铺底，安静、克制、有木质温度，用于手工艺教学场景的背景音乐，无鼓点',
  is_instrumental: true,
  audio_setting: { sample_rate: 44100, bitrate: 128000, format: 'mp3' },
  output_format: 'hex',
});
console.log('HTTP', music.status);
if (music.json) {
  console.log('base_resp:', JSON.stringify(music.json.base_resp));
  const hex = music.json?.data?.audio;
  if (hex) {
    const buf = Buffer.from(hex, 'hex');
    fs.writeFileSync('tools/.audio-cache/probe-bgm.mp3', buf);
    console.log(`✓ 音乐 ${buf.length} 字节 → tools/.audio-cache/probe-bgm.mp3`);
    console.log('extra_info:', JSON.stringify(music.json.extra_info));
  } else {
    console.log('响应键：', Object.keys(music.json), '\n', music.text.slice(0, 600));
  }
} else {
  console.log(music.text.slice(0, 600));
}
