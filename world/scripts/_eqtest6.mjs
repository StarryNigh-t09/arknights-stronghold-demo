import { dragHold } from '../lib/run.js'
import { scanDeckChips, findDeckEquip } from '../lib/run.js'
const c = await scanDeckChips()
const chips = c.chips
const e = await findDeckEquip()
const it = (e.items || [])[0]
if (!it) { console.log('没有散落装备'); process.exit(0) }
const sx = Math.round(it.x + it.w / 2), sy = Math.round(it.y + it.h / 2)
const chip = chips.slice().sort((a, b) => Math.abs(a.x - 52 + 18 - sx) - Math.abs(b.x - 52 + 18 - sx))[0]
console.log('拖', it.name, sx, sy, '->', chip.x, chip.y)
await dragHold([sx, sy], [chip.x, chip.y], { holdStartMs: 450, holdMs: 800, steps: 12, stepMs: 45 })
await new Promise(r => setTimeout(r, 900))
const e2 = await findDeckEquip()
console.log('复查:', JSON.stringify((e2.items || []).map(i => ({ n: i.name, x: i.x, y: i.y, placed: i.placed }))))
