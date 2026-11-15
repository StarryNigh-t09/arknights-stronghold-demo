import { dragFromTo, screenState, saveShot, PENDING_GREEN, validTilesOf, confirmDeploy } from '../lib/deploy-fast.js';
import { screenshot, adb } from '../lib/adb.js';
import { scanDeckChips } from '../lib/run.js';

const TILE = [Number(process.env.TX || 830), Number(process.env.TY || 680)];
const PRESS = [Number(process.env.PX || 1288), Number(process.env.PY || 865)];

function deckN(dk) { return ((dk && dk.chips) || []).length }

let dk0 = await scanDeckChips({ minPressY: 840 });
console.log('DECK0', deckN(dk0), JSON.stringify((dk0 && dk0.chips || []).map(c => [c.x, c.y])));
const t0 = Date.now();
dragFromTo(PRESS, TILE, { holdMs: 600, moveMs: 420, tag: 'run' });
const tDrag = Date.now() - t0;
await new Promise((r) => setTimeout(r, 320));
const pA = saveShot(screenshot(), 'runA');
const sA = screenState(pA);
console.log('PEND', sA.green, 'redC', JSON.stringify(sA.redCenter), 'tDrag', tDrag);
if (!(sA.green > PENDING_GREEN)) { console.log('NO_PENDING'); process.exit(0); }
const tiles = validTilesOf(pA);
console.log('TILES', tiles.length, JSON.stringify(tiles.slice(0, 6).map(t => [t.x, t.y, Number(t.ratio.toFixed(2))])));
const t1 = Date.now();
confirmDeploy(TILE, { ms: 400 });
const tConf = Date.now() - t1;
await new Promise((r) => setTimeout(r, 700));
const pB = saveShot(screenshot(), 'runB');
const sB = screenState(pB);
const dk1 = await scanDeckChips({ minPressY: 840 });
console.log('AFTER green', sB.green, 'deck', deckN(dk1), 'tConf', tConf, 'tAll', Date.now() - t0);
console.log('OK', deckN(dk1) < deckN(dk0));
