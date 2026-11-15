import test from 'node:test'
import assert from 'node:assert/strict'
import { planRestStep, pickWanted, BENCH_CAP, EQUIP_CAP, REFRESH_SAFETY, PACE, targetLevelFor } from '../lib/restplan.js'

const U = (name, cost, extra = {}) => ({ name, cost, slot: 0, x: 100, y: 930, want: 0, have: 0, ...extra })
const E = (name, cost) => ({ name, cost, slot: 0, x: 200, y: 930 })

test('升级排第一：钱够升级费就先升级，哪怕有想要的卡买得起', () => {
  const p = planRestStep({
    money: 8, level: 2, upgradeCost: 8, targetLevel: 4, bench: 3, equipCount: 0,
    units: [U('陨星', 2)], equips: [], refreshUsed: 0, freeRefresh: 0
  })
  assert.equal(p.action, 'upgrade')
})

test('钱不够升级费就买卡', () => {
  const p = planRestStep({
    money: 3, level: 2, upgradeCost: 8, targetLevel: 4, bench: 3, equipCount: 0,
    units: [U('陨星', 2)], equips: [], refreshUsed: 0, freeRefresh: 0
  })
  assert.equal(p.action, 'buy')
  assert.equal(p.kind, 'unit')
  assert.equal(p.card.name, '陨星')
})

test('买不起想要的卡（还有钱）→ 冻结', () => {
  const p = planRestStep({
    money: 1, level: 2, upgradeCost: 8, targetLevel: 2, bench: 3, equipCount: EQUIP_CAP,
    units: [U('卡涅利安', 3)], equips: [], refreshUsed: 0, freeRefresh: 0
  })
  assert.equal(p.action, 'freeze')
  assert.equal(p.card.name, '卡涅利安')
})

test('钱花光了就不冻结（m00211：没钱了不冻结）', () => {
  const p = planRestStep({
    money: 0, level: 2, upgradeCost: 8, targetLevel: 2, bench: 3, equipCount: EQUIP_CAP,
    units: [U('卡涅利安', 3)], equips: [], refreshUsed: 0, freeRefresh: 0
  })
  assert.equal(p.action, 'stop')
  assert.match(p.reason, /不冻结/)
})

test('没有想要的卡 → 刷新，1 块钱一次', () => {
  const p = planRestStep({
    money: 5, level: 2, upgradeCost: 8, targetLevel: 2, bench: 3, equipCount: EQUIP_CAP,
    units: [U('某人', 2, { want: null })], equips: [], refreshUsed: 0, freeRefresh: 0
  })
  assert.equal(p.action, 'refresh')
  assert.equal(p.free, false)
})

test('FREE 徽章在 → 没钱也能刷', () => {
  const p = planRestStep({
    money: 0, level: 2, upgradeCost: 8, targetLevel: 2, bench: 3, equipCount: EQUIP_CAP,
    units: [U('某人', 2, { want: null })], equips: [], refreshUsed: 3, freeRefresh: 1
  })
  assert.equal(p.action, 'refresh')
  assert.equal(p.free, true)
})

test('没钱又没 FREE → 停手等下回合自动刷新', () => {
  const p = planRestStep({
    money: 0, level: 2, upgradeCost: 8, targetLevel: 2, bench: 3, equipCount: EQUIP_CAP,
    units: [U('某人', 2, { want: null })], equips: [], refreshUsed: 3, freeRefresh: 0
  })
  assert.equal(p.action, 'stop')
})

test('装备不占整备区：整备区满也能买装备', () => {
  const p = planRestStep({
    money: 2, level: 5, upgradeCost: 9, targetLevel: 5, bench: BENCH_CAP, equipCount: 1,
    units: [U('陨星', 2)], equips: [E('维式重锤', 1)], refreshUsed: 0, freeRefresh: 0
  })
  assert.equal(p.action, 'buy')
  assert.equal(p.kind, 'equip')
})

test('装备满 5 个就不再买装备', () => {
  const p = planRestStep({
    money: 2, level: 2, upgradeCost: 8, targetLevel: 2, bench: 3, equipCount: EQUIP_CAP,
    units: [], equips: [E('维式重锤', 1)], refreshUsed: 0, freeRefresh: 0
  })
  assert.equal(p.action, 'refresh')
})

