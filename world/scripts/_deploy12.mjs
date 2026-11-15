import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adbPath, currentDevice } from '../lib/adb.js';
import { sleep } from '../lib/run.js';
import { senseRun } from '../lib/drive.js';
const adb = adbPath(); const serial = currentDevice();
const out = (t, o) => console.log(t, JSON.stringify(o));
const TMP = join(dirname(fileURLToPath(import.meta.url)), '..', '.tmp');
mkdirSync(TMP, { recursive: true });
const shot = (name) => { const p = join(TMP, name + '.png'); const r = spawnSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 40 * 1024 * 1024, timeout: 30000 }); if (r.status === 0 && r.stdout && r.stdout.length > 100000) { writeFileSync(p, r.stdout); return p; } return null; };
const tap = (x, y) => spawnSync(adb, ['-s', serial, 'shell', 'input', 'tap', String(x), String(y)], { timeout: 20000 });
const swipe = (x1, y1, x2, y2, d) => spawnSync(adb, ['-s', serial, 'shell', 'input', 'swipe', String(x1), String(y1), String(x2), String(y2), String(d)], { timeout: 30000 });
const YS = (process.argv[2] || '330,350,370,390').split(',').map(Number);
for (const y of YS) {
  tap(854, 242); await sleep(700);
  const st0 = await senseRun();
  if (st0.screen !== 'rest') { out('ABORT', { screen: st0.screen }); break; }
  swipe(1413, 861, 1086, 447, 700); await sleep(800);
  const pre = shot('gg-' + y + '-pre');
  swipe(1086, y, 1086, y - 170, 420); await sleep(1100);
  const st1 = await senseRun();
  const post = shot('gg-' + y + '-post');
  out('TRY', { y, before: st0.slotsLeft, after: st1.slotsLeft, pre, post });
}
console.log('DONE');
