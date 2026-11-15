import { dragFromTo, screenState, saveShot, cancelPending, PENDING_GREEN } from '../lib/deploy-fast.js';
import { screenshot } from '../lib/adb.js';
const PTS = JSON.parse(process.env.PTS || '[]');
const DROP = [Number(process.env.DX || 830), Number(process.env.DY || 680)];
for (const [x, y] of PTS) {
  dragFromTo([x, y], DROP, { holdMs: 600, moveMs: 420, tag: 'pp' });
  await new Promise((r) => setTimeout(r, 320));
  const p = saveShot(screenshot(), 'pp');
  const s = screenState(p);
  const pend = s.green > PENDING_GREEN;
  console.log('P', x, y, 'green', s.green, 'pending', pend, pend ? 'redC=' + JSON.stringify(s.redCenter) : '');
  if (pend) { cancelPending(s); await new Promise((r) => setTimeout(r, 700)); }
}
console.log('DONE');