test('没有要的卡先刷新，刷过 2 次再把钱花在人上（装备不能抢走买人的钱）', () => {
  const p = planRestStep({
    money: 2, level: 2, upgradeCost: 8, targetLevel: 2, bench: 3, equipCount: 0,
    units: [U('某人', 2, { want: null })], equips: [E('维式重锤', 1)], refreshUsed: 0, freeRefresh: 0
  })
  assert.equal(p.action, 'refresh')
})

test('刷新没有次数上限：店里没有买得起的，钱就一直刷（m00267/m02108）', () => {
  const p = planRestStep({
    money: 3, level: 2, upgradeCost: 8, targetLevel: 2, bench: 3, equipCount: 0,
    units: [U('某人', 5, { want: null })], equips: [], refreshUsed: 5, freeRefresh: 0
  })
  assert.equal(p.action, 'refresh')
  assert.equal(p.free, false)
})

test('刷了 3 次以上、店里有 ≤2 块的干员 → 先买人，别把回合烧在刷新上', () => {
  const p = planRestStep({
    money: 6, level: 2, upgradeCost: 8, targetLevel: 2, bench: 3, equipCount: 0,
    units: [U('某人', 2, { want: null })], equips: [], refreshUsed: 3, freeRefresh: 0
  })
  assert.equal(p.action, 'buy')
  assert.equal(p.kind, 'unit')
})

test('最后 1 块 + 店里有 1 块的人 → 买人，不再刷（人比再刷一次值）', () => {
  const p = planRestStep({
    money: 1, level: 2, upgradeCost: 8, targetLevel: 2, bench: 3, equipCount: 0,
    units: [U('某人', 1, { want: null })], equips: [], refreshUsed: 0, freeRefresh: 0
  })
  assert.equal(p.action, 'buy')
  assert.equal(p.kind, 'unit')
})

test('钱 1、店里最便宜 3 块 → 刷新把钱刷光（不带着钱进下一回合，m02108）', () => {
  const p = planRestStep({
    money: 1, level: 2, upgradeCost: 9, targetLevel: 2, bench: 3, equipCount: 0,
    units: [U('某人', 3, { want: null })], equips: [E('维式重锤', 1)], refreshUsed: 2, freeRefresh: 0
  })
  assert.equal(p.action, 'refresh')
})

test('刷新按钮灰了、店里没买得起的干员 → 钱拿去买装备（最多先买 3 件）', () => {
  const p = planRestStep({
    money: 2, level: 2, upgradeCost: 9, targetLevel: 2, bench: 3, equipCount: 2,
    units: [U('某人', 3, { want: null })], equips: [E('维式重锤', 1)], refreshUsed: 2, freeRefresh: 0,
    canRefresh: false
  })
  assert.equal(p.action, 'buy')
  assert.equal(p.kind, 'equip')
})

test('装备先买到 3 件就不再买（优先表还没写）；剩下的钱明确报出来', () => {
  const p = planRestStep({
    money: 5, level: 2, upgradeCost: 9, targetLevel: 2, bench: 3, equipCount: 3,
    units: [U('某人', 9, { want: null })], equips: [E('维式重锤', 1)], refreshUsed: 2, freeRefresh: 0,
    canRefresh: false
  })
  assert.equal(p.action, 'stop')
  assert.match(p.reason, /还剩 5 块/)
})

test('整备区满且买不了装备 → 先卖一张（m02251「满员了先卖卡」）', () => {
  const p = planRestStep({
    money: 5, level: 5, upgradeCost: 9, targetLevel: 5, bench: BENCH_CAP, equipCount: EQUIP_CAP,
    units: [U('陨星', 2)], equips: [], refreshUsed: 0, freeRefresh: 0
  })
  assert.equal(p.action, 'sell')
  assert.match(p.reason, /整备区满/)
})

test('整备区满 + 本回合已卖过一张 → 不再卖，直接停手', () => {
  const p = planRestStep({
    money: 5, level: 5, upgradeCost: 9, targetLevel: 5, bench: BENCH_CAP, equipCount: EQUIP_CAP,
    units: [U('陨星', 2)], equips: [], refreshUsed: 0, freeRefresh: 0, soldThisTurn: true
  })
  assert.equal(p.action, 'stop')
})

test('对子优先于清单（已有 2 张 > 清单但没有）', () => {
  const list = [U('甲', 3, { what: 0, want: 0, have: 0 }), U('乙', 2, { want: 1, have: 2 })]
  assert.equal(pickWanted(list).name, '乙')
})

