import { senseRun } from '../lib/drive.js'
import { scanDeckChips, shopAction } from '../lib/run.js'
const st = await senseRun(3)
console.log('screen=', st.screen, 'round=', st.round, 'money=', st.money, 'slotsLeft=', st.slotsLeft, 'level=', st.level)
console.log('shop=', JSON.stringify((st.shop || []).filter(s => s && !s.empty).map(s => ({ n: s.name, p: s.price, t: s.tier, x: s.x, y: s.y }))))
const before = (await scanDeckChips()).chips
console.log('牌位前=', JSON.stringify(before.map(c => ({ x: c.x, y: c.y, bx: c.chip.x, by: c.chip.y }))))
