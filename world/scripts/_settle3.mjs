import { readSettle, appendRunRecord } from '../lib/run.js'
const s = await readSettle({ roundFallback: 11 })
console.log(JSON.stringify(s).slice(0, 400))
if (s.ok) {
  appendRunRecord({
    at: new Date().toISOString(),
    maxRounds: 12,
    rounds: 12,
    settle: s,
    stop: 'died',
    source: 'run3-playfromrest-1150',
  })
  console.log('recorded')
}
