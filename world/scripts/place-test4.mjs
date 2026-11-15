import { sh } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
// 先悬停到干员身上，再按下、停顿、移动、松开
const p = []
p.push('input mouse motionevent MOVE 1372 645', 'sleep 0.2')
p.push('input mouse motionevent MOVE 1372 648', 'sleep 0.2')
p.push('input mouse motionevent DOWN 1372 648', 'sleep 0.45')
for (let i = 1; i <= 30; i++) {
  const k = i / 30
  const x = Math.round(1372 + (700 - 1372) * k)
  const y = Math.round(648 + (400 - 648) * k)
  p.push('input mouse motionevent MOVE ' + x + ' ' + y, 'sleep 0.035')
}
p.push('input mouse motionevent UP 700 400')
console.log(await sh(p.join('; '), { timeoutMs: 30000 }))
console.log('hover+press drag done')
await sleep(1500)