test('安全阀：刷到上限就改兜底买，不死循环', () => {
  const p = planRestStep({
    money: 3, level: 2, upgradeCost: 8, targetLevel: 2, bench: 3, equipCount: EQUIP_CAP,
    units: [U('某人', 1, { want: null })], equips: [], refreshUsed: REFRESH_SAFETY, freeRefresh: 1
  })
  assert.equal(p.action, 'buy')
  assert.equal(p.kind, 'unit')
})

test('升级费读不到（null）就跳过升级，不会卡死', () => {
  const p = planRestStep({
    money: 9, level: 2, upgradeCost: null, targetLevel: 5, bench: 3, equipCount: EQUIP_CAP,
    units: [U('陨星', 2)], equips: [], refreshUsed: 0, freeRefresh: 0
  })
  assert.equal(p.action, 'buy')
})
test('刷新按钮灰了（店冻结/特殊店）→ 不刷，先把钱花在能买的卡上（2026-11-11 真机：点了 36 下一次没动）', () => {
  const p = planRestStep({
    money: 5, level: 3, upgradeCost: 12, targetLevel: 5, bench: 3, equipCount: 0,
    units: [U('某人', 2, { want: null })], equips: [], refreshUsed: 0, freeRefresh: 4, canRefresh: false
  })
  assert.equal(p.action, 'buy')
  assert.equal(p.kind, 'unit')
})

test('刷新按钮灰了、又没有买得起的 → 停手', () => {
  const p = planRestStep({
    money: 1, level: 3, upgradeCost: 12, targetLevel: 5, bench: 3, equipCount: 0,
    units: [U('某人', 2, { want: null })], equips: [], refreshUsed: 0, freeRefresh: 0, canRefresh: false
  })
  assert.equal(p.action, 'stop')
  assert.match(p.reason, /还剩 1 块/)
})

test('canRefresh 不传 = 可以刷（老调用方不传也不能卡死）', () => {
  const p = planRestStep({
    money: 0, level: 3, upgradeCost: 12, targetLevel: 5, bench: 3, equipCount: 0,
    units: [], equips: [], refreshUsed: 0, freeRefresh: 2
  })
  assert.equal(p.action, 'refresh')
})

// ───────── m02897 / m02910 开局规则（2026-11-11 18:20）─────────
test('第 1 回合：店里有两张一样的 → 先买这张（凑两张同名）', () => {
  const p = planRestStep({
    money: 6, level: 1, upgradeCost: 4, targetLevel: 1, bench: 0, equipCount: 0,
    units: [U('折桠', 2), U('折桠', 2), U('卡达', 2)], equips: [], refreshUsed: 0, freeRefresh: 0,
    round: 1, bought: []
  })
  assert.equal(p.action, 'buy')
  assert.equal(p.card.name, '折桠')
})

test('第 1 回合：没有对子 → 买最便宜的，不升级', () => {
  const p = planRestStep({
    money: 6, level: 1, upgradeCost: 4, targetLevel: 1, bench: 0, equipCount: 0,
    units: [U('卡达', 3), U('褐果', 2)], equips: [], refreshUsed: 0, freeRefresh: 0,
    round: 1, bought: []
  })
  assert.equal(p.action, 'buy')
  assert.equal(p.card.name, '褐果')
})

test('第 1 回合：已经买过一张同名、店里还有 → 再买一张', () => {
  const p = planRestStep({
    money: 5, level: 1, upgradeCost: 4, targetLevel: 1, bench: 1, equipCount: 0,
    units: [U('折桠', 2), U('褐果', 2)], equips: [], refreshUsed: 0, freeRefresh: 0,
    round: 1, bought: ['折桠']
  })
  assert.equal(p.action, 'buy')
  assert.equal(p.card.name, '折桠')
})

test('第 2 回合：有两张一样 → 冻结，然后升级（then=upgrade）', () => {
  const p = planRestStep({
    money: 5, level: 1, upgradeCost: 4, targetLevel: 1, bench: 1, equipCount: 0,
    units: [U('褐果', 2), U('褐果', 2)], equips: [], refreshUsed: 0, freeRefresh: 0,
    round: 2, bought: []
  })
  assert.equal(p.action, 'freeze')
  assert.equal(p.then, 'upgrade')
})

