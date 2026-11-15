import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toRaw, PICK_DWELL_MS, ARRIVE_DWELL_MS } from './touch.js';
import { adbPath, currentDevice } from './adb.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const TMP = join(HERE, '..', '.tmp');

/** 幻影偏移：拖干员时手指必须比目标格低 (33,120)，否则松手弹回甲板 */
export const PHANTOM = { dx: 33, dy: 120 };
export const FACING_VEC = { right: [600, 0], left: [-600, 0], up: [0, -600], down: [0, 600] };
/** 售出区中心（拖到这里松手 = 卖掉） */
export const SELL_ZONE = [1840, 860];

function pushAndRun(lines, name) {
  mkdirSync(TMP, { recursive: true });
  const f = join(TMP, name + '-' + Date.now() + '.txt');
  writeFileSync(f, lines.join('\n') + '\n', 'utf8');
  const adb = adbPath();
  const serial = currentDevice();
  const p = spawnSync(adb, ['-s', serial, 'push', f, '/sdcard/_coopanion_act.txt'], { windowsHide: true, stdio: 'ignore', timeout: 60000 });
  if (p.status !== 0) return { ok: false, error: 'push 失败' };
  const r = spawnSync(adb, ['-s', serial, 'shell', '/data/local/tmp/minitouch -f /sdcard/_coopanion_act.txt'], { windowsHide: true, stdio: 'ignore', timeout: 60000 });
  if (r.error) return { ok: false, error: r.error.message };
  return { ok: true };
}

function emitPlace(lines, from, to, facing, holdStartMs) {
  const [sx, sy] = toRaw(from[0], from[1]);
  const [tx, ty] = toRaw(to[0] + PHANTOM.dx, to[1] + PHANTOM.dy);
  // 2026-11-11 19:26 实测：这里原来写死 'w 50'，调用方传的 holdStartMs 根本没生效。
  // 结果每次上场都是「50ms 轻按 + 拖」，游戏把这当成一次点击 → 弹干员详情（wz_buydetail），
  // 之后手指还按着，整局就卡在「点击取消」。现在按调用方给的起手时长按下去。
  const hs = holdStartMs === undefined || holdStartMs === null ? 50 : Math.max(30, Number(holdStartMs));
  // 起手按满 hs 之后再停 PICK_DWELL_MS 才开始滑（合并成一个 w，见 touch.js 的说明）。
  lines.push('d 0 ' + sx + ' ' + sy + ' 50', 'c', 'w ' + (hs + PICK_DWELL_MS));
  // 2026-11-13 12:4x 用户 m05738：「你拖动干员没有拖动到位，可以稍微拖慢一点，但一定要拖到位置上」。
  // 原来是 10 步 × (50+45)ms ≈ 0.95s，最长一拖要跨 900px，单步跳 90px —— 幽灵跟不上，
  // 表现为「拖到了但没落位 / 落点被吸到隔壁格」。改成 18 步 × (50+60)ms ≈ 2.0s，
  // 到位后再在原地补两次 MOVE（指针停在格心不动），让游戏确认指针就在这格上。
  const N = Number(process.env.COOP_DRAG_STEPS) > 2 ? Number(process.env.COOP_DRAG_STEPS) : 18;
  const stepW = Number(process.env.COOP_DRAG_STEP_MS) >= 0 ? Number(process.env.COOP_DRAG_STEP_MS) : 60;
  for (let i = 1; i <= N; i++) {
    lines.push('m 0 ' + Math.round(sx + (tx - sx) * i / N) + ' ' + Math.round(sy + (ty - sy) * i / N) + ' 50', 'c', 'w ' + stepW);
  }
  // 到位后原地再停两次（指针已在格心，别动），确认落点后再松手。
  lines.push('m 0 ' + tx + ' ' + ty + ' 50', 'c', 'w 200', 'm 0 ' + tx + ' ' + ty + ' 50', 'c', 'w 200');
  // 2026-11-11 m06537：到格心后先停 ARRIVE_DWELL_MS 让游戏确认落点，再松手；一到就松会弹回甲板。
  lines.push('w ' + ARRIVE_DWELL_MS, 'u 0', 'c', 'w 150');
  const d = FACING_VEC[facing || 'right'];
  if (d) {
    const [ox, oy] = toRaw(to[0], to[1]);
    const [ex, ey] = toRaw(to[0] + d[0], to[1] + d[1]);
    lines.push('d 0 ' + ox + ' ' + oy + ' 50', 'c', 'w 50');
    const M = Number(process.env.COOP_DRAG_STEPS) > 2 ? Number(process.env.COOP_DRAG_STEPS) : 18;
    for (let i = 1; i <= M; i++) {
      lines.push('m 0 ' + Math.round(ox + (ex - ox) * i / M) + ' ' + Math.round(oy + (ey - oy) * i / M) + ' 50', 'c', 'w ' + stepW);
    }
    lines.push('m 0 ' + ex + ' ' + ey + ' 50', 'c', 'w 200');
    lines.push('w 250', 'u 0', 'c', 'w 120');
  }
}

