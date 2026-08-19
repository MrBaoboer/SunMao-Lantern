/**
 * 点灯 · 猜灯谜
 */

import { V, a, Junk, buildNightSky, AIM_LANTERN, FIT_LANTERN } from '../steps/util.js';
import { playVO } from './vo.js';
import { tween, Ease, wait } from '../util/tween.js';

const junk = new Junk(null);

/** 答对一题灯亮一分，封顶避免过曝 */
const level = (c) => Math.min(1.4, 1 + c.state.riddleScore * 0.08);

// ══════════════════════════════════════════════════════════
// 点灯
//   长按引火。亮度走指数曲线：前九成时间只到三成亮，最后一下才冲满。
//   线性上升会让「点亮」这件事变得平淡。
// ══════════════════════════════════════════════════════════
export function openM1(c, onExit) {
  junk.scene = c.stage.scene;
  junk.clear();
  c.stage.setMood('night', { snap: true });   // 硬切进另一个场，光跟着镜头一刀换
  c.bgm.play('BGM_C_LANTERN');
  junk.add(buildNightSky(c.stage.scene));
  // 凑近，但整盏灯都在画面里 —— 原先贴到只看灯脚，上沿正好切在顶框下面一线，
  // 读出来是裁坏了，不是凑近了；点亮后 done() 再拉远一档，进退才成一对。
  // h 带着坞的抬升余量：底部「按住点灯」那一摞会把主体往上顶约二十毫米，
  // 不留这一份，柱头就顶出画面
  c.stage.setRecommended({ az: 55, el: 8, dist: 300, target: V(...AIM_LANTERN), fit: { r: 78, h: 126 } });
  c.stage.snapToRecommended();

  let k = 0, holding = false, held = 0, lit = c.state.lit, need = 1.2, misses = 0;
  let closed = false;
  c.lantern.setLit(lit ? level(c) : 0);

  const close = () => {
    closed = true;
    c.sfx.stopLoop('FLAME_IGNITE');
    junk.clear();
    c.hud.setBack(null);
    c.hud.hideOverlay();
    c.voice.stop();
    onExit?.();
  };
  c.hud.setBack(close);

  c.hud.dock({
    body: `<p class="dock-hint" id="tip" role="status" aria-live="polite">按住不放，等这一圈走满</p>
      <svg id="ring" class="ignite" viewBox="0 0 100 100" aria-hidden="true">
        <circle class="ignite-track" cx="50" cy="50" r="44" />
        <circle class="ignite-arc" id="arc" cx="50" cy="50" r="44"
                stroke-dasharray="276" stroke-dashoffset="276"/>
      </svg>
      <div id="tools" class="dock-row" hidden>
        <div class="slider"><span>亮度</span>
          <input id="bright" type="range" min="14" max="100" value="100" aria-label="亮度"></div>
      </div>`,
    actions: [
      { id: 'fire', label: '按住点灯', kind: 'primary', ico: 'flame' },
      { id: 'again', label: '再点一次', ico: 'refresh', hidden: true },
    ],
    onMount: (o) => {
      const fire = o.querySelector('#fire');
      const arc = o.querySelector('#arc');
      const tip = o.querySelector('#tip');
      const ring = o.querySelector('#ring');
      const tools = o.querySelector('#tools');
      const again = o.querySelector('#again');

      const done = async () => {
        if (closed) return;
        lit = true;
        c.state.lit = true;
        c.sfx.stopLoop('FLAME_IGNITE');
        c.sfx.play('LIGHT_BLOOM');
        c.sfx.loop('FLAME_LOOP');
        fire.hidden = true;
        ring.style.display = 'none';
        tip.textContent = '';
        // ease < 1 = 放慢：灯亮起来这一下值得一次从容的拉远，约两秒收进全灯
        c.stage.setRecommended({ az: 55, el: 10, dist: 470, target: V(...AIM_LANTERN), ease: 0.55, fit: FIT_LANTERN });
        await tween(0.9, (t) => {
          c.lantern.setLit(level(c) * (0.3 + 0.7 * t));
          c.lantern.root.position.z = a(0.5) * Math.sin(t * Math.PI) * 0.6;
        }, { ease: Ease.outCubic });
        c.lantern.root.position.z = 0;
        c.lantern.setLit(level(c));
        await wait(1.4);
        // 模块的 wait/tween 不经过 engine 的 cancelAll —— 关掉之后
        // 这条链还会跑到这里，旁白就响在了四门页上
        if (closed) return;
        playVO(c, 'M1');
        tools.hidden = false;
        again.hidden = false;
        c.state.modulesDone = { ...c.state.modulesDone, M1: true };
      };

      const start = () => {
        if (lit || holding) return;
        holding = true; held = 0;
        c.sfx.loop('FLAME_IGNITE', { dur: need });
        tip.textContent = '别松手';
      };
      const stop = () => {
        if (!holding || lit) return;
        holding = false;
        c.sfx.stopLoop('FLAME_IGNITE');
        if (held >= need) return;
        misses++;
        if (misses >= 3) need = 0.8;      // 悄悄放宽，不告诉用户
        tip.textContent = '再按久一点';
        tween(0.5, (t) => {
          const v = k * (1 - t);
          c.lantern.setLit(v * level(c));
          arc.style.strokeDashoffset = String(276 * (1 - v));
        }, { onDone: () => { k = 0; } });
      };

      fire.addEventListener('pointerdown', start);
      fire.addEventListener('pointerleave', stop);
      addEventListener('pointerup', stop);

      // 键盘也得点得着火。这枚按钮唯一的动作是「按住」，而空格与回车只会
      // 发 click —— 只挂 pointer 事件，用键盘的人在这里就走不下去了。
      // 按键自带重复，只认第一次下沉；焦点一走就当松手。
      const KEYS = new Set([' ', 'Enter']);
      fire.addEventListener('keydown', (e) => {
        if (!KEYS.has(e.key)) return;
        e.preventDefault();                 // 空格默认会触发 click
        if (!e.repeat) start();
      });
      fire.addEventListener('keyup', (e) => { if (KEYS.has(e.key)) stop(); });
      fire.addEventListener('blur', stop);

      const upd = (dt) => {
        if (!holding || lit) return;
        held += dt;
        const t = Math.min(1, held / need);
        k = Ease.ignite(t);
        c.lantern.setLit(k * level(c));
        arc.style.strokeDashoffset = String(276 * (1 - t));
        if (t >= 1) { holding = false; done(); }
      };
      c.stage.updaters.add(upd);
      junk.add({ dispose: () => { c.stage.updaters.delete(upd); removeEventListener('pointerup', stop); } });

      o.querySelector('#bright').addEventListener('input', (e) => {
        c.state.litLevel = e.target.value / 100;
        c.lantern.setLit(level(c) * c.state.litLevel);
      });
      again.addEventListener('click', () => {
        lit = false; k = 0; c.state.lit = false;
        c.lantern.setLit(0);
        c.sfx.stopLoop('FLAME_LOOP');
        fire.hidden = false; ring.style.display = '';
        tools.hidden = true; again.hidden = true;
        tip.textContent = '按住不放，等这一圈走满';
      });

      if (lit) done();
    },
  });

  return close;
}

