
import { createTouch } from '../lib/touch.js';
const t = createTouch({ adb: 'C:/Program Files/Netease/MuMu/nx_main/adb.exe', serial: '127.0.0.1:16416', log: console.log });
// 抓起后停 1.2 秒再松手，看「停住」是否才是落位条件
console.log('swipe', t.swipe(1386, 699, 1000, 520, { steps: 12, stepMs: 60, holdMs: 1200, jiggle: false, holdStartMs: 0 }).ok);
