import { writeFileSync } from 'node:fs'
import { placeEquip } from '../lib/run.js'
import { screenshot } from '../lib/adb.js'
const r = await placeEquip({ from: [1107, 776], to: [958, 300] })
console.log('EQUIP', JSON.stringify(r))
await new Promise(r => setTimeout(r, 1000))
writeFileSync('../_demo-equip2.png', screenshot())