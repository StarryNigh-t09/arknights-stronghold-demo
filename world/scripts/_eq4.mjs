import { tapAt, dragHold, findDeckEquip, scanDeckChips } from '../lib/run.js';
await tapAt([600, 250]);           // 点空白棋盘，取消选中、镜头回位
await new Promise(r=>setTimeout(r,1200));
const c1 = await scanDeckChips();
console.log('chips', JSON.stringify(c1.chips.map(c=>({x:c.x,y:c.y}))));
const e1 = await findDeckEquip();
console.log('eq1', JSON.stringify(e1.items.map(i=>[i.name, i.x, i.y, i.chip.x, i.chip.y])));
