/**
 * M1 点灯 · M2 猜灯谜
 */

import * as THREE from 'three';
import { V, a, C, PALETTE, Junk, buildNightSky } from '../steps/util.js';
import { tween, Ease, wait } from '../util/tween.js';

const junk = new Junk(null);

// ══════════════════════════════════════════════════════════
// M1 · 点灯
//   核心机制：长按引火 1.2 s，亮度走**指数曲线** ——
//   前 0.9 s 只到 30%，最后 0.3 s 冲到 100%。线性曲线会让点亮显得平淡。
// ══════════════════════════════════════════════════════════
export function openM1(c, onExit) {
  junk.scene = c.stage.scene;
  junk.clear();
  c.stage.setMood('night');
  c.bgm.play('BGM_C_LANTERN');
  junk.add(buildNightSky(c.stage.scene));
  c.stage.setRecommended({ az: 55, el: 6, dist: 240, target: V(0, 0, C.LOWER_Z1 + 20) });
  c.stage.snapToRecommended();

  let level = c.state.lit ? 1 : 0;
  let holding = false, held = 0, lit = c.state.lit;
  let required = 1.2;
  let attempts = 0;
  c.lantern.setLit(level * baseLevel(c));

  // 控件全部压到画面底部，把中间整块留给灯笼本身
  const html = `<div class="panel" style="position:fixed;left:0;right:0;bottom:calc(var(--safe) + 8px);
       display:flex;flex-direction:column;align-items:center;gap:12px;padding:0;max-height:none">
      <div id="m1-tip" style="font-size:13px;letter-spacing:.1em;color:rgba(236,229,216,.6)">
        长按不放，等它烧起来
      </div>
      <div id="m1-ring" style="width:76px;height:76px;position:relative">
        <svg viewBox="0 0 100 100" style="transform:rotate(-90deg)">
          <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(200,160,99,.18)" stroke-width="4"/>
          <circle id="m1-arc" cx="50" cy="50" r="44" fill="none" stroke="#c8a063" stroke-width="4"
                  stroke-linecap="round" stroke-dasharray="276" stroke-dashoffset="276"/>
        </svg>
      </div>
      <button id="m1-btn" class="main-btn" style="padding:14px 36px;font-size:15px">按住灯芯点亮</button>
      <div id="m1-tools" hidden style="display:flex;flex-direction:column;align-items:center;gap:12px">
        <div class="slider-wrap"><span>亮度</span>
          <input id="m1-bright" type="range" min="10" max="100" value="100"></div>
        <div style="display:flex;gap:10px">
          <button id="m1-again" class="alt-btn">重新点一次</button>
          <button id="m1-back" class="ghost-btn">返回</button>
        </div>
      </div>
    </div>`;

  c.hud.showOverlay(html, { solid: false, onMount: (o) => {
    o.classList.add('clear');
    const btn = o.querySelector('#m1-btn');
    const arc = o.querySelector('#m1-arc');
    const tip = o.querySelector('#m1-tip');
    const tools = o.querySelector('#m1-tools');

    const finish = async () => {
      lit = true;
      c.state.lit = true;
      c.state.litLevel = 1;
      c.sfx.stopLoop('FLAME_IGNITE');
      c.sfx.play('LIGHT_BLOOM');
      c.sfx.loop('FLAME_LOOP');
      btn.style.display = 'none';
      o.querySelector('#m1-ring').style.display = 'none';
      tip.textContent = '';
      // 点亮瞬间快速后拉至全景，让整盏灯笼一次性进入画面
      c.stage.setRecommended({ az: 55, el: 10, dist: 460, target: V(0, 0, 96), ease: 2.2 });
      await tween(0.9, (k) => {
        c.lantern.setLit(baseLevel(c) * (0.3 + 0.7 * k));
        // 灯笼整体升起 0.5a 并微微摆动
        c.lantern.root.position.z = a(0.5) * Math.sin(k * Math.PI) * 0.6;
      }, { ease: Ease.outCubic });
      c.lantern.root.position.z = 0;
      c.lantern.setLit(baseLevel(c));
      c.hud.toast('✓ 灯亮了', { dur: 1600 });
      await wait(1.5);
      c.voice.play('M1', `亮了。
光从绵纸里透出来，被木头挡成一格一格的 —— 这就是你刚才选的那个花纹。
（停顿 1.0 s）
看地上。`, { cps: 3.6 });
      tools.hidden = false;
      c.state.modulesDone = { ...c.state.modulesDone, M1: true };
    };

    const startHold = () => {
      if (lit || holding) return;
      holding = true; held = 0;
      c.sfx.loop('FLAME_IGNITE', { dur: required });
      tip.textContent = '按住…';
    };
    const endHold = () => {
      if (!holding || lit) return;
      holding = false;
      c.sfx.stopLoop('FLAME_IGNITE');
      if (held < required) {
        attempts++;
        // 无「失败」，仅有「未完成」；连续 3 次后隐性把所需时长降至 0.8 s
        if (attempts >= 3) required = 0.8;
        tip.textContent = attempts >= 3 ? '按住不放，等它烧起来' : '再按久一点';
        tween(0.5, (k) => {
          const v = level * (1 - k);
          c.lantern.setLit(v * baseLevel(c));
          arc.style.strokeDashoffset = String(276 * (1 - v));
        }, { onDone: () => { level = 0; } });
      }
    };

    btn.addEventListener('pointerdown', startHold);
    addEventListener('pointerup', endHold);
    btn.addEventListener('pointerleave', endHold);

    const upd = (dt) => {
      if (!holding || lit) return;
      held += dt;
      const k = Math.min(1, held / required);
      level = Ease.ignite(k);       // ★指数曲线
      c.lantern.setLit(level * baseLevel(c));
      arc.style.strokeDashoffset = String(276 * (1 - k));
      if (k >= 1) { holding = false; finish(); }
    };
    c.stage.updaters.add(upd);
    junk.add({ dispose: () => {
      c.stage.updaters.delete(upd);
      removeEventListener('pointerup', endHold);
    } });

    o.querySelector('#m1-bright').addEventListener('input', (e) => {
      c.state.litLevel = e.target.value / 100;
      c.lantern.setLit(baseLevel(c) * c.state.litLevel);
    });
    o.querySelector('#m1-again').addEventListener('click', () => {
      lit = false; level = 0; c.state.lit = false;
      c.lantern.setLit(0);
      btn.style.display = ''; o.querySelector('#m1-ring').style.display = '';
      tools.hidden = true; tip.textContent = '长按不放，等它烧起来';
      c.sfx.stopLoop('FLAME_LOOP');
    });
    o.querySelector('#m1-back').addEventListener('click', () => {
      c.sfx.play('PORTAL_ENTER');
      close();
    });

    if (lit) { finish(); }
  } });

  const close = () => {
    c.sfx.stopLoop('FLAME_IGNITE');
    junk.clear();
    c.hud.hideOverlay();
    c.voice.stop();
    onExit?.();
  };
  return close;
}

