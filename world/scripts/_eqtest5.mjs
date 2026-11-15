import { scanDeckChips, findDeckEquip } from '../lib/run.js'
const c = await scanDeckChips()
console.log('chips:', JSON.stringify(c.chips.map(x => ({ x: x.x, y: x.y, bx: x.chip.x, by: x.chip.y }))))
const e = await findDeckEquip()
console.log('eq:', JSON.stringify((e.items || []).map(i => ({ n: i.name, x: i.x, y: i.y, w: i.w, placed: i.placed, chipx: i.chip && i.chip.x }))))
