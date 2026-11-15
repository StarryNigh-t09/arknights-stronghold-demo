
import { createTouch } from '../lib/touch.js';
const t = createTouch({ adb: 'C:/Program Files/Netease/MuMu/nx_main/adb.exe', serial: '127.0.0.1:16416', log: console.log });
// MAA 配方：甲板中心 → 格心（300ms），停 250ms，再从格心朝右拖 600px/150ms 定朝向
console.log('drag', t.swipe(1110, 600, 950, 420, { steps: 8, stepMs: 35, holdMs: 80, jiggle: false, holdStartMs: 0 }).ok);
await new Promise(r => setTimeout(r, 250));
console.log('face', t.swipe(950, 420, 1550, 420, { steps: 4, stepMs: 35, holdMs: 0, jiggle: false, holdStartMs: 0 }).ok);
