import { tap } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
await tap(705, 510)      // 单击干员 → 拾取
await sleep(1200)
await tap(1230, 450)     // 单击绿色格子 → 放下
await sleep(1600)
console.log('pick then place by taps')
