import { scanDeckChips } from '../lib/run.js'
const r = await scanDeckChips()
console.log(JSON.stringify(r).slice(0, 500))