/**
 * 从源码直接导出旁白清单。
 *
 * 原先只有一条路：起 dev server → 在控制台敲 `__exportVO()` → 页面 POST 回来。
 * 那条路证明的是「线上念的就是这一份」，但它要人守着浏览器，于是清单一旦忘了重跑
 * 就悄悄过期，照文档流程再跑一次反而会把已经改掉的措辞写回去。
 *
 * 步骤脚本本身是纯数据：`actN(ctx)` 只在函数体第一行碰一下 `ctx.stage.scene`，
 * 给个占位对象就能在 Node 里取到整张步骤表。于是这条路不需要浏览器。
 *
 *   node tools/vo-manifest.mjs        # → tools/vo-manifest.json
 *   node tools/make-script.mjs        # → 旁白解说稿.md
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const stub = { stage: { scene: null } };
const { act1 } = await import('../src/steps/act1.js');
const { act3 } = await import('../src/steps/act3.js');
const { act4 } = await import('../src/steps/act4.js');
const { MODULE_VO } = await import('../src/modules/vo.js');

const steps = [...act1(stub), ...act3(stub), ...act4(stub)];
const items = steps
  .filter((s) => s.narration)
  .map((s) => ({ id: s.id, title: s.title, cps: s.cps ?? 4.0, lyric: !!s.lyric, text: s.narration }));
items.push(...MODULE_VO);

const out = path.join(process.cwd(), 'tools', 'vo-manifest.json');
fs.writeFileSync(out, `${JSON.stringify({ generatedFrom: 'source', count: items.length, items }, null, 2)}\n`, 'utf8');
console.log(`已写出 ${out}`);
console.log(`${steps.length} 步，其中 ${items.length - MODULE_VO.length} 步有旁白，加模块 ${MODULE_VO.length} 条`);
