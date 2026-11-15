import { identifyDeck } from '../lib/run.js'
const r = await identifyDeck()
console.log(JSON.stringify(r, null, 1))
