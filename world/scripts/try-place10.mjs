
import { placeUnit } from '../lib/run.js';
import { createTouch } from '../lib/touch.js';
const t = createTouch({ adb: 'C:/Program Files/Netease/MuMu/nx_main/adb.exe', serial: '127.0.0.1:16416', log: () => {} });
const r = await placeUnit({ from: [1130, 690], to: [900, 430], facing: 'right' });
console.log(JSON.stringify(r));
