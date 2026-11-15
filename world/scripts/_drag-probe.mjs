// 手势探针：抓「按下 / 到位 / 松手」三段现场证据（不改流程、不点准备就绪）
// G1 = 按住甲板卡 2.5s 不动再松（看游戏有没有把牌拎起来）
// G2 = 完整拖拽（起手 holdStart + 10 段滑动 + 到位停 900 + 松手），期间并行截图
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';
import { adbPath, currentDevice } from '../lib/adb.js';
import { toRaw, PICK_DWELL_MS, ARRIVE_DWELL_MS } from '../lib/touch.js';
import { scanDeckChips, sleep } from '../lib/run.js';
import { senseRun } from '../lib/drive.js';
import { PHANTOM } from '../lib/act.js';

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

async function runGesture(lines, shots) {
  const f = join(TMP, 'probe-' + Date.now() + '.txt');
  writeFileSync(f, lines.join('\n') + '\n', 'utf8');
  const push = spawnSync(adb, ['-s', serial, 'push', f, '/sdcard/_coopanion_probe.txt'], { windowsHide: true, stdio: 'ignore', timeout: 60000 });
  if (push.status !== 0) { out('PUSH_FAIL', { status: push.status }); return null; }
  const t0 = Date.now();
  const proc = spawn(adb, ['-s', serial, 'shell', '/data/local/tmp/minitouch -f /sdcard/_coopanion_probe.txt'], { windowsHide: true, stdio: 'ignore' });
  const taken = [];
  for (const s of shots) {
    const wait = s.at - (Date.now() - t0);
    if (wait > 0) await sleep(wait);
    taken.push([s.tag, shot('probe-' + s.tag + '-' + t0)]);
  }
  await new Promise((res) => { proc.on('exit', res); proc.on('error', res); });
  return { ms: Date.now() - t0, taken };
}

const st = await senseRun();
out('STATE', { screen: st.screen, round: st.round, slotsLeft: st.slotsLeft, money: st.money, shopOpen: st.shopExpanded, bright: st.shopBrightness });
if (st.screen !== 'rest') { console.log('ABORT 不在休整期'); process.exit(0); }
const deck = await scanDeckChips({ minPressY: 840 });
const chips = deck.chips || [];
out('DECK', { n: chips.length, chips: chips.map((c) => [c.x, c.y]) });
if (!chips.length) { console.log('DECK_EMPTY'); process.exit(0); }

const before = shot('probe-before');
out('SHOT', { before });

// G1：只按住，不动
{
  const c = chips[0];
  const [rx, ry] = toRaw(c.x, c.y);
  const lines = ['d 0 ' + rx + ' ' + ry + ' 50', 'c', 'w 2500', 'u 0', 'c', 'w 200'];
  const r = await runGesture(lines, [{ tag: 'g1-hold', at: 1200 }, { tag: 'g1-late', at: 2000 }]);
  out('G1', { from: [c.x, c.y], ms: r && r.ms, shots: r && r.taken });
  await sleep(800);
  out('G1_AFTER_SHOT', { p: shot('probe-g1-after') });
}

// G2：完整拖拽到 725,347（上一轮失败过的格）+ PHANTOM
{
  const c = chips[0];
  const to = [725, 347];
  const [sx, sy] = toRaw(c.x, c.y);
  const [tx, ty] = toRaw(to[0] + PHANTOM.dx, to[1] + PHANTOM.dy);
  const lines = ['d 0 ' + sx + ' ' + sy + ' 50', 'c', 'w ' + (600 + PICK_DWELL_MS)];
  const N = 10;
  for (let i = 1; i <= N; i++) lines.push('m 0 ' + Math.round(sx + (tx - sx) * i / N) + ' ' + Math.round(sy + (ty - sy) * i / N) + ' 50', 'c', 'w 45');
  lines.push('w ' + Math.max(900, ARRIVE_DWELL_MS), 'u 0', 'c', 'w 200');
  const r = await runGesture(lines, [{ tag: 'g2-lift', at: 400 }, { tag: 'g2-mid', at: 1200 }, { tag: 'g2-arrive', at: 1800 }, { tag: 'g2-hold', at: 2400 }]);
  out('G2', { from: [c.x, c.y], to, ms: r && r.ms, shots: r && r.taken });
  await sleep(900);
  out('G2_AFTER_SHOT', { p: shot('probe-g2-after') });
  const deck2 = await scanDeckChips({ minPressY: 840 });
  out('DECK_AFTER', { n: (deck2.chips || []).length, chips: (deck2.chips || []).map((c2) => [c2.x, c2.y]) });
}
console.log('DONE');
