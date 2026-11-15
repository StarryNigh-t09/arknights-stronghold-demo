import { screenshot, dragDrop, dragHold, tap } from '../lib/adb.js'
import { writeFileSync } from 'node:fs'
import { sleep, peek } from '../lib/run.js'
const shot = (n) => { writeFileSync('shots/' + n + '.png', screenshot()); console.log('shot', n) }
console.log('STATE', peek().state)
// A) input draganddrop
dragDrop(1218, 585, 505, 430, 1500)
await sleep(1500); shot('dr1_dragdrop')
// B) motionevent DOWN→hold→MOVE→UP
dragHold(1218, 585, 505, 430, { holdMs: 900, steps: 18, stepMs: 45 })
await sleep(1500); shot('dr2_draghold')
// C) 原地长按 900ms 再松手（看有没有「拿起」状态）
dragHold(1218, 585, 1218, 585, { holdMs: 1200, steps: 2, stepMs: 100 })
await sleep(1200); shot('dr3_longpress')
