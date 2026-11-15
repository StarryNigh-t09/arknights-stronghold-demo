import { autoRun } from '../lib/drive.js'

const r = await autoRun({
  maxRounds: Number(process.argv[2] || 3),
  maxBattleSeconds: Number(process.argv[3] || 150),
})
console.log(JSON.stringify(r, null, 1))
