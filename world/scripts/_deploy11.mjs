// 假设：之前一直失败是因为用远程（卡达）往地面格放=无效格，永远 pending
// 测：①点红 X 取消残留 ②拖最左（摆渡人，近战）到地面格 9 ③拖卡达到高台格 1
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
function tap(x, y) { spawnSync(adb, ['-s', serial, 'shell', 'input', 'tap', String(x), String(y)], { timeout: 20000 }); }
async function dragTo(cx, cy, TX, TY, hold) {
  const from = toRaw(cx, cy - 21); const to = toRaw(TX, TY);
  const lines = ['d 0 ' + from[0] + ' ' + from[1] + ' 50', 'c', 'w ' + hold];
  for (let i = 1; i <= 15; i++) lines.push('m 0 ' + Math.round(from[0] + (to[0] - from[0]) * i / 15) + ' ' + Math.round(from[1] + (to[1] - from[1]) * i / 15) + ' 50', 'c', 'w 40');
  lines.push('u 0', 'c');
  const f = join(TMP, 'd2-' + Date.now() + '.txt');
  writeFileSync(f, lines.join('\n') + '\n', 'utf8');
  spawnSync(adb, ['-s', serial, 'push', f, '/sdcard/_coopanion_d2.txt'], { windowsHide: true, stdio: 'ignore', timeout: 60000 });
  spawnSync(adb, ['-s', serial, 'shell', '/data/local/tmp/minitouch -f /sdcard/_coopanion_d2.txt'], { timeout: 30000 });
}
// ① 取消残留预览
tap(854, 242);
await sleep(900);
const st0 = await senseRun();
const p0 = shot('d2-clean');
out('AFTER_CANCEL', { screen: st0.screen, slotsLeft: st0.slotsLeft, p: p0 });
// ② 摆渡人（最左 chip）→ 地面格 9
const d0 = await scanDeckChips({ minPressY: 840 });
const chips = (d0.chips || []).slice().sort((a, b) => a.x - b.x);
out('CHIPS', chips.map((c) => [c.x, c.y]));
if (chips.length) {
  await dragTo(chips[0].x, chips[0].y, 1086, 447, 700);
  await sleep(1100);
  const stA = await senseRun();
  const pA = shot('d2-melee');
  out('TRY_MELEE', { before: st0.slotsLeft, after: stA.slotsLeft, placed: (st0.slotsLeft != null && stA.slotsLeft != null) ? st0.slotsLeft - stA.slotsLeft : null, p: pA });
}
console.log('DONE');
