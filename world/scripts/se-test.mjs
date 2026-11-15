import { seDrag, seFacing } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
console.log(await seDrag(705, 502, 980, 430, { steps: 40, holdMs: 150 }))
await sleep(1500)
console.log('moved unit')
