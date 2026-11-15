import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { pickBuyTarget, loadCovenantMap } from '../lib/covenantplan.js'
import { planRestStep } from '../lib/restplan.js'

// 2026-11-14 20:5x 用户 m07730「为什么每次都不凑盟约」
// 根因：目标盟约取自休整期顶栏，而顶栏只列「已经有人的」盟约 → 目标永远从已有里长出来，
// 结构上凑不进新盟约；本局 4 个可用核心盟约其实开局就定了（data/run-covenants.json）。
// 这组用例锁住「核心盟约进了买卡决策」这条链。

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')

const map = loadCovenantMap()
const ag = ((map.members && map.members['阿戈尔']) || {}).operators || []
assert.ok(ag.length >= 3, '阿戈尔成员表读不到')

// 1) 没给 coreCovenants：两张牌都是计划外、阶数 <4 → 一张都不选（这是旧行为，
//    也是真机里「凑盟约」经常变成 null、退回买便宜货的直接原因）
const cands = [{ name: ag[1], tier: 1, cost: 2 }, { name: '陨星', tier: 1, cost: 1 }]
const noCore = pickBuyTarget(cands, { board: [], bench: [], covenants: [], owned: {}, banned: [], round: 3 })
assert.ok(noCore, '没给核心盟约时也应当有兜底选择（m10875：不能因为没有就不上）')
assert.match(noCore.reason, /兜底/, '兜底卡要标出来是阵容补齐')
assert.ok(noCore.score < 3, '兜底分要明显低于计划内：' + noCore.score)

// 2) 给了核心盟约：同样两张牌，必须选阿戈尔那只
const withCore = pickBuyTarget(cands, { board: [], bench: [], covenants: [], coreCovenants: ['阿戈尔'], owned: {}, banned: [], round: 3 })
assert.ok(withCore, '给了核心盟约还选不出来')
assert.equal(withCore.card.name, ag[1])

// 3) 场上已有 2 个阿戈尔 → 这张是「2/3 → 3/3 激活」，理由里要点明
const act = pickBuyTarget(cands, { board: [ag[0], ag[2]], bench: [], covenants: [], coreCovenants: ['阿戈尔'], owned: {}, banned: [], round: 3 })
assert.ok(act && act.card.name === ag[1])
assert.ok(/凑到 3 人激活/.test(act.reason), '没标出激活：' + act.reason)

// 4) 第 1 回合先按盟约拿，而不是买最便宜的
const base = {
  round: 1, money: 4, level: 1, bench: 0, refreshUsed: 0, freeRefresh: 0, upgradeCost: 5, targetLevel: 2,
  bought: [], upgraded: false, equips: [],
  units: [{ name: ag[1], cost: 2, tier: 1, have: 0 }, { name: '陨星', cost: 1, tier: 1, have: 0 }],
}
const r1 = planRestStep({ ...base, prefer: { card: { name: ag[1] }, reason: '盟约缺口' } })
assert.equal(r1.action, 'buy')
assert.equal(r1.card.name, ag[1], '第 1 回合没按盟约买')
assert.ok(/第 1 回合：先按盟约拿/.test(r1.reason))
const r1no = planRestStep({ ...base, prefer: null })
assert.equal(r1no.card.name, '陨星', '没有盟约计划时应退回买便宜的')

// 5) 源码锁：开局落盘 + 读回 + 三个调用点
const runSrc = read('lib/run.js')
assert.ok(runSrc.includes("writeFileSync(join(HERE, '..', 'data', 'run-covenants.json')"), 'run.js 没落盘核心盟约')
assert.ok(runSrc.includes('本局核心盟约（') && runSrc.includes('组）落盘：'), 'run.js 没记落盘日志')

const driveSrc = read('lib/drive.js')
assert.ok(driveSrc.includes("'../data/run-covenants.json'"), 'drive.js 没读 run-covenants.json')
assert.ok(driveSrc.includes('→ 并入买卡目标'), 'drive.js 没把核心盟约并入目标')
assert.ok(driveSrc.includes('coreCovenants: Array.isArray(opts.coreCovenants) ? opts.coreCovenants : [],'), 'covenantCtx 没带 coreCovenants')
assert.ok(driveSrc.includes('coreCovenants: cc.coreCovenants ||'), 'pickBuyTarget 没收到 coreCovenants')

const covSrc = read('lib/covenantplan.js')
assert.ok(covSrc.includes('const cores = new Set('), 'covenantplan 没解析 coreCovenants')
assert.ok(covSrc.includes('|| cores.has(c))'), 'inPlan 没把核心盟约算进来')
assert.ok(covSrc.includes('if (cores.has(cov)) {'), '核心盟约没加权')

const restSrc = read('lib/restplan.js')
assert.ok(restSrc.includes('第 1 回合：先按盟约拿'), 'restplan 第 1 回合没走盟约优先')

// 6) 2026-11-14 21:4x 真机：enterRun 报「核心盟约落盘失败：left is not defined」
//    —— left/right 在 OCR 的 try 里声明，落盘那段在另一个 try，出了作用域。
//    结果 data/run-covenants.json 没写出来，核心盟约加权永远不生效。
assert.ok(runSrc.includes('let coresHere = []'), '缺外层 coresHere 变量')
assert.ok(runSrc.includes("coresHere = (picked === 'B' ? right : left)"), 'coresHere 没在 OCR 的 try 里赋值')
assert.ok(runSrc.includes('const coresToSave = coresHere.slice()'), '落盘还在用 try 里的 left/right')


// 2026-11-15 00:5x 用户 m08866「凑出 3 个盟约并叠层」：小盟约只要 2 人就能激活（坚守/精准/迅捷…），
// 以前不在 want/cores 里 → 整张卡判 off-plan 丢掉，「坚守 1/2」永远差最后一个人。
{
  // 场上 砾（不屈 1/2），店里 风丸（不屈）：补上就 2/2 激活，虽然它不在核心/目标盟约里，也该买。
  const r = pickBuyTarget([{ name: '风丸', tier: 1, cost: 2 }], {
    board: ['砾'], bench: [], covenants: ['维多利亚'], coreCovenants: ['维多利亚'], owned: {},
  })
  assert.ok(r && r.card && r.card.name === '风丸', '补人就能激活的小盟约卡被当成杂牌丢掉了')
  assert.match(r.reason, /凑到 2 人激活/)
  // 场上没这个人时，同一张卡仍然算计划外（别把冷门盟约杂牌全买进来）。
  const none = pickBuyTarget([{ name: '风丸', tier: 1, cost: 2 }], { board: [], bench: [], covenants: ['维多利亚'], coreCovenants: ['维多利亚'], owned: {} })
  assert.ok(none && none.card, 'm10875：没有目标盟约时也要有兜底卡（不能因为没有就不买）')
  assert.match(none.reason, /兜底/)
  assert.ok(none.score < 3, '兜底分要低：' + none.score)
}

console.log('covenant-cores 7/7 pass')
