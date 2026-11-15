import { scanDeckChips, placeDeckUnit } from '../lib/run.js'
import { senseRun } from '../lib/drive.js'
const before = await senseRun()
const scan = await scanDeckChips()
const c = (scan.chips || [])[0]
console.log('前：state=' + before.state + ' 剩余可放置=' + before.slotsLeft + ' 甲板=' + (scan.chips||[]).length + ' 牌=' + JSON.stringify(c && [c.x,c.y]))
if (c) {
  const r = await placeDeckUnit({ x: c.x, y: c.y, to: [990, 410], facing: 'right' })
  console.log('拖：' + JSON.stringify(r.ok) + ' ' + (r.log||[]).join(' / '))
}
await new Promise((res) => setTimeout(res, 3000))
const after = await senseRun()
console.log('后：state=' + after.state + ' 剩余可放置=' + after.slotsLeft)
