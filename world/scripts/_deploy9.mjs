// 决定性测试：真长按 700ms 拎起待命区干员 → 平滑拖到格心 → 立刻松手（无尾停）
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
const HOLD = Number(process.argv[4] || 700), STEPS = Number(process.argv[5] || 15), STEPW = Number(process.argv[6] || 40);
const st0 = await senseRun();
if (st0.screen !== 'rest') { out('ABORT', { screen: st0.screen }); process.exit(0); }
const d0 = await scanDeckChips({ minPressY: 840 });
const chips = (d0.chips || []).slice().sort((a, b) => a.x - b.x);
out('DECK0', { n: chips.length, chips: chips.map((c) => [c.x, c.y]) });
if (!chips.length) { out('DECK_EMPTY', {}); process.exit(0); }
const c = chips[chips.length - 1];
const from = toRaw(c.x, c.y - 21); const to = toRaw(TX, TY);
const lines = ['d 0 ' + from[0] + ' ' + from[1] + ' 50', 'c', 'w ' + HOLD];
for (let i = 1; i <= STEPS; i++) lines.push('m 0 ' + Math.round(from[0] + (to[0] - from[0]) * i / STEPS) + ' ' + Math.round(from[1] + (to[1] - from[1]) * i / STEPS) + ' 50', 'c', 'w ' + STEPW);
lines.push('u 0', 'c');
const f = join(TMP, 'hp-' + Date.now() + '.txt');
writeFileSync(f, lines.join('\n') + '\n', 'utf8');
spawnSync(adb, ['-s', serial, 'push', f, '/sdcard/_coopanion_hp.txt'], { windowsHide: true, stdio: 'ignore', timeout: 60000 });
spawnSync(adb, ['-s', serial, 'shell', '/data/local/tmp/minitouch -f /sdcard/_coopanion_hp.txt'], { timeout: 30000 });
await sleep(1200);
const post = shot('hp-' + HOLD + '-post');
const st1 = await senseRun();
out('TRY', { hold: HOLD, steps: STEPS, stepW: STEPW, slotsBefore: st0.slotsLeft, slotsAfter: st1.slotsLeft, placed: (st0.slotsLeft != null && st1.slotsLeft != null) ? st0.slotsLeft - st1.slotsLeft : null, post });
const d1 = await scanDeckChips({ minPressY: 840 });
out('DECK1', { n: (d1.chips || []).length });
console.log('DONE');
