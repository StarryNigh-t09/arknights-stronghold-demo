import { screenshot, tap } from '../lib/adb.js';
import { writeFileSync } from 'node:fs';
const ys = [600, 620, 640, 660, 676, 700, 720, 740];
for (const y of ys) {
  tap(1450, y);
  await new Promise(r => setTimeout(r, 900));
  writeFileSync('../_lbl-' + y + '.png', await screenshot());
  console.log('tapped', y);
}
process.exit(0);
