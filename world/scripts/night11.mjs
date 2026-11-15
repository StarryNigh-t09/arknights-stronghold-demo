import { autoRun } from '../lib/drive.js'
import { leaveSettle } from '../lib/run.js'

const maxRounds = Number(process.argv[2] || 4)
const hb = setInterval(() => console.log('[hb] ' + new Date().toISOString().slice(11, 19)), 25000)
try {
  const r = await autoRun({ maxRounds, maxBattleSeconds: 150, deploy: false })
  console.log('AUTORUN ' + JSON.stringify({ stop: r.stop, rounds: r.rounds, log: r.log }, null, 1))
  if (r.stop === '结算了') {
    const lv = await leaveSettle()
    console.log('LEAVE ' + JSON.stringify(lv))
  }
} catch (e) {
  console.log('ERR ' + (e && e.message))
} finally {
  clearInterval(hb)
}
