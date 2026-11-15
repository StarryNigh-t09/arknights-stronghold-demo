import { autoRun } from '../lib/drive.js'
import { peek, tapAt, sleep, enterRun, enterOrResume, leaveSettle, pickTactic, tacticPreference, clearItemPanel, itemPanelVisible } from '../lib/run.js'
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs'

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const dir = '../trace-' + stamp
mkdirSync(dir, { recursive: true })
const say = (l) => {
  appendFileSync(dir + '/run.log', l + '\n')
  console.log(l)
}
say('TRACE_DIR ' + dir)
// 2026-11-11 18:41 实测：进程在 scanDeckChips(final) 之后无声消失，log 里没有 RESULT / 没有堆栈。
// 加全局钩子把异常和退出码都落盘，下次出事能看到到底死在哪。
process.on('uncaughtException', (e) => { try { say('UNCAUGHT ' + (e && e.stack || e)) } catch { /* 忽略 */ } })
process.on('unhandledRejection', (e) => { try { say('UNHANDLED ' + (e && e.stack || e)) } catch { /* 忽略 */ } })
process.on('exit', (c) => { try { appendFileSync(dir + '/run.log', 'EXIT code=' + c + '\n') } catch { /* 忽略 */ } })
// 2026-11-11 16:2x：上一局在 15:54 后彻底没动静，25 分钟零日志、零步骤图，事后查不出卡在哪。
// 现在每 20 秒打一次心跳（带本进程跑了几秒、最后一步是什么），卡死能看出卡在哪个动作。
const T0 = Date.now()
let lastAction = '(还没开始)'
const hb = setInterval(() => {
  try {
    appendFileSync(dir + '/heartbeat.log',
      new Date().toISOString() + ' alive ' + Math.round((Date.now() - T0) / 1000) + 's last=' + lastAction + '\n')
  } catch { /* 忽略 */ }
}, 20000)

// 1) 等着能接手的界面：休整期/准备页 = 直接接；大厅 = 开一局；结算 = 回大厅
let st = null
let needEnter = false
for (let k = 0; k < 90; k++) {
  st = peek()
  const s = st.state
  if (s === 'wz_rest' || s === 'wz_prep') break
  if (s === 'wz_hall' || s === 'wz_hall_joint') { needEnter = true; break }
  // 2026-11-11 16:09：上一次开局在难度页断了，这里原来不认 wz_diff，原地空转 90 轮。
  // 难度页/本局信息页就直接接着开局（enterRun 的 fromDiff）。
  if (s === 'wz_diff' || s === 'wz_runinfo' || s === 'wz_strategy' || s === 'wz_squadsel') {
    say('停在开局流程里（' + s + '）→ 接着开')
    const en = await enterRun({ mode: 'independent', fromDiff: true })
    say('ENTER ' + JSON.stringify({ ok: en.ok, state: en.state, blocked: en.blocked }))
    for (const l of en.log || []) say('  ' + l)
    if (!en.ok) { say('DONE'); process.exit(0) }
    st = { state: 'wz_rest' }
    break
  }
  if (s === 'wz_settle') {
    say('结算页 → 回大厅')
    await leaveSettle()
    needEnter = true
    await sleep(3000)
    continue
  }
  if (s === 'title') {
    say('标题页 → 点 START')
    await tapAt([955, 1028], 3000, 'START')
    continue
  }
  // 2026-11-11 15:56 实拍：游戏停在「道具补给」三选一面板上（顶栏「无需消耗资金，获得装备补给」），
  // peek() 把它认成 wz_tactic，但这个等待循环原来只认休整期/准备页/大厅/结算/标题 → 原地空转 90 轮、零步骤图。
  if (s === 'wz_tactic') {
    const tk = await pickTactic({ preferList: tacticPreference().order })
    say('三选一面板 → 选第 ' + tk.picked + ' 张 ok=' + tk.ok)
    if (await clearItemPanel()) say('道具补给：补按一次确认')
    continue
  }
  if (await itemPanelVisible()) {
    say('认不出界面，但道具补给面板在 → 按确认')
    await clearItemPanel()
    continue
  }
  await sleep(5000)
}
say('当前 state=' + (st && st.state) + ' dist=' + (st && st.dist))

if (needEnter) {
  // 2026-11-12 04:3x 实测：大厅右下那颗「独立模拟 / 断线重连」点下去会先弹**上一局被中断的结算页**
  // （已终止），enterOrResume 只试一次就放弃 → grind 每 90 秒空转一次。这里失败就回大厅再来，最多 3 次。
  let en = null
  for (let k = 0; k < 3; k++) {
    en = await enterOrResume({ mode: 'independent' })
    say('ENTER' + (k ? '#' + (k + 1) : '') + ' ' + JSON.stringify({ ok: en.ok, resumed: en.resumed, state: en.state, blocked: en.blocked }))
    for (const l of en.log || []) say('  ' + l)
    if (en.ok) break
    if (en.state === 'wz_settle') {
      say('  落到结算页 → 返回主页，再开一次')
      await leaveSettle()
      await sleep(2500)
      continue
    }
    break
  }
  if (!en || !en.ok) { say('DONE'); process.exit(0) }
} else if (!st || (st.state !== 'wz_rest' && st.state !== 'wz_prep')) {
  say('接手失败：state=' + (st && st.state)); say('DONE'); process.exit(0)
}

const t0 = Date.now()
let last = t0
const r = await Promise.race([
  autoRun({
  maxRounds: 14,
  totalRounds: 12,
  deploy: true,
  boardCount: 0,
  wantList: 'auto',
  trace: dir,
  onRound: (x) => {
    const now = Date.now()
    say('ROUND ' + JSON.stringify(x) + ' 本轮耗时 ' + Math.round((now - last) / 1000) + 's')
    lastAction = 'ROUND ' + x.round
    last = now
  },
  }),
  new Promise((res) => setTimeout(() => res({ stop: 'TIMEOUT 40min', rounds: [], log: ['Watchdog: 40 分钟没跑完，主动退出'] }), 40 * 60 * 1000)),
])
clearInterval(hb)
say('RESULT stop=' + r.stop + ' rounds=' + r.rounds.length + ' 总耗时 ' + Math.round((Date.now() - t0) / 1000) + 's')
for (const l of r.log || []) say('  ' + l)
writeFileSync(dir + '/rounds.json', JSON.stringify(r.rounds || [], null, 2))
say('DONE')
// 2026-11-12 02:2x 实测：打完（DONE）之后进程还赖着不退（CPU 41s、40 分钟没动），
// _grind 用 spawnSync 等它 → 整晚卡在「第 1 轮」。这里显式退出。
process.exit(0)
