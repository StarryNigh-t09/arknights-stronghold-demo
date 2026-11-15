// 2026-11-12 S5 收口：走**生产路径** sellDeckUnit 卖一张刚买的卡，验证钱+1、甲板-1。
import { scanDeckChips, shopAction, tapAt, sleep, POINTS, sellDeckUnit, SELL_ZONE } from '../lib/run.js'
import { senseRun } from '../lib/drive.js'
import { screenshot } from '../lib/adb.js'
import { screenState, saveShot, isPending, cancelPending } from '../lib/deploy-fast.js'

const out = (k, v) => console.log(k + ' ' + JSON.stringify(v))

const g0 = saveShot(await screenshot(), 'sell3-guard')
const s0 = screenState(g0)
if (isPending(s0)) { out('CLEAN', cancelPending(s0)); await sleep(800) }

let st = await senseRun(null)
if (!st || st.screen !== 'rest') { out('ABORT', '不在休整期：' + (st && st.screen)); process.exit(0) }
const money0 = st.money
const bench0 = ((await scanDeckChips({ minPressY: 840 })).chips || []).length
out('START', { round: st.round, money: money0, bench: bench0, shopExpanded: st.shopExpanded })

// 展开商店（若已折叠）
if (st.shopExpanded !== true) {
  await tapAt(POINTS.shopExpand, 1300, '展开商店')
  await sleep(500)
  st = await senseRun(null)
}
const cards = (st.shop || []).filter((c) => c && c.price != null).map((c) => ({ n: c.name, p: Number(c.price), x: c.x, y: c.y }))
out('SHOP', cards)
const pick = cards.slice().sort((a, b) => a.p - b.p)[0]
if (!pick || pick.p > 2) { out('ABORT', '没有 ≤2 块的卡可买'); process.exit(0) }
await shopAction({ buyPoints: [[pick.x, pick.y]] })
await sleep(900)
// 折叠商店（甲板操作前必须折叠）
await tapAt(POINTS.collapse, 1300, '收起商店')
await sleep(700)
let st2 = await senseRun(null)
const deck1 = await scanDeckChips({ minPressY: 840 })
out('AFTER_BUY', { money: st2 && st2.money, bench: (deck1.chips || []).length, shopExpanded: st2 && st2.shopExpanded })
const chip = (deck1.chips || []).slice().sort((a, b) => a.x - b.x)[0]
if (!chip) { out('ABORT', '买完甲板还是空的'); process.exit(0) }

const t0 = Date.now()
const r = await sellDeckUnit([chip.x, chip.y])
await sleep(900)
const st3 = await senseRun(null)
const deck2 = await scanDeckChips({ minPressY: 840 })
out('AFTER_SELL', { ok: r.ok, zone: SELL_ZONE, money: st3 && st3.money, bench: (deck2.chips || []).length, ms: Date.now() - t0 })
const png = saveShot(await screenshot(), 'sell3-after')
const s3 = screenState(png)
out('SHOT', { png, pending: isPending(s3), green: s3.green, red: s3.red })
if (isPending(s3)) { out('CLEANUP', cancelPending(s3)); await sleep(600) }
out('VERDICT', {
  moneyPlus1: Number(st3 && st3.money) === Number(money0) - pick.p + 1,
  benchDown: (deck2.chips || []).length === (deck1.chips || []).length - 1,
})
