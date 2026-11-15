import { screenshot, tap, sh } from '../lib/adb.js';
import { writeFileSync } from 'node:fs';
const save = (n, b) => writeFileSync('../_it-' + n + '.png', b);
tap(478, 676);
await new Promise(r => setTimeout(r, 120));
save('t1', await screenshot());
await new Promise(r => setTimeout(r, 600));
save('t2', await screenshot());
// double tap
tap(478, 676); await new Promise(r => setTimeout(r, 80)); tap(478, 676);
await new Promise(r => setTimeout(r, 1200));
save('t3', await screenshot());
console.log('ok');
process.exit(0);
