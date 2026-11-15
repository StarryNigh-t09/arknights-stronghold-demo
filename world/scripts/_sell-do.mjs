// 2026-11-12 S5：待确认态把幽灵拖进右下「+1 拖拽至此售出」→ 真的卖掉？
// 面板实测（.tmp/sellzone.png，2x 裁图换算）：x 1657..1880 / y 780..1065，中心约 (1770,920)。
// run.js 的 SELL_ZONE=[1840,860] 落在面板内但贴着右边缘，这里改用中心。
import { scanDeckChips, sleep } from '../lib/run.js'
import { senseRun } from '../lib/drive.js'
import { dragFromTo, screenState, saveShot, isPending, cancelPending } from '../lib/deploy-fast.js'
import { screenshot } from '../lib/adb.js'

const out = (k, v) => console.log(k + ' ' + JSON.stringify(v))
const SELL = [1770, 920]
const TILE = [1196, 353]

const before = await senseRun(null)
const deck0 = await scanDeckChips({ minPressY: 840 })
out('BEFORE', { money: before && before.money, slotsLeft: before && before.slotsLeft, bench: (deck0.chips || []).length })

const png0 = saveShot(await screenshot(), 'sell-before')
const s0 = screenState(png0)
out('PENDING0', { pending: isPending(s0), green: s0.green })
if (!isPending(s0)) { out('ABORT', '当前不在待确认态，先跑 _sell-probe.mjs'); process.exit(0) }

// 从幽灵身上起手，拖到售出区
const t0 = Date.now()
dragFromTo([TILE[0], TILE[1] - 40], SELL, { holdMs: 20, moveMs: 420, steps: 14 })
await sleep(900)
const png1 = saveShot(await screenshot(), 'sell-after')
const s1 = screenState(png1)
const after = await senseRun(null)
const deck1 = await scanDeckChips({ minPressY: 840 })
out('AFTER', {
  money: after && after.money, slotsLeft: after && after.slotsLeft, bench: (deck1.chips || []).length,
  pending: isPending(s1), green: s1.green, ms: Date.now() - t0,
})
out('SHOT', png1)
if (isPending(s1)) { out('CLEANUP', cancelPending(s1)); await sleep(600) }
