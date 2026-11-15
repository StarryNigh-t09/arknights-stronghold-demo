import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const ADB = 'C:/Program Files/Netease/MuMu/nx_main/adb.exe';
const DEV = process.env.COOPANION_DEVICE || 'emulator-5556';
const W = process.cwd();
const TMP = W + '\\.tmp';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const adb = (args, opts = {}) => spawnSync(ADB, ['-s', DEV, ...args], { maxBuffer: 48 * 1024 * 1024, timeout: 60000, ...opts });

let shotN = 0;
function shot(tag) {
  const name = (tag || 'p') + '-' + (++shotN) + '.png';
  const p = TMP + '\\' + name;
  const r = adb(['exec-out', 'screencap', '-p']);
  if (r.status !== 0 || !r.stdout || r.stdout.length < 10000) throw new Error('screencap failed');
  fs.writeFileSync(p, r.stdout);
  return p;
}

function state(png) {
  const r = spawnSync('python', [W + '\\sidecar\\_state.py', png], { encoding: 'utf8', cwd: W });
  try { return JSON.parse((r.stdout || '').trim()); } catch { return { green: -1, red: -1, redCenter: null, err: (r.stderr || '').slice(0, 200) }; }
}

function badges(png) {
  const r = spawnSync('python', [W + '\\sidecar\\deck.py', png], { encoding: 'utf8', cwd: W });
  const out = (r.stdout || '').trim();
  try { return JSON.parse(out); } catch { return { raw: out.slice(0, 300), chips: [] }; }
}

let mtN = 0;
function minitouch(lines) {
  const tag = 'mt' + (++mtN);
  const f = TMP + '\\' + tag + '.txt';
  fs.writeFileSync(f, lines.join('\n') + '\n', 'utf8');
  adb(['push', f, '/sdcard/_mtp.txt']);
  const r = adb(['shell', '/data/local/tmp/minitouch -f /sdcard/_mtp.txt'], { encoding: 'utf8', timeout: 40000 });
  return r;
}

const toRaw = (x, y) => [1079 - y, x];

function pressMoveUp(x, y, holdMs, dyPx) {
  const [rx, ry] = toRaw(x, y);
  const lines = ['d 0 ' + rx + ' ' + ry + ' 50', 'c', 'w ' + holdMs];
  const steps = 6;
  for (let i = 1; i <= steps; i++) {
    const yy = y - Math.round((dyPx * i) / steps);
    const [mx, my] = toRaw(x, yy);
    lines.push('m 0 ' + mx + ' ' + my + ' 50', 'c', 'w 40');
  }
  lines.push('u 0', 'c', 'w 120');
  return minitouch(lines);
}

async function main() {
  // 0) 先确保商店折叠
  let p = shot('fold-check');
  let st = state(p);
  console.log('STATE0', JSON.stringify(st));
  // 折叠：点收起
  {
    const [rx, ry] = toRaw(1763, 953);
    minitouch(['d 0 ' + rx + ' ' + ry + ' 50', 'c', 'w 120', 'u 0', 'c', 'w 100']);
    await sleep(1400);
  }
  p = shot('after-fold');
  st = state(p);
  console.log('FOLD', JSON.stringify(st));
  const bd = badges(p);
  const chips = bd.chips || [];
  console.log('BADGES', JSON.stringify(chips));
  if (!chips.length) { console.log('NO_BADGES', JSON.stringify(bd).slice(0, 300)); return; }
  const b = chips[0];
  const offs = [];
  for (const dx of [40, 60, 80, 100]) for (const dy of [40, 70, 100, 130]) offs.push([dx, dy]);
  const hits = [];
  for (const [dx, dy] of offs) {
    const px = b.x + dx, py = b.y + dy;
    pressMoveUp(px, py, 520, 70);
    await sleep(600);
    const s2 = state(shot('probe'));
    const pending = s2.green > 3000;
    console.log('PROBE', 'badge=' + b.x + ',' + b.y, 'press=' + px + ',' + py, 'green=' + s2.green, pending ? 'PENDING' : '-');
    if (pending) {
      hits.push([px, py, s2.green]);
      // 清残留：点红 X
      if (s2.redCenter) {
        minitouch(['d 0 ' + toRaw(s2.redCenter[0], s2.redCenter[1])[0] + ' ' + toRaw(s2.redCenter[0], s2.redCenter[1])[1] + ' 50', 'c', 'w 120', 'u 0', 'c', 'w 100']);
      } else {
        minitouch(['d 0 ' + toRaw(1500, 300)[0] + ' ' + toRaw(1500, 300)[1] + ' 50', 'c', 'w 120', 'u 0', 'c', 'w 100']);
      }
      await sleep(900);
    }
  }
  console.log('HITS', JSON.stringify(hits));
}

main().catch((e) => { console.error('ERR', e && e.stack || e); process.exit(1); });
