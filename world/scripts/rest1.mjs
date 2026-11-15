import { autoRest } from '../lib/drive.js'

const r = await autoRest({ centerLevel: 2, maxSteps: 6, totalRounds: 9 })
console.log(JSON.stringify(r, null, 1))
if (r.last) console.log('last:', r.last.round, 'money', r.last.money, 'hp', r.last.hp)
