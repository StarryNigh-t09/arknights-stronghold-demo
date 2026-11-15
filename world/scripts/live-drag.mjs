import { screenshot, dragDrop, dragHold, tap } from '../lib/adb.js'
import { writeFileSync } from 'node:fs'
import { enterRun, sleep, peek } from '../lib/run.js'
import { senseRun } from '../lib/drive.js'
const shot = (n) => { writeFileSync('shots/' + n + '.png', screenshot()); console.log('shot', n) }

const e = await enterRun({ mode: 'independent' })
console.log('ENTER', e.ok)
if (!e.ok) process.exit(2)
const st = await senseRun(1)
const units = (st.shop || []).filter(c => c && !c.empty && c.price != null)
console.log('SHOP', JSON.stringify(units))
// 买两张最便宜的
for (const c of units.slice(0, 2)) {
  await tap(c.x, 910); await sleep(900)
  await tap(c.x, 910); await sleep(1200)
}
shot('dr0_units')
