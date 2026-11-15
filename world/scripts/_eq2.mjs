import { findDeckEquip, scanDeckChips } from '../lib/run.js';
const chips = await scanDeckChips();
console.log('chips', JSON.stringify(chips.chips.map(c=>({x:c.x,y:c.y}))));
const r = await findDeckEquip();
console.log('equip', JSON.stringify(r, null, 1).slice(0, 1500));
