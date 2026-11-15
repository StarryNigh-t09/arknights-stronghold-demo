import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { scanDeckChips } from '../lib/run.js';

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
  fs.writeFileSync(p, r.stdout);
  return p;
}
function state(png) {
  const r = spawnSync(PY, [W + '\\sidecar\\_state.py', png], { encoding: 'utf8', cwd: W });
  try { return JSON.parse((r.stdout || '').trim()); } catch { return { green: -1, red: -1, redCenter: null, shop: -1 }; }
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
function drag(x, y, tx, ty, holdMs, durMs, steps = 12) {
  const [rx, ry] = toRaw(x, y);
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
  let p = shot('s0');
  let st = state(p);
  console.log('S0', JSON.stringify(st));
  if (st.shop < 300) {
    tap(1770, 1005); await sleep(1500);
    p = shot('s1'); st = state(p);
    console.log('AFTER_FOLD', JSON.stringify(st));
  }
  const d = scanDeckChips({ minPressY: 840 });
  const chips = d.chips || [];
  console.log('DECK', d.ok, JSON.stringify(chips));
  if (!chips.length) { console.log('NO_CHIPS'); return; }
  const c = chips[0];
  const fx = c.x, fy = c.y - 21;
  console.log('PRESS', fx, fy);
  drag(fx, fy, 964, 350, 600, 420);
  await sleep(500);
  p = shot('pend');
  st = state(p);
  console.log('AFTER_DRAG', JSON.stringify(st), st.green > 3000 ? 'PENDING' : 'NO_PENDING');
  console.log('PEND_PNG', p);
}
main().catch((e) => { console.error('ERR', e && e.stack || e); process.exit(1); });
