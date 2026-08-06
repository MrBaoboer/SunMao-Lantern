/**
 * 几何闭合验算 —— 在 Node 中先跑通，再进渲染。
 * 用法： npm run verify
 */
import { runVerification, formatReport } from '../src/core/verify.js';

const res = runVerification();
const { pass, total, text } = formatReport(res);

console.log('══════════════════════════════════════════════════════════');
console.log('  《榫卯灯笼 · 国风流光》几何闭合验算  §13.1 建模自检表');
console.log('══════════════════════════════════════════════════════════\n');
console.log(text);
console.log(`\n──────────────────────────────────────────────────────────`);
console.log(`  ${pass} / ${total} 项通过`);
console.log('══════════════════════════════════════════════════════════');

process.exit(pass === total ? 0 : 1);
