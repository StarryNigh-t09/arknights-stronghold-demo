import { writeFileSync } from 'node:fs'
import { scanDeckChips, tapAt } from '../lib/run.js'
import { placeBatch } from '../lib/act.js'
import { screenshot } from '../lib/adb.js'
const t0 = Date.now()
let sc1 = await scanDeckChips()
if (sc1.chips.length < 4) { await tapAt([1425, 950], 900, '折叠商店'); sc1 = await scanDeckChips() }
const chips = sc1.chips
console.log('deck', chips.length, chips.map(c => c.x + ',' + c.y).join(' | '))
if (!chips.length) process.exit(0)
const from = [chips[0].x, chips[0].y]
const r = await placeBatch([{ from, to: [1100, 410], facing: 'right' }])
console.log('place', JSON.stringify(r))
await new Promise(r => setTimeout(r, 1200))
writeFileSync('../_t50.png', screenshot())
console.log('total ms', Date.now() - t0)