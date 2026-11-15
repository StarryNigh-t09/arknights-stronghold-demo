import { sh } from '../lib/adb.js'
// 鼠标源：按住 → 拖 → 松手（用户说的第一段动作）
const parts = ['input mouse motionevent DOWN 1388 668']
parts.push('sleep 0.15')
for (let i = 1; i <= 20; i++) {
  const k = i / 20
  const x = Math.round(1388 + (563 - 1388) * k)
  const y = Math.round(668 + (480 - 668) * k)
  parts.push('input mouse motionevent MOVE ' + x + ' ' + y)
  parts.push('sleep 0.03')
}
parts.push('input mouse motionevent UP 563 480')
console.log(await sh(parts.join('; '), { timeoutMs: 30000 }))
