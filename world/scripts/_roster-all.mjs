
import fs from 'node:fs';
import path from 'node:path';
import { tap, swipe, screenshot } from '../lib/adb.js';
const OUT = path.resolve(process.cwd(), '.tmp/rosterAll');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
tap(1810, 172);           // ALL
await sleep(1200);
let prev = null, n = 0;
for (let page = 0; page < 14; page++) {
  const buf = screenshot();
  if (prev && Buffer.compare(prev, buf) === 0) break;
  prev = buf;
  fs.writeFileSync(path.join(OUT, `a-p${page}.png`), buf);
  n++;
  swipe(1600, 860, 500, 860, 600);
  await sleep(1100);
}
console.log('pages', n);
process.exit(0);
