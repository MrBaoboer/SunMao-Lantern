/**
 * 点灯 · 猜灯谜
 */

import { V, a, C, Junk, buildNightSky } from '../steps/util.js';
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
  c.stage.setMood('night');
  c.bgm.play('BGM_C_LANTERN');
  junk.add(buildNightSky(c.stage.scene));
  c.stage.setRecommended({ az: 55, el: 6, dist: 250, target: V(0, 0, C.LOWER_Z1 + 20) });
  c.stage.snapToRecommended();

  let k = 0, holding = false, held = 0, lit = c.state.lit, need = 1.2, misses = 0;
  c.lantern.setLit(lit ? level(c) : 0);

  const close = () => {
    c.sfx.stopLoop('FLAME_IGNITE');
    junk.clear();
    c.hud.hideOverlay();
    c.voice.stop();
    onExit?.();
  };

  c.hud.dock({
    body: `<p class="dock-hint" id="tip">按住不放，等这一圈走满</p>
      <svg id="ring" class="ignite" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(242,236,224,.13)" stroke-width="3"/>
        <circle id="arc" cx="50" cy="50" r="44" fill="none" stroke="#d3aa63" stroke-width="3"
                stroke-linecap="round" stroke-dasharray="276" stroke-dashoffset="276"/>
      </svg>
      <div id="tools" class="dock-row" hidden>
        <div class="slider"><span>亮度</span>
          <input id="bright" type="range" min="14" max="100" value="100" aria-label="亮度"></div>
      </div>`,
    actions: [
      { id: 'fire', label: '按住点灯', kind: 'primary', ico: 'flame' },
      { id: 'again', label: '再点一次', ico: 'refresh', hidden: true },
      { label: '回去', ico: 'back', on: () => { close(); } },
    ],
    onMount: (o) => {
      const fire = o.querySelector('#fire');
      const arc = o.querySelector('#arc');
      const tip = o.querySelector('#tip');
      const ring = o.querySelector('#ring');
      const tools = o.querySelector('#tools');
      const again = o.querySelector('#again');

      const done = async () => {
        lit = true;
        c.state.lit = true;
        c.sfx.stopLoop('FLAME_IGNITE');
        c.sfx.play('LIGHT_BLOOM');
        c.sfx.loop('FLAME_LOOP');
        fire.hidden = true;
        ring.style.display = 'none';
        tip.textContent = '';
        c.stage.setRecommended({ az: 55, el: 10, dist: 470, target: V(0, 0, 96), ease: 2.2 });
        await tween(0.9, (t) => {
          c.lantern.setLit(level(c) * (0.3 + 0.7 * t));
          c.lantern.root.position.z = a(0.5) * Math.sin(t * Math.PI) * 0.6;
        }, { ease: Ease.outCubic });
        c.lantern.root.position.z = 0;
        c.lantern.setLit(level(c));
        await wait(1.4);
        c.voice.play('M1', `亮了。
光从绵纸里透出来，被木头挡成一格一格的 —— 这就是你选的那个花纹。
（停顿 1.0 s）
看地上。`, { cps: 3.6 });
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
//   前四题是流传已久的民间谜面，最后一题留给刚学的东西。
// ══════════════════════════════════════════════════════════
const RIDDLES = [
  {
    face: '麻屋子，红帐子\n里面住着一个白胖子', tag: '打一食物',
    key: '花生', opts: ['花生', '核桃', '石榴', '荔枝'],
    why: '麻屋子是外壳，红帐子是那层红衣，白胖子就是果仁。',
  },
  {
    face: '千条线，万条线\n落到水里看不见', tag: '打一自然现象',
    key: '雨', opts: ['雪', '雨', '雾', '风'],
    why: '雨丝落进水里就没了踪影。',
  },
  {
    face: '身子矮矮，肚里有火\n越烧越短，烧完就没', tag: '打一日用物',
    key: '蜡烛', opts: ['油灯', '火柴', '蜡烛', '香'],
    why: '就是你刚放进灯笼里的那一根。',
  },
  {
    face: '有面没有口，有脚没有手\n四只脚站着，自己不会走', tag: '打一家具',
    key: '桌子', opts: ['凳子', '桌子', '柜子', '床'],
    why: '「面」和「脚」都是木工的说法。',
  },
  {
    face: '不用一钉，不用一胶\n一凹一凸，两木咬牢', tag: '打一木作工艺',
    key: '榫卯', opts: ['榫卯', '斗拱', '雕花', '髹漆'],
    why: '凸的叫榫，凹的叫卯 —— 你在第二幕见过它。',
    last: true,
  },
];

export function openM2(c, onExit) {
  junk.scene = c.stage.scene;
  junk.clear();
  c.stage.setMood('night');
  c.bgm.play('BGM_C_FAIR');
  junk.add(buildNightSky(c.stage.scene));
  c.stage.setRecommended({ az: 40, el: 10, dist: 640, target: V(90, 0, 96) });
  c.stage.snapToRecommended();

  let i = 0, score = 0;

  const close = () => { junk.clear(); c.hud.hideOverlay(); c.voice.stop(); onExit?.(); };

  const ask = () => {
    const q = RIDDLES[i];
    const last = i === RIDDLES.length - 1;
    c.hud.sheet({
      eyebrow: `第 ${i + 1} 题 / 共 5 题 · ${q.tag}`,
      body: `<div class="riddle">${q.face.replace(/\n/g, '<br>')}</div>
        <div class="opts">${q.opts.map((o) => `
          <button class="opt" type="button" data-o="${o}">${o}</button>`).join('')}</div>
        <div class="answer" id="ans"></div>`,
      actions: [
        { id: 'skip', label: '想不出来' },
        { id: 'next', label: last ? '看看结果' : '下一题', kind: 'primary', hidden: true },
      ],
      onMount: (o) => {
        c.sfx.play('PAPER', { gain: 0.6 });
        c.voice.play(`M2-${i + 1}`, q.face.replace(/\n/g, ''), { cps: 3.5 });
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
          if (q.last && right) {
            c.voice.play('M2-fin', `这一题你答得出来，是因为前面那二十多步你都看过了。
不用一根钉，不用一滴胶 —— 一凹，一凸，两块木头就咬死了。
这就是榫卯。`, { cps: 3.5 });
          }
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
    c.state.riddleDone = true;
    c.state.modulesDone = { ...c.state.modulesDone, M2: true };
    c.sfx.play('SUCCESS');
    c.hud.sheet({
      eyebrow: `答对 ${score} 题`,
      title: name,
      lede: score ? `灯笼比刚才亮了 ${score * 8}%` : '灯笼还是原来的亮度',
      actions: [
        { label: '再来一次', ico: 'refresh', on: () => { i = 0; score = 0; ask(); } },
        { label: '回去', kind: 'primary', on: close },
      ],
    });
  };

  ask();
  return close;
}
