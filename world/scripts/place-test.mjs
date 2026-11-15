import { mouseDrag, mouseFacing } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
// A) 把 烈夏 从甲板拖上场
mouseDrag(1372, 645, 700, 430, { holdMs: 150, steps: 26, stepMs: 30 })
console.log('placed?')
await sleep(1200)
// 顺手改朝向朝下（敌人往下方来）
mouseFacing(700, 430, 'down', { holdMs: 900, dist: 120 })
console.log('facing down')
