import { writeFileSync } from 'node:fs'
import { scanDeckChips } from '../lib/run.js'
import { sellBatch } from '../lib/act.js'
import { screenshot } from '../lib/adb.js'
const t0 = Date.now()
const sc1 = await scanDeckChips()
console.log('deck', sc1.chips.length, sc1.chips.map(c => c.x + ',' + c.y).join(' | '))
if (!sc1.chips.length) process.exit(0)
const r = await sellBatch([[sc1.chips[sc1.chips.length - 1].x, sc1.chips[sc1.chips.length - 1].y]])
console.log('sell', JSON.stringify(r))
await new Promise(r => setTimeout(r, 1200))
writeFileSync('../_sell50.png', screenshot())
console.log('total ms', Date.now() - t0)