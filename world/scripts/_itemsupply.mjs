import { screenshot, tap } from '../lib/adb.js';
import { createTouch } from '../lib/touch.js';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const t = await createTouch({ abi: 'x86_64' });
await t.ensure();
const steps = [];
const cap = async (label) => {
  const b = await screenshot();
  const h = createHash('md5').update(b).digest('hex').slice(0, 10);
  writeFileSync('../_item-' + label + '.png', b);
  steps.push(label + ' -> ' + h);
  console.log(label, h);
};
await cap('0-before');
tap(981, 676); await new Promise(r => setTimeout(r, 1500)); await cap('1-inputtap');
await t.tap(981, 676, { holdMs: 60 }); await new Promise(r => setTimeout(r, 1500)); await cap('2-mt-quick');
await t.tap(981, 676, { holdMs: 1200 }); await new Promise(r => setTimeout(r, 1500)); await cap('3-mt-long');
// press card then drag onto button then release
await t.swipe(981, 450, 981, 676, { steps: 10, stepMs: 40, holdMs: 120, holdStartMs: 200 });
await new Promise(r => setTimeout(r, 1500)); await cap('4-drag-to-btn');
tap(478, 470); await new Promise(r => setTimeout(r, 1200)); await cap('5-tap-left-card');
await t.tap(822, 372, { holdMs: 80 }); await new Promise(r => setTimeout(r, 1200)); await cap('6-tap-badge');
console.log('SUMMARY', JSON.stringify(steps, null, 1));
process.exit(0);
