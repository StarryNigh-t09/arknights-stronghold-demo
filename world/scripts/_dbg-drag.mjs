import { scanDeckChips } from '../lib/run.js';
import { bodyOf, dragFromTo, screenState, saveShot, PENDING_GREEN } from '../lib/deploy-fast.js';
import { screenshot } from '../lib/adb.js';
const dk = await scanDeckChips({ minPressY: 840 });
console.log('CHIPS', JSON.stringify(dk && dk.chips));
const chips = (dk && dk.chips) || [];
if (chips.length) {
  const c = chips[chips.length - 1];
  console.log('PRESS', c.x, c.y, 'BODY', JSON.stringify(bodyOf(c)));
  const g = dragFromTo([c.x, c.y], [1000, 500], { holdMs: 600, moveMs: 420, tag: 'dbg' });
  console.log('DRAG', JSON.stringify(g));
  await new Promise((r) => setTimeout(r, 400));
  const p = saveShot(screenshot(), 'dbg');
  console.log('SHOT', p, JSON.stringify(screenState(p)));
}
