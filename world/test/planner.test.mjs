// planner 的擂台测试（2026-11-15 09:3x）
// 目标：把「目标函数是不是朝对的方向走」钉住，不是钉具体分数。
// 用 data/covenants-map.json 的真名册造局面，别造假盟约。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { suggestTurn, scoreBoard, enumerateActions, describePlan } from '../lib/planner.js'
import { loadCovenantMap, covenantCounts } from '../lib/covenantplan.js'

const map = loadCovenantMap()
// 谢拉格成员：初雪/雪猎/角峰（6 人大盟约里最常用的一只）
const isXielage = (n) => covenantCounts([n], map).some((c) => c.name === '谢拉格' && c.count === 1)
const xl = ['初雪', '雪猎', '角峰'].filter(isXielage)
assert.ok(xl.length >= 2, '谢拉格成员名不对，夹具失效')

test('空名额 3 个 + 钱够 → 一定先上人，不上人就是浪费', () => {
  const st = { money: 5, slots: 3, level: 3, board: [{ name: xl[0] }, { name: xl[1] }], bench: [{ name: '风丸', tier: 2 }], shop: [{ name: '蛇屠箱', tier: 2, cost: 3 }] }
  const p = suggestTurn(st, { map, upgradeCost: 4 })
  assert.ok(p.best.length, '没有给出任何动作')
  assert.equal(p.best[0].type, 'deploy', '第一动作该是上人，实际：' + p.best[0].desc)
  assert.ok(p.gain > 0)
})

test('差一个人激活盟约 → 买那只，比买高阶杂牌分高', () => {
  // 场上已有谢拉格 2/3，店里 1 块杂牌 vs 谢拉格第 3 人
  const third = xl[2] || xl[1]
  const st = {
    money: 4, slots: 1, level: 3,
    board: [{ name: xl[0] }, { name: xl[1] }],
    bench: [],
    shop: [{ name: third, tier: 1, cost: 2 }, { name: '陨星', tier: 4, cost: 2 }],
  }
  const p = suggestTurn(st, { map, upgradeCost: 9 })
  const first = p.best[0]
  assert.equal(first.type, 'buy', '该是买卡：' + first.desc)
  assert.equal(first.card.name, third, '该优先补谢拉格第 3 人（激活 4 分），实际买了 ' + first.card.name)
})

test('名额 0 + 整备区有高阶 → 建议换人，不是干看着', () => {
  const st = { money: 2, slots: 0, level: 4, board: [{ name: '风丸' }, { name: xl[0] }], bench: [{ name: xl[1], tier: 3 }], shop: [] }
  const p = suggestTurn(st, { map })
  const hasSwap = p.ranked.some((r) => r.seq.some((a) => a.type === 'swap'))
  assert.ok(hasSwap, '名额 0 时没有任何换人方案')
})

test('钱不够时不许买、不许升级（不能出现负钱）', () => {
  const st = { money: 0, slots: 2, level: 2, board: [], bench: [], shop: [{ name: xl[0], tier: 1, cost: 2 }] }
  const acts = enumerateActions(st, { map, upgradeCost: 3 })
  assert.equal(acts.filter((a) => a.cost > 0).length, 0, '钱 0 还给出花钱方案')
  const p = suggestTurn(st, { map, upgradeCost: 3 })
  assert.ok(!p.best.some((a) => a.type === 'buy' || a.type === 'upgrade'), '钱 0 的规划里出现了花钱动作')
})

test('整备区满 10 张 → 分数被扣（提示该卖/该上）', () => {
  const full = { money: 5, slots: 0, level: 3, board: [], bench: Array.from({ length: 10 }, () => ({ name: '风丸', tier: 1 })), shop: [] }
  const empty = { ...full, bench: [] }
  const a = scoreBoard(full, { map }).score
  const b = scoreBoard(empty, { map }).score
  assert.ok(a < b, '满整备区没被扣分：' + a + ' vs ' + b)
})

test('describePlan 永远能读出一行（没有动作也不炸）', () => {
  const p = suggestTurn({ money: 0, slots: 0, level: 1, board: [], bench: [], shop: [] }, { map })
  const line = describePlan(p)
  assert.match(line, /^规划建议（现在 [-\d.]+ 分 → 做完 [-\d.]+ 分/)
  assert.match(describePlan(null), /规划：没有/)
})

test('同一局面规划是确定的（没有随机、可复现）', () => {
  const st = { money: 6, slots: 1, level: 3, board: [{ name: xl[0] }], bench: [{ name: xl[1], tier: 2 }], shop: [{ name: '陨星', tier: 2, cost: 2 }] }
  const a = describePlan(suggestTurn(st, { map, upgradeCost: 5 }))
  const b = describePlan(suggestTurn(st, { map, upgradeCost: 5 }))
  assert.equal(a, b)
})
