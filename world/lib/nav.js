/**
 * nav.js — 界面状态机：从任意已知界面走到目标界面
 *
 * 只干导航，不碰对局。默认停在「卫戍协议大厅」——再往里点「个人模拟」就是真开一局、
 * 消耗战绩，必须人点头。
 *
 * 每一步：截图 → vision 分类 → 查转移表 → 动作 → 等页面稳定。
 * 两个必须有的容错（都是实测踩到的）：
 *   1. 点完立刻截图常常抓到过场淡入帧，dist 会飙到 0.17 —— 所以要「等它稳」
 *   2. 冷启动有 40~50 秒的加载轮播，分类器认不出，不能当成出错，得等
 */
import { screenshot, tap, key, foregroundApp, GAME_PKG } from './adb.js';
import { classifyBuffer } from './vision.js';

/** state → 怎么离开它 */
export const TRANSITIONS = {
  title: { action: 'tap', at: [967, 1040], label: 'START', waitMs: 8000 },
  login: { action: 'tap', at: [959, 761], label: '开始唤醒', waitMs: 24000 },
  hall: { action: 'tap', at: [1686, 225], label: '卫戍协议 banner', waitMs: 5000 },
  wz_hall: { action: null, label: '已到卫戍协议大厅' },
  wz_admin: { action: 'key', code: 4, label: '返回键（编队界面）', waitMs: 3000 },
  wz_squad: { action: 'tap', at: [1832, 90], label: '关闭弹窗 X', waitMs: 3000 },
  wz_db: { action: 'tap', at: [1832, 90], label: '关闭弹窗 X', waitMs: 3000 },
  // 联机入口「选择同盟方式」：左上返回箭头回大厅。
  // 注意：这里**不自动点**创建/加入同盟 —— 建同盟会留房间，进同盟要密钥，都得人点头。
  wz_joint: { action: 'tap', at: [65, 40], label: '返回箭头（同盟方式页）', waitMs: 2500 },
  unknown: { action: null, label: '不认识的界面' },
};

/**
 * 只有「入口」没有「离开规则」的界面：从哪个界面点哪一下能进去。
 * 现在只有联机入口这一条（大厅 → 同盟模拟）。
 */
export const ENTRY = {
  wz_joint: { from: 'wz_hall', at: [1187, 945], label: '同盟模拟', waitMs: 2500 },
};

const SETTLED = 0.07;          // dist 小于这个才算「画面稳了、可以动手」
                               // 干净帧实测 0.000~0.012；过场淡入帧 0.086~0.199。
                               // 0.07 卡在中间：宁可多等一帧，也不要对着淡入帧乱点。
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 看一眼。画面还在过场（dist 大）就隔一会儿再看，最多 4 次，返回最稳的那次。
 */
export async function look({ tries = 5, gapMs = 1500 } = {}) {
  let best = null;
  for (let i = 0; i < tries; i++) {
    const vis = classifyBuffer(screenshot());
    if (!best || Number(vis.dist) < Number(best.dist)) best = vis;
    if (Number(best.dist) <= SETTLED) break;
    if (i < tries - 1) await sleep(gapMs);
  }
  return best;
}

/**
 * 走到 target（默认 wz_hall）。
 * @returns {Promise<{ok:boolean, state:string, steps:string[], reason?:string}>}
 */
export async function goto(target = 'wz_hall', { deadlineMs = 210_000, unknownGraceMs = 30_000, onStep } = {}) {
  const t0 = Date.now();
  const steps = [];
  let lastActed = null;
  let unknownSince = 0;
  let unsure = 0;

  while (Date.now() - t0 < deadlineMs) {
    // 游戏不在前台就别点：MuMu 在 force-stop 后还会留最后一帧，
    // 对着这一帧点等于在桌面上乱点（实测会把启动后的进度算成「已在大厅」）
    const app = foregroundApp();
    if (!app || app.pkg !== GAME_PKG) {
      steps.push('  … 游戏不在前台（' + (app ? app.pkg : 'none') + '），等它起来');
      await sleep(2000);
      continue;
    }
    const vis = await look();
    const state = (vis && vis.state) || 'unknown';
    const dist = Number(vis.dist).toFixed(3);
    steps.push('界面 ' + state + ' dist=' + dist);
    if (onStep) onStep(state, vis);
    // 画面不稳就不动手：淡入帧上分类会漂（实测 hall 加载时被认成 wz_db，dist 0.098）
    if (Number(vis.dist) > SETTLED) {
      unsure = unsure + 1;
      steps.push('  … 画面没稳或没认出（dist ' + dist + '），等 2s 再看（第 ' + unsure + ' 次）');
      if (unsure > 45) return { ok: false, state, steps, reason: '连续 90 秒没能确认界面' };
      await sleep(2000);
      continue;
    }
    unsure = 0;
    if (state === target) return { ok: true, state, steps };

    // 先进入口：目标界面可能不是靠「当前界面的离开规则」走过去的
    const entry = ENTRY[target];
    if (entry && state === entry.from && lastActed !== 'entry:' + target) {
      tap(entry.at[0], entry.at[1]);
      lastActed = 'entry:' + target;
      steps.push('  → 进入 ' + target + '：「' + entry.label + '」(' + entry.at.join(',') + ')');
      await sleep(entry.waitMs ?? 2500);
      continue;
    }
    if (entry && state === entry.from && lastActed === 'entry:' + target) {
      return { ok: false, state, steps, reason: '点了「' + entry.label + '」之后没进到 ' + target };
    }

    const t = TRANSITIONS[state];
    if (!t || !t.action) {
      if (state === 'unknown') {
        // 加载轮播、过场、对局界面都长这样：等，但别无限等
        unknownSince = unknownSince || Date.now();
        if (Date.now() - unknownSince > unknownGraceMs) {
          return { ok: false, state, steps, reason: '停在未识别界面超过 ' + Math.round(unknownGraceMs / 1000) + ' 秒（可能是加载卡住，或已经到了对局界面）' };
        }
        steps.push('  … 未知界面，等 2.5s 再看');
        await sleep(2500);
        continue;
      }
      return { ok: false, state, steps, reason: '卡在 ' + state + '（' + (t ? t.label : '没有转移规则') + '）' };
    }
    unknownSince = 0;

    if (lastActed === state) {
      return { ok: false, state, steps, reason: '点了「' + t.label + '」之后界面没变，可能没点中或页面还在加载' };
    }
    lastActed = state;
    if (t.action === 'tap') tap(t.at[0], t.at[1]);
    else if (t.action === 'key') key(t.code);
    steps.push('  → ' + t.label + (t.at ? ' (' + t.at.join(',') + ')' : ''));
    await sleep(t.waitMs ?? 3000);
  }
  return { ok: false, state: 'unknown', steps, reason: '超时（' + Math.round(deadlineMs / 1000) + ' 秒）还没到 ' + target };
}

if (process.argv[1] && process.argv[1].endsWith('nav.js')) {
  const target = process.argv[2] || 'wz_hall';
  const r = await goto(target);
  console.log(r.steps.join('\n'));
  console.log(r.ok ? '到达 ' + target : '失败：' + r.reason);
  process.exit(r.ok ? 0 : 1);
}
