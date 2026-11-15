
import { createTouch } from '../lib/touch.js';
const t = createTouch({ adb: 'C:/Program Files/Netease/MuMu/nx_main/adb.exe', serial: '127.0.0.1:16416', log: () => {} });
const r = t.swipe(920, 350, 500, 350, { steps: 8, stepMs: 45, holdMs: 350, holdStartMs: 450, jiggle: false });
console.log('facing2', r.ok);
