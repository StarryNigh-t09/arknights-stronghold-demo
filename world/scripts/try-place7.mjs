
import { createTouch } from '../lib/touch.js';
const t = createTouch({ adb: 'C:/Program Files/Netease/MuMu/nx_main/adb.exe', serial: '127.0.0.1:16416', log: console.log });
console.log('drag', t.swipe(1110, 870, 950, 420, { steps: 10, stepMs: 55, holdMs: 100, jiggle: false, holdStartMs: 0 }).ok);
await new Promise(r => setTimeout(r, 250));
console.log('face', t.swipe(950, 420, 1550, 420, { steps: 4, stepMs: 40, holdMs: 0, jiggle: false, holdStartMs: 0 }).ok);
