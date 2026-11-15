import { autoRest, senseRun } from '../lib/drive.js'
const r = await autoRest({ board: [], boardCount: 0, wantAuto: true, freeScan: true, smart: false, maxSteps: 4, centerLevel: 1 })
console.log('RESULT', JSON.stringify(r).slice(0, 900))
process.exit(0)