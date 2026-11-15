import { scanFreeTiles, scanDeckChips, peek, sleep, POINTS, tapAt, shopAction } from '../lib/run.js'
import { senseRun } from '../lib/drive.js'
import { deployTilesRanked } from '../lib/gamemap.js'
import { writeFileSync, readFileSync } from 'node:fs'

let st = await senseRun(1, { expect: 'rest' })
console.log('BEFORE money', st.money, 'open', st.shopExpanded, 'slots', st.slotsLeft)
if (st.shopExpanded !== true) { await tapAt(POINTS.shopExpand, 1500, '展开商店'); st = await senseRun(1, { expect: 'rest' }) }
const r = await shopAction({ buy: [0] })
console.log('BUY', JSON.stringify(r))
st = await senseRun(1, { expect: 'rest' })
console.log('AFTER-BUY money', st.money, 'open', st.shopExpanded)
if (st.shopExpanded === true) { await tapAt(POINTS.collapse, 1500, '折叠商店'); await sleep(400) }

const ranked = deployTilesRanked()
const t = Date.now()
const ft = await scanFreeTiles({ cells: ranked })
console.log('FREE', Date.now() - t, 'ms mode=' + ft.mode, 'ok=' + ft.ok)
console.log('CELLS', JSON.stringify((ft.cells || []).filter((c) => c.green > 0.2)))
if (ft.shot) { try { writeFileSync('../_grab2.png', readFileSync(ft.shot)) } catch (e) { console.log('copy fail', e.message) } }
console.log('SCREEN', (await peek()).state)
