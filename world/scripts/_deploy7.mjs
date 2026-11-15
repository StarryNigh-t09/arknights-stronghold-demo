// 变体机：落格后按不同「确认手势」尝试，判据 slotsLeft 减少
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
// variant: settleMs, startDy, up, dur, mode(swipe|tap)
const VARIANTS = [
  { name: 'settle2500', settle: 2500, dy: -50, up: 170, dur: 400, mode: 'swipe' },
  { name: 'flick100', settle: 600, dy: -50, up: 170, dur: 100, mode: 'swipe' },
  { name: 'big300', settle: 600, dy: -50, up: 300, dur: 500, mode: 'swipe' },
  { name: 'tapCenter', settle: 600, dy: -60, up: 0, dur: 0, mode: 'tap' },
];
for (const v of VARIANTS) {
  const st0 = await senseRun();
  if (st0.screen !== 'rest') { out('ABORT', { screen: st0.screen }); break; }
  const d0 = await scanDeckChips({ minPressY: 840 });
  const chips = (d0.chips || []).slice().sort((a, b) => a.x - b.x);
  if (!chips.length) { out('DECK_EMPTY', {}); break; }
  const c = chips[chips.length - 1];
  const from = toRaw(c.x, c.y - 21); const to = toRaw(TX, TY);
  const lines = ['d 0 ' + from[0] + ' ' + from[1] + ' 50', 'c', 'w 300'];
  for (let i = 1; i <= 12; i++) lines.push('m 0 ' + Math.round(from[0] + (to[0] - from[0]) * i / 12) + ' ' + Math.round(from[1] + (to[1] - from[1]) * i / 12) + ' 50', 'c', 'w 45');
  lines.push('w 150', 'u 0', 'c', 'w 200');
  const f = join(TMP, 'vb-' + Date.now() + '.txt');
  writeFileSync(f, lines.join('\n') + '\n', 'utf8');
  spawnSync(adb, ['-s', serial, 'push', f, '/sdcard/_coopanion_vb.txt'], { windowsHide: true, stdio: 'ignore', timeout: 60000 });
  spawnSync(adb, ['-s', serial, 'shell', '/data/local/tmp/minitouch -f /sdcard/_coopanion_vb.txt'], { timeout: 30000 });
  await sleep(v.settle);
  const y0 = TY + v.dy;
  const p1 = shot('vb-' + v.name + '-pre');
  if (v.mode === 'tap') {
    spawnSync(adb, ['-s', serial, 'shell', 'input', 'tap', String(TX), String(y0)], { timeout: 20000 });
  } else {
    spawnSync(adb, ['-s', serial, 'shell', 'input', 'swipe', String(TX), String(y0), String(TX), String(y0 - v.up), String(v.dur)], { timeout: 30000 });
  }
  await sleep(1200);
  const st1 = await senseRun();
  const placed = (st0.slotsLeft != null && st1.slotsLeft != null) ? st0.slotsLeft - st1.slotsLeft : null;
  const p2 = shot('vb-' + v.name + '-post');
  out('TRY', { v: v.name, slotsBefore: st0.slotsLeft, slotsAfter: st1.slotsLeft, placed, pre: p1, post: p2 });
  if (placed && placed > 0) { break; }
}
console.log('DONE');
