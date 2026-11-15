// 2026-11-12 S5 第二式：不在待确认态时，直接把甲板卡拖到右下角，看能不能换钱。
import { scanDeckChips, sleep } from '../lib/run.js'
import { senseRun } from '../lib/drive.js'
import { dragFromTo, screenState, saveShot, isPending, cancelPending } from '../lib/deploy-fast.js'
import { screenshot } from '../lib/adb.js'

const out = (k, v) => console.log(k + ' ' + JSON.stringify(v))
const SELL = [1770, 920]

const g0 = saveShot(await screenshot(), 'sell2-guard')
const s0 = screenState(g0)
if (isPending(s0)) { out('CLEAN', cancelPending(s0)); await sleep(800) }

const before = await senseRun(null)
const deck0 = await scanDeckChips({ minPressY: 840 })
out('BEFORE', { money: before && before.money, bench: (deck0.chips || []).length, chips: (deck0.chips || []).map((c) => [c.x, c.y]) })
const left = (deck0.chips || []).slice().sort((a, b) => a.x - b.x)[0]
if (!left) { out('ABORT', '甲板空'); process.exit(0) }

const t0 = Date.now()
dragFromTo([left.x, left.y], SELL, { holdMs: 20, moveMs: 500, steps: 14 })
await sleep(900)
const png1 = saveShot(await screenshot(), 'sell2-after')
const s1 = screenState(png1)
const after = await senseRun(null)
const deck1 = await scanDeckChips({ minPressY: 840 })
out('AFTER', { money: after && after.money, bench: (deck1.chips || []).length, pending: isPending(s1), green: s1.green, ms: Date.now() - t0 })
out('SHOT', png1)
if (isPending(s1)) { out('CLEANUP', cancelPending(s1)); await sleep(600) }
