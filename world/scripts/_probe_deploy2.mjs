import { peek, scanDeckChips, diffCells, sleep, tapAt } from '../lib/run.js'
import { screenshot } from '../lib/adb.js'
import { placeBatch } from '../lib/act.js'
import { deployTiles } from '../lib/gamemap.js'
import { writeFileSync } from 'node:fs'

// 先把商店折叠
await tapAt([1763, 953], 2000, '折叠商店')
await sleep(1500)
const st = peek()
console.log('STATE', JSON.stringify({ state: st.state, dist: st.dist, slotsLeft: st.slotsLeft }))
writeFileSync('../_probe_fold.png', screenshot())
const sc = await scanDeckChips()
console.log('CHIPS', JSON.stringify(sc.chips.map((c) => [c.x, c.y])))
console.log('ROWS', JSON.stringify((sc.rows || []).map((r) => r.map((c) => [c.x, c.y]))))
const tiles = deployTiles()
if (!sc.chips.length) { console.log('no chips'); process.exit(0) }
const cell = tiles[0]
const before = screenshot()
const from = [sc.chips[0].x, sc.chips[0].y]
console.log('DRAG', JSON.stringify(from), '->', JSON.stringify(cell))
const r = await placeBatch([{ from, to: cell, facing: 'right' }])
console.log('PLACEBATCH', JSON.stringify(r))
await sleep(600)
const after = screenshot()
writeFileSync('../_probe_after2.png', after)
console.log('DIFF', JSON.stringify(await diffCells(before, after, [cell])))
