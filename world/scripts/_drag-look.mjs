// 干净探针：拎起一张甲板卡 → 空中悬停截图（看可放置格高亮）→ 松手可放置区外
// 不拖到任何格子，只观察。手上没牌时才会跑。
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

function shot(name) {
  const p = join(TMP, name + '.png');
  const r = spawnSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 40 * 1024 * 1024, timeout: 30000 });
  if (r.status === 0 && r.stdout && r.stdout.length > 100000) { writeFileSync(p, r.stdout); return p; }
  return null;
}

const st = await senseRun();
out('STATE', { screen: st.screen, round: st.round, slotsLeft: st.slotsLeft, money: st.money });
if (st.screen !== 'rest') { console.log('ABORT 不在休整期'); process.exit(0); }
const deck = await scanDeckChips({ minPressY: 840 });
const chips = (deck.chips || []).slice().sort((a, b) => a.x - b.x);
out('DECK', { n: chips.length, chips: chips.map((c) => [c.x, c.y]) });
if (!chips.length) { console.log('DECK_EMPTY'); process.exit(0); }
const c = chips[0];
out('SHOT0', { p: shot('look-before') });

const [sx, sy] = toRaw(c.x, c.y - 21);
const mid = [c.x - 40, c.y - 300];
const [mx, my] = toRaw(mid[0], mid[1]);
const lines = ['d 0 ' + sx + ' ' + sy + ' 50', 'c', 'w 300'];
const N = 8;
for (let i = 1; i <= N; i++) lines.push('m 0 ' + Math.round(sx + (mx - sx) * i / N) + ' ' + Math.round(sy + (my - sy) * i / N) + ' 50', 'c', 'w 60');
lines.push('w 2200', 'u 0', 'c', 'w 300');
const f = join(TMP, 'look-' + Date.now() + '.txt');
writeFileSync(f, lines.join('\n') + '\n', 'utf8');
const push = spawnSync(adb, ['-s', serial, 'push', f, '/sdcard/_coopanion_look.txt'], { windowsHide: true, stdio: 'ignore', timeout: 60000 });
out('PUSH', { ok: push.status === 0 });
const t0 = Date.now();
const proc = spawn(adb, ['-s', serial, 'shell', '/data/local/tmp/minitouch -f /sdcard/_coopanion_look.txt'], { windowsHide: true, stdio: 'ignore' });
const plan = [{ tag: 'lift', at: 500 }, { tag: 'mid', at: 1200 }, { tag: 'hover', at: 2400 }, { tag: 'hover2', at: 3200 }];
const taken = [];
for (const s of plan) {
  const wait = s.at - (Date.now() - t0);
  if (wait > 0) await sleep(wait);
  taken.push([s.tag, shot('look-' + s.tag)]);
}
await new Promise((res) => { proc.on('exit', res); proc.on('error', res); });
out('SHOTS', { taken, ms: Date.now() - t0 });
await sleep(900);
out('SHOT_AFTER', { p: shot('look-after') });
const deck2 = await scanDeckChips({ minPressY: 840 });
out('DECK_AFTER', { n: (deck2.chips || []).length, chips: (deck2.chips || []).map((c2) => [c2.x, c2.y]) });
console.log('DONE');
