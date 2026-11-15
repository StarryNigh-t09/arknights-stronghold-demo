import { dragFromTo, screenState, saveShot, PENDING_GREEN, validTilesOf, cancelPending } from '../lib/deploy-fast.js';
import { screenshot, adb } from '../lib/adb.js';
import { scanDeckChips } from '../lib/run.js';

const HOLDS = JSON.parse(process.env.HOLDS || '[100,120,150,200,250,300]');
const TRIALS = Number(process.env.TRIALS || 3);
const MOVEMS = Number(process.env.MOVEMS || 420);
const STEPS = Number(process.env.STEPS || 12);
const deckN = (dk) => ((dk && dk.chips) || []).length;
const lastChip = (dk) => { const c = (dk && dk.chips) || []; return c.length ? c[c.length - 1] : null; };
const neutral = () => adb(['shell', 'input', 'tap', '960', '140']);

let dk = await scanDeckChips({ minPressY: 840 });
console.log('DECK0', deckN(dk));
if (!lastChip(dk)) { console.log('NO_DECK'); process.exit(0); }

// 探一次合法格
let c0 = lastChip(dk);
dragFromTo([c0.x, c0.y], [830, 680], { holdMs: 600, moveMs: 420, tag: 'sw0' });
await new Promise((r) => setTimeout(r, 320));
let p0 = saveShot(screenshot(), 'sw0');
let s0 = screenState(p0);
if (!(s0.green > PENDING_GREEN)) { console.log('PROBE_FAIL'); process.exit(0); }
let tiles = validTilesOf(p0).map((t) => [t.x, t.y]);
console.log('TILES', tiles.length, JSON.stringify(tiles.slice(0, 6)));
cancelPending(s0);
await new Promise((r) => setTimeout(r, 800));

const rows = [];
for (const hold of HOLDS) {
  let okN = 0, tSum = 0;
  for (let t = 0; t < TRIALS; t++) {
    dk = await scanDeckChips({ minPressY: 840 });
    const c = lastChip(dk);
    if (!c) { console.log('DECK_EMPTY_MID'); break; }
    const tile = tiles[(t + okN) % tiles.length];
    const t0 = Date.now();
    dragFromTo([c.x, c.y], tile, { holdMs: hold, moveMs: MOVEMS, steps: STEPS, tag: 'sw' });
    const dt = Date.now() - t0;
    await new Promise((r) => setTimeout(r, 300));
    const p = saveShot(screenshot(), 'sw');
    const s = screenState(p);
    const pend = s.green > PENDING_GREEN;
    console.log('T', hold, t, 'pend', pend, 'green', s.green, 'dt', dt, 'press', c.x + ',' + c.y, 'tile', tile.join(','));
    if (pend) {
      okN++; tSum += dt;
      cancelPending(s);
      await new Promise((r) => setTimeout(r, 800));
    } else {
      neutral();
      await new Promise((r) => setTimeout(r, 700));
    }
  }
  const row = { hold, ok: okN, trials: TRIALS, avgDrag: okN ? Math.round(tSum / okN) : null };
  rows.push(row);
  console.log('ROW', JSON.stringify({ ...row, moveMs: MOVEMS, steps: STEPS }));
}
console.log('SUMMARY', JSON.stringify(rows));
