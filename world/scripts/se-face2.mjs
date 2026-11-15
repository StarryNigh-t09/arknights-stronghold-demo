import { seDrag } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
await seDrag(825, 360, 955, 360, { steps: 14, holdMs: 350, stepMs: 20 })
await sleep(1500)
console.log('second-gesture facing drag done')
