// 两段式落位：①卡→格心 松手 ②从格心向上滑 松手=确认
// 用法: node scripts/_deploy2.mjs [tx] [ty]
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
async function gesture(lines, tag) {
  const f = join(TMP, 'g-' + tag + '-' + Date.now() + '.txt');
  writeFileSync(f, lines.join('\n') + '\n', 'utf8');
  spawnSync(adb, ['-s', serial, 'push', f, '/sdcard/_coopanion_g.txt'], { windowsHide: true, stdio: 'ignore', timeout: 60000 });
  const t0 = Date.now();
  const proc = spawn(adb, ['-s', serial, 'shell', '/data/local/tmp/minitouch -f /sdcard/_coopanion_g.txt'], { windowsHide: true, stdio: 'ignore' });
  await new Promise((res) => { proc.on('exit', res); proc.on('error', res); });
  return Date.now() - t0;
}
function lerp(a, b, n) { const r = []; for (let i = 1; i <= n; i++) r.push([Math.round(a[0] + (b[0] - a[0]) * i / n), Math.round(a[1] + (b[1] - a[1]) * i / n)]); return r; }

const TX = Number(process.argv[2] || 1000);
const TY = Number(process.argv[3] || 470);
const st0 = await senseRun();
out('STATE0', { screen: st0.screen, round: st0.round, slotsLeft: st0.slotsLeft, money: st0.money });
if (st0.screen !== 'rest') { console.log('ABORT not rest'); process.exit(0); }
const d0 = await scanDeckChips({ minPressY: 840 });
const chips = (d0.chips || []).slice().sort((a, b) => a.x - b.x);
out('DECK0', { n: chips.length, chips: chips.map((c) => [c.x, c.y]) });
if (!chips.length) { console.log('DECK_EMPTY'); process.exit(0); }
const c = chips[chips.length - 1];
const from = toRaw(c.x, c.y - 21);
const to = toRaw(TX, TY);
const L1 = ['d 0 ' + from[0] + ' ' + from[1] + ' 50', 'c', 'w 300'];
for (const p of lerp(from, to, 12)) L1.push('m 0 ' + p[0] + ' ' + p[1] + ' 50', 'c', 'w 45');
L1.push('w 150', 'u 0', 'c', 'w 200');
const ms1 = await gesture(L1, 'pick');
await sleep(400);
const L2 = ['d 0 ' + to[0] + ' ' + to[1] + ' 50', 'c', 'w 90'];
for (const p of lerp(to, [to[0], to[1] - 150], 6)) L2.push('m 0 ' + p[0] + ' ' + p[1] + ' 50', 'c', 'w 30');
L2.push('w 80', 'u 0', 'c', 'w 250');
const ms2 = await gesture(L2, 'confirm');
await sleep(900);
out('SHOT', { p: shot('deploy2-after'), ms1, ms2 });
await sleep(900);
const st1 = await senseRun();
out('STATE1', { screen: st1.screen, round: st1.round, slotsLeft: st1.slotsLeft, money: st1.money });
const d1 = await scanDeckChips({ minPressY: 840 });
out('DECK1', { n: (d1.chips || []).length, chips: (d1.chips || []).map((x) => [x.x, x.y]) });
console.log('DONE');
