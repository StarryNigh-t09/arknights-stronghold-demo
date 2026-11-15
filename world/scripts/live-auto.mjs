import { leaveSettle } from '../lib/run.js'
import { autoRun } from '../lib/drive.js'
const r = await autoRun({
  maxRounds: 12, totalRounds: 9,
  activeCovenants: ['乌萨斯', '炎', '维多利亚', '伊比利亚'],
  onRound: x => console.log('ROUND', JSON.stringify(x)),
})
console.log('RESULT', JSON.stringify({ log: r.log, stop: r.stop }, null, 1))
if (r.stop === '结算了') console.log('LEAVE', JSON.stringify(await leaveSettle()))
