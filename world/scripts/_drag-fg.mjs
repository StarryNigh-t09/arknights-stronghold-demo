// 变体 F/G：慢速多步 + 到格心后微移再松手
// 用法: node scripts/_drag-fg.mjs F|G [tx] [ty]
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';
import { adbPath, currentDevice } from '../lib/adb.js';
import { toRaw } from '../lib/touch.js';
import { scanDeckChips, sleep } from '../lib/run.js';
import { senseRun } from '../lib/drive.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const TMP = join(HERE, '..', '.tmp');
mkdirSync(TMP, { recursive: true });
const adb = adbPath();
const serial = currentDevice();
const out = (t, o) => console.log(t, JSON.stringify(o));
function shot(name) {
  const p = join(TMP, name + '.png');
  const r = spawnSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 40 * 1024 * 1024, timeout: 30000 });
  if (r.status === 0 && r.stdout && r.stdout.length > 100000) { writeFileSync(p, r.stdout); return p; }
  return null;
}
const variant = process.argv[2] || 'F';
const TX = Number(process.argv[3] || 964);
const TY = Number(process.argv[4] || 350);
const st = await senseRun();
out('STATE', { screen: st.screen, round: st.round, money: st.money });
if (st.screen !== 'rest') { console.log('ABORT not rest'); process.exit(0); }
const deck = await scanDeckChips({ minPressY: 840 });
const chips = (deck.chips || []).slice().sort((a, b) => a.x - b.x);
out('DECK', { n: chips.length, chips: chips.map((c) => [c.x, c.y]) });
if (!chips.length) { console.log('DECK_EMPTY'); process.exit(0); }
const c = chips[chips.length - 1];
const [sx, sy] = toRaw(c.x, c.y - 21);
const [tx, ty] = toRaw(TX, TY);
const STEPS = 30;
const lines = ['d 0 ' + sx + ' ' + sy + ' 50', 'c', 'w 300'];
for (let i = 1; i <= STEPS; i++) lines.push('m 0 ' + Math.round(sx + (tx - sx) * i / STEPS) + ' ' + Math.round(sy + (ty - sy) * i / STEPS) + ' 50', 'c', 'w 40');
if (variant === 'F') { lines.push('w 450', 'm 0 ' + (tx + 8) + ' ' + (ty + 6) + ' 50', 'c', 'w 60', 'u 0', 'c', 'w 250'); }
else { lines.push('w 1200', 'u 0', 'c', 'w 250'); }
out('PLAN', { variant, from: [c.x, c.y - 21], to: [TX, TY], lines: lines.length });
const f = join(TMP, 'fg-' + Date.now() + '.txt');
writeFileSync(f, lines.join('\n') + '\n', 'utf8');
spawnSync(adb, ['-s', serial, 'push', f, '/sdcard/_coopanion_fg.txt'], { windowsHide: true, stdio: 'ignore', timeout: 60000 });
const t0 = Date.now();
const proc = spawn(adb, ['-s', serial, 'shell', '/data/local/tmp/minitouch -f /sdcard/_coopanion_fg.txt'], { windowsHide: true, stdio: 'ignore' });
const midShots = [];
for (const at of [1300, 2000]) {
  const wait = at - (Date.now() - t0);
  if (wait > 0) await sleep(wait);
  midShots.push(shot('fg-' + variant + '-t' + at));
}
await new Promise((res) => { proc.on('exit', res); proc.on('error', res); });
const ms = Date.now() - t0;
await sleep(800);
const after = shot('fg-' + variant + '-after');
await sleep(1200);
const after2 = shot('fg-' + variant + '-after2');
const deck2 = await scanDeckChips({ minPressY: 840 });
out('RESULT', { variant, ms, midShots, after, after2, deckN: (deck2.chips || []).length, deck: (deck2.chips || []).map((x) => [x.x, x.y]) });
console.log('DONE');
