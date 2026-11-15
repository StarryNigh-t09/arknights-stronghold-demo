import { readSettle } from '../lib/run.js'
const s = await readSettle({ roundFallback: 12 })
console.log(JSON.stringify(s))
