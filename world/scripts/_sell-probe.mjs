// 2026-11-12 S5：卖卡实测第一步 —— 进待确认态，把「+1 拖拽至此售出」那块裁出来，
// 确认 SELL_ZONE=[1840,860]（run.js 注释自认未验证）到底对不对。只做探路，不真卖。
import { scanDeckChips, POINTS, tapAt, sleep, SELL_ZONE } from '../lib/run.js'
import { senseRun } from '../lib/drive.js'
import { dragFromTo, screenState, saveShot, probeValidTiles, isPending, cancelPending } from '../lib/deploy-fast.js'

const out = (k, v) => console.log(k + ' ' + JSON.stringify(v))

{
  const { screenshot: sh0 } = await import('../lib/adb.js')
  const g0 = saveShot(await sh0(), 'sell-guard')
  const s0 = screenState(g0)
  if (isPending(s0)) { out('CLEAN', cancelPending(s0)); await sleep(700) }
}

const st = await senseRun(null)
out('STATE', { ok: st && st.ok, screen: st && st.screen, round: st && st.round, money: st && st.money, slotsLeft: st && st.slotsLeft, shopExpanded: st && st.shopExpanded, brightness: st && st.shopBrightness })
if (!st || st.screen !== 'rest') { out('ABORT', '不在休整期'); process.exit(0) }

// 商店折叠（甲板操作前必须折叠）
if (st.shopExpanded === true || (st.shopBrightness != null && Number(st.shopBrightness) < 300)) {
  await tapAt(POINTS.collapse, 1300, '收起商店')
  await sleep(600)
  const st2 = await senseRun(null)
  out('FOLD', { shopExpanded: st2 && st2.shopExpanded, brightness: st2 && st2.shopBrightness })
}

const deck = await scanDeckChips({ minPressY: 840 })
out('DECK', { ok: deck.ok, n: (deck.chips || []).length, chips: (deck.chips || []).map((c) => [c.x, c.y]), rail: deck.railOk === true })
if (!deck.chips || !deck.chips.length) { out('BENCH_EMPTY', true); process.exit(0) }

const left = deck.chips.slice().sort((a, b) => a.x - b.x)[0]
const { screenshot } = await import('../lib/adb.js')

// 合法格现在探不出来（_state.py --tiles 给 empty），直接按常见合法格试，进待确认就算成
const CANDS = [[1196, 353], [1290, 440], [1330, 540], [830, 340], [964, 350], [1086, 447]]
let png = null, tile = null, stp = null
for (const t of CANDS) {
  const { cancelPending: _c } = await import('../lib/deploy-fast.js')
  dragFromTo([left.x, left.y], t, { holdMs: 20, moveMs: 150 })
  await sleep(260)
  png = saveShot(await screenshot(), 'sell-pending')
  stp = screenState(png)
  if (isPending(stp)) { tile = t; break }
  // 没进待确认：牌回甲板，换下一个格
  out('TRY_FAIL', { tile: t, green: stp.green, red: stp.red })
  await sleep(200)
}
out('PENDING', { pending: isPending(stp || {}), tile, green: stp && stp.green, red: stp && stp.red, redCenter: stp && stp.redCenter })
out('SHOT', png)
if (!isPending(stp || {})) { out('NOTE', '没进待确认态'); process.exit(0) }
