// 候选确认手势批量测试：每次重新拎卡→落格→做一个动作→判 slotsLeft
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
function swipe(x1, y1, x2, y2, d) { spawnSync(adb, ['-s', serial, 'shell', 'input', 'swipe', String(x1), String(y1), String(x2), String(y2), String(d)], { timeout: 30000 }); }
const TX = 1086, TY = 447;
async function pickUp() {
  const d0 = await scanDeckChips({ minPressY: 840 });
  const chips = (d0.chips || []).slice().sort((a, b) => a.x - b.x);
  if (!chips.length) return false;
  const c = chips[chips.length - 1];
  const from = toRaw(c.x, c.y - 21); const to = toRaw(TX, TY);
  const lines = ['d 0 ' + from[0] + ' ' + from[1] + ' 50', 'c', 'w 700'];
  for (let i = 1; i <= 15; i++) lines.push('m 0 ' + Math.round(from[0] + (to[0] - from[0]) * i / 15) + ' ' + Math.round(from[1] + (to[1] - from[1]) * i / 15) + ' 50', 'c', 'w 40');
  lines.push('u 0', 'c');
  const f = join(TMP, 'ck-' + Date.now() + '.txt');
  writeFileSync(f, lines.join('\n') + '\n', 'utf8');
  spawnSync(adb, ['-s', serial, 'push', f, '/sdcard/_coopanion_ck.txt'], { windowsHide: true, stdio: 'ignore', timeout: 60000 });
  spawnSync(adb, ['-s', serial, 'shell', '/data/local/tmp/minitouch -f /sdcard/_coopanion_ck.txt'], { timeout: 30000 });
  await sleep(900);
  return true;
}
const CASES = [
  { name: 'tapSky', run: async () => { tap(960, 140); } },
  { name: 'dblTapGhost', run: async () => { tap(1082, 380); await sleep(120); tap(1082, 380); } },
  { name: 'longGhost', run: async () => { swipe(1082, 380, 1082, 380, 900); } },
  { name: 'swipeRight', run: async () => { swipe(1082, 380, 1230, 380, 350); } },
];
for (const c of CASES) {
  const st0 = await senseRun();
  if (st0.screen !== 'rest') { out('ABORT', { screen: st0.screen }); break; }
  const ok = await pickUp();
  if (!ok) { out('DECK_EMPTY', {}); break; }
  const pre = shot('ck-' + c.name + '-pre');
  await c.run();
  await sleep(1100);
  const st1 = await senseRun();
  const post = shot('ck-' + c.name + '-post');
  out('TRY', { c: c.name, before: st0.slotsLeft, after: st1.slotsLeft, placed: (st0.slotsLeft != null && st1.slotsLeft != null) ? st0.slotsLeft - st1.slotsLeft : null, pre, post });
  await sleep(200);
}
console.log('DONE');
