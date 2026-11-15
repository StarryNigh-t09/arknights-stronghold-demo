import { screenshot } from '../lib/adb.js';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const shot = await screenshot();
const p = '../_g1.png';
fs.writeFileSync(p, shot);
for (const [sc, out] of [['equip.py','_g1e.json'],['deck.py','_g1d.json']]) {
  spawnSync('python', ['sidecar/'+sc, p, '../'+out], { stdio: 'ignore' });
  console.log(sc, fs.readFileSync('../'+out,'utf8').slice(0,400));
}
