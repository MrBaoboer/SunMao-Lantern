import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 仅开发期使用的截图中转：页面把 canvas 的 dataURL POST 过来，写到 .shots/。
 * 用于在无法直接截屏的环境里做视觉校验。生产构建不包含此插件。
 */
function shotPlugin() {
  return {
    name: 'sunmao-shot',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
        // 跨站页面能对 localhost 发 no-cors POST —— 只收本站请求
        const site = req.headers['sec-fetch-site'];
        if (site && site !== 'same-origin' && site !== 'none') { res.statusCode = 403; return res.end(); }
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          try {
            const { name = 'shot', data } = JSON.parse(body);
            const b64 = data.slice(data.indexOf(',') + 1);
            const dir = path.resolve(process.cwd(), '.shots');
            fs.mkdirSync(dir, { recursive: true });
            // 清洗文件名，杜绝路径穿越（name 传 ../..\x 就能写到 .shots 之外）
            const safe = path.basename(String(name)).replace(/[^\w-]/g, '') || 'shot';
            const file = path.join(dir, `${safe}.png`);
            fs.writeFileSync(file, Buffer.from(b64, 'base64'));
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true, file }));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: e.message }));
          }
        });
      });

      // 旁白清单导出：由页面把**真实的**步骤数据写出，
      // 好过让生成脚本用正则去解析源码。
      server.middlewares.use('/__manifest', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
        const site = req.headers['sec-fetch-site'];
        if (site && site !== 'same-origin' && site !== 'none') { res.statusCode = 403; return res.end(); }
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          try {
            const dir = path.resolve(process.cwd(), 'tools');
            fs.mkdirSync(dir, { recursive: true });
            const file = path.join(dir, 'vo-manifest.json');
            fs.writeFileSync(file, body);
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true, file }));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: e.message }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [shotPlugin()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'] },
      },
    },
  },
  server: { port: Number(process.env.PORT) || 5173, open: false },
});
