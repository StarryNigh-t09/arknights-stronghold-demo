import { tap } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
await tap(1760, 1002); await sleep(900)          // 展开商店
await tap(1029, 900); await sleep(700); await tap(1029, 900)  // 买折柽
await sleep(900)
await tap(1755, 948); await sleep(1100)          // 收起
console.log('bought 折柽, collapsed')
