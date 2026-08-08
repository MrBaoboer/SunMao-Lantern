import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

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

/**
 * 生产构建时把 CSP 写进首页的 <meta>。
 *
 * 为什么不写在 vercel.json 里当响应头：首页有一段内联脚本（首帧之前定主题，
 * 不然会闪一下），CSP 放行它要靠 sha256。那个哈希连换行符都算 —— 本机是 CRLF、
 * CI 上是 LF，同一份源码能算出两个值；以后改动那段脚本也会让写死的哈希对不上。
 * 对不上的后果还特别隐蔽：脚本被挡，页面照样能用，只是每次打开先闪一下白。
 * 所以哈希现算现填，跟着真实产物走。
 *
 * 注入位置必须是 head 的最前面 —— meta 形式的 CSP 只管到它后面解析的内容，
 * 排在内联脚本之后就等于没写。
 *
 * frame-ancestors 在 meta 里是被忽略的，这里也就不写：这一页没有登录、没有用户数据，
 * 被人嵌进 iframe 里展示反而是好事。
 */
function cspPlugin() {
  const INLINE = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  return {
    name: 'sunmao-csp',
    apply: 'build',
    transformIndexHtml: {
      // post：等 Vite 自己那些标签都注入完，算的才是最终产物里的脚本
      order: 'post',
      handler(html) {
        // 按 HTML 解析规范，分词阶段就把 \r\n 与孤立的 \r 归一成 \n，
        // 浏览器拿去算哈希的是归一之后的文本。不跟着归一，Windows 上产出的
        // 哈希就会比浏览器多算几个 CR —— 正是这一条把脚本挡在门外过一次。
        const hashes = [...html.matchAll(INLINE)]
          .map((m) => m[1].replace(/\r\n?/g, '\n'))
          .map((s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`);
        const csp = [
          "default-src 'self'",
          `script-src 'self' ${hashes.join(' ')}`.trim(),
          "style-src 'self'",
          // data: 有两处用途：favicon，以及 --grain 那张噪点底纹
          "img-src 'self' data:",
          "media-src 'self'",                 // 旁白与背景音乐
          "connect-src 'self'",               // 两份 manifest.json
          "font-src 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'none'",
        ].join('; ');
        return {
          html,
          tags: [{
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: csp },
            injectTo: 'head-prepend',
          }],
        };
      },
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [shotPlugin(), cspPlugin()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 1200,
    // Vite 8 起打包器换成 rolldown：build.rollupOptions 改名 rolldownOptions，
    // 且 manualChunks 的对象写法已移除 —— 分包改用 codeSplitting.groups 按模块 id 匹配。
    // three 单独成块：它占了全部产物的七成，业务代码改一行不该让用户重下这 500 kB。
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/ }],
        },
      },
    },
  },
  server: { port: Number(process.env.PORT) || 5173, open: false },
});
