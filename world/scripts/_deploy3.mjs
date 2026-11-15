// 混合两段式：minitouch 拖到格 + adb swipe 向上确认
import { spawnSync } from 'node:child_process';
import { adbPath, currentDevice } from '../lib/adb.js';
import { toRaw } from '../lib/touch.js';
import { scanDeckChips, sleep } from '../lib/run.js';
import { senseRun } from '../lib/drive.js';
const adb = adbPath(); const serial = currentDevice();
const out = (t, o) => console.log(t, JSON.stringify(o));
const TX = Number(process.argv[2] || 1086), TY = Number(process.argv[3] || 447), UP = Number(process.argv[4] || 170), DUR = Number(process.argv[5] || 400);
const st0 = await senseRun();
out('STATE0', { screen: st0.screen, slotsLeft: st0.slotsLeft, money: st0.money });
if (st0.screen !== 'rest') { console.log('ABORT not rest'); process.exit(0); }
const d0 = await scanDeckChips({ minPressY: 840 });
const chips = (d0.chips || []).slice().sort((a, b) => a.x - b.x);
out('DECK0', { n: chips.length, chips: chips.map((c) => [c.x, c.y]) });
if (!chips.length) { console.log('DECK_EMPTY'); process.exit(0); }
const c = chips[chips.length - 1];
const from = toRaw(c.x, c.y - 21); const to = toRaw(TX, TY);
const lines = ['d 0 ' + from[0] + ' ' + from[1] + ' 50', 'c', 'w 300'];
for (let i = 1; i <= 12; i++) lines.push('m 0 ' + Math.round(from[0] + (to[0] - from[0]) * i / 12) + ' ' + Math.round(from[1] + (to[1] - from[1]) * i / 12) + ' 50', 'c', 'w 45');
lines.push('w 150', 'u 0', 'c', 'w 200');
const { writeFileSync } = await import('node:fs');
const { join, dirname } = await import('node:path');
const { fileURLToPath } = await import('node:url');
const TMP = join(dirname(fileURLToPath(import.meta.url)), '..', '.tmp');
const f = join(TMP, 'p2-' + Date.now() + '.txt');
writeFileSync(f, lines.join('\n') + '\n', 'utf8');
spawnSync(adb, ['-s', serial, 'push', f, '/sdcard/_coopanion_p2.txt'], { windowsHide: true, stdio: 'ignore', timeout: 60000 });
const t0 = Date.now();
const r1 = spawnSync(adb, ['-s', serial, 'shell', '/data/local/tmp/minitouch -f /sdcard/_coopanion_p2.txt'], { timeout: 30000 });
const ms1 = Date.now() - t0;
await sleep(400);
const r2 = spawnSync(adb, ['-s', serial, 'shell', 'input', 'swipe', String(TX), String(TY), String(TX), String(TY - UP), String(DUR)], { timeout: 30000 });
await sleep(1000);
const st1 = await senseRun();
out('STATE1', { screen: st1.screen, slotsLeft: st1.slotsLeft, money: st1.money });
const d1 = await scanDeckChips({ minPressY: 840 });
out('RESULT', { ms1, swipeExit: r2.status, deckN: (d1.chips || []).length, deck: (d1.chips || []).map((x) => [x.x, x.y]), placed: (st0.slotsLeft != null && st1.slotsLeft != null) ? st0.slotsLeft - st1.slotsLeft : null });
console.log('DONE');
