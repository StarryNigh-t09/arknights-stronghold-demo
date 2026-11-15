// 按旧会话配方：落格松手后，再按格心朝方向滑 70px 定朝向并确认
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
const DIRS = { right: [70, 0], left: [-70, 0], up: [0, -70], down: [0, 70] };
const TX = 1086, TY = 447;
for (const [name, [dx, dy]] of Object.entries(DIRS)) {
  tap(854, 242); await sleep(650);
  const st0 = await senseRun();
  if (st0.screen !== 'rest') { out('ABORT', { screen: st0.screen }); break; }
  // 第一段：待命区 → 格心
  const from = toRaw(1413, 861); const to = toRaw(TX, TY);
  const lines = ['d 0 ' + from[0] + ' ' + from[1] + ' 50', 'c', 'w 600'];
  for (let i = 1; i <= 10; i++) lines.push('m 0 ' + Math.round(from[0] + (to[0] - from[0]) * i / 10) + ' ' + Math.round(from[1] + (to[1] - from[1]) * i / 10) + ' 50', 'c', 'w 45');
  lines.push('w 450', 'u 0', 'c', 'w 150');
  // 第二段：按格心 → 朝方向滑 70px
  const c0 = toRaw(TX, TY); const c1 = toRaw(TX + dx, TY + dy);
  lines.push('d 0 ' + c0[0] + ' ' + c0[1] + ' 50', 'c', 'w 80');
  for (let i = 1; i <= 6; i++) lines.push('m 0 ' + Math.round(c0[0] + (c1[0] - c0[0]) * i / 6) + ' ' + Math.round(c0[1] + (c1[1] - c0[1]) * i / 6) + ' 50', 'c', 'w 40');
  lines.push('w 250', 'u 0', 'c', 'w 200');
  const f = join(TMP, 'face-' + name + '.txt');
  writeFileSync(f, lines.join('\n') + '\n', 'utf8');
  spawnSync(adb, ['-s', serial, 'push', f, '/sdcard/_coopanion_face.txt'], { windowsHide: true, stdio: 'ignore', timeout: 60000 });
  spawnSync(adb, ['-s', serial, 'shell', '/data/local/tmp/minitouch -f /sdcard/_coopanion_face.txt'], { timeout: 40000 });
  await sleep(1200);
  const st1 = await senseRun();
  const p = shot('face-' + name);
  out('TRY', { dir: name, before: st0.slotsLeft, after: st1.slotsLeft, p });
}
console.log('DONE');
