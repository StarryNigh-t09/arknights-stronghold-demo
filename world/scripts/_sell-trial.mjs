import { appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanDeckChips, tapAt } from '../lib/run.js';
import { senseRun } from '../lib/drive.js';
import { sellBatch } from '../lib/act.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const targetMap = { left: [1800, 845], mid: [1840, 860], right: [1878, 880] };
const which = process.argv[2] || 'mid';
const hold = Number(process.argv[3] || 0);

function pickRow(chips) {
  if (!chips || !chips.length) return null;
  const deck = chips.filter((c) => c.y <= 830);
  return (deck.length ? deck : chips).slice().sort((a, b) => a.x - b.x)[0];
}

let chips = (await scanDeckChips()).chips || [];
if (chips.length && Math.min(...chips.map((c) => c.y)) > 830) {
  await tapAt([1763, 953], 900, '折叠商店');
  chips = (await scanDeckChips()).chips || [];
}
const pick = pickRow(chips);
if (!pick) { console.log('NO_CHIPS'); process.exit(0); }

const before = await senseRun();
const t0 = Date.now();
await sellBatch([pick], { to: targetMap[which], holdStartMs: 450, holdMs: hold });
await new Promise((r) => setTimeout(r, 900));
const after = await senseRun();
const chipsAfter = (await scanDeckChips()).chips || [];
const row = {
  at: new Date().toISOString(), target: which, to: targetMap[which], holdMs: hold,
  from: [pick.x, pick.y], moneyBefore: before.money, moneyAfter: after.money,
  chipsBefore: chips.length, chipsAfter: chipsAfter.length,
  ok: after.money === before.money + 1 || chipsAfter.length === chips.length - 1,
  ms: Date.now() - t0,
};
mkdirSync(dirname(HERE + '/x'), { recursive: true });
appendFileSync(join(HERE, '..', 'data', 'sell-trials.jsonl'), JSON.stringify(row) + '\n', 'utf8');
console.log('TRIAL', JSON.stringify(row));
