import { screenshot, dragHold, tap } from '../lib/adb.js'
import { writeFileSync } from 'node:fs'
import { sleep, peek } from '../lib/run.js'
const shot = (n) => { writeFileSync('shots/' + n + '.png', screenshot()); console.log('shot', n) }
tap(500, 655)   // 取消
await sleep(1500); shot('dr4_cancel')
console.log('STATE', peek().state)
// 沿甲板水平拖：把亚叶从 1218 拖到 1000
dragHold(1218, 585, 1000, 585, { holdMs: 700, steps: 12, stepMs: 50 })
await sleep(1200); shot('dr5_deckmove')
