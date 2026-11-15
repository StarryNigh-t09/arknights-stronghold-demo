import { dragHold, findDeckEquip } from '../lib/run.js';
console.log('before', JSON.stringify((await findDeckEquip()).items.map(i=>[i.name,i.chip.x])));
await dragHold([1247, 746], [1413, 883], { holdStartMs: 450, holdMs: 800, steps: 12, stepMs: 45 });
await new Promise(r=>setTimeout(r,1500));
console.log('after', JSON.stringify((await findDeckEquip()).items.map(i=>[i.name,i.chip.x])));
