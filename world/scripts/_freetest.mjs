import { scanFreeTiles } from '../lib/run.js'
const r = await scanFreeTiles()
console.log(JSON.stringify(r).slice(0, 800))
