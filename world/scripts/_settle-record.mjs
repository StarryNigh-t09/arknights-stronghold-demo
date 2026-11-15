import { readSettle, appendRunRecord, tapAt, sleep, peek, leaveSettle } from '../lib/run.js'
const s = await readSettle({ roundFallback: 13 })
console.log('settle', JSON.stringify({ passed: s.passedRounds, cert: s.cert, dur: s.duration }))
const ok = appendRunRecord({ at: new Date().toISOString(), maxRounds: 14, rounds: [], stop: '死在第14回合', settle: s, note: '旧局续打（R13-R14），验证整备区满格闸门' })
console.log('record', ok)
const left = await leaveSettle()
console.log('leave', JSON.stringify(left).slice(0, 200))
await sleep(1500)
console.log('state', (await peek()).state)
