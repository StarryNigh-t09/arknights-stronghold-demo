import { tapAt, scanDeckChips } from '../lib/run.js'
import { screenshot } from '../lib/adb.js'
import { writeFileSync } from 'node:fs'
await tapAt([430, 1000], 900, '空白处')
writeFileSync('../_now3.png', screenshot())
const c = await scanDeckChips()
console.log('chips:', JSON.stringify(c.chips))
