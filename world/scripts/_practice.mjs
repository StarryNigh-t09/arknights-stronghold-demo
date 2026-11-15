// 连打练习：一个休息期做一次完整 autoRest（买卡/升级/部署），然后点准备就绪进下一回合。
// 目的：多回合攒「上滑确认」落位的成功率与耗时样本，落 data/practice-log.jsonl。
// 用法：node scripts/_practice.mjs [回合数]，默认 6。
import { setTrace, autoRest, senseRun } from '../lib/drive.js';
import { playRound, peek, sleep } from '../lib/run.js';
import fs from 'node:fs';
import path from 'node:path';

const ROUNDS = Math.max(1, Number(process.argv[2]) || 6);
const tag = 'practice-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
setTrace(tag);
const logPath = path.join(process.cwd(), 'data', 'practice-log.jsonl');
const append = (o) => { try { fs.appendFileSync(logPath, JSON.stringify(o) + '\n'); } catch {} };

const brief = (st) => st ? { screen: st.screen, round: st.round, money: st.money, slotsLeft: st.slotsLeft, shopExpanded: st.shopExpanded } : null;

for (let n = 0; n < ROUNDS; n++) {
  const pre = peek();
  const st = await senseRun().catch(() => null);
  console.log('R' + n + ' STATE ' + JSON.stringify({ state: pre.state, dist: pre.dist, ...brief(st) }));
  if (pre.state !== 'wz_rest' && pre.state !== 'wz_prep') {
    console.log('R' + n + ' STOP 不在休整期（' + pre.state + '）');
    append({ at: new Date().toISOString(), stop: 'not_rest', state: pre.state });
    break;
  }
  const t0 = Date.now();
  let r = null;
  try {
    r = await autoRest({ deploy: true, maxSteps: 6, round: st && st.round, money: st && st.money });
  } catch (e) {
    console.log('R' + n + ' REST_ERR ' + String(e && e.message || e));
    append({ at: new Date().toISOString(), err: String(e && e.message || e) });
  }
  const ms = Date.now() - t0;
  const after = await senseRun().catch(() => null);
  console.log('R' + n + ' REST ' + JSON.stringify({ ok: r && r.ok, placed: r && r.placed, attempts: r && r.attempts, quotaEmpty: r && r.quotaEmpty, failed: r && r.failedTiles && r.failedTiles.length, ms }), ' AFTER ' + JSON.stringify(brief(after)));
  if (r && r.steps) console.log('R' + n + ' STEPS\n' + r.steps.filter((s) => /上场|拎不|合法格|部署中止|试 |候选格|跳过/.test(s)).join('\n'));
  append({ at: new Date().toISOString(), phase: 'rest', round: st && st.round, placed: r && r.placed, attempts: r && r.attempts, quotaEmpty: r && r.quotaEmpty, failed: (r && r.failedTiles && r.failedTiles.length) || 0, ms, after: brief(after) });

  const t1 = Date.now();
  let pr = null;
  try { pr = await playRound({ readyWaitMs: 4000, battleMaxMs: 240000 }); }
  catch (e) { console.log('R' + n + ' ROUND_ERR ' + String(e && e.message || e)); append({ at: new Date().toISOString(), err: String(e && e.message || e) }); break; }
  console.log('R' + n + ' ROUND ' + JSON.stringify({ ok: pr && pr.ok, state: pr && pr.state, reason: pr && pr.reason, ms: Date.now() - t1 }));
  if (pr && pr.log) console.log(pr.log.slice(0, 6).join('\n'));
  await sleep(1200);
  const next = await senseRun().catch(() => null);
  console.log('R' + n + ' NEXT ' + JSON.stringify(brief(next)));
  if (!next || (next.screen !== 'rest' && next.screen !== 'prep')) {
    console.log('R' + n + ' STOP 下一回合不在休整期：' + JSON.stringify(brief(next)));
    append({ at: new Date().toISOString(), stop: 'next_not_rest', next: brief(next) });
    break;
  }
}
console.log('DONE ' + tag + ' log=' + logPath);