/** M2 答对加亮：每题 +8%，5 题满分 +40%，须设上限钳制避免过曝 */
function baseLevel(c) {
  return Math.min(1.4, 1 + c.state.riddleScore * 0.08);
}

// ══════════════════════════════════════════════════════════
// M2 · 猜灯谜
//   ★设计红线：答错不惩罚、不阻断、不重来、不使用红色。
//   Q1–Q4 为流传久远的民间谜面（公有领域），Q5 为本片原创的知识回收题。
// ══════════════════════════════════════════════════════════
const RIDDLES = [
  {
    face: '麻屋子，红帐子，\n里面住着一个白胖子', tag: '打一食物',
    answer: '花生', opts: ['花生', '核桃', '石榴', '荔枝'],
    note: '麻屋子指外壳，红帐子指红衣，白胖子即果仁。',
  },
  {
    face: '千条线，万条线，\n落到水里看不见', tag: '打一自然现象',
    answer: '雨', opts: ['雪', '雨', '雾', '风'],
    note: '雨丝入水即隐，故「看不见」。',
  },
  {
    face: '身子矮矮，肚里有火，\n越烧越短，烧完就没', tag: '打一日用物',
    answer: '蜡烛', opts: ['油灯', '火柴', '蜡烛', '香'],
    note: '正是这盏灯笼里的灯芯。',
  },
  {
    face: '有面没有口，有脚没有手，\n四只脚站着，自己不会走', tag: '打一家具',
    answer: '桌子', opts: ['凳子', '桌子', '柜子', '床'],
    note: '「面」「脚」皆为木作术语。',
  },
  {
    face: '不用一钉，不用一胶，\n一凹一凸，两木咬牢', tag: '打一木作工艺',
    answer: '榫卯', opts: ['榫卯', '斗拱', '雕花', '髹漆'],
    note: '凸为榫，凹为卯 —— 你在第二幕已经见过它。',
    finale: true,
  },
];

