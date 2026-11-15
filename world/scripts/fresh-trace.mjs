import { mkdirSync } from 'node:fs'
import { enterRun, leaveSettle, peek } from '../lib/run.js'
import { autoRun } from '../lib/drive.js'

// 2026-11-11 22:40：从结算页/主页新开独立模拟，带 trace（每步截图 + steps.jsonl）。
// 用法：node world/scripts/fresh-trace.mjs [maxRounds] [boardCount] [deploy|nodeploy]
const maxRounds = Number(process.argv[2] || 14)
const boardCount = Number(process.argv[3] || 0)
const deploy = (process.argv[4] || 'deploy') !== 'nodeploy'
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const trace = '../trace-' + stamp
const t0 = Date.now()
mkdirSync(trace, { recursive: true })
console.log('TRACE', trace)
const cur = peek().state
console.log('START state=' + cur)
if (cur !== 'wz_hall' && cur !== 'wz_hall_joint') {
  const l = await leaveSettle()
  console.log('LEAVE', JSON.stringify(l))
}
const e = await enterRun({ mode: 'independent' })
console.log('ENTER', JSON.stringify(e))
if (!e.ok) { console.log('RESULT stop=进不去'); process.exit(2) }
const r = await autoRun({
  maxRounds, totalRounds: 12, deploy, boardCount, wantList: 'auto', trace,
  onRound: (x) => console.log('ROUND', JSON.stringify(x)),
})
console.log('RESULT stop=' + r.stop + ' rounds=' + r.rounds.length)
for (const l of r.log || []) console.log('  ' + l)
console.log('SECONDS', Math.round((Date.now() - t0) / 1000))
