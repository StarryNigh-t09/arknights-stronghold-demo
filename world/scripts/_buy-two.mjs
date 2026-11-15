// 只做一件事：展开商店 → 买最多 2 张单价 ≤2 的卡 → 折叠商店 → 复核
// 不点准备就绪、不开新局、不刷新、不升级。
import { POINTS, sleep, tapAt } from '../lib/run.js';
import { senseRun } from '../lib/drive.js';

const out = (tag, obj) => console.log(tag, JSON.stringify(obj));
const nonEmpty = (st) => (st.shop || []).filter((c) => c && !c.empty && c.name);
const isOpen = (st) => (st.shopExpanded === false ? false : (typeof st.shopBrightness === 'number' ? st.shopBrightness < 300 : nonEmpty(st).length > 1));

let st = await senseRun();
out('STATE0', { ok: st.ok, screen: st.screen, round: st.round, money: st.money, slotsLeft: st.slotsLeft, shopOpen: isOpen(st), brightness: st.shopBrightness });
if (!st.ok || st.screen !== 'rest') { console.log('ABORT 不在休整期'); process.exit(0); }
if (!isOpen(st)) {
  await tapAt(POINTS.shopExpand, 1300, '展开商店');
  st = await senseRun();
  out('EXPAND', { shopOpen: isOpen(st), brightness: st.shopBrightness, cards: nonEmpty(st).map((c) => [c.name, c.price, c.x, c.y]) });
  if (!isOpen(st)) { console.log('ABORT 商店没展开，买不了'); process.exit(0); }
} else {
  out('SHOP', { cards: nonEmpty(st).map((c) => [c.name, c.price, c.x, c.y]) });
}

const money0 = Number(st.money) || 0;
const picks = [];
for (const c of nonEmpty(st)) {
  if (picks.length >= 2) break;
  const price = c.price == null ? null : Number(c.price);
  const cost = price == null ? 99 : price;
  if (cost > 2) continue;
  if (!c.x || !c.y) continue;
  if (picks.reduce((s, p) => s + p.cost, 0) + cost > Math.max(0, money0)) continue;
  picks.push({ name: c.name, cost, pt: [c.x, c.y] });
}
if (!picks.length) { console.log('NO_PICK 没有单价 ≤2 且买得起的卡'); out('STATE1', { money: money0 }); process.exit(0); }
out('PICK', { picks: picks.map((p) => [p.name, p.cost, p.pt]) });

const { shopAction } = await import('../lib/run.js');
const done = await shopAction({ buyPoints: picks.map((p) => p.pt) });
out('BOUGHT', { done });

await sleep(600);
st = await senseRun();
out('AFTER', { money: st.money, shopOpen: isOpen(st), cards: nonEmpty(st).map((c) => [c.name, c.price]), slotsLeft: st.slotsLeft });

if (isOpen(st)) {
  await tapAt(POINTS.collapse, 1300, '折叠商店');
  const st2 = await senseRun();
  out('FOLD', { brightness: st2.shopBrightness, shopExpanded: st2.shopExpanded, shopOpen: isOpen(st2) });
}
console.log('DONE');
