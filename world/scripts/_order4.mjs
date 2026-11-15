import { senseRun } from '../lib/drive.js'
import { shopAction, scanDeckChips } from '../lib/run.js'
const b = (await scanDeckChips()).chips
console.log('买前牌位:', JSON.stringify(b.map(c => c.chip.x)))
const st0 = await senseRun(3)
console.log('钱:', st0.money, '牌数:', b.length)
await shopAction({ buyPoints: [[807, 930]] })
await new Promise(r => setTimeout(r, 1800))
const a = (await scanDeckChips()).chips
const st = await senseRun(3)
console.log('钱:', st.money)
console.log('买后牌位:', JSON.stringify(a.map(c => c.chip.x)))