// ══════════════════════════════════════════════════════════
// 猜灯谜
//   答错不扣分、不阻断、不重来，也不用红色。
//
//   五道谜全部指回这一课：你做的灯、你放的芯、你拉的锯、
//   你合的龙、你推的榫 —— 谜底不在天边，就在手边。
//   物谜与字谜混排（灯谜本来就以字谜为正宗），难度递进，
//   最后一题留给刚学的东西。
// ══════════════════════════════════════════════════════════
const RIDDLES = [
  {
    face: '薄薄一张纸，包住一团火\n白天静悄悄，夜里满脸红', tag: '打一物',
    key: '灯笼', opts: ['火盆', '烟花', '灯笼', '香炉'],
    why: '都说纸包不住火，灯笼偏偏包住了 —— 诀窍你知道：火在中间，纸离得远。',
  },
  {
    face: '身子矮矮，肚里有火\n越烧越短，烧完就没', tag: '打一日用物',
    key: '蜡烛', opts: ['油灯', '火柴', '蜡烛', '香'],
    why: '就是你刚放进灯笼里的那一根。',
  },
  {
    face: '满口小铁牙，专咬硬木头\n来回拉几趟，吐出白雪花', tag: '打一件工具',
    key: '锯', opts: ['凿', '锯', '斧', '刨'],
    why: '吐出来的「雪花」是锯末。切榫头那一步，你来回拉的就是它。',
  },
  {
    // 四个选项都是「人 / 木」加「口」拼出来的字 —— 拆错哪一笔都有地方去
    face: '一、人、口\n三笔拼一字', tag: '打一字',
    key: '合', opts: ['囚', '杏', '合', '呆'],
    why: '「人」字下面一横一口，拼出来是「合」。四根柱子一起推到底，木匠管那一下叫合龙 —— 你推过。',
  },
  {
    face: '不用一钉，不用一胶\n一凹一凸，两木咬牢', tag: '打一木作工艺',
    key: '榫卯', opts: ['榫卯', '斗拱', '雕花', '髹漆'],
    why: '凸的叫榫，凹的叫卯 —— 你在「认识榫卯」那一章亲手推过它。',
    last: true,
  },
];

