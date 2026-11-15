
import { createTouch } from '../lib/touch.js';
const t = createTouch({ adb: 'C:/Program Files/Netease/MuMu/nx_main/adb.exe', serial: '127.0.0.1:16416', log: () => {} });
const r = await t.swipe({ x: 1388, y: 700 }, { x: 920, y: 290 }, { steps: 12, stepMs: 45, holdMs: 400, holdStartMs: 450, jiggle: false });
console.log('drag', r.ok);
await new Promise(r2 => setTimeout(r2, 400));
const r3 = await t.swipe({ x: 920, y: 290 }, { x: 920, y: 890 }, { steps: 8, stepMs: 45, holdMs: 300, holdStartMs: 450 });
console.log('facing', r3.ok);
process.exit(0);
