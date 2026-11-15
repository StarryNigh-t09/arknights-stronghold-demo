import { senseRun } from '../lib/drive.js'
import { tapAt, POINTS, scanDeckChips } from '../lib/run.js'
await tapAt(POINTS.shopExpand, 1500, '展开商店')
const st = await senseRun(3)
console.log('screen=', st.screen, 'money=', st.money, 'slotsLeft=', st.slotsLeft)
console.log('shop=', JSON.stringify((st.shop || []).filter(s => s && !s.empty).map(s => ({ n: s.name, p: s.price, t: s.tier, x: s.x, y: s.y }))))
const c = (await scanDeckChips()).chips
console.log('牌位=', JSON.stringify(c.map(x => ({ x: x.x, y: x.y, bx: x.chip.x, by: x.chip.y }))))
