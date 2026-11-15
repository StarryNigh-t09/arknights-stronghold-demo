/**
 * play-from-rest.mjs — 从当前休整期直接续打（不导航、不开局），用来造「整备区有干员」的局面。
 * 用法：node scripts/play-from-rest.mjs [maxRounds] [deploy|nodeploy]
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { autoRun } from '../lib/drive.js';
import { peek } from '../lib/run.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(HERE, '..', 'logs');
mkdirSync(LOG_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const LOG = join(LOG_DIR, 'rest-' + stamp + '.log');
const say = (line) => {
  const s = '[' + new Date().toTimeString().slice(0, 8) + '] ' + line;
  console.log(s);
  try { appendFileSync(LOG, s + '\n'); } catch (e) { void e; }
};

const maxRounds = Math.max(1, Number(process.argv[2]) || 1);
const deploy = process.argv[3] !== 'nodeploy';
say('=== 续打 maxRounds=' + maxRounds + ' deploy=' + deploy + ' 当前=' + JSON.stringify(peek().state) + ' ===');
// 第 4 个参数：已经上场的干员数（整备区上限 10 判据），不传就当 0
export const BOARD0 = Math.max(0, Number(process.argv[4]) || 0);
// 第 5 个参数 want = 目标阵容清单；第 6 个参数 free = 上场前扫绿格补位
const wantList = process.argv[5] === 'want' ? 'auto' : null;
const freeScan = process.argv[6] === 'free';
// 心跳：每 30 秒写一行，卡在 OCR/拖拽时能看出「还活着、卡在哪一秒」
const t0 = Date.now();
const hb = setInterval(() => say('…还在跑 ' + Math.round((Date.now() - t0) / 1000) + 's'), 30_000);
const r = await autoRun({ maxRounds, deploy, boardCount: BOARD0, wantList, freeScan, onRound: (x) => say('ROUND ' + JSON.stringify(x)) });
clearInterval(hb);
say('结束 stop=' + r.stop + ' rounds=' + r.rounds.length);
for (const l of r.log || []) say('  ' + l);
say('LOG=' + LOG);
