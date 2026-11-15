/**
 * covenantplan 单测：盟约计数、买卡排序、换人挑选。
 * 数据都是 data/covenants-map.json 里真实存在的干员（不造的假名，避免跟真表脱节）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  loadCovenantMap, covenantNeed, covenantsOf, tierOf, isStacker,
  covenantCounts, pickBuyTarget, pickSwap, planRecallSwap, describeCovenants, covenantRank,
} from '../lib/covenantplan.js'

const map = loadCovenantMap()

test('盟约表读得到', () => {
  assert.equal(map.ok, true)
  assert.ok(map.covenants.length >= 20)
  assert.ok(Object.keys(map.operators).length >= 100)
})

test('激活门槛：核心 3、附加按表（不屈=2）', () => {
  assert.equal(covenantNeed('谢拉格', map), 3)
  assert.equal(covenantNeed('坚守', map), 2)
  assert.equal(covenantNeed('不存在的盟约', map), 3)
})

test('干员归属：核心 + 附加都在', () => {
  const covs = covenantsOf('角峰', map)
  assert.ok(covs.includes('谢拉格'))
  assert.ok(covs.includes('坚守'))
  assert.equal(tierOf('角峰', map), 1)
  assert.deepEqual(covenantsOf('查无此人', map), [])
})

test('叠层核心识别', () => {
  assert.equal(isStacker('卡达', map), true)
  assert.equal(isStacker('查无此人', map), false)
})

test('计数：同名只算一个，active/missing 对得上', () => {
  const rows = covenantCounts(['角峰', '泡泡', '查无此人'], map)
  const hold = rows.find((r) => r.name === '坚守')
  assert.equal(hold.count, 2)
  assert.equal(hold.need, 2)
  assert.equal(hold.active, true)
  const dup = covenantCounts(['角峰', '角峰'], map).find((r) => r.name === '坚守')
  assert.equal(dup.count, 1, '同名两次只算一个人')
})

test('买卡：差一只激活的排在阶数更高的前面', () => {
  const board = ['角峰']                       // 坚守 1/2
  const pick = pickBuyTarget(
    [{ name: '泡泡', tier: 2, cost: 3 }, { name: '车尔尼', tier: 3, cost: 3 }],
    { board, bench: [], covenants: ['坚守', '谢拉格'], map }
  )
  assert.ok(pick)
  assert.equal(pick.card.name, '泡泡')
  assert.match(pick.reason, /凑到 2 人激活/)
})

test('买卡：同名可买第 2 张凑三合一，第 3 张高分，3 张以上不买', () => {
  // 2026-11-14 口径修正：旧规则「已有 1 张就不许再买」让三合一在结构上不可能发生
  // （用户 m02396「三合一的优先级很高」），现在允许买第 2 张凑对子、第 3 张立刻升阶。
  const pair = pickBuyTarget([{ name: '角峰', tier: 1, cost: 1 }], { board: ['角峰'], map })
  assert.ok(pair, '已有 1 张时允许买第 2 张')
  assert.match(pair.reason, /买第 2 张凑三合一/)
  const trip = pickBuyTarget([{ name: '角峰', tier: 1, cost: 1 }], { board: ['角峰'], owned: { 角峰: 2 }, map })
  assert.ok(trip)
  assert.match(trip.reason, /三合一升阶/)
  assert.equal(pickBuyTarget([{ name: '角峰', tier: 1, cost: 1 }], { board: ['角峰'], owned: { 角峰: 3 }, map }), null)
})

test('买卡：禁用的干员不买', () => {
  const pick = pickBuyTarget([{ name: '泡泡', tier: 2, cost: 2 }], { board: ['角峰'], banned: ['泡泡'], map })
  assert.equal(pick, null)
})

test('买卡：叠层核心加分', () => {
  const pick = pickBuyTarget([{ name: '卡达', tier: 1, cost: 1 }], { board: [], map })
  assert.ok(pick)
  assert.match(pick.reason, /叠层核心/)
})

test('换人：整备区能补激活的换掉场上最弱的', () => {
  // 场上只有泡泡（坚守 1/2、萨尔贡 0/3，2 阶），整备区有角峰（坚守+谢拉格，1 阶）
  const sw = pickSwap({
    board: [{ name: '泡泡' }],
    bench: [{ name: '角峰', index: 0 }],
    covenants: ['坚守'],
    map,
  })
  assert.ok(sw)
  assert.equal(sw.add.name, '角峰')
  assert.ok(sw.drop, '应挑出一个要下来的人')
  assert.equal(sw.drop.name, '泡泡')
  assert.match(sw.reason, /换人：角峰/)
})

test('换人：换上来不赚就不换', () => {
  // 场上是同一只、整备区也是同一只 → 增益差不多，不应白换
  const sw = pickSwap({ board: [{ name: '角峰' }], bench: [{ name: '角峰', index: 0 }], map })
  assert.ok(sw)
  assert.equal(sw.drop, null)
  assert.match(sw.reason, /不划算/)
})

test('换人：整备区空就返回 null', () => {
  assert.equal(pickSwap({ board: [{ name: '角峰' }], bench: [], map }), null)
})

test('日志摘要', () => {
  const s = describeCovenants(['角峰', '泡泡'], map)
  assert.match(s, /坚守/)
  assert.match(describeCovenants([], map), /还没数出盟约/)
})

test('买卡：本局禁用按盟约降权（禁得越多的盟约越不优先）', () => {
  const argv = [{ name: '泡泡', tier: 2, cost: 3 }]
  const base = { board: ['角峰'], bench: [], covenants: ['坚守'], map }
  const free = pickBuyTarget(argv, base)
  const banned = pickBuyTarget(argv, { ...base, bannedCovenants: [{ covenant: '坚守', count: 5 }, { covenant: '萨尔贡', count: 3 }] })
  assert.ok(free && banned)
  assert.equal(banned.card.name, '泡泡')
  assert.ok(banned.score < free.score, '同一个人，盟约被禁后分数要更低（' + banned.score + ' < ' + free.score + '）')
})

test('买卡：禁用压不住「正好激活」时仍然会买', () => {
  const pick = pickBuyTarget([{ name: '泡泡', tier: 2, cost: 3 }], {
    board: ['角峰'], covenants: ['坚守'], bannedCovenants: [{ covenant: '坚守', count: 2 }], map,
  })
  assert.ok(pick)
  assert.match(pick.reason, /凑到 2 人激活/)
})

test('盟约优先级：主盟约 > 输出/经济小盟约 > 防御小盟约（用户 m07228 / m07277）', () => {
  // 用户 m07277 定死主盟约只有六个：叙拉古、乌萨斯、莱塔尼亚、维多利亚、炎、谢拉格。
  // 艾雅法拉 = 莱塔尼亚(主盟约) + 奥术(输出类)，应该压在纯输出类的灰喉之上；
  // 泡泡 = 萨尔贡(不在六家里) + 坚守(防御)，应该排在最后。
  const pick = (cands) => pickBuyTarget(cands, { board: [], bench: [], covenants: [], map })
  const cands = [
    { name: '泡泡', tier: 1, cost: 2 },
    { name: '灰喉', tier: 1, cost: 2 },
    { name: '艾雅法拉', tier: 1, cost: 2 },
  ]
  const r1 = pick(cands)
  assert.ok(r1)
  assert.equal(r1.card.name, '艾雅法拉', '主盟约 + 输出类应排第一')
  const r2 = pick([{ name: '泡泡', tier: 1, cost: 2 }, { name: '灰喉', tier: 1, cost: 2 }])
  assert.equal(r2.card.name, '灰喉', '输出类小盟约应优先于「非六家的核心 + 防御」')
  assert.deepEqual(
    [covenantRank('谢拉格'), covenantRank('精准'), covenantRank('坚守'), covenantRank('萨尔贡')],
    [3, 2, 1, 0.4]
  )
})


// 2026-11-14 用户 m05970「撤回并部署」：名额满时撤回场上一个、回整备区，再正常部署。
test('撤回再部署：名册齐全时挑「该下的人」，并把落点像素带出来', () => {
  const rp = planRecallSwap({
    board: [{ name: '泡泡', px: [900, 400] }],
    bench: [{ name: '角峰', index: 0 }],
    covenants: ['坚守'],
    round: 1,
    map,
  })
  assert.ok(rp.drop, '应挑出一个要撤回的人')
  assert.equal(rp.drop.name, '泡泡')
  assert.deepEqual(rp.drop.px, [900, 400])
  assert.equal(rp.add && rp.add.name, '角峰')
})

test('撤回再部署：换人不划算就不撤（别越换越低阶）', () => {
  const rp = planRecallSwap({
    board: [{ name: '角峰', px: [900, 400] }],
    bench: [{ name: '角峰', index: 0 }],
    map,
  })
  assert.equal(rp.drop, null)
  assert.match(rp.reason, /不划算/)
})

test('撤回再部署：没有名册时按棋盘实测占格撤最右一格（Set 也吃）', () => {
  const rp = planRecallSwap({ bench: [], board: [], occupiedPx: new Set(['830,340', '1342,552', '1196,353']) })
  assert.deepEqual(rp.drop.px, [1342, 552])
  assert.equal(rp.drop.name, '')
})

test('撤回再部署：占格传数组/对象也能解析', () => {
  const rp = planRecallSwap({ bench: [], board: [], occupiedPx: ['700,300', [1500, 600], { px: [1100, 500] }] })
  assert.deepEqual(rp.drop.px, [1500, 600])
})

test('撤回再部署：什么都没有就返回 drop=null，不猜', () => {
  const rp = planRecallSwap({ bench: [], board: [], occupiedPx: [] })
  assert.equal(rp.drop, null)
  assert.match(rp.reason, /没有名册/)
})
