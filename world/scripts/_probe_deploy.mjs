import { peek, scanDeckChips, diffCells, sleep } from '../lib/run.js'
import { screenshot } from '../lib/adb.js'
import { placeBatch } from '../lib/act.js'
import { deployTiles } from '../lib/gamemap.js'
import { writeFileSync } from 'node:fs'

const st = peek()
console.log('STATE', JSON.stringify({ state: st.state, dist: st.dist, round: st.round, money: st.money, slotsLeft: st.slotsLeft }))
writeFileSync('../_probe0.png', screenshot())
const sc = await scanDeckChips()
console.log('CHIPS', JSON.stringify(sc.chips.map((c) => [c.x, c.y])))
const tiles = deployTiles()
console.log('TILES', JSON.stringify(tiles))
if (!sc.chips.length) { console.log('no chips'); process.exit(0) }
const cell = tiles[0]
const before = screenshot()
writeFileSync('../_probe_before.png', before)
const from = [sc.chips[0].x, sc.chips[0].y]
console.log('DRAG', JSON.stringify(from), '->', JSON.stringify(cell))
const r = await placeBatch([{ from, to: cell, facing: 'right' }])
console.log('PLACEBATCH', JSON.stringify(r))
await sleep(500)
const after = screenshot()
writeFileSync('../_probe_after.png', after)
const dv = await diffCells(before, after, [cell])
console.log('DIFF', JSON.stringify(dv))