test('第 2 回合：没有对子/三连/盟约 → 不冻结，走常规流程', () => {
  const p = planRestStep({
    money: 5, level: 1, upgradeCost: 4, targetLevel: 2, bench: 1, equipCount: 0,
    units: [U('褐果', 2), U('卡达', 3)], equips: [], refreshUsed: 0, freeRefresh: 0,
    round: 2, bought: []
  })
  assert.notEqual(p.action, 'freeze')
})

test('6 回合前刷出 4 阶卡：PACE 升级没到时点 → 必买', () => {
  const p = planRestStep({
    money: 8, level: 4, upgradeCost: 6, targetLevel: 4, bench: 2, equipCount: 0,
    units: [U('高阶核心', 5, { tier: 4 })], equips: [], refreshUsed: 0, freeRefresh: 0,
    round: 4, bought: []
  })
  assert.equal(p.action, 'buy')
  assert.equal(p.card.name, '高阶核心')
})

test('6 回合前刷出 4 阶卡但 PACE 升级到期 + 钱够 → 先升级（m02251 原文第一句）', () => {
  const p = planRestStep({
    money: 8, level: 3, upgradeCost: 6, targetLevel: 5, bench: 2, equipCount: 0,
    units: [U('高阶核心', 5, { tier: 4 })], equips: [], refreshUsed: 0, freeRefresh: 0,
    round: 4, bought: []
  })
  assert.equal(p.action, 'upgrade')
})

test('10 回合起刷出 5 阶卡 → 必买', () => {
  const p = planRestStep({
    money: 9, level: 5, upgradeCost: 20, targetLevel: 5, bench: 2, equipCount: 0,
    units: [U('六星', 5, { tier: 5 })], equips: [], refreshUsed: 0, freeRefresh: 0,
    round: 11, bought: []
  })
  assert.equal(p.action, 'buy')
  assert.equal(p.card.name, '六星')
})

test('第 3 回合起：升完只剩 1 块也照升（用户 m04079 废掉「刚好够就等下一回合」）', () => {
  const p = planRestStep({
    money: 5, level: 2, upgradeCost: 4, targetLevel: 4, bench: 2, equipCount: 0,
    units: [U('陨星', 2)], equips: [], refreshUsed: 0, freeRefresh: 0,
    round: 5, bought: []
  })
  assert.equal(p.action, 'upgrade')
})

test('第 3 回合起：升完还剩 3 块 → 照常升级', () => {
  const p = planRestStep({
    money: 7, level: 2, upgradeCost: 4, targetLevel: 4, bench: 2, equipCount: 0,
    units: [U('陨星', 2)], equips: [], refreshUsed: 0, freeRefresh: 0,
    round: 5, bought: []
  })
  assert.equal(p.action, 'upgrade')
})

/* ---------- 2026-11-11 22:35 用户 m05971「按照节奏升级，节奏到了优先升级，然后买卡」 ---------- */

test('节奏表：回合 → 目标等级（稳本口径，永不升六）', () => {
  assert.equal(targetLevelFor(1), 1)
  assert.equal(targetLevelFor(2), 1)
  assert.equal(targetLevelFor(3), 2)
  assert.equal(targetLevelFor(4), 3)
  assert.equal(targetLevelFor(6), 3)
  assert.equal(targetLevelFor(7), 4)
  assert.equal(targetLevelFor(9), 4)
  assert.equal(targetLevelFor(10), 5)
  assert.equal(targetLevelFor(20), 5)   // 上限 5，永不升六
})

test('节奏表单调不降、段首递增', () => {
  for (let i = 1; i < PACE.length; i++) {
    assert.ok(PACE[i].from > PACE[i - 1].from, '段首必须递增')
    assert.ok(PACE[i].level >= PACE[i - 1].level, '等级不能回落')
  }
})

test('第 3 回合节奏点到 Lv2：钱够就先升级，哪怕店里有买得起的想要的卡', () => {
  const p = planRestStep({
    money: 6, level: 1, upgradeCost: 6, targetLevel: targetLevelFor(3), bench: 2, equipCount: 0,
    units: [U('陨星', 2)], equips: [], refreshUsed: 0, freeRefresh: 0,
    round: 3, bought: [], upgraded: false
  })
  assert.equal(p.action, 'upgrade')
  assert.match(p.reason, /节奏/)
})

