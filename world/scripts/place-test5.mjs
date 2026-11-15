import { mouseDrag } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
await mouseDrag(1215, 765, 830, 615, { holdMs: 200, steps: 26, stepMs: 30 })
console.log('drag equipment -> 烈夏 done')
await sleep(1500)
