// 定向落位：折叠商店 → 扫甲板 → 拖进待确认态 → 按 dir 方向滑选朝向 → 验证是否真上场。
import { scanDeckChips, tapAt, POINTS } from '../lib/run.js';
import { adb, screenshot } from '../lib/adb.js';
import { senseRun } from '../lib/drive.js';
import { dragFromTo, confirmDeploy, screenState, saveShot, snapTile, validTilesOf, PENDING_GREEN, DEPLOY_HOLD_MS, DEPLOY_MOVE_MS, loadPressOffset, cancelPending } from '../lib/deploy-fast.js';

const TILES = [[1196,353],[964,350],[845,348],[1081,351],[1311,354],[715,444],[840,445],[1086,447],[1207,448],[1326,449],[704,550],[835,551],[1218,552],[1342,552],[692,667],[829,667],[1360,665],[1489,665]];
const DIRS = (process.env.DIRS || 'right,up').split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1) 折叠商店（手头铁律：甲板操作前必须折叠）
let st0 = screenState(saveShot(screenshot(), 'f0'));
if (st0.shop < 300) { await tapAt(POINTS.collapse, 1300, '折叠商店'); await sleep(1200); st0 = screenState(saveShot(screenshot(), 'f1')); console.log('FOLD shop=' + st0.shop); }
const off = loadPressOffset() || { dx: 0, dy: 0 };
console.log('OFFSET ' + JSON.stringify(off));
const s0 = await senseRun().catch(() => null);
console.log('STATE ' + JSON.stringify({ round: s0 && s0.round, slots: s0 && s0.slotsLeft, money: s0 && s0.money, shopExpanded: s0 && s0.shopExpanded }));

const out = [];
for (const dir of DIRS) {
  const deck = await scanDeckChips({ minPressY: 840 });
  const cs = (deck && deck.chips) || [];
  console.log('DECK ' + cs.length + ' ' + JSON.stringify(cs.map((c) => [c.x, c.y])));
  if (!cs.length) break;
  const press = { x: cs[0].x + (off.dx || 0), y: cs[0].y + (off.dy || 0) };
  let landed = false;
  for (const tile of TILES) {
    const t0 = Date.now();
    dragFromTo([press.x, press.y], tile, { holdMs: DEPLOY_HOLD_MS, moveMs: DEPLOY_MOVE_MS, tag: 'fd' });
    await sleep(300);
    const st = screenState(saveShot(screenshot(), 'fd-' + dir));
    if (!(st.green > PENDING_GREEN)) { console.log('  ' + dir + ' ' + tile.join(',') + ' 无待确认 green=' + st.green); continue; }
    saveShot(screenshot(), 'arrow-' + dir + '-' + tile.join('_'));
    const snap = snapTile(saveShot(screenshot(), 'snap-' + dir), tile);
    if (!snap) { console.log('  ' + dir + ' 拿不到吸附格 → 取消'); cancelPending(st); await sleep(700); continue; }
    if (Math.abs(snap[0] - tile[0]) > 30 || Math.abs(snap[1] - tile[1]) > 30) console.log('  ' + dir + ' 幽灵吸到 ' + snap.join(','));
    confirmDeploy(snap, { dir });
    await sleep(600);
    const st2 = screenState(saveShot(screenshot(), 'done-' + dir));
    const after = await scanDeckChips({ minPressY: 840 });
    const n = (after && after.chips || []).length;
    const ok = n < cs.length;
    console.log('  ' + dir + ' tile ' + tile.join(',') + ' green ' + st.green + '→' + st2.green + ' deck ' + cs.length + '→' + n + (ok ? ' ✅' : ' ❌') + ' ' + (Date.now() - t0) + 'ms');
    out.push({ dir, tile, ok, n });
    landed = true;
    break;
  }
  if (!landed) console.log('  ' + dir + ' 没找到能放的格');
}
const fin = await scanDeckChips({ minPressY: 840 });
const s1 = await senseRun().catch(() => null);
console.log('END deck=' + ((fin && fin.chips) || []).length + ' ' + JSON.stringify({ round: s1 && s1.round, slots: s1 && s1.slotsLeft }));
console.log('RESULT ' + JSON.stringify(out));
