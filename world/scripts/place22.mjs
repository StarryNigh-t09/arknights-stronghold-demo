import { seSwipe } from '../lib/adb.js'
import { sleep } from '../lib/run.js'

// 锤子 (1092,750) → 亚叶 (712,398)
await seSwipe(1092, 750, 712, 398, { points: 20, durationMs: 500 })
await sleep(900)
// 兔子玩偶 (960,750) → 褐果 (832,322)
await seSwipe(960, 750, 832, 322, { points: 20, durationMs: 500 })
await sleep(900)
console.log('done')
