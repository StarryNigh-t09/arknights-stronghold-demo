import { POINTS, shopAction, tapAt, sleep } from '../lib/run.js';
import { senseRun } from '../lib/drive.js';

async function main() {
  const N = Number(process.env.BUY_N || 3);
  let st = await senseRun();
  console.log('S0', JSON.stringify({ screen: st.screen, money: st.money, expanded: st.shopExpanded, cards: (st.shop || []).length }));
  if (st.screen !== 'rest' && st.screen !== 'prep') return console.log('NOT_REST', st.screen);
  const open = st.shopExpanded || (st.shopBrightness != null && st.shopBrightness < 300) || (st.shop || []).filter((c) => c && c.name).length > 1;
  if (!open) {
    await tapAt(POINTS.shopExpand, 1300, '展开商店');
    st = await senseRun();
  }
  const cards = (st.shop || []).filter((c) => c && c.name).map((c) => ({ name: c.name, cost: c.price == null ? null : Number(c.price), x: c.x, y: c.y }));
  cards.sort((a, b) => (a.cost ?? 99) - (b.cost ?? 99));
  let money = st.money;
  const pts = [];
  for (const c of cards) {
    if (pts.length >= N) break;
    if (c.cost == null || c.cost > money) continue;
    if (!c.x || !c.y) continue;
    pts.push([c.x, c.y]);
    money -= c.cost;
  }
  console.log('BUY', JSON.stringify({ picks: pts, left: money }));
  if (pts.length) await shopAction({ buyPoints: pts });
  await sleep(900);
  await tapAt(POINTS.collapse, 1400, '收起商店');
  await sleep(700);
  const a = await senseRun();
  console.log('S1', JSON.stringify({ money: a.money, expanded: a.shopExpanded, brightness: a.shopBrightness }));
}
main().catch((e) => { console.error('ERR', e && e.stack || e); process.exit(1); });
