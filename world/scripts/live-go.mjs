import { autoRun } from '../lib/drive.js'
const t0 = Date.now()
const r = await autoRun({ maxRounds: 2, maxBattleSeconds: 170, centerLevel: 2 })
r.elapsedMs = Date.now() - t0
console.log(JSON.stringify(r, null, 1))
