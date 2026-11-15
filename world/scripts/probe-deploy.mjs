/**
 * probe-deploy.mjs — 拖上场的手工探针。用法：
 *   node scripts/probe-deploy.mjs look
 *   node scripts/probe-deploy.mjs drag <x> <y> <tx> <ty> [facing]
 *   node scripts/probe-deploy.mjs fold            // 点右下开关，切商店展开/折叠
 * look/drag 都会把截图存到 world/shots/probe-<ts>.png
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { screenshot, tap } from '../lib/adb.js';
import { readState } from '../lib/ocr.js';
import { placeUnit, POINTS, sleep } from '../lib/run.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, '..', 'shots');
mkdirSync(SHOTS, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

async function look(tag) {
  const p = join(SHOTS, 'probe-' + tag + '-' + ts + '.png');
  const buf = screenshot();
  writeFileSync(p, buf);
  const st = await readState(p, { level: Number(process.env.LVL || 0) || undefined });
  console.log(JSON.stringify({
    shot: p,
    ok: st.ok,
    screen: st.screen,
    round: st.round,
    money: st.money,
    hp: st.hp,
    level: st.centerLevel,
    slotsLeft: st.slotsLeft,
    upgradeCost: st.upgradeCost,
    deckUnits: st.deckUnits,
    shop: (st.shop || []).map((s) => ({ n: s.name, p: s.price, t: s.tier, x: s.x, y: s.y, empty: s.empty })),
    raw: st.raw && st.raw.top,
  }, null, 1));
}

const cmd = process.argv[2] || 'look';
if (cmd === 'look') {
  await look('look');
} else if (cmd === 'fold') {
  tap(POINTS.shopExpand[0], POINTS.shopExpand[1]);
  await sleep(1500);
  await look('afterfold');
} else if (cmd === 'drag') {
  const [x, y, tx, ty] = process.argv.slice(3, 7).map(Number);
  const facing = process.argv[7] || 'right';
  const before = await readState(join(SHOTS, 'probe-before-' + ts + '.png'), {});
  console.log('before slotsLeft=' + before.slotsLeft + ' screen=' + before.screen);
  const r = await placeUnit({ from: [x, y], to: [tx, ty], facing });
  console.log('placeUnit ' + JSON.stringify(r));
  await sleep(1200);
  await look('afterdrag');
} else if (cmd === 'mdrag') {
  // 鼠标源拖拽（历史记录说这只一种有时灵）
  const [x, y, tx, ty] = process.argv.slice(3, 7).map(Number);
  const face = process.argv[7] || 'right';
  const { mouseDrag, mouseFacing } = await import('../lib/adb.js');
  mouseDrag(x, y, tx, ty, { holdMs: 150, steps: 24, stepMs: 30 });
  await sleep(400);
  mouseFacing(tx, ty, face, { holdMs: 900, dist: 130 });
  await sleep(1500);
  await look('aftermdrag');
} else if (cmd === 'swipe') {
  const [x, y, tx, ty] = process.argv.slice(3, 7).map(Number);
  const ms = Number(process.argv[7] || 800);
  const { swipe } = await import('../lib/adb.js');
  swipe(x, y, tx, ty, ms);
  await sleep(300);
  const { swipe: s2 } = await import('../lib/adb.js');
  s2(tx, ty, tx + 600, ty, 150);
  await sleep(1500);
  await look('afterswipe');
} else {
  console.log('unknown cmd ' + cmd);
}
