/**
 * ESLint 扁平配置。
 *
 * 这个项目没有框架、没有 TypeScript，所以规则也不必层层叠叠 ——
 * 只留「能挡住真错误」的那一档：recommended，外加几条本项目吃过亏的。
 * 风格问题（缩进、引号、分号）一概不管，交给人和 code review。
 *
 * 三套环境各有各的全局：src/ 跑在浏览器里，tools/ 与配置文件跑在 Node 里。
 */

import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**', '.shots/**', '.vercel/**'] },

  js.configs.recommended,

  {
    // ── 页面代码 ──
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: globals.browser,
    },
    rules: {
      // 调试痕迹要留得住：控制台是这个项目的一部分（几何验算结果就印在那儿）
      'no-console': 'off',
      // 空的 catch 是有意的 —— 隐私模式读 localStorage、解码失败之类到处都是，
      // 但必须写成 catch {} 或写上注释，不许静默吞掉一个有名字的错误变量
      'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none' }],
    },
  },

  {
    // ── 构建与测试脚本 ──
    files: ['tools/**/*.mjs', '*.config.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none' }],
    },
  },

  {
    // ── 冒烟测试里 page.evaluate 的回调是在浏览器里跑的 ──
    files: ['tools/smoke.mjs', 'tools/shots.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },

  {
    // ── 配音稿排版 ──
    // 这个脚本往 markdown 里排的是中文，全角空格（U+3000）是排版字符不是手误：
    // 段首缩进、`语速 · 字数` 的间隔都靠它。默认规则会把它判成 irregular whitespace，
    // 真按它说的改会把生成的《旁白解说稿》排版弄坏。
    files: ['tools/make-script.mjs'],
    rules: {
      'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true }],
    },
  },
];
