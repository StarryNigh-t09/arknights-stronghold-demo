import { screenshot, swipe, tap } from '../lib/adb.js'
import { writeFileSync } from 'node:fs'
import { sleep, peek } from '../lib/run.js'
const shot = (n) => { writeFileSync('shots/' + n + '.png', screenshot()); console.log('shot', n) }
console.log('STATE', peek().state)
// A) 快速拖拽（600ms）
swipe(1135, 635, 500, 430, 600)
await sleep(1200); shot('pl8_drag600')
// B) 慢拖（2000ms）
swipe(1135, 635, 700, 300, 2000)
await sleep(1200); shot('pl9_drag2000')
// C) 点选中再点格子
tap(1135, 635); await sleep(900); shot('pl10_tapunit')
tap(520, 300); await sleep(1200); shot('pl11_tapAfterUnit')
