import { scanDeckChips } from '../lib/run.js'
const r = await scanDeckChips()
console.log('rows:', JSON.stringify(r.rows))
console.log('chips:', JSON.stringify(r.chips.map(c => ({ x: c.chip.x, y: c.chip.y, rank: c.rank }))))