test('本回合已经升过一次 → 不再升级，转去 买卡', () => {
  const p = planRestStep({
    money: 6, level: 1, upgradeCost: 6, targetLevel: targetLevelFor(3), bench: 2, equipCount: 0,
    units: [U('陨星', 2)], equips: [], refreshUsed: 0, freeRefresh: 0,
    round: 3, bought: [], upgraded: true
  })
  assert.notEqual(p.action, 'upgrade')
  assert.equal(p.action, 'buy')
})

test('节奏点到但钱不够升级 → 先买卡，reason 里写明还差几块', () => {
  const p = planRestStep({
    money: 3, level: 1, upgradeCost: 6, targetLevel: targetLevelFor(3), bench: 2, equipCount: 0,
    units: [U('陨星', 2)], equips: [], refreshUsed: 0, freeRefresh: 0,
    round: 3, bought: [], upgraded: false
  })
  assert.equal(p.action, 'buy')
  assert.match(p.reason, /还差 3 块升级/)
})

test('第 2 回合节奏只要求 Lv1：钱够也不升，先买卡（速本派才第 2 回合升）', () => {
  const p = planRestStep({
    money: 8, level: 1, upgradeCost: 4, targetLevel: targetLevelFor(2), bench: 2, equipCount: 0,
    units: [U('陨星', 2)], equips: [], refreshUsed: 0, freeRefresh: 0,
    round: 2, bought: ['陨星'], upgraded: false
  })
  assert.notEqual(p.action, 'upgrade')
})

test('BOSS 回合（第 14 回合）不升级：钱够升级费也只买卡/刷新', () => {
  const p = planRestStep({
    money: 8, level: 2, upgradeCost: 8, targetLevel: 4, bench: 3, equipCount: 0,
    units: [U('陨星', 2)], equips: [], refreshUsed: 0, freeRefresh: 0,
    round: 14, bought: [], upgraded: false, roundsSinceUpgrade: 5, boss: true
  })
  assert.notEqual(p.action, 'upgrade')
  assert.equal(p.action, 'buy')
})

test('同参数、非 BOSS 回合：照旧升级（闸门只认 ctx.boss）', () => {
  const p = planRestStep({
    money: 8, level: 2, upgradeCost: 8, targetLevel: 4, bench: 3, equipCount: 0,
    units: [U('陨星', 2)], equips: [], refreshUsed: 0, freeRefresh: 0,
    round: 13, bought: [], upgraded: false, roundsSinceUpgrade: 5, boss: false
  })
  assert.equal(p.action, 'upgrade')
})

test('三合一优先：整备区到 BENCH_STOP_BUY=6 也照买（m02396 三合一有经济又有战力）', () => {
  const p = planRestStep({
    money: 5, level: 5, upgradeCost: null, targetLevel: 5, bench: 6, equipCount: 2,
    units: [U('陨星', 2, { have: 2 })], equips: [], refreshUsed: 0, freeRefresh: 0
  })
  assert.equal(p.action, 'buy')
  assert.equal(p.card.name, '陨星')
  assert.match(p.reason, /凑三合一/)
})

test('盟约内的三合一排前面（m02396：尤其是盟约内的三合一）', () => {
  const p = planRestStep({
    money: 5, level: 5, upgradeCost: null, targetLevel: 5, bench: 5, equipCount: 2,
    units: [U('车尔尼', 2, { have: 2 }), U('陨星', 2, { have: 2 })], equips: [],
    covenants: ['坚守'], covenantOf: (n) => (n === '车尔尼' ? ['坚守'] : ['维多利亚']),
    refreshUsed: 0, freeRefresh: 0
  })
  assert.equal(p.action, 'buy')
  assert.equal(p.card.name, '车尔尼')
  assert.match(p.reason, /盟约内：坚守/)
})

test('没有盟约信息时退回「手上张数多的先合」', () => {
  const p = planRestStep({
    money: 5, level: 5, upgradeCost: null, targetLevel: 5, bench: 6, equipCount: 2,
    units: [U('车尔尼', 3, { have: 2 }), U('陨星', 2, { have: 3 })], equips: [],
    covenants: ['坚守'], refreshUsed: 0, freeRefresh: 0
  })
  assert.equal(p.action, 'buy')
  assert.equal(p.card.name, '陨星')
})
