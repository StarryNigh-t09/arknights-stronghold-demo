import { writeFileSync } from 'node:fs'
import { placeEquip } from '../lib/run.js'
import { screenshot } from '../lib/adb.js'
const r = await placeEquip({ from: [1107, 776], to: [990, 300], holdStartMs: 600 })
console.log('EQUIP600', JSON.stringify(r))
await new Promise(r => setTimeout(r, 1000))
writeFileSync('../_demo-equip3.png', screenshot())