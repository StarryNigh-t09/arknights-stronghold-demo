#!/usr/bin/env node
/**
 * planner-report.mjs — 影子期/接管期的对比报告。
 *
 * 读 world/data/planner-compare.jsonl（drive.js 每回合写一行：restplan 选了什么、
 * planner 首选什么、差多少分、两者是否一致），输出：
 *   · 一致率 / 平均收益分
 *   · 分歧最多的几类（actual → bestType）
 *   · 分歧里 planner 首选是「买」的样本明细（谁、多少分）
 *
 * 用法：node scripts/planner-report.mjs [--json]
 * 2026-11-15 09:5x 建立（用户 m11286 批准 planner 从影子转真开车，先攒对比数据）。
 */
import { readFileSync, existsSync } from 'node:fs'

const FILE = new URL('../data/planner-compare.jsonl', import.meta.url)
const asJson = process.argv.includes('--json')

if (!existsSync(FILE)) {
  console.log('[PLANNER] 还没有对比数据（data/planner-compare.jsonl 不存在）')
  process.exit(0)
}
const rows = readFileSync(FILE, 'utf8').trim().split('\n').filter(Boolean).map((l) => {
  try { return JSON.parse(l) } catch { return null }
}).filter(Boolean)

const n = rows.length
const agree = rows.filter((r) => r.agree).length
const gains = rows.map((r) => Number(r.gain)).filter((x) => Number.isFinite(x))
const avgGain = gains.length ? (gains.reduce((a, b) => a + b, 0) / gains.length) : 0
const disagree = rows.filter((r) => !r.agree)

const pairs = new Map()
for (const r of disagree) {
  const k = String(r.actual) + ' → ' + String(r.bestType)
  pairs.set(k, (pairs.get(k) || 0) + 1)
}
const topPairs = [...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
const buyCases = disagree.filter((r) => r.bestType === 'buy').slice(-10)

if (asJson) {
  console.log(JSON.stringify({ n, agree, agreeRate: n ? agree / n : 0, avgGain, topPairs, buyCases }, null, 1))
} else {
  console.log('[PLANNER] 样本 ' + n + ' 回合｜一致 ' + agree + '/' + n +
    '（' + (n ? Math.round((agree / n) * 100) : 0) + '%）｜平均收益 +' + avgGain.toFixed(2) + ' 分')
  if (topPairs.length) {
    console.log('分歧最多的几类：')
    for (const [k, v] of topPairs) console.log('  ' + k + '：' + v + ' 次')
  }
  if (buyCases.length) {
    console.log('planner 说该买、restplan 没买的样本：')
    for (const r of buyCases) console.log('  R' + r.round + '｜restplan ' + r.actual + '｜' + (r.bestDesc || '') + '｜+' + r.gain)
  }
  const zero = rows.filter((r) => Number(r.gain) === 0).length
  console.log('零收益回合：' + zero + '｜有分歧且收益 ≥1.2 的回合：' +
    rows.filter((r) => !r.agree && Number(r.gain) >= 1.2).length)
}
