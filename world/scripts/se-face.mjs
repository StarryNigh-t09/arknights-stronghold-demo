import { seFacing } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
await seFacing(705, 510, 'right', { holdMs: 300, dist: 120, steps: 12 })
await sleep(1500)
console.log('facing drag done')
