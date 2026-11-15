// 单手势落位试验：卡 → 格心 → 继续上滑 → 松手
// 用法: node scripts/_drag-up.mjs [tx] [ty] [upPx]
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
const TX = Number(process.argv[2] || 900);
const TY = Number(process.argv[3] || 450);
const UP = Number(process.argv[4] || 160);
const st = await senseRun();
out('STATE0', { screen: st.screen, round: st.round, slotsLeft: st.slotsLeft, money: st.money });
if (st.screen !== 'rest') { console.log('ABORT not rest'); process.exit(0); }
const deck = await scanDeckChips({ minPressY: 840 });
const chips = (deck.chips || []).slice().sort((a, b) => a.x - b.x);
out('DECK0', { n: chips.length, chips: chips.map((c) => [c.x, c.y]) });
if (!chips.length) { console.log('DECK_EMPTY'); process.exit(0); }
const c = chips[chips.length - 1];
const [sx, sy] = toRaw(c.x, c.y - 21);
const [tx, ty] = toRaw(TX, TY);
const lines = ['d 0 ' + sx + ' ' + sy + ' 50', 'c', 'w 300'];
const S1 = 14;
for (let i = 1; i <= S1; i++) lines.push('m 0 ' + Math.round(sx + (tx - sx) * i / S1) + ' ' + Math.round(sy + (ty - sy) * i / S1) + ' 50', 'c', 'w 40');
lines.push('w 150');
const S2 = 8;
for (let i = 1; i <= S2; i++) lines.push('m 0 ' + tx + ' ' + Math.round(ty - UP * i / S2) + ' 50', 'c', 'w 30');
lines.push('u 0', 'c', 'w 250');
const f = join(TMP, 'up-' + Date.now() + '.txt');
writeFileSync(f, lines.join('\n') + '\n', 'utf8');
spawnSync(adb, ['-s', serial, 'push', f, '/sdcard/_coopanion_up.txt'], { windowsHide: true, stdio: 'ignore', timeout: 60000 });
const t0 = Date.now();
const proc = spawn(adb, ['-s', serial, 'shell', '/data/local/tmp/minitouch -f /sdcard/_coopanion_up.txt'], { windowsHide: true, stdio: 'ignore' });
await new Promise((res) => { proc.on('exit', res); proc.on('error', res); });
const ms = Date.now() - t0;
await sleep(900);
out('SHOT', { p: shot('up-after'), ms });
await sleep(1200);
const st2 = await senseRun();
out('STATE1', { screen: st2.screen, round: st2.round, slotsLeft: st2.slotsLeft, money: st2.money });
const deck2 = await scanDeckChips({ minPressY: 840 });
out('DECK1', { n: (deck2.chips || []).length, chips: (deck2.chips || []).map((x) => [x.x, x.y]) });
console.log('DONE');
