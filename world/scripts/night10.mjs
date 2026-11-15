import { autoRun } from '../lib/drive.js'

const maxRounds = Number(process.argv[2] || 4)
const hb = setInterval(() => console.log('[hb] ' + new Date().toISOString().slice(11, 19)), 20000)
try {
  const r = await autoRun({ maxRounds, maxBattleSeconds: 150, deploy: false })
  console.log(JSON.stringify(r, null, 2))
} catch (e) {
  console.log('ERR ' + (e && e.message))
} finally {
  clearInterval(hb)
}
