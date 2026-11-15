import { sh } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
const p = ['input mouse motionevent DOWN 800 700','sleep 0.05']
for (let i=1;i<=10;i++) p.push('input motionevent MOVE ' + (800+i*20) + ' ' + (700-i*15), 'sleep 0.04')
p.push('input motionevent UP 1000 550')
console.log(await sh(p.join('; '), {timeoutMs:30000}))
