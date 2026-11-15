import { dragFromTo, screenState, saveShot, PENDING_GREEN, validTilesOf, confirmDeploy, cancelPending } from '../lib/deploy-fast.js';
import { screenshot, adb, swipe } from '../lib/adb.js';
import { scanDeckChips } from '../lib/run.js';

const deckN = (dk) => ((dk && dk.chips) || []).length;

let dk = await scanDeckChips({ minPressY: 840 });
console.log('DECK', deckN(dk), JSON.stringify(((dk && dk.chips) || []).map(c => [c.x, c.y])));
const chips = (dk && dk.chips) || [];
if (!chips.length) { console.log('EMPTY'); process.exit(0); }
const c = chips[chips.length - 1];
const PRESS = [c.x - 40, c.y - 20];

// 1) 探合法格
dragFromTo(PRESS, [830, 680], { holdMs: 600, moveMs: 420, tag: 'pr' });
await new Promise((r) => setTimeout(r, 320));
const p0 = saveShot(screenshot(), 'pr');
let s = screenState(p0);
console.log('PROBE_PEND', s.green, 'red', s.red, 'redC', JSON.stringify(s.redCenter));
if (!(s.green > PENDING_GREEN)) { console.log('NO_PENDING_PROBE'); process.exit(0); }
const tiles = validTilesOf(p0);
console.log('TILES', tiles.length, JSON.stringify(tiles.slice(0, 8).map(t => [t.x, t.y, Number(t.ratio.toFixed(2))])));
cancelPending(s);
await new Promise((r) => setTimeout(r, 800));

// 2) 正式拖 + 上滑确认
const T = [Number(process.env.TX || (tiles[2] ? tiles[2].x : 830)), Number(process.env.TY || (tiles[2] ? tiles[2].y : 680))];
const t0 = Date.now();
dragFromTo(PRESS, T, { holdMs: 600, moveMs: 420, tag: 'go' });
const tDrag = Date.now() - t0;
await new Promise((r) => setTimeout(r, 320));
const p1 = saveShot(screenshot(), 'go');
s = screenState(p1);
console.log('PEND', s.green, 'tDrag', tDrag, 'tile', JSON.stringify(T));
if (!(s.green > PENDING_GREEN)) { console.log('NO_PENDING_GO'); process.exit(0); }
confirmDeploy(T, { ms: 400 });
await new Promise((r) => setTimeout(r, 800));
const p2 = saveShot(screenshot(), 'done');
const s2 = screenState(p2);
const dk2 = await scanDeckChips({ minPressY: 840 });
console.log('RESULT green', s2.green, 'deck', deckN(dk2), 'ok', deckN(dk2) < deckN(dk), 'tAll', Date.now() - t0);
