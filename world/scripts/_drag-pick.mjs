// A 段实验：拎起一张卡 → 松手（悬空）→ 截图找绿色可放置格 → 点格心 → 看有没有真的放上去
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { adbPath, currentDevice } from '../lib/adb.js';
import { toRaw } from '../lib/touch.js';
import { scanDeckChips, sleep, POINTS, tapAt } from '../lib/run.js';
import { senseRun } from '../lib/drive.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const TMP = join(HERE, '..', '.tmp');
mkdirSync(TMP, { recursive: true });
const adb = adbPath();
const serial = currentDevice();
const PY = process.env.COOP_OCR_PYTHON || 'python';
const out = (tag, obj) => console.log(tag, JSON.stringify(obj));

function shot(name) {
  const p = join(TMP, name + '.png');
  const r = spawnSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 40 * 1024 * 1024, timeout: 30000 });
  if (r.status === 0 && r.stdout && r.stdout.length > 50000) { writeFileSync(p, r.stdout); return p; }
  return null;
}
function runMinitouch(lines, name) {
  const f = join(TMP, name + '-' + Date.now() + '.txt');
  writeFileSync(f, lines.join('\n') + '\n', 'utf8');
  const push = spawnSync(adb, ['-s', serial, 'push', f, '/sdcard/_coopanion_' + name + '.txt'], { windowsHide: true, stdio: 'ignore', timeout: 60000 });
  if (push.status !== 0) return { ok: false };
  const r = spawnSync(adb, ['-s', serial, 'shell', '/data/local/tmp/minitouch -f /sdcard/_coopanion_' + name + '.txt'], { windowsHide: true, stdio: 'ignore', timeout: 60000 });
  return { ok: r.status === 0 };
}
function greenTiles(png) {
  const r = spawnSync(PY, [join(HERE, '_green.py'), png], { encoding: 'utf8', timeout: 60000 });
  try { return JSON.parse((r.stdout || '').trim().split('\n').pop()); } catch { return { n: 0, err: (r.stderr || '').slice(-300) }; }
}

const st = await senseRun();
out('STATE', { screen: st.screen, round: st.round, slotsLeft: st.slotsLeft, money: st.money });
if (st.screen !== 'rest') { console.log('ABORT 不在休整期'); process.exit(0); }
const deck0 = await scanDeckChips({ minPressY: 840 });
const chips0 = (deck0.chips || []).slice().sort((a, b) => a.x - b.x);
out('DECK0', { n: chips0.length, chips: chips0.map((c) => [c.x, c.y]) });
if (!chips0.length) { console.log('DECK_EMPTY'); process.exit(0); }
const card = chips0[0];

// 1) 拎起来，悬空松手
const [sx, sy] = toRaw(card.x, card.y - 21);
const lines = ['d 0 ' + sx + ' ' + sy + ' 50', 'c', 'w 350'];
const N = 8;
const dest = [card.x - 120, card.y - 260];
const [dx, dy] = toRaw(dest[0], dest[1]);
for (let i = 1; i <= N; i++) lines.push('m 0 ' + Math.round(sx + (dx - sx) * i / N) + ' ' + Math.round(sy + (dy - sy) * i / N) + ' 50', 'c', 'w 55');
lines.push('w 600', 'u 0', 'c', 'w 300');
out('GRAB', runMinitouch(lines, 'pick'));
await sleep(900);
const pMode = shot('pick-mode');
out('MODE_SHOT', { p: pMode });
const green = greenTiles(pMode);
out('GREEN', green);
if (!green.tiles || !green.tiles.length) { console.log('NO_GREEN 认不出可放置格，停手'); process.exit(0); }

// 2) 点绿色格心，看是不是就落位
const t = green.tiles[0];
out('TAP_TILE', { at: [t.x, t.y], px: t.n });
await tapAt([t.x, t.y], 1400, '点可放置格');
await sleep(1000);
const pAfter = shot('pick-after');
out('AFTER_SHOT', { p: pAfter });
const deck1 = await scanDeckChips({ minPressY: 840 });
out('DECK1', { n: (deck1.chips || []).length, chips: (deck1.chips || []).map((c) => [c.x, c.y]) });
const st2 = await senseRun();
out('STATE2', { screen: st2.screen, slotsLeft: st2.slotsLeft, money: st2.money });
console.log('DONE');
