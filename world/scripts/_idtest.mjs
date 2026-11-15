import { identifyDeck } from '../lib/run.js'
const r = await identifyDeck()
console.log(JSON.stringify(r.units || r).slice(0, 800))
