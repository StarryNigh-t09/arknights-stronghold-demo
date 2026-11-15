import { writeFileSync } from 'node:fs'
import { placeEquip, scanDeckChips } from '../lib/run.js'
import { screenshot } from '../lib/adb.js'
const sc1 = await scanDeckChips()
const tgt = sc1.chips[sc1.chips.length - 1]
console.log('target chip', tgt.x + ',' + tgt.y)
const r = await placeEquip({ from: [1107, 776], to: [tgt.x, tgt.y] })
console.log('EQUIP', JSON.stringify(r))
await new Promise(r => setTimeout(r, 1000))
writeFileSync('../_demo-equip.png', screenshot())
console.log('done')