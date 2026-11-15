
import fs from 'node:fs';
import path from 'node:path';
import { tap, swipe, screenshot } from '../lib/adb.js';
const OUT = path.resolve(process.cwd(), '.tmp/rosterAll2');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 先回到列表最左：连续右滑
for (let i = 0; i < 8; i++) { swipe(500, 860, 1650, 860, 500); await sleep(500); }
tap(1810, 172);
await sleep(1200);
let prev = null, n = 0, still = 0;
for (let page = 0; page < 46; page++) {
  const buf = screenshot();
  if (prev && Buffer.compare(prev, buf) === 0) { still++; if (still > 2) break; } else still = 0;
  prev = buf;
  fs.writeFileSync(path.join(OUT, `a-p${String(page).padStart(2,'0')}.png`), buf);
  n++;
  swipe(1600, 860, 500, 860, 600);
  await sleep(900);
}
console.log('pages', n);
process.exit(0);
