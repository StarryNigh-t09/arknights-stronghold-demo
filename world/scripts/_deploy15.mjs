// A/B 扫按压高度：可能起手点太低（踩在平台而不是干员身上）导致只进入预览态
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adbPath, currentDevice } from '../lib/adb.js';
import { toRaw } from '../lib/touch.js';
import { sleep, scanDeckChips } from '../lib/run.js';
import { senseRun } from '../lib/drive.js';
const adb = adbPath(); const serial = currentDevice();
const out = (t, o) => console.log(t, JSON.stringify(o));
const TMP = join(dirname(fileURLToPath(import.meta.url)), '..', '.tmp');
mkdirSync(TMP, { recursive: true });
const shot = (name) => { const p = join(TMP, name + '.png'); const r = spawnSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 40 * 1024 * 1024, timeout: 30000 }); if (r.status === 0 && r.stdout && r.stdout.length > 100000) { writeFileSync(p, r.stdout); return p; } return null; };
const tap = (x, y) => spawnSync(adb, ['-s', serial, 'shell', 'input', 'tap', String(x), String(y)], { timeout: 20000 });
const TX = 1086, TY = 447;
const mindTouch = (lines, tag) => {
  const f = join(TMP, 'mt-' + tag + '.txt');
  writeFileSync(f, lines.join('\n') + '\n', 'utf8');
  spawnSync(adb, ['-s', serial, 'push', f, '/sdcard/_coopanion_mt.txt'], { windowsHide: true, stdio: 'ignore', timeout: 60000 });
  spawnSync(adb, ['-s', serial, 'shell', '/data/local/tmp/minitouch -f /sdcard/_coopanion_mt.txt'], { timeout: 40000 });
};
const sweep = [900, 880, 861, 830, 800, 770, 740];
for (const py of sweep) {
  tap(854, 242); await sleep(700);            // 清残留
  const st0 = await senseRun();
  if (st0.screen !== 'rest') { out('ABORT', { screen: st0.screen }); break; }
  const ch = scanDeckChips({ minPressY: 840 });
  if (!ch.ok || !ch.chips.length) { out('NO_CHIPS', { ok: ch.ok, n: ch.chips ? ch.chips.length : -1 }); break; }
  const chip = ch.chips[ch.chips.length - 1];   // 最右＝最新
  const fx = chip.x, fy = py;
  const from = toRaw(fx, fy), to = toRaw(TX, TY);
  const lines = ['d 0 ' + from[0] + ' ' + from[1] + ' 50', 'c', 'w 600'];
  for (let i = 1; i <= 12; i++) lines.push('m 0 ' + Math.round(from[0] + (to[0]-from[0])*i/12) + ' ' + Math.round(from[1] + (to[1]-from[1])*i/12) + ' 50', 'c', 'w 45');
  lines.push('w 450', 'u 0', 'c', 'w 250');
  mindTouch(lines, 'y' + py);
  await sleep(1100);
  const st1 = await senseRun();
  const p = shot('sweep-' + py);
  out('TRY', { pressY: py, chipX: chip.x, before: st0.slotsLeft, after: st1.slotsLeft, screen: st1.screen, p });
}
console.log('DONE');
