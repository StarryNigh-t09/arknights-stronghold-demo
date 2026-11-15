import { dragHold } from '../lib/run.js';
import { screenshot } from '../lib/adb.js';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const P = '../';
function probe(tag) {
  const p = P + '_eq' + tag + '.png';
  fs.writeFileSync(p, screenshot());
  for (const [sc, out] of [['deck.py','_eq'+tag+'d.json'],['equip.py','_eq'+tag+'e.json']]) {
    spawnSync('python', ['sidecar/'+sc, p, P+out], { stdio: 'ignore' });
  }
  const d = JSON.parse(fs.readFileSync(P+'_eq'+tag+'d.json','utf8'));
  const e = JSON.parse(fs.readFileSync(P+'_eq'+tag+'e.json','utf8'));
  return { d, e };
}
const a = probe('a');
console.log('badges', JSON.stringify(a.d));
console.log('items', JSON.stringify(a.e.items));