export function openM2(c, onExit) {
  junk.scene = c.stage.scene;
  junk.clear();
  c.stage.setMood('night');
  c.bgm.play('BGM_C_FAIR');
  junk.add(buildNightSky(c.stage.scene));
  c.stage.setRecommended({ az: 40, el: 10, dist: 620, target: V(90, 0, 96) });
  c.stage.snapToRecommended();

  let i = 0, score = 0;
  const render = () => {
    const q = RIDDLES[i];
    const html = `<div class="panel">
      <div style="text-align:right;font-size:12px;letter-spacing:.1em;color:rgba(236,229,216,.5)">
        第 ${i + 1} 题 / 共 5 题 · ${q.tag}
      </div>
      <div class="riddle-face">${q.face.replace(/\n/g, '<br>')}</div>
      <div class="riddle-opts">
        ${q.opts.map((o) => `<button class="riddle-opt" data-o="${o}">${o}</button>`).join('')}
      </div>
      <div id="m2-fb" style="margin-top:20px;min-height:64px"></div>
      <div style="margin-top:14px;text-align:center;display:flex;gap:10px;justify-content:center">
        <button id="m2-skip" class="ghost-btn">跳过本题</button>
        <button id="m2-next" class="main-btn" hidden>下一题 ▸</button>
      </div>
    </div>`;
    c.hud.showOverlay(html, { onMount: (o) => {
      c.sfx.play('PAPER_UNROLL');
      c.voice.play(`M2-${i + 1}`, q.face.replace(/\n/g, ''), { cps: 3.5 });
      const fb = o.querySelector('#m2-fb');
      const next = o.querySelector('#m2-next');
      const answer = (picked) => {
        o.querySelectorAll('.riddle-opt').forEach((b) => {
          b.disabled = true;
          // ★不得使用红色表示错误 —— 一律用暖金高亮正确项的正向表述
          if (b.dataset.o === q.answer) b.classList.add('right');
          else b.classList.add('dim');
        });
        const right = picked === q.answer;
        if (right) {
          score++;
          c.state.riddleScore = score;
          c.sfx.play('RIDDLE_CORRECT');
          c.lantern.setLit(c.state.lit ? Math.min(1.4, 1 + score * 0.08) : score * 0.08);
          c.sfx.play('LIGHT_ABSORB', { delay: 0.3 });
          fb.innerHTML = `<div class="card"><h4>答对了 · 灯更亮了一点</h4><p>谜底：${q.answer} —— ${q.note}</p></div>`;
        } else {
          c.sfx.play('RIDDLE_SOFT');
          fb.innerHTML = `<div class="card"><h4>这次没猜中 —— 灯谜本就是慢慢想的</h4><p>谜底：${q.answer} —— ${q.note}</p></div>`;
        }
        if (q.finale && right) {
          fb.innerHTML += `<div class="card"><h4>知识闭环</h4>
            <p>你能答出这题，是因为前面二十多步你都看过了。<br>
            不用一钉，不用一胶 —— 一凹一凸，两木咬牢。这就是榫卯。</p></div>`;
          c.voice.play('M2-fin', `这一题，你答得出来，是因为前面那二十多步你都看过了。
不用一根钉，不用一滴胶 —— 一凹，一凸，两块木头就咬死了。
这就是榫卯。`, { cps: 3.5 });
        }
        next.hidden = false;
        next.textContent = i === RIDDLES.length - 1 ? '看看结果 ▸' : '下一题 ▸';
      };
      o.querySelectorAll('.riddle-opt').forEach((b) => {
        b.addEventListener('click', () => answer(b.dataset.o));
      });
      o.querySelector('#m2-skip').addEventListener('click', () => answer('__skip__'));
      next.addEventListener('click', () => {
        i++;
        if (i < RIDDLES.length) render(); else result();
      });
    } });
  };

  const result = () => {
    const title = score === 5 ? '榫卯通' : score === 4 ? '巧手' : score === 3 ? '明白人' : '学徒';
    c.state.riddleDone = true;
    c.state.modulesDone = { ...c.state.modulesDone, M2: true };
    c.sfx.play('ACHIEVEMENT_MID');
    if (score >= 3) c.lantern.fuCharmUnlocked = true;
    c.hud.showOverlay(`<div class="panel" style="text-align:center">
      <h2>${title}</h2>
      <p class="lead">答对 ${score}/5 · 灯笼亮度 +${score * 8}%</p>
      ${score >= 3 ? '<p class="lead" style="color:var(--tenon)">解锁「福」字灯挂饰</p>' : ''}
      <div style="margin-top:24px;display:flex;gap:10px;justify-content:center">
        <button id="m2-again" class="alt-btn">再玩一次</button>
        <button id="m2-back" class="main-btn">返回</button>
      </div>
    </div>`, { onMount: (o) => {
      o.querySelector('#m2-again').addEventListener('click', () => { i = 0; score = 0; render(); });
      o.querySelector('#m2-back').addEventListener('click', close);
    } });
  };

  const close = () => {
    junk.clear();
    c.hud.hideOverlay();
    c.voice.stop();
    onExit?.();
  };

  render();
  return close;
}

export { PALETTE, THREE };
