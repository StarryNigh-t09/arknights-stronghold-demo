import { scanDeckChips, placeDeckUnit, sellDeckUnit } from '../lib/run.js'
import { senseRun } from '../lib/drive.js'

const before = await senseRun()
console.log('before slots', before.slotsLeft, 'money', before.money, 'screen', before.screen)
let { chips } = await scanDeckChips()
console.log('chips', chips.length, chips.map((c) => c.x + ',' + c.y).join(' | '))
// 卖掉最左一个，把整备区从 11 降到 10
const target = chips[chips.length - 1]
const s = await sellDeckUnit([target.x, target.y])
const after = await senseRun()
console.log('after sell money', after.money, 'slots', after.slotsLeft, 'sellOk', s.ok)
chips = (await scanDeckChips()).chips
console.log('chips now', chips.length)
for (const t of [[1200, 450], [880, 560], [690, 560], [1150, 340]]) {
  const b = Number((await senseRun()).slotsLeft)
  if (!(b > 0)) { console.log('no slot'); break }
  const c0 = (await scanDeckChips()).chips[0]
  if (!c0) { console.log('no chip'); break }
  const r = await placeDeckUnit({ x: c0.x, y: c0.y, to: t, facing: 'right' })
  const a = Number((await senseRun()).slotsLeft)
  console.log('try', t.join(','), b + '->' + a, 'ok=' + r.ok)
  if (a < b) { console.log('PLACED', t.join(',')); break }
}
