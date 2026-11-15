import { senseRun } from '../lib/drive.js'
import { shopAction, scanDeckChips } from '../lib/run.js'
const before = (await scanDeckChips()).chips
await shopAction({ buyPoints: [[567, 930]] })
await new Promise(r => setTimeout(r, 1500))
const after = (await scanDeckChips()).chips
const st = await senseRun(3)
console.log('钱=', st.money, '剩余可放置=', st.slotsLeft)
console.log('前=', JSON.stringify(before.map(c => [c.chip.x, c.chip.y])))
console.log('后=', JSON.stringify(after.map(c => [c.chip.x, c.chip.y])))
