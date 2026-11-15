import { readSettle, appendRunRecord } from '../lib/run.js'
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const s = await readSettle()
// 先清空重写（这是本会话第一条完整整局记录）
writeFileSync(join(HERE, '..', 'data', 'runs.jsonl'), '')
const rec = {
  at: new Date().toISOString(),
  source: 'live-run 2026-11-10 11:11（全自动：自动上场 + 道具补给自动选）',
  rounds: [
    { round: 1, hp: 26 }, { round: 2, hp: 26 }, { round: 3, hp: 26 }, { round: 4, hp: 26 },
    { round: 5, hp: 26 }, { round: 6, hp: 26 }, { round: 7, hp: 26 }, { round: 8, hp: 26 },
    { round: 9, hp: 16, lifeLost: 10 }, { round: 10, hp: 6, lifeLost: 10 },
  ],
  settle: { passedRounds: s.passedRounds, cert: s.cert, duration: s.duration, certCap: '630/6250' },
  note: '前 8 回合零掉血；第 9 回合起每回合掉 10。证实时自动上场有效，崩盘原因是中后期强度爬升 + 站位不是按职业/范围算的。',
}
console.log('recorded=' + appendRunRecord(rec))
console.log(JSON.stringify(rec.settle))
