import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ADB = 'C:/Program Files/Netease/MuMu/nx_main/adb.exe';
const DEV = process.env.COOPANION_DEVICE || 'emulator-5556';
const W = process.cwd();
const TMP = W + '\\.tmp';
const PY = 'C:\\Python314\\python.exe';
const PYROOT = '..\\~\\Python\\Python314\\site-packages';
const ENV = { ...process.env, PYTHONPATH: PYROOT, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const adb = (args, opts = {}) => spawnSync(ADB, ['-s', DEV, ...args], { maxBuffer: 48 * 1024 * 1024, timeout: 60000, ...opts });
const toRaw = (x, y) => [1079 - y, x];
const PYENV = { encoding: 'utf8', cwd: W, env: ENV };

let shotN = 0;
export function shot(tag) {
  const p = TMP + '\\' + tag + '-' + Date.now() + '-' + (++shotN) + '.png';
  fs.writeFileSync(p, adb(['exec-out', 'screencap', '-p']).stdout);
  return p;
}
function state(png) {
  const r = spawnSync(PY, [W + '\\sidecar\\_state.py', png], PYENV);
  try { return JSON.parse((r.stdout || '').trim()); } catch { return { green: -1, red: -1, redCenter: null, shop: -1 }; }
}
function validTiles(png) {
  const r = spawnSync(PY, [W + '\\sidecar\\_validtiles.py', png], PYENV);
  try { return (JSON.parse((r.stdout || '').trim()).pts || []).map((t) => ({ v: t[0], x: t[1], y: t[2] })); } catch { return []; }
}
function deckBadges(png) {
  const r = spawnSync('python', [W + '\\sidecar\\deck.py', png], { encoding: 'utf8', cwd: W, env: ENV });
  try { const o = JSON.parse((r.stdout || '').trim()); return (o.best || []); } catch { return []; }
}
let mtN = 0;
function minitouch(lines) {
  const f = TMP + '\\mt' + (++mtN) + '.txt';
  fs.writeFileSync(f, lines.join('\n') + '\n', 'utf8');
  adb(['push', f, '/sdcard/_mtc.txt']);
  return adb(['shell', '/data/local/tmp/minitouch -f /sdcard/_mtc.txt'], { encoding: 'utf8', timeout: 40000 });
}
export function drag(x, y, tx, ty, holdMs, durMs, steps = 12) {
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
const tapRaw = (x, y) => adb(['shell', 'input', 'tap', String(x), String(y)]);

// 抓一次 pending 拿合法格列表，然后点红 X 取消
export async function probeTiles(press, offsets = [[0, 0], [-6, 12], [4, -8], [-4, 20]]) {
  let s = null;
  let p = null;
  for (const [ox, oy] of offsets) {
    drag(press.x + ox, press.y + oy, 1000, 500, 600, 420);
    await sleep(320);
    p = shot('probe');
    s = state(p);
    if (s.green > 3000) break;
    tapRaw(1500, 300);
    await sleep(350);
  }
  if (!(s && s.green > 3000)) return { ok: false, why: 'no_pending', green: s ? s.green : -1 };
  const tiles = validTiles(p);
  const rc = s.redCenter || [965, 240];
  tapRaw(rc[0], rc[1]);
  await sleep(700);
  const s2 = state(shot('probe-cancel'));
  return { ok: true, tiles, cancelled: !(s2.green > 3000), greenAfter: s2.green };
}

export function bodyOf(badge, dx = 47, dy = 88) {
  return { x: Math.round(badge.x + dx), y: Math.round(badge.y + dy) };
}

// 一次上场（拖到已证实合法的格子 + 上滑确认），返回 {ok, pending, ms}
export async function place(press, tile, opts = {}) {
  const holdMs = opts.holdMs ?? 600;
  const durMs = opts.moveMs ?? 420;
  const steps = opts.steps ?? 12;
  const fromDy = opts.fromDy ?? -50;
  const toDy = opts.toDy ?? -200;
  const confirmMs = opts.confirmMs ?? 400;
  const t0 = Date.now();
  drag(press.x, press.y, tile.x, tile.y, holdMs, durMs, steps);
  const tGesture = Date.now() - t0;
  if (opts.noVerify) {
    swipe(tile.x, tile.y + fromDy, tile.x, tile.y + toDy, confirmMs);
    return { ok: null, tGesture, tAll: Date.now() - t0 };
  }
  await sleep(280);
  const a = shot('pl');
  const s1 = state(a);
  if (!(s1.green > 3000)) {
    // 没拎起来：可能弹了详情面板，点空白关掉
    tapRaw(1500, 300);
    await sleep(400);
    return { ok: false, why: 'no_pending', green: s1.green, tGesture, tAll: Date.now() - t0 };
  }
  swipe(tile.x, tile.y + fromDy, tile.x, tile.y + toDy, confirmMs);
  await sleep(520);
  const b = shot('pl2');
  const s2 = state(b);
  const n = deckBadges(b).length;
  return { ok: !(s2.green > 3000), green1: s2.green, deck: n, tile, tGesture, tAll: Date.now() - t0 };
}

export { state, validTiles, deckBadges, swipe, tapRaw, sleep, adb, W, ENV };
