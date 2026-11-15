
import { createTouch } from '../lib/touch.js';
const t = createTouch({ adb: 'C:/Program Files/Netease/MuMu/nx_main/adb.exe', serial: '127.0.0.1:16416', log: () => {} });
const T = { x: 880, y: 300 };
const f = { x: T.x + 33, y: T.y + 120 };
const r1 = await t.swipe(1388, 700, f.x, f.y, { steps: 12, stepMs: 45, holdMs: 800, holdStartMs: 450, jiggle: false });
console.log('drag', r1.ok);
process.exit(0);
