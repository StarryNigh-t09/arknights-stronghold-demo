
import { createTouch } from '../lib/touch.js';
const t = createTouch({ adb: 'C:/Program Files/Netease/MuMu/nx_main/adb.exe', serial: '127.0.0.1:16416', log: console.log });
// 定朝向：在已上场干员身上长按 450ms 再拖向左 500px 松手
const r = t.swipe(920, 290, 420, 290, { steps: 8, stepMs: 45, holdMs: 300, holdStartMs: 450, jiggle: false });
console.log('facing', JSON.stringify(r).slice(0, 120));
