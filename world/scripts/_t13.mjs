
import { createTouch } from '../lib/touch.js';
const t = createTouch({ adb: 'C:/Program Files/Netease/MuMu/nx_main/adb.exe', serial: '127.0.0.1:16416', log: () => {} });
const r = await t.swipe(860, 270, 1460, 270, { steps: 8, stepMs: 45, holdMs: 300, holdStartMs: 450 });
console.log('facing', r.ok);
process.exit(0);
