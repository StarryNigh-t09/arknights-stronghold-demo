// 录屏版诊断：从甲板卡拖到 C5 格心（964,350），松手；全程录屏
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';
import { adbPath, currentDevice } from '../lib/adb.js';
import { toRaw } from '../lib/touch.js';
import { scanDeckChips, sleep } from '../lib/run.js';
import { senseRun } from '../lib/drive.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const TMP = join(HERE, '..', '.tmp');
mkdirSync(TMP, { recursive: true });
const adb = adbPath();
const serial = currentDevice();
const out = (tag, obj) => console.log(tag, JSON.stringify(obj));
const TARGET = [964, 350];

function shot(name) {
  const p = join(TMP, name + '.png');
  const r = spawnSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 40 * 1024 * 1024, timeout: 30000 });
  if (r.status === 0 && r.stdout && r.stdout.length > 50000) { writeFileSync(p, r.stdout); return p; }
  return null;
}

const st = await senseRun();
out('STATE', { screen: st.screen, round: st.round, slotsLeft: st.slotsLeft });
if (st.screen !== 'rest') { console.log('ABORT 不在休整期'); process.exit(0); }
const deck0 = await scanDeckChips({ minPressY: 840 });
const chips0 = (deck0.chips || []).slice().sort((a, b) => b.x - a.x); // 最右边＝最旧的一张
out('DECK0', { n: chips0.length, chips: chips0.map((c) => [c.x, c.y]) });
if (!chips0.length) { console.log('DECK_EMPTY'); process.exit(0); }
const card = chips0[0];
out('CARD', { at: [card.x, card.y] });

const recName = 'diag-' + Date.now();
const rec = spawn(adb, ['-s', serial, 'shell', 'screenrecord', '--time-limit', '18', '--size', '1280x720', '--bit-rate', '6000000', '/sdcard/' + recName + '.mp4'], { windowsHide: true, stdio: 'ignore' });
await sleep(2500);
out('SHOT_BEFORE', { p: shot('diag-before') });

const [sx, sy] = toRaw(card.x, card.y - 21);
const [tx, ty] = toRaw(TARGET[0], TARGET[1]);
const lines = ['d 0 ' + sx + ' ' + sy + ' 50', 'c', 'w 400'];
const N = 10;
for (let i = 1; i <= N; i++) lines.push('m 0 ' + Math.round(sx + (tx - sx) * i / N) + ' ' + Math.round(sy + (ty - sy) * i / N) + ' 50', 'c', 'w 60');
lines.push('w 800', 'u 0', 'c', 'w 400');
const f = join(TMP, recName + '.txt');
writeFileSync(f, lines.join('\n') + '\n', 'utf8');
spawnSync(adb, ['-s', serial, 'push', f, '/sdcard/_coopanion_diag.txt'], { windowsHide: true, stdio: 'ignore', timeout: 60000 });
const tg = Date.now();
const g = spawnSync(adb, ['-s', serial, 'shell', '/data/local/tmp/minitouch -f /sdcard/_coopanion_diag.txt'], { windowsHide: true, stdio: 'ignore', timeout: 60000 });
out('GESTURE', { ok: g.status === 0, ms: Date.now() - tg });
await sleep(1500);
out('SHOT_DURING', { p: shot('diag-mid') });
await new Promise((res) => { rec.on('exit', res); rec.on('error', res); });
await sleep(500);
const pull = spawnSync(adb, ['-s', serial, 'pull', '/sdcard/' + recName + '.mp4', join(TMP, recName + '.mp4')], { windowsHide: true, stdio: 'ignore', timeout: 120000 });
out('REC', { ok: pull.status === 0, path: join(TMP, recName + '.mp4') });
out('SHOT_AFTER', { p: shot('diag-after') });
const deck1 = await scanDeckChips({ minPressY: 840 });
out('DECK1', { n: (deck1.chips || []).length, chips: (deck1.chips || []).map((c) => [c.x, c.y]) });
const st2 = await senseRun();
out('STATE2', { screen: st2.screen, slotsLeft: st2.slotsLeft });
console.log('DONE');
