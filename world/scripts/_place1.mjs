
import { createTouch } from '../lib/touch.js';
const t = createTouch({ adb: 'C:/Program Files/Netease/MuMu/nx_main/adb.exe', serial: '127.0.0.1:16416', log: () => {} });
const from = { x: 1200, y: 640 }, to = { x: 920, y: 290 };
const r1 = await t.swipe(from, to, { steps: 12, stepMs: 45, holdMs: 400, holdStartMs: 450, jiggle: false });
console.log('drag', r1.ok);
await new Promise(r => setTimeout(r, 350));
const r2 = await t.swipe(to, { x: to.x, y: to.y + 600 }, { steps: 8, stepMs: 45, holdMs: 300, holdStartMs: 450 });
console.log('facing', r2.ok);
