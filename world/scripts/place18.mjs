import { seSwipe } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
// 1) 甲板 → 格子（MAA: duration 至少 300ms，起手慢一点）
await seSwipe(1540, 862, 1200, 397, { points: 22, durationMs: 600 })
await sleep(250)
// 2) 格子 → 朝向（MAA: 距离 400*(1080/720)=600px，duration 150ms）
await seSwipe(1200, 397, 1800, 397, { points: 6, durationMs: 150 })
await sleep(500)
console.log('maa-style deploy done')
