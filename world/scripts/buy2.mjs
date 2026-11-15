import { tap } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
await tap(765, 900); await sleep(700); await tap(765, 900)
await sleep(900)
await tap(1755, 948)   // 收起商店
await sleep(1200)
console.log('bought hammer, shop collapsed')
