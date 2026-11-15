// 通宵刷局：每局 enterRun → autoRun → leaveSettle，失败重试。
// deploy:false —— 靠游戏自己的「整备区自动部署」，今晚已确认不拖也能上场。
import { autoRun } from '../lib/drive.js'
import { enterRun, leaveSettle, peek, waitFor } from '../lib/run.js'

const games = Number(process.argv[2] || 3)
const maxRounds = Number(process.argv[3] || 14)
const hb = setInterval(() => console.log('[hb] ' + new Date().toISOString().slice(11, 19) + ' — 还活着'), 30000)

const out = []
for (let g = 1; g <= games; g++) {
  const rec = { game: g, startedAt: new Date().toISOString(), ok: false }
  try {
    const cur = peek()
    if (cur.state === 'wz_settle') await leaveSettle()
    const e = await enterRun({ mode: 'independent', maxMs: 240000 })
    rec.enter = { ok: e.ok, log: (e.log || []).slice(-6), blocked: e.blocked }
    if (!e.ok) { out.push(rec); continue }
    const r = await autoRun({ maxRounds, maxBattleSeconds: 150, deploy: false })
    rec.auto = { stop: r.stop, rounds: r.rounds, log: r.log }
    if (r.stop === '结算了') {
      const lv = await leaveSettle()
      rec.leave = lv.ok
    }
    rec.ok = true
  } catch (err) {
    rec.err = String(err && err.message || err)
    // 出错就退回大厅再试，退不回去就交给下一局的开头去处理
    try {
      const st = peek()
      if (st.state === 'wz_settle') await leaveSettle()
      else if (st.state !== 'wz_hall' && st.state !== 'wz_hall_joint') {
        await waitFor(['wz_hall', 'wz_hall_joint', 'wz_settle'], { timeoutMs: 60000 })
      }
    } catch (e2) { rec.err2 = String(e2 && e2.message || e2) }
  }
  out.push(rec)
  console.log('GAME ' + g + ' ' + JSON.stringify(rec))
}
clearInterval(hb)
console.log('ALL DONE ' + JSON.stringify(out.map((x) => ({ g: x.game, ok: x.ok, stop: x.auto && x.auto.stop, rounds: x.auto && x.auto.rounds && x.auto.rounds.length }))))
