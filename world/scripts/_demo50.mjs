import { writeFileSync } from 'node:fs'
import { scanDeckChips, findDeckEquip, placeEquip } from '../lib/run.js'
import { placeBatch } from '../lib/act.js'
import { screenshot } from '../lib/adb.js'
const sc1 = await scanDeckChips()
console.log('CHIPS', sc1.chips.map(c => c.x + ',' + c.y).join(' | '))
const eq = await findDeckEquip()
console.log('EQUIP', JSON.stringify((eq.items || []).map(it => ({ n: it.name, x: it.x, y: it.y, placed: it.placed }))))
const chip = sc1.chips[0]
const r1 = await placeBatch([{ from: [chip.x, chip.y], to: [990, 300], facing: 'right' }])
console.log('PLACE', JSON.stringify(r1))
await new Promise(r => setTimeout(r, 900))
writeFileSync('../_demo-place.png', screenshot())
const sc2 = await scanDeckChips()
const eq2 = await findDeckEquip()
const it = (eq2.items || []).find(i => !i.placed)
console.log('AFTER chips', sc2.chips.map(c => c.x + ',' + c.y).join(' | '), 'loose', it ? it.name : 'none')
if (it) {
  const tgt = sc2.chips[sc2.chips.length - 1]
  const r2 = await placeEquip({ from: [it.x, it.y], to: [tgt.x, tgt.y] })
  console.log('EQUIPMOVE', JSON.stringify(r2))
  await new Promise(r => setTimeout(r, 900))
  writeFileSync('../_demo-equip.png', screenshot())
}