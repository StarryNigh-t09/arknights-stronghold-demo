import fs from 'node:fs';
import { placeFast, saveShot, screenState, probeValidTiles, bodyOf, validTilesOf } from '../lib/deploy-fast.js';
import { scanDeckChips } from '../lib/run.js';
import { senseRun } from '../lib/drive.js';
import { screenshot } from '../lib/adb.js';

const HOLD = Number(process.env.HOLD || 600);
const MOVEMS = Number(process.env.MOVEMS || 420);
const MAXN = Number(process.env.MAXN || 9);

async function main() {
  const st = await senseRun();
  console.log('STATE', JSON.stringify({ screen: st.screen, round: st.round, slotsLeft: st.slotsLeft, money: st.money }));
  if (st.screen !== 'rest' && st.screen !== 'prep') return console.log('NOT_REST');
  let tileset = null;
  try { tileset = JSON.parse(fs.readFileSync('data/tileset.json', 'utf8')); } catch {}
  let tiles = tileset && tileset.round === st.round ? tileset.tiles : null;
  if (!tiles) {
    const dk0 = await scanDeckChips({ minPressY: 840 });
    const chips0 = (dk0 && dk0.chips) || [];
    if (!chips0.length) return console.log('NO_DECK');
    const pr = await probeValidTiles({ x: chips0[0].x, y: chips0[0].y }, { savePng: (b) => saveShot(b, 'probe') });
    console.log('PROBE', JSON.stringify({ ok: pr.ok, n: (pr.tiles || []).length, why: pr.why }));
    if (!pr.ok) return console.log('PROBE_FAIL');
    tiles = pr.tiles.map((t) => ({ x: t.x, y: t.y }));
    fs.writeFileSync('data/tileset.json', JSON.stringify({ round: st.round, at: new Date().toISOString(), tiles }, null, 2), 'utf8');
  }
  console.log('TILES', tiles.length);
  const rows = [];
  for (let i = 0; i < MAXN; i++) {
    const dk = await scanDeckChips({ minPressY: 840 });
    const chips = (dk && dk.chips) || [];
    if (!chips.length) { console.log('DECK_EMPTY'); break; }
    const press = chips[chips.length - 1];
    const tile = tiles[i % tiles.length];
    const r = await placeFast({ from: press, to: [tile.x, tile.y], holdMs: HOLD, moveMs: MOVEMS, tag: 'pf' });
    const dk2 = await scanDeckChips({ minPressY: 840 });
    const n2 = ((dk2 && dk2.chips) || []).length;
    const ok = n2 < chips.length;
    const row = { hold: HOLD, tile: [tile.x, tile.y], press: [press.x, press.y], ok, pending: r.pending, after: r.after, gestureMs: r.gestureMs, ms: r.ms, deckBefore: chips.length, deckAfter: n2, why: r.why || null };
    rows.push(row);
    console.log('ROW', JSON.stringify(row));
    fs.appendFileSync('data/place-sweep.jsonl', JSON.stringify({ ...row, at: new Date().toISOString() }) + '\n', 'utf8');
    if (!ok) { try { const s = screenState(saveShot(screenshot(), 'clr')); if (s.green > 3000) { const rc = s.redCenter || [965, 240]; const { adb } = await import('../lib/adb.js'); adb(['shell', 'input', 'tap', String(rc[0]), String(rc[1])]); } } catch {} }
  }
  const okN = rows.filter((r) => r.ok).length;
  console.log('SUMMARY', JSON.stringify({ n: rows.length, ok: okN, avgGesture: okN ? Math.round(rows.filter((r) => r.ok).reduce((a, b) => a + b.gestureMs, 0) / okN) : null }));
}
main().catch((e) => { console.error('ERR', e && e.stack || e); process.exit(1); });
