import { scanDeckChips, sellDeckUnit, placeDeckUnit, boardUnitDrag } from '../lib/run.js'
import { screenshot } from '../lib/adb.js'
import { writeFileSync } from 'node:fs'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const snap = (tag) => { try { writeFileSync('../_demo-' + tag + '.png', screenshot()) } catch (e) { console.log('shot fail', tag, e.message) } }

const scan = await scanDeckChips()
const chips = scan.chips || []
console.log('甲板牌：', JSON.stringify(chips.map(c => [c.x, c.y])))
if (!chips.length) process.exit(0)

// 1) 卖最左那张
const first = chips[0]
const sold = await sellDeckUnit([first.x, first.y])
console.log('1 卖卡', JSON.stringify([first.x, first.y]), '→', JSON.stringify(sold))
await sleep(2500)
snap('1-sold')

// 2) 把（卖掉后重新扫的）最左牌拖到场上一格 = 上人
const scan2 = await scanDeckChips()
const c2 = (scan2.chips || [])[0]
if (c2) {
  const placed = await placeDeckUnit({ x: c2.x, y: c2.y, to: [880, 410], facing: 'right' })
  console.log('2 上场', JSON.stringify([c2.x, c2.y]), '→ 880,410 =', JSON.stringify(placed))
  await sleep(2500)
  snap('2-placed')
  // 3) 把刚上的那个从场上拖回甲板最右空格 = 下人
  const back = await boardUnitDrag([880, 410], [1560, 780])
  console.log('3 下场', JSON.stringify(back))
  await sleep(2500)
  snap('3-back')
}
