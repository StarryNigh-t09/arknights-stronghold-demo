import { readSettle } from '../lib/run.js'
const s = await readSettle()
console.log('OK=' + s.ok + ' ERR=' + (s.error || '') + ' PR=' + s.passedRounds + ' CERT=' + s.cert + ' DUR=' + s.duration)
