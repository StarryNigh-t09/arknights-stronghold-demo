import { scanDeckChips } from '../lib/run.js'
const r = await scanDeckChips()
console.log('CHIPS ' + JSON.stringify(r))
