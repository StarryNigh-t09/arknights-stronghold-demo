import { setTrace, senseRun, deployFromDeck } from '../lib/drive.js';
import { scanDeckChips } from '../lib/run.js';
const tag = 'deployonly-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
setTrace(tag);
const st = await senseRun();
console.log('STATE', JSON.stringify({ screen: st.screen, round: st.round, slotsLeft: st.slotsLeft, money: st.money, shopExpanded: st.shopExpanded }));
const sc = await scanDeckChips({ minPressY: 840 });
const n = ((sc && sc.chips) || []).length;
console.log('DECK', n, JSON.stringify(((sc && sc.chips) || []).map((c) => [c.x, c.y])));
if (!n) { console.log('EMPTY'); process.exit(0); }
const deck = new Array(n).fill({}).map(() => ({ name: '' }));
const t0 = Date.now();
const r = await deployFromDeck(deck, { slotsLeft: st.slotsLeft, round: st.round, trace: tag, shopOpen: false });
console.log('RESULT', JSON.stringify({ ok: r.ok, placed: r.placed, attempts: r.attempts, ms: r.ms, holdStart: r.holdStart, failed: (r.failedTiles || []).length, wall: Date.now() - t0 }));
console.log('STEPS\n' + (r.steps || []).join('\n'));
console.log('TRACE ' + tag);
