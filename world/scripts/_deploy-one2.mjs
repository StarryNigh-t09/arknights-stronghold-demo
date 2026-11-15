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
  adb(['push', f, '/sdcard/_mtc.txt']);
  return adb(['shell', '/data/local/tmp/minitouch -f /sdcard/_mtc.txt'], { encoding: 'utf8', timeout: 40000 });
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
function swipe(x1, y1, x2, y2, ms) {
  return adb(['shell', 'input', 'swipe', String(x1), String(y1), String(x2), String(y2), String(ms)]);
}

// 一次上场：拖拽 + 上滑确认
async function deployOne(px, py, tx, ty, tag) {
  const t0 = Date.now();
  drag(px, py, tx, ty, 600, 420);
  await sleep(320);
  let s = state(shot(tag + '-a'));
  const tDrag = Date.now() - t0;
  if (!(s.green > 3000)) return { ok: false, why: 'no_pending', green: s.green, tDrag };
  // 幽灵脚在落点上，上滑确认：从落点上方 50px 向上滑 150px
  swipe(tx, ty - 50, tx, ty - 200, 400);
  await sleep(520);
  s = state(shot(tag + '-b'));
  const tAll = Date.now() - t0;
  if (s.green > 3000) return { ok: false, why: 'still_pending', green: s.green, tDrag, tAll };
  return { ok: true, green: s.green, tDrag, tAll };
}

async function main() {
  const jobs = JSON.parse(process.env.DEPLOY_JOBS || '[]');
  for (const j of jobs) {
    const r = await deployOne(j.px, j.py, j.tx, j.ty, 'd' + j.tx + '_' + j.ty);
    console.log('DEPLOY', JSON.stringify({ from: [j.px, j.py], to: [j.tx, j.ty], ...r }));
    if (!r.ok) break;
  }
  const p = shot('final');
  console.log('FINAL', JSON.stringify(state(p)));
}
main().catch((e) => { console.error('ERR', e && e.stack || e); process.exit(1); });
