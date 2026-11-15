import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { planRestStep } from '../lib/restplan.js'

const U = (name, cost, extra = {}) => ({ name, cost, slot: 0, x: 100, y: 930, want: 0, have: 0, ...extra })

// 2026-11-14 20:1x 真机（trace-night-2026-11-14T11-55-01 R2~R5）：钱全花在「升级费 + 两次刷新」上，
// 剩 2 块买不起 3 块的卡 → 每回合只上 0~1 人、空着 4~5 个名额，血量 26→24→21→19。
// 用户 m06708「一回合最多刷2次，其他买卡」→ 空名额 ≥2 且有买得起的卡时，不刷新，直接买。

test('空名额 ≥2 + 有买得起的卡 → 不刷新，直接买最便宜的', () => {
  const p = planRestStep({
    money: 5, level: 2, upgradeCost: 8, targetLevel: 2, bench: 1, equipCount: 0, slotsLeft: 4,
    units: [U('某人', 3, { want: null }), U('别人', 2, { want: null })],
    equips: [], refreshUsed: 0, freeRefresh: 0, bought: []
  })
  assert.equal(p.action, 'buy')
  assert.equal(p.kind, 'unit')
  assert.equal(p.card.name, '别人')
  assert.match(p.reason, /空名额 4 个/)
})

test('空名额只有 1 个 → 保持老行为（刷新）', () => {
  const p = planRestStep({
    money: 5, level: 2, upgradeCost: 8, targetLevel: 2, bench: 1, equipCount: 0, slotsLeft: 1,
    units: [U('某人', 2, { want: null })], equips: [], refreshUsed: 0, freeRefresh: 0, bought: []
  })
  assert.equal(p.action, 'refresh')
})

test('没传 slotsLeft（老调用方）→ 行为不变，刷新', () => {
  const p = planRestStep({
    money: 5, level: 2, upgradeCost: 8, targetLevel: 2, bench: 1, equipCount: 0,
    units: [U('某人', 2, { want: null })], equips: [], refreshUsed: 0, freeRefresh: 0
  })
  assert.equal(p.action, 'refresh')
})

test('清单/对子优先：想要的卡还是先买，不被空名额规则抢走', () => {
  const p = planRestStep({
    money: 5, level: 2, upgradeCost: 8, targetLevel: 2, bench: 1, equipCount: 0, slotsLeft: 4,
    units: [U('清单卡', 3, { want: 1 }), U('杂牌', 1, { want: null })],
    equips: [], refreshUsed: 0, freeRefresh: 0, bought: []
  })
  assert.equal(p.action, 'buy')
  assert.equal(p.card.name, '清单卡')
  assert.match(p.reason, /清单|对子/)
})

test('本回合已买到名额上限 → 不再硬买（防止一回合把整备区塞满）', () => {
  const p = planRestStep({
    money: 5, level: 2, upgradeCost: 8, targetLevel: 2, bench: 1, equipCount: 0, slotsLeft: 2,
    units: [U('某人', 2, { want: null })], equips: [], refreshUsed: 0, freeRefresh: 0,
    bought: ['甲', '乙']
  })
  assert.notEqual(p.action, 'buy')
})

test('战斗刚结束读到 battle/tactic 时 autoRest 先等回休整期（源码锁）', () => {
  const src = readFileSync(fileURLToPath(new URL('../lib/drive.js', import.meta.url)), 'utf8')
  assert.match(src, /st\.screen === 'battle' \|\| st\.screen === 'warbanner' \|\| st\.screen === 'tactic'/)
  assert.match(src, /上一回合没收干净（先前读到 /)
  assert.match(src, /战术决策（进休整期前）/)
})

test('空名额 ≥2：有盟约最优解时先买它，不买最便宜的杂牌（用户 m08866 3 盟约）', () => {
  const p = planRestStep({
    money: 6, level: 2, upgradeCost: 8, targetLevel: 2, bench: 1, equipCount: 0, slotsLeft: 3,
    units: [U('杂牌', 2, { want: null }), U('乌啾', 3, { want: null })],
    prefer: { card: { name: '乌啾' }, reason: '正好把【乌萨斯】凑到 3 人激活' },
    equips: [], refreshUsed: 0, freeRefresh: 0, bought: []
  })
  assert.equal(p.action, 'buy')
  assert.equal(p.card.name, '乌啾', '盟约牌优先于便宜杂牌')
  assert.match(p.reason, /凑盟约|优先凑盟约/)
})

// 2026-11-15 04:1x：空名额 ≥2 时先买卡补人，不要先把钱拿去升级（真机 trace 19-52-08 第 2~3 回合：
// 场上 3 人、剩余名额 4，钱 6 拿去升级 Lv2 → 整备区 0 张、布阵 0 个上场）。
test('空名额 ≥2 且买得起卡 → 先买卡，不升级', () => {
  const p = planRestStep({
    money: 10, level: 1, upgradeCost: 5, targetLevel: 2, bench: 1, equipCount: 0, slotsLeft: 4,
    units: [U('角峰', 2, { want: null })], equips: [], refreshUsed: 0, freeRefresh: 0, bought: [],
    upgraded: false, roundsSinceUpgrade: 9, round: 3
  })
  assert.notEqual(p.action, 'upgrade')
})

test('名额用完了（slotsLeft 0）→ 该升级照样升级', () => {
  const p = planRestStep({
    money: 10, level: 1, upgradeCost: 5, targetLevel: 2, bench: 1, equipCount: 0, slotsLeft: 0,
    units: [U('角峰', 2, { want: null })], equips: [], refreshUsed: 0, freeRefresh: 0, bought: [],
    upgraded: false, roundsSinceUpgrade: 9, round: 3
  })
  assert.equal(p.action, 'upgrade')
})
