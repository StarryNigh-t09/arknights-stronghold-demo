
import { createTouch } from '../lib/touch.js';
const t = createTouch({ adb: 'C:/Program Files/Netease/MuMu/nx_main/adb.exe', serial: '127.0.0.1:16416', log: () => {} });
// 先取消当前选中
await t.tap(1500, 330, { holdMs: 100 });
await new Promise(r => setTimeout(r, 700));
// 抓起灰喉（甲板上那个），拖到地图中部并保持按住 4 秒，供中途截图
await t.swipe({ x: 1415, y: 690 }, { x: 1000, y: 420 }, { steps: 14, stepMs: 45, holdMs: 4000, holdStartMs: 500, jiggle: false });
console.log('done');
