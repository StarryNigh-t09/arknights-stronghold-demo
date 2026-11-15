import test from 'node:test'
import assert from 'node:assert/strict'
import { planRestStep, shopEntryPlan, judgeUpgrade, reconcileLevel, pickSellCard, BENCH_CAP, BENCH_STOP_BUY } from '../lib/restplan.js'

const U = (name, cost, extra = {}) => ({ name, cost, slot: 0, x: 100, y: 930, want: 0, have: 0, ...extra })

// 2026-11-12 07:2x 用户 m02102「为什么不升级商店，打到第九回合还是1级商店」。
// 回归点：整备区≥6 张时旧代码整段跳过商店阶段，连升级都不判；现在只关买卡。
const base = { level: 1, upgradeCost: 3, targetLevel: 2, equipCount: 0, equips: [], refreshUsed: 0, freeRefresh: 0, round: 4 }

test('整备区 6 张 + benchBlock：照样按节奏升级（不被买卡闸门吞掉）', () => {
  const p = planRestStep({ ...base, money: 5, bench: 6, benchBlock: true, units: [U('陨星', 2)] })
  assert.equal(p.action, 'upgrade')
  assert.match(p.reason, /节奏 Lv1 → Lv2/)
})

test('整备区 6 张 + benchBlock：不到升级时点就收工，不买/不刷/不冻', () => {
  const p = planRestStep({ ...base, money: 5, level: 2, targetLevel: 2, bench: 6, benchBlock: true, units: [U('陨星', 2), U('卡达', 1)] })
  assert.equal(p.action, 'stop')
  assert.match(p.reason, /整备区 \d+ 张|BENCH_STOP_BUY|买卡闸门关着/)
})

test('benchBlock 不误伤装备：升级不了、装备不占整备区 → 仍可买装备', () => {
  const p = planRestStep({ ...base, money: 5, level: 2, targetLevel: 2, bench: 6, benchBlock: true, units: [U('陨星', 2)], equips: [{ name: '随身身份牌', cost: 2, slot: 0, x: 200, y: 930 }] })
  assert.equal(p.action, 'buy')
  assert.equal(p.kind, 'equip')
})

test('整备区没到闸门（5 张）且 benchBlock=false：买卡照旧', () => {
  const p = planRestStep({ ...base, money: 2, level: 2, targetLevel: 2, bench: 5, benchBlock: false, units: [U('陨星', 2)] })
  assert.equal(p.action, 'buy')
  assert.equal(p.kind, 'unit')
})

test('真的满 10 张（bench>=BENCH_CAP）：先卖一张（m02251）', () => {
  const p = planRestStep({ ...base, money: 5, level: 2, targetLevel: 2, bench: BENCH_CAP, benchBlock: true, units: [U('陨星', 2)] })
  // m02251「满员了先卖卡」：不再直接 stop，先卖一张腾格子。
  assert.equal(p.action, 'sell')
  assert.match(p.reason, /整备区满/)
})
// ── 入口闸门（autoRest 里真正决定「要不要为了升级去展开商店」的那一步）──
const g = (o = {}) => shopEntryPlan({ money: 5, level: 1, targetLevel: 2, upgradeCost: 3, bench: 10, ...o })

test('shopEntryPlan：整备区 10 张 + 钱够升级 → 仍要展开商店（这就是修掉的 bug）', () => {
  const r = g()
  assert.equal(r.benchBlock, true)
  assert.equal(r.mayUpgrade, true)
  assert.equal(r.enterShop, true)
})

test('shopEntryPlan：整备区 10 张 + 钱不够升级 → 不展开商店，省时间', () => {
  const r = g({ money: 1 })
  assert.equal(r.benchBlock, true)
  assert.equal(r.mayUpgrade, false)
  assert.equal(r.enterShop, false)
})

test('shopEntryPlan：整备区 10 张 + 已到本回合目标等级 → 不展开商店', () => {
  const r = g({ level: 3, targetLevel: 3 })
  assert.equal(r.mayUpgrade, false)
  assert.equal(r.enterShop, false)
})

test('shopEntryPlan：升级费读不到时，只要有钱就还去判一次（不在入口判死）', () => {
  const r = g({ upgradeCost: null, money: 2 })
  assert.equal(r.mayUpgrade, true)
  assert.equal(r.enterShop, true)
})

test('shopEntryPlan：整备区没到闸门（5 张）→ 正常展开，不拦买卡', () => {
  const r = g({ bench: 5, level: 3, targetLevel: 3, money: 0 })
  assert.equal(r.benchBlock, false)
  assert.equal(r.enterShop, true)
})

test('shopEntryPlan：forceBuy 时不拦买卡', () => {
  const r = g({ forceBuy: true })
  assert.equal(r.benchBlock, false)
  assert.equal(r.enterShop, true)
})

test('shopEntryPlan：闸门阈值就是 10（BENCH_STOP_BUY，2026-11-15 07:0x 由 8 调到 10：买满整备区好三合一）', () => {
  assert.equal(BENCH_STOP_BUY, 10)
  assert.equal(g({ bench: 10 }).benchBlock, true)
  assert.equal(g({ bench: 9 }).benchBlock, false)
  assert.equal(g({ bench: 5 }).benchBlock, false)
})
// ── 升级判据 / 等级对账 / 卖谁（m02102 + m02251，全部纯函数）──
const J = (b, a) => judgeUpgrade(b, a)

