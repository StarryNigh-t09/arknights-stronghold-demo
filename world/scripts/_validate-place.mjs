import { dragFromTo, confirmDeploy, screenState, saveShot, PENDING_GREEN, validTilesOf, cancelPending } from '../lib/deploy-fast.js';
import { screenshot, adb, swipe } from '../lib/adb.js';
import { scanDeckChips } from '../lib/run.js';

const HOLD = Number(process.env.HOLD || 20);
const MOVE = Number(process.env.MOVE || 150);
const STEPS = Number(process.env.STEPS || 12);
const CONFIRM_MS = Number(process.env.CONFIRM_MS || 400);
const N = Number(process.env.N || 2);
const deckN = (dk) => ((dk && dk.chips) || []).length;
const last = (dk) => { const c = (dk && dk.chips) || []; return c.length ? c[c.length - 1] : null; };

let dk = await scanDeckChips({ minPressY: 840 });
console.log('DECK0', deckN(dk));
const c0 = last(dk);
dragFromTo([c0.x, c0.y], [830, 680], { holdMs: 600, moveMs: 420, tag: 'v0' });
await new Promise((r) => setTimeout(r, 320));
const p0 = saveShot(screenshot(), 'v0');
const s0 = screenState(p0);
if (!(s0.green > PENDING_GREEN)) { console.log('PROBE_FAIL'); process.exit(0); }
const tiles = validTilesOf(p0).map((t) => [t.x, t.y]);
console.log('TILES', tiles.length);
cancelPending(s0);
await new Promise((r) => setTimeout(r, 800));

const rows = [];
for (let i = 0; i < N; i++) {
  dk = await scanDeckChips({ minPressY: 840 });
  const before = deckN(dk);
  const c = last(dk);
  if (!c) { console.log('DECK_EMPTY'); break; }
  const tile = tiles[i % tiles.length];
  const t0 = Date.now();
  dragFromTo([c.x, c.y], tile, { holdMs: HOLD, moveMs: MOVE, steps: STEPS, tag: 'v1' });
  const tDrag = Date.now() - t0;
  await new Promise((r) => setTimeout(r, 300));
  const stA = screenState(saveShot(screenshot(), 'v1'));
  const pend = stA.green > PENDING_GREEN;
  if (!pend) { console.log('ROW', JSON.stringify({ ok: false, why: 'no_pending', tile, tDrag })); continue; }
  const t1 = Date.now();
  confirmDeploy(tile, { ms: CONFIRM_MS });
  const tConf = Date.now() - t1;
  await new Promise((r) => setTimeout(r, 700));
  const stB = screenState(saveShot(screenshot(), 'v2'));
  const dk2 = await scanDeckChips({ minPressY: 840 });
  const ok = deckN(dk2) < before;
  const row = { ok, tile, hold: HOLD, move: MOVE, steps: STEPS, tDrag, tConf, tAll: Date.now() - t0, deckBefore: before, deckAfter: deckN(dk2), greenAfter: stB.green };
  rows.push(row);
  console.log('ROW', JSON.stringify(row));
  if (!ok) { const rc = stB.redCenter || [965, 240]; adb(['shell', 'input', 'tap', String(rc[0]), String(rc[1])]); await new Promise((r) => setTimeout(r, 600)); }
}
console.log('SUMMARY', JSON.stringify({ n: rows.length, ok: rows.filter(r=>r.ok).length }));
