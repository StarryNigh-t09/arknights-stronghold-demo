/**
 * 决策门（2026-11-14 用户 m03796 / m03497）：
 *  1) 「不要买计划之外的卡」——盟约不在目标里、不是输出羁绊、不凑三合一、阶数 <4 的牌直接不买；
 *  2) 「台下不用的干员就卖掉」——pickSellChips 先卖计划外/最低阶，对子素材不动；
 *  3) 后期（>=8 回合）低阶计划外更不该买。
 * 这里用合成盟约表（不依赖 data/covenants-map.json 的真实名字），只测判定逻辑。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickBuyTarget, pickSellChips } from '../lib/covenantplan.js'

const MAP = {
  covenants: [
    { name: '乌萨斯', activateCount: 2 },
    { name: '精准', activateCount: 2 },
    { name: '不屈', activateCount: 2 },
  ],
  operators: {
    甲: { tier: 2, core: ['乌萨斯'] },
    乙: { tier: 1, core: ['不屈'] },
    丙: { tier: 3, core: ['精准'] },
    丁: { tier: 1, core: ['乌萨斯'] },
    戊: { tier: 1, core: ['乌萨斯'] },
  },
  members: {},
}

test('计划外的 1 阶卡不买：有盟约内的牌时挑盟约内的', () => {
  const r = pickBuyTarget(
    [{ name: '乙', tier: 1, cost: 2 }, { name: '甲', tier: 2, cost: 3 }],
    { map: MAP, covenants: ['乌萨斯'] },
  )
  assert.ok(r)
  assert.equal(r.card.name, '甲')
  assert.ok(r.offPlan.includes('乙'), '计划外的牌要记在 offPlan 里')
})

test('计划外的牌：同名的第 2 张放行（凑对子→三合一）', () => {
  const r = pickBuyTarget([{ name: '乙', tier: 1, cost: 2 }], { map: MAP, covenants: ['乌萨斯'], owned: { 乙: 1 } })
  assert.ok(r)
  assert.equal(r.card.name, '乙')
})

test('输出羁绊（精准/奥术）算计划内', () => {
  const r = pickBuyTarget([{ name: '丙', tier: 3, cost: 2 }], { map: MAP, covenants: ['乌萨斯'] })
  assert.ok(r)
  assert.equal(r.card.name, '丙')
})

test('后期（>=8 回合）计划外的 1 阶卡：降分兜底，不再直接不买', () => {
  const r = pickBuyTarget([{ name: '乙', tier: 1, cost: 1 }], { map: MAP, covenants: ['乌萨斯'], round: 9 })
  assert.ok(r, 'm10875：抄攻略是补齐阵容，不能硬抄没有就不买')
  assert.match(r.reason, /兜底|阵容补齐/)
  const plan = pickBuyTarget([{ name: '乙', tier: 1, cost: 1 }], { map: MAP, covenants: ['乌萨斯'], round: 9, coreCovenants: [] })
  assert.ok(r.score < 6, '兜底分不能高过凑盟约：' + r.score)
})

test('卖牌：先卖计划外的低阶，计划内的高阶留作换人素材', () => {
  const rows = pickSellChips({
    map: MAP,
    covenants: ['乌萨斯'],
    bench: [{ name: '乙' }, { name: '甲' }, { name: '丙' }],
    board: [{ name: '丁' }],
  })
  assert.ok(rows.length >= 1)
  assert.equal(rows[0].name, '乙')
  assert.ok(!rows.some((r) => r.name === '丙'), '计划内的 3 阶（精准）不该被卖')
})

test('卖牌：同名 2 张是对子素材，不卖', () => {
  const rows = pickSellChips({ map: MAP, covenants: ['乌萨斯'], bench: [{ name: '乙' }, { name: '乙' }], board: [] })
  assert.ok(!rows.some((r) => r.name === '乙'))
})
