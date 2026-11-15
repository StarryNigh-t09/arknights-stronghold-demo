import { scanDeckChips } from '../lib/run.js';
import { senseRun } from '../lib/drive.js';
import { screenshot } from '../lib/adb.js';
import { screenState, saveShot, cancelPending, calibratePress } from '../lib/deploy-fast.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let st = screenState(saveShot(screenshot(), 'pre'));
console.log('PRE ' + JSON.stringify({ green: st.green, red: st.red, redCenter: st.redCenter, shop: st.shop }));
if (st.green > 3000) { cancelPending(st); await sleep(900); console.log('CANCELLED'); st = screenState(saveShot(screenshot(), 'pre2')); console.log('AFTER_CANCEL ' + JSON.stringify({ green: st.green })); }
const s = await senseRun().catch(() => null);
console.log('STATE ' + JSON.stringify({ round: s && s.round, slots: s && s.slotsLeft, money: s && s.money, shopExpanded: s && s.shopExpanded }));
const d = await scanDeckChips({ minPressY: 840 });
console.log('CHIPS ' + JSON.stringify({ n: (d.chips || []).length, camMoved: d.camMoved, pts: (d.chips || []).map((c) => [c.x, c.y]) }));
if ((d.chips || []).length) {
  const c = await calibratePress(d.chips, { maxChips: 2 });
  console.log('CALIB ' + JSON.stringify(c));
}
