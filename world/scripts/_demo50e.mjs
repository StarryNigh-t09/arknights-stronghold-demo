import { writeFileSync } from 'node:fs'
import { scanDeckChips } from '../lib/run.js'
import { sellBatch } from '../lib/act.js'
import { screenshot } from '../lib/adb.js'
const c = await scanDeckChips()
console.log('chips', c.chips.map(x => x.x + ',' + x.y).join(' | '))
const r = await sellBatch([[c.chips[0].x, c.chips[0].y]])
console.log('SELL', JSON.stringify(r))
await new Promise(r => setTimeout(r, 1200))
writeFileSync('../_after-sell.png', screenshot())