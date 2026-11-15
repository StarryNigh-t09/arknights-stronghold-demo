import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const ADB = 'C:/Program Files/Netease/MuMu/nx_main/adb.exe';
const DEV = process.env.COOPANION_DEVICE || 'emulator-5556';
const W = process.cwd();
const TMP = W + '\\.tmp';
const PY = process.env.COOP_OCR_PYTHON || 'C:\\\\Python314\\\\python.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const adb = (args, opts = {}) => spawnSync(ADB, ['-s', DEV, ...args], { maxBuffer: 48 * 1024 * 1024, timeout: 60000, ...opts });
const toRaw = (x, y) => [1079 - y, x];

let shotN = 0;
function shot(tag) {
  const p = TMP + '\\' + (tag || 'p') + '-' + (++shotN) + '.png';
  const r = adb(['exec-out', 'screencap', '-p']);
  if (r.status !== 0 || !r.stdout || r.stdout.length < 10000) throw new Error('screencap failed');
  fs.writeFileSync(p, r.stdout);
  return p;
}
function state(png) {
  const r = spawnSync(PY, [W + '\\sidecar\\_state.py', png], { encoding: 'utf8', cwd: W });
  try { return JSON.parse((r.stdout || '').trim()); } catch { return { green: -1, red: -1, redCenter: null }; }
}
function badges(png) {
  const r = spawnSync(PY, [W + '\\sidecar\\deck.py', png], { encoding: 'utf8', cwd: W });
  try { return JSON.parse((r.stdout || '').trim()); } catch { return { best: [] }; }
}
let mtN = 0;
function minitouch(lines) {
  const f = TMP + '\\mt' + (++mtN) + '.txt';
  fs.writeFileSync(f, lines.join('\n') + '\n', 'utf8');
  adb(['push', f, '/sdcard/_mtp.txt']);
  return adb(['shell', '/data/local/tmp/minitouch -f /sdcard/_mtp.txt'], { encoding: 'utf8', timeout: 40000 });
}
function tap(x, y, ms = 120) {
  const [rx, ry] = toRaw(x, y);
  return minitouch(['d 0 ' + rx + ' ' + ry + ' 50', 'c', 'w ' + ms, 'u 0', 'c', 'w 100']);
}
function drag(x, y, tx, ty, holdMs, durMs) {
  const [rx, ry] = toRaw(x, y);
  const steps = 12;
  const lines = ['d 0 ' + rx + ' ' + ry + ' 50', 'c', 'w ' + holdMs];
  for (let i = 1; i <= steps; i++) {
    const xx = Math.round(x + (tx - x) * i / steps);
    const yy = Math.round(y + (ty - y) * i / steps);
    const [mx, my] = toRaw(xx, yy);
    lines.push('m 0 ' + mx + ' ' + my + ' 50', 'c', 'w ' + Math.round(durMs / steps));
  }
  lines.push('u 0', 'c', 'w 150');
  return minitouch(lines);
}

async function main() {
  // 折叠商店
  tap(1763, 953); await sleep(1300);
  let p = shot('chk');
  console.log('STATE', JSON.stringify(state(p)));
  const bd = badges(p);
  const best = (bd.best || []).slice();
  console.log('BEST', JSON.stringify(best));
  if (!best.length) return;
  const b = best[0];
  const bx = b.x + 75, by = b.y + 100;   // 干员身体中心估计
  console.log('BODY_GUESS', bx, by);
  const holds = [120, 200, 300, 400, 600, 800];
  for (const h of holds) {
    drag(bx, by, 964, 350, h, 420);
    await sleep(500);
    const s = state(shot('h' + h));
    console.log('HOLD', h, 'green=' + s.green, 'red=' + s.red, s.green > 3000 ? 'PENDING' : '-');
    if (s.green > 3000) {
      // 清：点红 X
      if (s.redCenter) tap(s.redCenter[0], s.redCenter[1], 100); else tap(1500, 300, 100);
      await sleep(900);
      const s3 = state(shot('clr' + h));
      console.log('  CLEARED green=' + s3.green);
    }
  }
}
main().catch((e) => { console.error('ERR', e && e.stack || e); process.exit(1); });
