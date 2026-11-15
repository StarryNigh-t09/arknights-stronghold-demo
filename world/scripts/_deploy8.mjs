// 假设：预览态的箭头是朝向提示，必须「朝箭头方向滑动」才确认
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adbPath, currentDevice } from '../lib/adb.js';
import { toRaw } from '../lib/touch.js';
import { scanDeckChips, sleep } from '../lib/run.js';
import { senseRun } from '../lib/drive.js';
const adb = adbPath(); const serial = currentDevice();
const out = (t, o) => console.log(t, JSON.stringify(o));
const TMP = join(dirname(fileURLToPath(import.meta.url)), '..', '.tmp');
mkdirSync(TMP, { recursive: true });
function shot(name) { const p = join(TMP, name + '.png'); const r = spawnSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 40 * 1024 * 1024, timeout: 30000 }); if (r.status === 0 && r.stdout && r.stdout.length > 100000) { writeFileSync(p, r.stdout); return p; } return null; }
const TX = Number(process.argv[2] || 1086), TY = Number(process.argv[3] || 447);
const DIR = (process.argv[4] || 'left');
const LEN = Number(process.argv[5] || 170), DUR = Number(process.argv[6] || 400);
const st0 = await senseRun();
if (st0.screen !== 'rest') { out('ABORT', { screen: st0.screen }); process.exit(0); }
const d0 = await scanDeckChips({ minPressY: 840 });
const chips = (d0.chips || []).slice().sort((a, b) => a.x - b.x);
if (!chips.length) { out('DECK_EMPTY', {}); process.exit(0); }
const c = chips[chips.length - 1];
const from = toRaw(c.x, c.y - 21); const to = toRaw(TX, TY);
const lines = ['d 0 ' + from[0] + ' ' + from[1] + ' 50', 'c', 'w 300'];
for (let i = 1; i <= 12; i++) lines.push('m 0 ' + Math.round(from[0] + (to[0] - from[0]) * i / 12) + ' ' + Math.round(from[1] + (to[1] - from[1]) * i / 12) + ' 50', 'c', 'w 45');
lines.push('w 150', 'u 0', 'c', 'w 200');
const f = join(TMP, 'dr-' + Date.now() + '.txt');
writeFileSync(f, lines.join('\n') + '\n', 'utf8');
spawnSync(adb, ['-s', serial, 'push', f, '/sdcard/_coopanion_dr.txt'], { windowsHide: true, stdio: 'ignore', timeout: 60000 });
spawnSync(adb, ['-s', serial, 'shell', '/data/local/tmp/minitouch -f /sdcard/_coopanion_dr.txt'], { timeout: 30000 });
await sleep(600);
const pre = shot('dr-' + DIR + '-pre');
const sy = TY - 50;
let ex = TX, ey = sy;
if (DIR === 'left') ex = TX - LEN; else if (DIR === 'right') ex = TX + LEN; else if (DIR === 'up') ey = sy - LEN; else ey = sy + LEN;
spawnSync(adb, ['-s', serial, 'shell', 'input', 'swipe', String(TX), String(sy), String(ex), String(ey), String(DUR)], { timeout: 30000 });
await sleep(1200);
const st1 = await senseRun();
const post = shot('dr-' + DIR + '-post');
out('TRY', { dir: DIR, slotsBefore: st0.slotsLeft, slotsAfter: st1.slotsLeft, placed: (st0.slotsLeft != null && st1.slotsLeft != null) ? st0.slotsLeft - st1.slotsLeft : null, pre, post });
console.log('DONE');
