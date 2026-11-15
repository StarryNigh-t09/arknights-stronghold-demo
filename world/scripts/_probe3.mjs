import { POINTS, tapAt, sleep, scanDeckChips, scanFreeTiles, peek, shopAction } from '../lib/run.js'
import { senseRun } from '../lib/drive.js'
import { key } from '../lib/adb.js'

const HOLDS = String(process.env.COOP_HOLDS || '90,120,150,200,300,600').split(',').map(Number)
const BUY_SLOT = Number(process.env.BUY_SLOT != null ? process.env.BUY_SLOT : 1)

let st = await senseRun(1, { expect: 'rest' })
console.log('BEFORE', JSON.stringify({ screen: st.screen, money: st.money, level: st.level, open: st.shopExpanded }))
if (st.shopExpanded !== true) { await tapAt(POINTS.shopExpand, 1500, '展开商店'); st = await senseRun(1, { expect: 'rest' }) }
console.log('OPEN', st.shopExpanded, 'money', st.money)
const r = await shopAction({ buy: [BUY_SLOT] })
console.log('BUY', JSON.stringify(r))
const st2 = await senseRun(1, { expect: 'rest' })
console.log('AFTER-BUY money', st2.money, 'open', st2.shopExpanded, 'cards', (st2.shop || []).filter((c) => !c.empty).length)
if (st2.shopExpanded === true) { await tapAt(POINTS.collapse, 1500, '折叠商店') }
await sleep(500)
const sc = await scanDeckChips()
console.log('CHIPS', JSON.stringify(sc.chips.map((c) => [c.x, c.y, c.chip && c.chip.n])))
if (!sc.chips.length) { console.log('甲板还是空的'); process.exit(2) }

const out = []
for (const hold of HOLDS) {
  const t = Date.now()
  const ft = await scanFreeTiles({ holdStartMs: hold })
  const ms = Date.now() - t
  const lifted = Boolean(ft.ok && ft.tiles && ft.tiles.length)
  const pk = await peek()
  const rec = { hold, lifted, ms, tiles: (ft.tiles || []).length, error: ft.error || null, screen: pk.state }
  out.push(rec)
  console.log('HOLD', JSON.stringify(rec))
  if (!lifted && pk.state !== 'wz_rest' && pk.state !== 'wz_prep') {
    console.log('界面变成', pk.state, '→ 按返回键')
    key(4)
    await sleep(1200)
    console.log('收拾后', (await peek()).state)
  }
  if (lifted) break
}
console.log('SUMMARY', JSON.stringify(out))
