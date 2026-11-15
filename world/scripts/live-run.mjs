/**
 * live-run.mjs — 实测用：进卫戍 → 打一整局 → 结算回主页，全程落日志文件。
 * 用法：node scripts/live-run.mjs [maxRounds] [deploy|nodeploy]
 * 日志：world/logs/live-<时间戳>.log（同时打 stdout）
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { goto } from '../lib/nav.js';
import { enterRun, leaveSettle, peek, readSettle, appendRunRecord } from '../lib/run.js';
import { autoRun } from '../lib/drive.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(HERE, '..', 'logs');
mkdirSync(LOG_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const LOG = join(LOG_DIR, 'live-' + stamp + '.log');

const maxRounds = Math.max(1, Number(process.argv[2]) || 3);
const deploy = process.argv[3] !== 'nodeploy';
// 第 4 个参数 want = 启用「开局列目标阵容清单，照着买」（wants.js）
const wantList = process.argv[4] === 'want' ? 'auto' : null;
// 第 5 个参数 free = 上场前扫「抓取态绿格」，扫出来的空格用来补位（写死的 12 格仍排最前）
const freeScan = process.argv[5] === 'free';

function say(line) {
  const s = '[' + new Date().toTimeString().slice(0, 8) + '] ' + line;
  console.log(s);
  try { appendFileSync(LOG, s + '\n'); } catch (e) { void e; }
}

say('=== 实测开始 maxRounds=' + maxRounds + ' deploy=' + deploy + ' ===');
say('当前界面：' + JSON.stringify(peek().state));

const nav = await goto('wz_hall', { onStep: (s) => say('  nav ' + s) });
say('进卫戍大厅：' + (nav.ok ? 'OK ' + nav.state : '失败 ' + (nav.error || nav.blocked || nav.state)));
for (const l of (nav.log || []).slice(-4)) say('  ' + l);
if (!nav.ok) { say('停在导航，不盲点'); process.exit(2); }

const enter = await enterRun({ mode: 'independent' });
for (const l of enter.log || []) say('  ' + l);
say('进对局：' + (enter.ok ? 'OK' : '失败 ' + enter.blocked));
if (!enter.ok) { say('开局没走通，停手'); process.exit(3); }

// 新开局先把名册/棋盘清零：上一局残留的 op-N 会和本局的编号、格子混在一起（19:30 实测 8 人里 5 个是上一局）
try {
  const { emptyRoster, saveRoster } = await import('../lib/roster.js')
  const { emptyBoard, saveBoard } = await import('../lib/board.js')
  saveRoster(emptyRoster())
  saveBoard(emptyBoard())
  say('名册/棋盘已清零（新开局）')
} catch (e) { say('名册清零失败：' + e.message) }

// 第 6 个参数 smart = 按职业+攻击范围挑站位（需要认人；认不出就退回原顺序）
const smart = process.argv[6] === 'smart';
const t0 = Date.now();
const hb = setInterval(() => say('…还在跑 ' + Math.round((Date.now() - t0) / 1000) + 's'), 30_000);
const r = await autoRun({
  maxRounds,
  deploy,
  wantList,
  freeScan,
  smart,
  centerLevel: 1,
  onRound: (x) => say('ROUND ' + JSON.stringify(x)),
});
clearInterval(hb);
say('autoRun 结束：stop=' + r.stop + ' 回合数=' + r.rounds.length);
for (const line of r.log || []) say('  ' + line);
say('战报 ' + JSON.stringify(r.rounds));

// 结算页读数 + 落盘（每局一条，攒起来做复盘）
let settle = null;
if (peek().state === 'wz_settle') {
  // 打通/打穿的通过回合口径不同（见 readSettle 里的 cleared 判断），把打完的回合数传进去兜底
  settle = await readSettle({ roundFallback: r.rounds.length });
  say('结算读数：' + JSON.stringify(settle && { cleared: settle.cleared, passedRounds: settle.passedRounds, cert: settle.cert, duration: settle.duration }));
  const okRec = appendRunRecord({
    at: new Date().toISOString(),
    maxRounds,
    rounds: r.rounds,
    stop: r.stop,
    settle,
    log: r.log,
  });
  say('战果已记入 data/runs.jsonl：' + okRec);
}

try {
  const left = await leaveSettle();
  say('回主页：' + JSON.stringify(left).slice(0, 300));
} catch (e) {
  say('回主页失败：' + e.message);
}
say('=== 实测结束 ===');
say('LOG=' + LOG);
