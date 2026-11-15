import { enterRun, leaveSettle } from '../lib/run.js'
import { autoRun } from '../lib/drive.js'

const t0 = Date.now()
const e = await enterRun({ mode: 'independent' })
console.log('ENTER', JSON.stringify(e))
if (!e.ok) process.exit(2)
const r = await autoRun({
  maxRounds: 12, totalRounds: 9,
  activeCovenants: ['乌萨斯', '炎', '维多利亚', '伊比利亚'],
  onRound: x => console.log('ROUND', JSON.stringify(x)),
})
console.log('RESULT', JSON.stringify({ rounds: r.rounds, log: r.log, stop: r.stop }, null, 1))
if (r.stop === '结算了') {
  const l = await leaveSettle()
  console.log('LEAVE', JSON.stringify(l))
}
console.log('SECONDS', Math.round((Date.now() - t0) / 1000))
