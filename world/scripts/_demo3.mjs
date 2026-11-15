import { scanDeckChips, placeDeckUnit, scanFreeTiles } from '../lib/run.js'
import { senseRun } from '../lib/drive.js'
const free = await scanFreeTiles({})
const tiles = (free.tiles || []).map(t => [t.x, t.y])
console.log('扫到可站格 ' + tiles.length + ' 个：' + JSON.stringify(tiles.slice(0, 6)))
if (tiles.length) {
  const scan = await scanDeckChips()
  const c = (scan.chips || [])[0]
  const before = await senseRun()
  console.log('前 剩余可放置=' + before.slotsLeft + ' 甲板=' + (scan.chips||[]).length)
  if (c) {
    const r = await placeDeckUnit({ x: c.x, y: c.y, to: tiles[0], facing: 'right' })
    console.log('拖：' + JSON.stringify(r.ok) + ' ' + (r.log||[]).join(' / '))
  }
  await new Promise((res) => setTimeout(res, 3000))
  const after = await senseRun()
  console.log('后 剩余可放置=' + after.slotsLeft)
}
