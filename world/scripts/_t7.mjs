
import { createTouch } from '../lib/touch.js';
const t = createTouch({ adb: 'C:/Program Files/Netease/MuMu/nx_main/adb.exe', serial: '127.0.0.1:16416', log: () => {} });
await t.swipe({ x: 1300, y: 700 }, { x: 1100, y: 480 }, { steps: 8, stepMs: 60, holdMs: 3000, holdStartMs: 900, jiggle: false });
process.exit(0);
