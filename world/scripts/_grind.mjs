// 连续练习引擎：不断重跑 run-attach（它自己处理 结算→大厅→新局 / 接手当前局），
// 一局打完自动开下一局，用来给「落位成功率/耗时」攒样本。
// 用法：node scripts/_grind.mjs [小时数，默认 6]
import { spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'

const hours = Number(process.argv[2] || 6)
const log = '../.tmp/grind.log'
const say = (l) => {
  const line = new Date().toISOString() + ' ' + l
  try { appendFileSync(log, line + '\n') } catch { /* 忽略 */ }
  console.log(line)
}

const end = Date.now() + hours * 3600 * 1000
let i = 0
while (Date.now() < end) {
  i += 1
  say('=== 第 ' + i + ' 轮 run-attach 开始')
  const t0 = Date.now()
  const r = spawnSync('node', ['scripts/run-attach.mjs'], { stdio: 'inherit', timeout: 36 * 60 * 1000 })
  say('=== 第 ' + i + ' 轮结束 code=' + r.status + ' 用时 ' + Math.round((Date.now() - t0) / 1000) + 's')
  // 一轮通常是一局（12 回合）跑完；过早退出就等一会儿再来，别原地打转。
  const spent = Date.now() - t0
  if (spent < 90 * 1000) {
    say('退出过快，等 90s 再来（可能卡在某个界面）')
    spawnSync('node', ['-e', 'setTimeout(()=>{},90000)'])
  }
}
say('到点了，练习循环结束')
