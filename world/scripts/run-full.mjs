import { autoRun } from '../lib/drive.js'
import { peek, tapAt, sleep, enterRun, leaveSettle } from '../lib/run.js'
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs'

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const dir = '../trace-' + stamp
mkdirSync(dir, { recursive: true })
const say = (l) => {
  appendFileSync(dir + '/run.log', l + '\n')
  console.log(l)
}
say('TRACE_DIR ' + dir)

// 1) 等到卫戍大厅；标题页才点 START；结算页先回大厅
let st = null
for (let k = 0; k < 60; k++) {
  st = peek()
  const s = st.state
  if (s === 'wz_hall' || s === 'wz_hall_joint') break
  if (s === 'wz_settle') {
    say('结算页 → 回大厅')
    await leaveSettle()
    await sleep(3000)
    continue
  }
  if (s === 'title') {
    say('标题页 → 点 START')
    await tapAt([955, 1028], 3000, 'START')
    continue
  }
  await sleep(4000)
}
say('当前 state=' + (st && st.state) + ' dist=' + (st && st.dist))
if (!st || (st.state !== 'wz_hall' && st.state !== 'wz_hall_joint')) {
  say('没等到大厅，停手')
  say('DONE')
  process.exit(0)
}

// 2) 开局
const en = await enterRun({ mode: 'independent' })
say('ENTER ' + JSON.stringify({ ok: en.ok, state: en.state, blocked: en.blocked }))
for (const l of en.log || []) say('  ' + l)
if (!en.ok) {
  say('DONE')
  process.exit(0)
}

// 3) 跑
const t0 = Date.now()
let last = t0
const r = await autoRun({
  maxRounds: 14,
  totalRounds: 12,
  deploy: true,
  boardCount: 0,
  wantList: 'auto',
  trace: dir,
  onRound: (x) => {
    const now = Date.now()
    say('ROUND ' + JSON.stringify(x) + ' 本轮耗时 ' + Math.round((now - last) / 1000) + 's')
    last = now
  },
})
say('RESULT stop=' + r.stop + ' rounds=' + r.rounds.length + ' 总耗时 ' + Math.round((Date.now() - t0) / 1000) + 's')
for (const l of r.log || []) say('  ' + l)
writeFileSync(dir + '/rounds.json', JSON.stringify(r.rounds || [], null, 2))
say('DONE')
