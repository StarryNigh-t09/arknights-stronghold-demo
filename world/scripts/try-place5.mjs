
import { createTouch, toRaw } from '../lib/touch.js';
const t = createTouch({ adb: 'C:/Program Files/Netease/MuMu/nx_main/adb.exe', serial: '127.0.0.1:16416', log: console.log });
const [rx, ry] = toRaw(1310, 620);
// 长按 600ms，看是否进入可拖状态
console.log('longpress', t.exec([`d 0 ${rx} ${ry} 50`, 'c', 'w 600', 'u 0', 'c', 'w 200']).ok);
