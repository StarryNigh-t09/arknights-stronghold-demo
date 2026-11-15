import { scanDeckChips, scanFreeTiles, placeDeckUnit } from '../lib/run.js';
import { senseRun } from '../lib/drive.js';
const t0 = Date.now();
const before = await senseRun();
console.log('BEFORE', JSON.stringify({ screen: before.screen, slots: before.slotsLeft, hp: before.hp, money: before.money }));
const ch = await scanDeckChips();
console.log('CHIPS', (ch.chips || []).length, JSON.stringify((ch.chips || []).map(c => [c.x, c.y])));
const ft = await scanFreeTiles({});
console.log('FREE', JSON.stringify(ft.tiles));
if ((ch.chips || []).length && (ft.tiles || []).length) {
  const s = ch.chips[0], d = ft.tiles[0];
  const t1 = Date.now();
  const r = await placeDeckUnit({ index: 0, x: s.x, y: s.y, to: [d[0], d[1]], facing: 'right' });
  console.log('PLACE_MS', Date.now() - t1, JSON.stringify(r.log));
}
await new Promise(r => setTimeout(r, 1200));
const after = await senseRun();
console.log('AFTER', JSON.stringify({ screen: after.screen, slots: after.slotsLeft, hp: after.hp }));
console.log('TOTAL_MS', Date.now() - t0);
