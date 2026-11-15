import { tap } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
await tap(1178, 910); await sleep(1000)   // 选中 烈夏
await tap(1178, 910); await sleep(1500)   // 确认购买
await tap(758, 910);  await sleep(1000)   // 选中 源石溶剂
await tap(758, 910);  await sleep(1500)   // 确认购买
console.log('bought')
