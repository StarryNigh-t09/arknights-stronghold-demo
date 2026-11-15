import fs from 'node:fs';
import { shot, state, deckBadges, probeTiles, place, bodyOf, swipe, sleep, tapRaw } from './_place-lib.mjs';

const REPEAT = Number(process.env.REPEAT || 3);
const HOLDS = (process.env.HOLDS || '100,150,200,250,300,400,600').split(',').map(Number);
const HOLD_START = process.env.HOLD_START ? Number(process.env.HOLD_START) : null; // 从某个 hold 值开始
const LOG = 'data/place-sweep.jsonl';

function log(obj) {
  fs.appendFileSync(LOG, JSON.stringify(obj) + '\n', 'utf8');
}
async function clearPending() {
  const p = shot('clr');
  const s = state(p);
  if (s.green > 3000) {
    const rc = s.redCenter || [965, 240];
    tapRaw(rc[0], rc[1]);
    await sleep(700);
    return true;
  }
  return false;
}

async function main() {
  const base = shot('sweep-base');
  const s0 = state(base);
  console.log('BASE', JSON.stringify(s0));
  if (s0.green > 3000) { await clearPending(); console.log('CLEARED'); }
  let badges = deckBadges(shot('sweep-deck'));
  console.log('DECK', JSON.stringify(badges));
  if (!badges.length) return console.log('DECK_EMPTY');

  const probePress = bodyOf(badges[badges.length - 1]);
  const pr = await probeTiles(probePress);
  console.log('PROBE', JSON.stringify({ ok: pr.ok, n: (pr.tiles || []).length, cancelled: pr.cancelled, why: pr.why }));
  if (!pr.ok) return console.log('PROBE_FAIL');
  const tiles = (pr.tiles || []).filter((t) => t.y > 300 && t.y < 800);
  tiles.sort((a, b) => (b.y - a.y) || (a.x - b.x));
  const used = [];
  let ti = 0;

  const rows = [];
  for (const hold of HOLDS) {
    if (HOLD_START != null && hold < HOLD_START) continue;
    for (let rep = 0; rep < REPEAT; rep++) {
      const dk = deckBadges(shot('sweep-d' + hold + '-' + rep));
      if (!dk.length) { console.log('DECK_EMPTY_STOP'); break; }
      const press = bodyOf(dk[dk.length - 1]);
      const tile = tiles[ti % tiles.length] || tiles[0];
      const r = await place(press, tile, { holdMs: hold });
      const okDeck = r.deck != null && r.deck < dk.length;
      const row = { hold, rep, tile: [tile.x, tile.y], press: [press.x, press.y], ok: !!(r.ok && okDeck), clear: r.ok, deckBefore: dk.length, deckAfter: r.deck, tGesture: r.tGesture, tAll: r.tAll, why: r.why || null, at: new Date().toISOString() };
      log(row); rows.push(row);
      console.log('ROW', JSON.stringify(row));
      if (row.ok) ti++; else await clearPending();
    }
  }
  const byHold = {};
  for (const r of rows) {
    byHold[r.hold] = byHold[r.hold] || { n: 0, ok: 0, sumGesture: 0 };
    byHold[r.hold].n++;
    if (r.ok) { byHold[r.hold].ok++; byHold[r.hold].sumGesture += r.tGesture; }
  }
  console.log('SUMMARY', JSON.stringify(Object.entries(byHold).map(([h, v]) => ({ hold: Number(h), n: v.n, ok: v.ok, avgGesture: v.ok ? Math.round(v.sumGesture / v.ok) : null }))));
}
main().catch((e) => { console.error('ERR', e && e.stack || e); process.exit(1); });
