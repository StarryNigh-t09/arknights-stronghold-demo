import { enterRun, leaveSettle, peek } from '../lib/run.js'
import { autoRun } from '../lib/drive.js'

const t0 = Date.now()
const cur = peek().state
console.log('START state=' + cur)
if (cur !== 'wz_hall' && cur !== 'wz_hall_joint') {
  const l = await leaveSettle()
  console.log('LEAVE', JSON.stringify(l))
}
const e = await enterRun({ mode: 'independent' })
console.log('ENTER', JSON.stringify(e))
if (!e.ok) process.exit(2)
const r = await autoRun({
  maxRounds: 8,
  totalRounds: 12,
  deploy: true,
  boardCount: 0,
  wantList: 'auto',
  onRound: (x) => console.log('ROUND', JSON.stringify(x)),
})
console.log('RESULT stop=' + r.stop + ' rounds=' + r.rounds.length)
for (const l of r.log || []) console.log('  ' + l)
console.log('SECONDS', Math.round((Date.now() - t0) / 1000))
