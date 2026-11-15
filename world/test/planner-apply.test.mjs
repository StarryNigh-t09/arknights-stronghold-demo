// 2026-11-15：planner 从影子转「真开车」的开关，锁源码 + 锁行为。
// 来由：用户 m11286「可以，你慢慢做吧」批准第 1 项（planner 接管决策）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { suggestTurn } from '../lib/planner.js'

const SRC = readFileSync(new URL('../lib/drive.js', import.meta.url), 'utf8')

test('plan 必须是 let（apply 模式要能被覆盖）', () => {
  assert.ok(SRC.includes('let plan = planRestStep({'))
  assert.ok(!SRC.includes('const plan = planRestStep({'))
})

test('p0 声明在「买卡 →」日志之前，apply 块在之后', () => {
  const decl = SRC.indexOf('let p0 = null')
  const logLine = SRC.indexOf("'  买卡 → ' + plan.action")
  const applyIdx = SRC.indexOf("process.env.COOP_PLANNER_MODE === 'apply'")
  assert.ok(decl > 0 && logLine > 0 && applyIdx > 0)
  assert.ok(decl < logLine, 'p0 必须在打日志前声明')
  assert.ok(applyIdx > logLine, 'apply 块必须在影子块之后（否则 p0 还没算）')
})

test('apply 块只接管买/升级，且带钱与名额硬约束', () => {
  const i = SRC.indexOf("process.env.COOP_PLANNER_MODE === 'apply'")
  const seg = SRC.slice(i, i + 1800)
  assert.match(seg, /规划接管：改成买 /)
  assert.match(seg, /规划接管：改成升级 Lv/)
  assert.match(seg, /Number\(p0\.gain\) >= 1\.2/)
  assert.match(seg, /costA <= money && benchNow < BENCH_CAP/)
  assert.match(seg, /upA <= money && level < 5/)
  // deploy/swap 不许被这里接管（部署是另一个阶段，风险最大）
  assert.ok(!/first\.type === 'deploy'/.test(seg))
  assert.ok(!/first\.type === 'swap'/.test(seg))
})

test('影子期也留对比证据（data/planner-compare.jsonl）', () => {
  assert.ok(SRC.includes("'../data/planner-compare.jsonl'"))
  assert.match(SRC, /agree: !!\(first0 && first0\.type === plan\.action\)/)
  assert.match(SRC, /bestType: first0 \? first0\.type : null/)
})

test('不设 COOP_PLANNER_MODE 时不接管（默认影子）', () => {
  // 只有 === 'apply' 一个入口，没有别的地方改 plan
  const hits = SRC.match(/plan = \{ action:/g) || []
  assert.equal(hits.length, 2, '只允许 buy/upgrade 两处覆盖')
  assert.ok(SRC.includes("process.env.COOP_PLANNER_MODE === 'apply'"))
  assert.ok(!SRC.includes("COOP_PLANNER_MODE !== 'off'"))
})

test('planner 首选是可买的牌时，action 带回原始 card 对象', () => {
  const st = { money: 5, level: 1, slots: 2, board: [], bench: [], shop: [{ name: '玫兰莎', cost: 2, tier: 1 }] }
  const r = suggestTurn(st, { upgradeCost: 3, maxLevel: 5, depth: 2 })
  const first = r.best[0]
  assert.equal(first.type, 'buy')
  assert.equal(first.card.name, '玫兰莎')
  assert.equal(first.card.cost, 2)
})
