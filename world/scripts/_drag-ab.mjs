// A/B 探针：不同起手/落位手法下，摆位模式是否退出、卡是否离手
// 用法: node scripts/_drag-ab.mjs <variant>
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
function greenCount(png) {
  const py = join(TMP, '_green.py');
  const t0 = Date.now();
  const r = spawnSync('python', [py, png], { encoding: 'utf8', timeout: 60000 });
  let tiles = [];
  try { tiles = JSON.parse(r.stdout).tiles || []; } catch { }
  return { tiles: tiles.length, total: tiles.reduce((s, t) => s + (t.n || 0), 0), ms: Date.now() - t0 };
}

const variant = process.argv[2] || 'A';
const st = await senseRun();
out('STATE', { screen: st.screen, round: st.round, slotsLeft: st.slotsLeft, money: st.money });
if (st.screen !== 'rest') { console.log('ABORT not rest'); process.exit(0); }
const deck = await scanDeckChips({ minPressY: 840 });
const chips = (deck.chips || []).slice().sort((a, b) => a.x - b.x);
out('DECK', { n: chips.length, chips: chips.map((c) => [c.x, c.y]) });
if (!chips.length) { console.log('DECK_EMPTY'); process.exit(0); }

const VALID = [964, 350];
const INVALID = [1700, 600];
const c = chips[chips.length - 1]; // 最右（最新）那张
let hold = 300, dwell = 400, target = VALID, postTap = null, steps = 12;
if (variant === 'A') { hold = 150; dwell = 80; }
if (variant === 'B') { hold = 300; dwell = 300; target = INVALID; }
if (variant === 'C') { hold = 600; dwell = 400; }
if (variant === 'D') { hold = 300; dwell = 400; postTap = VALID; }
if (variant === 'E') { hold = 300; dwell = 0; }
out('PLAN', { variant, hold, dwell, target, postTap });

const [sx, sy] = toRaw(c.x, c.y - 21);
const [tx, ty] = toRaw(target[0], target[1]);
const lines = ['d 0 ' + sx + ' ' + sy + ' 50', 'c', 'w ' + hold];
for (let i = 1; i <= steps; i++) {
  lines.push('m 0 ' + Math.round(sx + (tx - sx) * i / steps) + ' ' + Math.round(sy + (ty - sy) * i / steps) + ' 50', 'c', 'w 45');
}
if (dwell > 0) lines.push('w ' + dwell);
lines.push('u 0', 'c', 'w 250');
const f = join(TMP, 'ab-' + Date.now() + '.txt');
writeFileSync(f, lines.join('\n') + '\n', 'utf8');
const push = spawnSync(adb, ['-s', serial, 'push', f, '/sdcard/_coopanion_ab.txt'], { windowsHide: true, stdio: 'ignore', timeout: 60000 });
const t0 = Date.now();
const proc = spawn(adb, ['-s', serial, 'shell', '/data/local/tmp/minitouch -f /sdcard/_coopanion_ab.txt'], { windowsHide: true, stdio: 'ignore' });
await new Promise((res) => { proc.on('exit', res); proc.on('error', res); });
const ms = Date.now() - t0;
await sleep(700);
const after = shot('ab-' + variant + '-after');
const g = greenCount(after);
out('RESULT', { variant, ms, shot: after, greenTiles: g.tiles, greenPx: g.total });
if (postTap) {
  spawnSync(adb, ['-s', serial, 'shell', 'input', 'tap', String(postTap[0]), String(postTap[1])], { timeout: 20000 });
  await sleep(900);
}
const after2 = shot('ab-' + variant + '-after2');
const g2 = greenCount(after2);
const deck2 = await scanDeckChips({ minPressY: 840 });
out('AFTER', { shot: after2, greenTiles: g2.tiles, greenPx: g2.total, deckN: (deck2.chips || []).length, deck: (deck2.chips || []).map((x) => [x.x, x.y]) });
console.log('DONE');
