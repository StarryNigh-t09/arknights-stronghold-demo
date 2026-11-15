// 统计落位成功率与耗时：把 trace-*/steps.jsonl 里「上场 …」「本回合上场 N 个｜试了 M 次」抓出来汇总。
// 用法：node scripts/_stats.mjs [最近几个 trace，默认全部]
import { readdirSync, readFileSync, existsSync } from 'node:fs'

const root = '..'
const dirs = readdirSync(root).filter((d) => d.startsWith('trace-')).sort()
let placed = 0, attempts = 0, roundLines = 0, msSum = 0, msN = 0
const per = []
for (const d of dirs) {
  const sp = root + '/' + d + '/steps.jsonl'
  if (!existsSync(sp)) continue
  let ok = 0, tries = 0, rounds = 0
  for (const line of readFileSync(sp, 'utf8').split('\n')) {
    if (!line.trim()) continue
    let r
    try { r = JSON.parse(line) } catch { continue }
    const a = String(r.action || '')
    let m = a.match(/上场 (\S+) \((\d+),(\d+) → (\d+),(\d+)\).*起手 (\d+)ms 用时 ([\d.]+)s/)
    if (m) { ok += 1; msSum += Number(m[6]) * 1000; msN += 1 }
    m = a.match(/本回合上场 (\d+) 个｜试了 (\d+) 次/)
    if (m) { rounds += 1; tries += Number(m[2]) }
  }
  if (rounds || ok) {
    placed += ok; attempts += tries; roundLines += rounds
    per.push({ trace: d, placed: ok, tried: tries || ok, rounds })
  }
}
console.log(JSON.stringify({
  traces: per.length,
  rounds: roundLines,
  placed,
  attempts,
  successRate: attempts ? +(placed / attempts).toFixed(3) : null,
  avgPlaceSec: msN ? +(msSum / msN / 1000).toFixed(2) : null,
  per: per.slice(-8),
}, null, 2))
