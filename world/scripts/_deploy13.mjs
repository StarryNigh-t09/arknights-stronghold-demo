import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adbPath, currentDevice } from '../lib/adb.js';
import { toRaw } from '../lib/touch.js';
import { sleep } from '../lib/run.js';
import { senseRun } from '../lib/drive.js';
const adb = adbPath(); const serial = currentDevice();
const out = (t, o) => console.log(t, JSON.stringify(o));
const TMP = join(dirname(fileURLToPath(import.meta.url)), '..', '.tmp');
mkdirSync(TMP, { recursive: true });
const shot = (name) => { const p = join(TMP, name + '.png'); const r = spawnSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 40 * 1024 * 1024, timeout: 30000 }); if (r.status === 0 && r.stdout && r.stdout.length > 100000) { writeFileSync(p, r.stdout); return p; } return null; };
const tap = (x, y) => spawnSync(adb, ['-s', serial, 'shell', 'input', 'tap', String(x), String(y)], { timeout: 20000 });
// 候选落点（含 PHANTOM 偏移）
const TARGETS = [[1119, 567], [1086, 500], [1119, 480], [1120, 600]];
for (const [tx, ty] of TARGETS) {
  tap(854, 242); await sleep(700);
  const st0 = await senseRun();
  if (st0.screen !== 'rest') { out('ABORT', { screen: st0.screen }); break; }
  // minitouch 完整拖拽（快一些，减少悬停）
  const from = toRaw(1413, 861); const to = toRaw(tx, ty);
  const lines = ['d 0 ' + from[0] + ' ' + from[1] + ' 50', 'c', 'w 120'];
  for (let i = 1; i <= 10; i++) lines.push('m 0 ' + Math.round(from[0] + (to[0] - from[0]) * i / 10) + ' ' + Math.round(from[1] + (to[1] - from[1]) * i / 10) + ' 50', 'c', 'w 35');
  lines.push('w 200', 'u 0', 'c', 'w 200');
  const f = join(TMP, 'ph-' + tx + '-' + ty + '.txt');
  writeFileSync(f, lines.join('\n') + '\n', 'utf8');
  spawnSync(adb, ['-s', serial, 'push', f, '/sdcard/_coopanion_ph.txt'], { windowsHide: true, stdio: 'ignore', timeout: 60000 });
  spawnSync(adb, ['-s', serial, 'shell', '/data/local/tmp/minitouch -f /sdcard/_coopanion_ph.txt'], { timeout: 30000 });
  await sleep(1100);
  const st1 = await senseRun();
  const p = shot('ph-' + tx + '-' + ty);
  out('TRY', { tx, ty, before: st0.slotsLeft, after: st1.slotsLeft, p });
}
console.log('DONE');
