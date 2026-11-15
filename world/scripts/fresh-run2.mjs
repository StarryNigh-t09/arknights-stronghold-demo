import { enterRun, leaveSettle, peek } from '../lib/run.js'
import { autoRun } from '../lib/drive.js'
import { appendFileSync } from 'node:fs'

const LOG = './world/logs/fresh2.log'
const say = (l) => appendFileSync(LOG, l + '\n')
say('=== start ' + new Date().toISOString())
const t0 = Date.now()
const cur = peek().state
say('state=' + cur)
if (cur !== 'wz_hall' && cur !== 'wz_hall_joint') {
  const l = await leaveSettle()
  say('LEAVE ' + JSON.stringify(l))
}
const e = await enterRun({ mode: 'independent' })
say('ENTER ' + JSON.stringify(e))
if (!e.ok) process.exit(2)
const r = await autoRun({
  maxRounds: 4,
  totalRounds: 12,
  deploy: true,
  boardCount: 0,
  wantList: 'auto',
  onRound: (x) => say('ROUND ' + JSON.stringify(x)),
})
say('RESULT stop=' + r.stop + ' rounds=' + r.rounds.length)
for (const l of r.log || r.steps || []) say('  ' + l)
say('SECONDS ' + Math.round((Date.now() - t0) / 1000))