export function openM2(c, onExit) {
  junk.scene = c.stage.scene;
  junk.clear();
  c.stage.setMood('night', { snap: true });   // 硬切进另一个场，光跟着镜头一刀换
  c.bgm.play('BGM_C_FAIR');
  junk.add(buildNightSky(c.stage.scene));
  c.stage.setRecommended({ az: 40, el: 10, dist: 640, target: V(90, 0, 96), fit: { r: 190, h: 172 } });
  c.stage.snapToRecommended();

  let i = 0, score = 0;

  const close = () => {
    junk.clear(); c.hud.setBack(null); c.hud.hideOverlay(); c.voice.stop(); onExit?.();
  };
  c.hud.setBack(close);

  const ask = () => {
    const q = RIDDLES[i];
    const last = i === RIDDLES.length - 1;
    c.hud.sheet({
      eyebrow: `第 ${i + 1} 题 / 共 5 题 · ${q.tag}`,
      body: `<div class="riddle">${q.face.replace(/\n/g, '<br>')}</div>
        <div class="opts">${q.opts.map((o) => `
          <button class="opt" type="button" data-o="${o}">${o}</button>`).join('')}</div>
        <div class="answer" id="ans" role="status" aria-live="polite"></div>`,
      actions: [
        { id: 'skip', label: '想不出来' },
        { id: 'next', label: last ? '看看结果' : '下一题', kind: 'primary', hidden: true },
      ],
      onEsc: close,
      onMount: (o) => {
        c.sfx.play('PAPER', { gain: 0.6 });
        playVO(c, `M2-${i + 1}`);
        const ans = o.querySelector('#ans');
        const next = o.querySelector('#next');

        const answer = (picked) => {
          o.querySelectorAll('.opt').forEach((b) => {
            b.disabled = true;
            b.classList.add(b.dataset.o === q.key ? 'yes' : 'no');
          });
          const right = picked === q.key;
          if (right) {
            score++;
            c.state.riddleScore = score;
            c.sfx.play('SUCCESS');
            c.lantern.setLit(c.state.lit ? level(c) : score * 0.08);
            ans.innerHTML = `<div class="answer-k">对了 · 灯又亮了一分</div>
              <div class="answer-v">${q.why}</div>`;
          } else {
            ans.innerHTML = `<div class="answer-k">${q.key}</div>
              <div class="answer-v">${q.why}</div>`;
          }
          if (q.last && right) playVO(c, 'M2-fin');
          next.hidden = false;
        };

        o.querySelectorAll('.opt').forEach((b) =>
          b.addEventListener('click', () => answer(b.dataset.o)));
        o.querySelector('#skip').addEventListener('click', () => answer(null));
        next.addEventListener('click', () => { i++; if (i < RIDDLES.length) ask(); else result(); });
      },
    });
  };

  const result = () => {
    const name = score === 5 ? '榫卯通' : score === 4 ? '巧手' : score === 3 ? '明白人' : '学徒';
    c.state.modulesDone = { ...c.state.modulesDone, M2: true };
    c.sfx.play('SUCCESS');
    c.hud.sheet({
      eyebrow: `五题答对 ${score} 题`,
      title: name,
      lede: score ? `灯笼比刚才亮了 ${score * 8}%` : '再来一次，灯会更亮',
      // 出口不能只有「再来一次」—— 否则这一页读起来是「必须重玩」
      actions: [
        { label: '再来一次', ico: 'refresh', on: () => { i = 0; score = 0; ask(); } },
        { label: '回去看看别的', kind: 'primary', on: close },
      ],
      onEsc: close,
    });
  };

  ask();
  return close;
}
