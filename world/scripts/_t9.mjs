
import { createTouch } from '../lib/touch.js';
const t = createTouch({ adb: 'C:/Program Files/Netease/MuMu/nx_main/adb.exe', serial: '127.0.0.1:16416', log: () => {} });
await t.swipe(1388, 700, 1100, 500, { steps: 10, stepMs: 50, holdMs: 3500, holdStartMs: 450, jiggle: false });
process.exit(0);