test('judgeUpgrade：升级费变小不算升级（这就是把 Lv1 记成 Lv3 的老 bug）', () => {
  const r = J({ cost: 2, x: 337, cards: 3, level: 1 }, { cost: 1, x: 337, cards: 3, level: 1 })
  assert.equal(r.ok, false)
  assert.equal(r.costDropped, true)
})

test('judgeUpgrade：升级费变高算升级', () => {
  const r = J({ cost: 3, x: 337, cards: 3, level: 1 }, { cost: 4, x: 337, cards: 3, level: 1 })
  assert.equal(r.ok, true)
  assert.match(r.signals.join(), /升级费 3→4/)
})

test('judgeUpgrade：LEVEL 读数变高算升级（用户说「UI 的 LEVEL 数字」）', () => {
  const r = J({ cost: 4, x: 337, cards: 3, level: 2 }, { cost: 4, x: 337, cards: 4, level: 3 })
  assert.equal(r.ok, true)
  assert.match(r.signals.join(), /LEVEL Lv2→3/)
  assert.equal(r.level, 3)
})

test('judgeUpgrade：商店格数变多 / 面板左移都算（没有 LEVEL 读数时也能判）', () => {
  assert.equal(J({ cards: 3 }, { cards: 4 }).ok, true)
  // 2026-11-12 真机：真升级是整排左移一格（240px），337→97 才算数
  assert.equal(J({ x: 337 }, { x: 97 }).ok, true)
  assert.equal(J({ x: 337, cards: 3 }, { x: 337, cards: 3 }).ok, false)
})

test('judgeUpgrade：面板只抖 2px 不算升级（2026-11-12 12:13 真机误报）', () => {
  // 第一次点击只选中「确认升级」，钱没动、等级没变，升级点从 337 抖到 335
  const r = J({ level: 2, cost: 8, x: 337, cards: 4, money: 10 }, { level: 2, cost: 8, x: 335, cards: 4, money: 10 })
  assert.equal(r.ok, false)
  assert.equal(r.signals.length, 0)
})

test('judgeUpgrade：升级费只降不升不算升级（用户 m01970：每回合升级费都会减少）', () => {
  // 2026-11-12 用户原话「1每过一个回合升级费用都会减少」—— 所以「升级费变了」不能当通用信号，
  // 只有变高（升级后重置回基准）才算。单纯变低是回合流逝，钱和 LEVEL 都没动。
  const r = J({ level: 2, cost: 8, x: 337, cards: 4, money: 7 }, { level: 2, cost: 2, x: 337, cards: 4, money: 7 })
  assert.equal(r.ok, false)
  assert.equal(r.signals.length, 0)
  assert.equal(r.costDropped, true)
})

test('reconcileLevel：OCR 和点击次数对得上就采信 OCR', () => {
  const r = reconcileLevel({ tracked: 3, ocr: 3, clicks: 2 })
  assert.equal(r.level, 3)
  assert.equal(r.agreed, 'both')
})

test('reconcileLevel：OCR 和自己记的对不上 → 按自己记的走，并留 note', () => {
  const r = reconcileLevel({ tracked: 3, ocr: 1, clicks: 2 })
  assert.equal(r.level, 3)
  assert.equal(r.notes.length, 1)
})

test('reconcileLevel：自己记的和点击次数也不一致 → 标出来（可疑）', () => {
  const r = reconcileLevel({ tracked: 5, ocr: null, clicks: 2 })
  assert.equal(r.level, 5)
  assert.match(r.notes.join(), /不一致/)
})

test('pickSellCard：不卖能凑三连的、不卖清单想要的，先卖最低阶最便宜', () => {
  const c = pickSellCard([
    { name: '三连', tier: 1, cost: 1, have: 2 },
    { name: '想要的', tier: 2, cost: 1, want: 0 },
    { name: '过渡甲', tier: 3, cost: 2 },
    { name: '过渡乙', tier: 3, cost: 1 }
  ], { covenants: [] })
  assert.equal(c.name, '过渡乙')
})

test('pickSellCard：全是宝贝也得卖一张（池子空就退回 keep）', () => {
  const c = pickSellCard([{ name: '唯一', tier: 1, cost: 1, have: 3 }])
  assert.equal(c.name, '唯一')
})

// 2026-11-12 真机（_upgrade-test.mjs）：升级成功后钱正好少一个升级费 —— 这是最硬的一条信号。
// 第 3 回合就是只靠「LEVEL Lv1→2」（动画里的误读）判成功，账本虚高一级，之后每次升级都点空。
test('judgeUpgrade：扣钱正好等于升级费 → 算升级成功', () => {
  const v = judgeUpgrade({ level: null, cost: 2, x: 578, cards: 4, money: 5 }, { cost: 8, x: 337, cards: 5, money: 3 })
  assert.equal(v.ok, true)
  assert.ok(v.signals.some((s) => s.includes('扣钱')), v.signals.join(' | '))
  assert.equal(v.costDropped, false)
})

test('judgeUpgrade：只扣了钱但金额不等于升级费 → 不算', () => {
  const v = judgeUpgrade({ level: null, cost: 2, x: 578, cards: 4, money: 5 }, { cost: 2, x: 578, cards: 4, money: 1 })
  assert.equal(v.ok, false)
})

test('judgeUpgrade：升级费变小（旧 bug 的假成功）在没有其它信号时不算', () => {
  const v = judgeUpgrade({ level: 1, cost: 3, x: 578, cards: 4, money: 6 }, { level: 1, cost: 2, x: 578, cards: 4, money: 6 })
  assert.equal(v.ok, false)
  assert.equal(v.costDropped, true)
})
