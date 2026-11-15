import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const ADB = 'C:/Program Files/Netease/MuMu/nx_main/adb.exe';
const DEV = process.env.COOPANION_DEVICE || 'emulator-5556';
const W = process.cwd();
const TMP = W + '\\.tmp';
const PY = 'C:\\Python314\\python.exe';
const ENV = { ...process.env, PYTHONPATH: '..\\~\\Python\\Python314\\site-packages', PYTHONIOENCODING: 'utf-8' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const adb = (args, opts = {}) => spawnSync(ADB, ['-s', DEV, ...args], { maxBuffer: 48 * 1024 * 1024, timeout: 60000, ...opts });
const toRaw = (x, y) => [1079 - y, x];
const PYENV = { encoding: 'utf8', cwd: W, env: ENV };

let shotN = 0;
function shot(tag) {
  const p = TMP + '\\' + tag + '-' + (++shotN) + '.png';
  fs.writeFileSync(p, adb(['exec-out', 'screencap', '-p']).stdout);
  return p;
}
function state(png) {
  const r = spawnSync(PY, [W + '\\sidecar\\_state.py', png], PYENV);
  try { return JSON.parse((r.stdout || '').trim()); } catch { return { green: -1, red: -1, redCenter: null, shop: -1 }; }
}
function greenAt(png, pts) {
  const r = spawnSync(PY, [W + '\\sidecar\\_greenat.py', png, ...pts.map((p) => p[0] + ',' + p[1])], PYENV);
  try { return JSON.parse((r.stdout || '').trim()).g; } catch { return []; }
}
function deck(png) {
  const r = spawnSync('python', [W + '\\sidecar\\deck.py', png], { encoding: 'utf8', cwd: W, env: ENV });
  try { return JSON.parse((r.stdout || '').trim()); } catch { return null; }
}
let mtN = 0;
function minitouch(lines) {
  const f = TMP + '\\mt' + (++mtN) + '.txt';
  fs.writeFileSync(f, lines.join('\n') + '\n', 'utf8');
  adb(['push', f, '/sdcard/_mtc.txt']);
  return adb(['shell', '/data/local/tmp/minitouch -f /sdcard/_mtc.txt'], { encoding: 'utf8', timeout: 40000 });
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
const swipe = (x1, y1, x2, y2, ms) => adb(['shell', 'input', 'swipe', String(x1), String(y1), String(x2), String(y2), String(ms)]);

async function attempt(v) {
  const t0 = Date.now();
  drag(v.px, v.py, v.tx, v.ty, v.holdMs || 600, v.durMs || 420);
  await sleep(300);
  const a = shot('v');
  const s1 = state(a);
  if (!(s1.green > 3000)) {
    // 没进入 pending：可能弹了详情面板，点空白关掉
    swipe(1500, 300, 1500, 300, 60);
    await sleep(400);
    return { ok: false, why: 'no_pending', green: s1.green, ms: Date.now() - t0 };
  }
  const ga = greenAt(a, [[v.tx, v.ty], [v.tx, v.ty - 60]]);
  swipe(v.tx, v.ty + (v.fromDy || -50), v.tx, v.ty + (v.toDy || -200), v.ms || 400);
  await sleep(600);
  const b = shot('w');
  const s2 = state(b);
  const dk = deck(b);
  const tAll = Date.now() - t0;
  const ok = !(s2.green > 3000);
  return { ok, why: ok ? 'cleared' : 'still_pending', green0: s1.green, green1: s2.green, deck: dk && dk.best ? dk.best.length : null, ga, ms: tAll };
}

async function main() {
  const variants = JSON.parse(process.env.AB_JOBS || '[]');
  const base = shot('base');
  const d0 = deck(base);
  console.log('BASE', JSON.stringify({ deck: d0 && d0.best ? d0.best.length : null, state: state(base) }));
  for (const v of variants) {
    const r = await attempt(v);
    console.log('TRY', JSON.stringify({ v, ...r }));
    if (r.ok && r.deck === 0) { console.log('DEPLOYED'); break; }
  }
  const f = shot('end');
  console.log('END', JSON.stringify({ deck: (deck(f) || {}).best?.length ?? null, state: state(f) }));
}
main().catch((e) => { console.error('ERR', e && e.stack || e); process.exit(1); });
