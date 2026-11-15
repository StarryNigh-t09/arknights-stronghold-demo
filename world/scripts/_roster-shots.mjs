
import fs from 'node:fs';
import path from 'node:path';
import { tap, swipe, screenshot } from '../lib/adb.js';

const OUT = path.resolve(process.cwd(), '.tmp/roster3');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const TAB_Y = { 1:310, 2:410, 3:555, 4:645, 5:750, 6:865 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let total = 0;

for (const n of [1,2,3,4,5,6]) {
  tap(1800, TAB_Y[n]);
  await sleep(1200);
  let prev = null;
  for (let page = 0; page < 8; page++) {
    const buf = screenshot();
    if (prev && Buffer.compare(prev, buf) === 0) break;
    prev = buf;
    fs.writeFileSync(path.join(OUT, `t${n}-p${page}.png`), buf);
    total++;
    swipe(1600, 860, 500, 860, 600);
    await sleep(1100);
  }
}
console.log('shots', total);
process.exit(0);
