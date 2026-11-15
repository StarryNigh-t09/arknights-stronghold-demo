import { playRound, peek, shopAction, tapAt, POINTS, sleep } from '../lib/run.js';
import { senseRun } from '../lib/drive.js';

async function main() {
  const pre = peek();
  console.log('PRE', JSON.stringify({ state: pre.state, dist: pre.dist }));
  const r = await playRound({ readyWaitMs: 4000, battleMaxMs: 200000 });
  console.log('ROUND', JSON.stringify(r));
  await sleep(1500);
  try {
    const st = await senseRun();
    console.log('AFTER', JSON.stringify({ screen: st && st.screen, round: st && st.round, money: st && st.money, slotsLeft: st && st.slotsLeft, shopExpanded: st && st.shopExpanded }));
  } catch (e) { console.log('AFTER_ERR', String(e && e.message || e)); }
}
main().catch((e) => { console.error('ERR', e && e.stack || e); process.exit(1); });
