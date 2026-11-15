import { dragHold, findDeckEquip, scanDeckChips } from '../lib/run.js';
const chips = (await scanDeckChips()).chips;
console.log('chips', JSON.stringify(chips.map(c=>[c.x,c.y])));
const e1 = await findDeckEquip();
console.log('eq1', JSON.stringify(e1.items.map(i=>[i.name,i.x,i.y,i.chip.x])));
if (e1.items.length) {
  const it = e1.items[0];
  const target = chips[chips.length-1];   // 最左那位
  await dragHold([it.x, it.y], [target.x, target.y], { holdStartMs: 450, holdMs: 800, steps: 12, stepMs: 45 });
  await new Promise(r=>setTimeout(r,1500));
  const e2 = await findDeckEquip();
  console.log('eq2', JSON.stringify(e2.items.map(i=>[i.name,i.x,i.y,i.chip.x])));
}