function emitEquip(lines, from, to, holdStartMs, holdMs, steps) {
  const hs = holdStartMs === undefined ? 50 : holdStartMs;
  const hm = holdMs === undefined ? 700 : holdMs;
  const st = steps === undefined ? 12 : steps;
  const [sx, sy] = toRaw(from[0], from[1]);
  const [tx, ty] = toRaw(to[0], to[1]);
  lines.push('d 0 ' + sx + ' ' + sy + ' 50', 'c', 'w ' + (hs + PICK_DWELL_MS));
  for (let i = 1; i <= st; i++) {
    lines.push('m 0 ' + Math.round(sx + (tx - sx) * i / st) + ' ' + Math.round(sy + (ty - sy) * i / st) + ' 50', 'c', 'w 45');
  }
  lines.push('w ' + (hm + ARRIVE_DWELL_MS), 'u 0', 'c', 'w 200');
}

function emitDrag(lines, from, to, opts) {
  const o = opts || {};
  const holdStartMs = o.holdStartMs === undefined ? 50 : o.holdStartMs;
  const holdMs = o.holdMs === undefined ? 500 : o.holdMs;
  const steps = o.steps || 10;
  const stepMs = o.stepMs || 45;
  const [sx, sy] = toRaw(from[0], from[1]);
  const [tx, ty] = toRaw(to[0], to[1]);
  lines.push('d 0 ' + sx + ' ' + sy + ' 50', 'c', 'w ' + holdStartMs);
  for (let i = 1; i <= steps; i++) {
    lines.push('m 0 ' + Math.round(sx + (tx - sx) * i / steps) + ' ' + Math.round(sy + (ty - sy) * i / steps) + ' 50', 'c', 'w ' + stepMs);
  }
  lines.push('w ' + holdMs, 'u 0', 'c', 'w 200');
}

/** 一次上场多个干员：所有动作写进同一个命令文件，中间不截图、不回主机。 */
export async function placeBatch(items) {
  const t0 = Date.now();
  const lines = [];
  for (const it of items) emitPlace(lines, it.from, it.to, it.facing, it.holdStartMs);
  const r = pushAndRun(lines, 'place');
  return Object.assign({}, r, { count: items.length, ms: Date.now() - t0 });
}

/** 一次卖多个（每个 from 拖到售出区）。 */
export async function sellBatch(points, opts) {
  const t0 = Date.now();
  const lines = [];
  const o = opts || {};
  for (const p of points) emitDrag(lines, p, o.to || SELL_ZONE, o);
  const r = pushAndRun(lines, 'sell');
  return Object.assign({}, r, { count: points.length, ms: Date.now() - t0 });
}

/** 一次装多件装备。 */
export async function equipBatch(pairs) {
  const t0 = Date.now();
  const lines = [];
  for (const p of pairs) emitEquip(lines, p.from, p.to, p.holdStartMs, p.holdMs, p.steps);
  const r = pushAndRun(lines, 'equip');
  return Object.assign({}, r, { count: pairs.length, ms: Date.now() - t0 });
}

export async function place(from, to, facing) {
  return placeBatch([{ from: from, to: to, facing: facing || 'right' }]);
}
export async function sell(from, to) {
  return sellBatch([from], { to: to || SELL_ZONE });
}
export async function equip(from, to) {
  return equipBatch([{ from: from, to: to }]);
}
