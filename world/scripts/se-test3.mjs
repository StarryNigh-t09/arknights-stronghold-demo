import { tap, seDrag } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
await tap(800, 195)      // 取消（退出拾取态）
await sleep(900)
await seDrag(705, 502, 980, 430, { steps: 30, holdMs: 250, stepMs: 15 })
await sleep(1600)
console.log('slow drag done')
