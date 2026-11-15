import { senseRun } from '../lib/drive.js'
const st = await senseRun(1)
console.log(JSON.stringify(st, null, 1).slice(0, 1500))
