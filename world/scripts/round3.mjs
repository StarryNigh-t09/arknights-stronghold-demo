import { playRound } from '../lib/run.js'
const r = await playRound({ readyWaitMs: 5000, battleMaxMs: 150000 })
console.log(JSON.stringify(r, null, 1))
