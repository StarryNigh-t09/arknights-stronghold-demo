import { leaveSettle } from '../lib/run.js'
const r = await leaveSettle()
console.log(JSON.stringify(r))
