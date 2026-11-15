
import { createTouch } from '../lib/touch.js';
const t = createTouch({ adb: 'C:/Program Files/Netease/MuMu/nx_main/adb.exe', serial: '127.0.0.1:16416', log: console.log });
console.log('pick', t.tap(1310, 620).ok);
await new Promise(r=>setTimeout(r,150));
console.log('drag', t.swipe(1310, 620, 830, 400, { steps: 15, stepMs: 20, holdMs: 200, jiggle: false, holdStartMs: 0 }).ok);
