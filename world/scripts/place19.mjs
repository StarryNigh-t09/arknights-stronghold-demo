import { seSwipe } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
// 把甲板上的「源石溶剂」拖到刚上场的折柽身上（装备）—— 只做一次滑动，不给朝向
await seSwipe(1140, 945, 1200, 285, { points: 22, durationMs: 600 })
await sleep(600)
console.log('item drag done')
