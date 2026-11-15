import { sh } from '../lib/adb.js'
// 朝向：长按已放置的干员 → 拖向右（画面右侧）→ 松手
const parts = ['input mouse motionevent DOWN 840 360', 'sleep 0.9']
for (let i = 1; i <= 10; i++) {
  const x = Math.round(840 + 130 * (i / 10))
  parts.push('input mouse motionevent MOVE ' + x + ' 360')
  parts.push('sleep 0.05')
}
parts.push('input mouse motionevent UP 970 360')
console.log(await sh(parts.join('; '), { timeoutMs: 30000 }))
