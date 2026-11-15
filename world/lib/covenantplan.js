/**
 * covenantplan.js —— 按盟约凑人。
 *
 * 为什么要有这个文件（用户 m02613–m02617）：
 *   ①「没凑盟约，这模式战力关键就是凑盟约叠层」→ 买卡的第一判据不是阶数、不是便宜，是「这只能不能把某个盟约凑到激活」。
 *   ②「你识别场上干员，自己根据盟约加，你读图不一定准」→ 不 OCR 顶栏层数，靠我们自己记账的名单
 *     （这一局上过场的人 + 整备区的人）去数每个盟约当前几个人。
 *   ③「场上都是低阶干员、整备区有高阶的要换上」→ 换人时先比盟约贡献，再比阶数。
 *
 * 数据出处（都是本地静态表，不联网、不点屏幕）：
 *   world/data/covenants-map.json  —— 26 个盟约的 activateCount（核心 3 / 附加 1~3）
 *                                     + 141 个干员的 {tier, core[], extra[], traits}
 *   阶数 tier：1/2/3 = 卡面 Ⅰ/Ⅱ/Ⅲ，4 以上是精英后的更高阶。
 *
 * 纯函数为主，只有 loadCovenantMap 读一次盘（缓存）。不 import 任何 adb/游戏相关模块。
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { roleGroup } from './gamemap.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const MAP_PATH = join(HERE, '..', 'data', 'covenants-map.json')

let _cache = null

/** 读盟约表（缓存）。给的路径不存在时返回空表，调用方自己降级。 */
export function loadCovenantMap(path = MAP_PATH) {
  if (_cache && path === MAP_PATH) return _cache
  let out = { covenants: [], operators: {}, members: {}, ok: false }
  try {
    if (existsSync(path)) {
      const raw = JSON.parse(readFileSync(path, 'utf8'))
      out = {
        covenants: Array.isArray(raw.covenants) ? raw.covenants : [],
        operators: raw.operators && typeof raw.operators === 'object' ? raw.operators : {},
        members: raw.members && typeof raw.members === 'object' ? raw.members : {},
        ok: true,
      }
    }
  } catch { /* 读不到就空表，函数全走降级分支 */ }
  if (path === MAP_PATH) _cache = out
  return out
}

/** 每个盟约要几个人才激活（核心 3，附加看表里的 activateCount，实测 1/2/3 都有）。 */
export function covenantNeed(cov, map = loadCovenantMap()) {
  const c = (map.covenants || []).find((x) => x && x.name === cov)
  if (c && Number(c.activateCount) > 0) return Number(c.activateCount)
  const m = (map.members || {})[cov]
  if (m && Number(m.activateCount) > 0) return Number(m.activateCount)
  return 3
}

/** 某个干员归属哪些盟约：core + extra 合起来（去重、去掉空串）。 */
export function covenantsOf(name, map = loadCovenantMap()) {
  const op = (map.operators || {})[name]
  if (!op) return []
  const all = []
  for (const c of [].concat(op.core || [], op.extra || [])) {
    const s = String(c || '').trim()
    if (s && !all.includes(s)) all.push(s)
  }
  return all
}

/** 阶数（1=Ⅰ 2=Ⅱ 3=Ⅲ；认不出给 0）。 */
export function tierOf(name, map = loadCovenantMap()) {
  const op = (map.operators || {})[name]
  return op ? Number(op.tier) || 0 : 0
}

/** 这只干员是不是「叠层核心」（traits 里出现层数/叠加字样）。 */
export function isStacker(name, map = loadCovenantMap()) {
  const op = (map.operators || {})[name]
  if (!op || !op.traits) return false
  const txt = JSON.stringify(op.traits)
  return /层数|叠加|持续叠加/.test(txt)
}

/**
 * 数一遍名单里每个盟约现有几个人。
 * @param {string[]} names 场上 + 整备区的干员名（我们自己记账的，不是 OCR 的）
 * @returns {Array<{name:string, need:number, count:number, members:string[], active:boolean, missing:number}>}
 */
export function covenantCounts(names, map = loadCovenantMap()) {
  const list = (names || []).filter((n) => typeof n === 'string' && n.trim())
  const acc = new Map()
  for (const n of list) {
    for (const cov of covenantsOf(n, map)) {
      if (!acc.has(cov)) acc.set(cov, [])
      const arr = acc.get(cov)
      if (!arr.includes(n)) arr.push(n)   // 同名同盟约只算一个人
    }
  }
  const all = new Set([...(map.covenants || []).map((c) => c.name), ...acc.keys()])
  const out = []
  for (const cov of all) {
    const members = acc.get(cov) || []
    const need = covenantNeed(cov, map)
    out.push({
      name: cov,
      need,
      count: members.length,
      members,
      active: members.length >= need,
      missing: Math.max(0, need - members.length),
    })
  }
  // 差得最少的排前面：调用方拿 [0] 就是「下一只最该补的盟约」
  out.sort((a, b) => a.missing - b.missing || b.count - a.count || a.name.localeCompare(b.name, 'zh'))
  return out
}

/**
 * 买卡排序（用户口径：凑盟约 > 叠层 > 阶数 > 便宜）。
 *
 * @param {Array<{name:string, tier?:number, cost?:number}>} cands 店里买得起的候选
 * @param {object} ctx
 * @param {string[]} [ctx.board]     场上干员名（自己记的）
 * @param {string[]} [ctx.bench]     整备区干员名
 * @param {string[]} [ctx.covenants] 本局在叠的盟约（顶栏读到的名字，只用来加权，不要求精确）
 * @param {Record<string,number>} [ctx.owned] 同名已有几张（三合一时允许再买）
 * @param {string[]} [ctx.banned]    本局禁用干员（买了也上不了场）
 * @returns {{card:object, score:number, reason:string}|null}
 */
// 2026-11-13 森空岛社区攻略（world/docs/guide-skland-2026-11-13.md，160 篇正文统计）里
// 出现最多的通用核心干员：空弦 93 篇、霍尔海雅 87、华法琳 61、云迹 51、承曦格雷伊 46、纯烬艾雅法拉 41。
// 这些干员覆盖多条盟约、当倍率堆的性价比高，买卡时给一点点加成（不压过「正好凑齐激活」的 6 分）。
// 2026-11-13 18:3x（用户 m07228）：凑盟约的优先级 —— 先大盟约（核心），再输出类/经济类小盟约
// （精准、奥术、灵巧、奇迹…），最后防御类。特殊玩法另论，这里不建模。
const CORE_COV = new Set(['乌萨斯','伊比利亚','莱塔尼亚','炎','阿戈尔','叙拉古','谢拉格','维多利亚','萨尔贡','卡西米尔'])
const OFFENSE_ECON_COV = new Set(['精准','奥术','灵巧','奇迹','迅捷','助力','投资人','远见'])
const DEFENSE_COV = new Set(['坚守','不屈','调和','协防干员','独行','聚合','突袭','绝技'])
// 2026-11-13 18:3x（用户 m07277）：主盟约只认这六个 —— 叙拉古、乌萨斯、莱塔尼亚、维多利亚、炎、谢拉格。
// 其余核心（伊比利亚、萨尔贡、卡西米尔、阿戈尔）「要么难要么就弱」，开局不选、买卡也不为它们凑。
export const PRIMARY_CORES = new Set(['叙拉古', '乌萨斯', '莱塔尼亚', '维多利亚', '炎', '谢拉格'])
/** 输出羁绊（用户 m03497：「优先凑输出羁绊」—— 奥术、精准）。 */
export const OUTPUT_COVS = new Set(['奥术', '精准'])

/**
 * 本局的主盟约：已经凑得最多的那个主盟约（用户 m03497「主要盟约像乌萨斯这种只要组一个就行」）。
 * 一个都不在主盟约里就返回空串，调用方退回旧口径（所有目标盟约平权）。
 */
export function mainCovenantOf(names, map = loadCovenantMap(), prefer = []) {
  const want = new Set((Array.isArray(prefer) ? prefer : []).map((x) => String(x || '').trim()).filter(Boolean))
  const list = covenantCounts(Array.isArray(names) ? names.filter(Boolean) : [], map).filter((c) => PRIMARY_CORES.has(c.name))
  // 有目标盟约时先只在目标里挑（用户只说「像乌萨斯这种只要组一个就行」= 在选定的里面挑一个）
  const pool = want.size ? list.filter((c) => want.has(c.name)) : list
  const use = pool.length ? pool : list
  let best = null
  for (const c of use) if (!best || c.count > best.count) best = c
  return best ? best.name : ''
}

export function covenantRank(name) {
  const n = String(name || '')
  if (PRIMARY_CORES.has(n)) return 3
  if (CORE_COV.has(n)) return 0.4
  if (OFFENSE_ECON_COV.has(n)) return 2
  if (DEFENSE_COV.has(n)) return 1
  return 2
}
export function covenantWeight(name) {
  const r = covenantRank(name)
  return r >= 3 ? 1.45 : r === 2 ? 1.0 : r <= 0.5 ? 0.3 : 0.55
}
const GUIDE_CORE = new Set(['空弦', '霍尔海雅', '华法琳', '云迹', '承曦格雷伊', '纯烬艾雅法拉'])

export function pickBuyTarget(cands, ctx = {}) {
  const map = ctx.map || loadCovenantMap()
  const board = Array.isArray(ctx.board) ? ctx.board.filter(Boolean) : []
  const bench = Array.isArray(ctx.bench) ? ctx.bench.filter(Boolean) : []
  const have = board.concat(bench)
  const want = new Set((ctx.covenants || []).map((s) => String(s || '').trim()).filter(Boolean))
  const owned = ctx.owned || {}
  // 2026-11-14 20:5x（用户 m07730「每次都不凑盟约」）：本局开局选定的核心盟约（4 家）。
  // 顶栏只列已经有人的盟约，光靠它永远凑不进新盟约；这 4 家才是本局能买到的人。
  const cores = new Set((Array.isArray(ctx.coreCovenants) ? ctx.coreCovenants : []).map((x) => String(x || '').trim()).filter(Boolean))
  const banned = new Set((ctx.banned || []).map((s) => String(s || '').trim()).filter(Boolean))
  // 开局扫到的「本局禁用干员」是按盟约记的（头像是半身像，认不出名字）：某个盟约被禁得越多，
  // 这个盟约就越难凑齐 → 整个盟约的权重按禁用量往下压（用户 m02645）。
  const banCov = new Map(
    (Array.isArray(ctx.bannedCovenants) ? ctx.bannedCovenants : [])
      .filter((g) => g && g.covenant)
      .map((g) => [String(g.covenant).trim(), Math.max(0, Number(g.count) || 0)]),
  )
  const counts = new Map(covenantCounts(have, map).map((c) => [c.name, c]))
  // 2026-11-14 11:4x 用户 m03497：只主攻一个盟约（摊大饼等于谁都凑不齐），输出羁绊（奥术/精准）优先。
  const mainCov = String(ctx.mainCovenant || '') || mainCovenantOf(have, map, [...want])
  const lateRound = Number(ctx.round) >= 8

  // 2026-11-14 12:1x 用户 m03796「不要买计划之外的卡」：盟约既不在目标里、也不是输出羁绊、
  // 也不在凑三合一/对子的路上、阶数还不高（<4）→ 直接不买（以前只降权，结果整备区塞满杂牌）。
  const offPlan = []
  let best = null
  for (const card of cands || []) {
    const name = String((card && card.name) || '').trim()
    if (!name) continue
    if (banned.has(name)) continue
    const copies = Number(owned[name]) || have.filter((n) => n === name).length
    // 2026-11-14 10:0x 修正（根因：40+ 回合 0 次三合一）：
    // 旧写法 `copies >= 1 && copies !== 2` 只允许「已有 2 张时买第 3 张」，
    // 可「已有 1 张时不许买第 2 张」→ 永远凑不到 2 张 → 三合一在结构上不可能发生。
    // 现在允许买第 2 张（凑对子），第 3 张给高分；3 张以上不买（同名同阶 3 张已合成升阶）。
    if (copies >= 3) continue
    const covs = covenantsOf(name, map)
    const tier = Number(card.tier) || tierOf(name, map)
    const cost = Number(card.cost)
    // 2026-11-15 00:5x（用户 m08866「凑出 3 个盟约并叠层」）：小盟约只要 2 人就能激活（坚守/精准/迅捷…），
    // 以前它们不在 want/cores 里 → 整张卡被判 off-plan 直接丢掉，于是「坚守 1/2」永远差最后一个人。
    // 现在「再补一只就能激活」的卡也算计划内。
    const wouldComplete = covs.some((cov) => {
      const rec = counts.get(cov)
      const need = rec ? rec.need : covenantNeed(cov, map)
      const now = rec ? rec.count : 0
      return now + 1 === need
    })
    const inPlan = covs.some((c) => want.has(c) || OUTPUT_COVS.has(c) || cores.has(c)) || wouldComplete
    // 后期（8 回合起）1 阶且不在计划里的牌不买：整备区留给换人素材和盟约牌（用户 m03497「后期要减少低阶干员」）。
    // 2026-11-15 07:0x（用户 m10875「让你抄攻略是让你根据阵容补齐的，不是硬抄没有就不上」）：
    // 以前「不在计划盟约 + 1 阶 + 后期」直接不买 → 店里一张目标盟约都没有就整回合不买卡，
    // 整备区空着，下一回合无牌可上（真机 R4：「整备区剩 0 张」「布阵：上场 0 个」）。
    // 现在改成「降分照买」：杂牌只值很少分，但别的卡都不够好时它照样能进整备区当换人/三合一素材。
    const offPlanCard = !inPlan && copies < 1
    if (offPlanCard) offPlan.push(name)
    let score = 0
    const bits = []
    let completes = false
    if (wouldComplete && !covs.some((c) => want.has(c) || cores.has(c))) score += 1.2
    for (const cov of covs) {
      const rec = counts.get(cov)
      const need = rec ? rec.need : covenantNeed(cov, map)
      const now = rec ? rec.count : 0
      const inTarget = want.size ? want.has(cov) : true
      // m05478「补齐盟约是看你的目标盟约」：目标盟约之外的卡只值 0.12 分，
      // 只有「店里一张目标盟约都没有」时才轮得到它（以前是 0.45，会把冷门盟约的卡买进来）。
      let w = inTarget ? 1 : (want.size ? 0.12 : 1)
      w *= covenantWeight(cov)
      // 只有「没给定目标盟约、靠本局进度推断」时才压非主盟约；OCR 已经给了目标清单时不要再双重降权
      if (!want.size && mainCov && cov !== mainCov && !OUTPUT_COVS.has(cov)) w *= 0.45
      if (OUTPUT_COVS.has(cov)) w *= 1.35
      const bc = banCov.get(cov) || 0
      if (bc > 0) w *= Math.max(0.3, 1 - 0.18 * bc)
      // 2026-11-14 23:1x（用户 m08805「照着别人的攻略流程走，不要自己凑盟约了」）：
      // 再乘一层攻略热度权重（data/guide-covenant-rank.json，160 篇统计）。
      // 同样是「正好凑到 N 人」，攻略热门盟约（伊比利亚/莱塔尼亚、绝技/精准）要排在冷门前头。
      const gw = ctx.guideWeight && Object.prototype.hasOwnProperty.call(ctx.guideWeight, cov) ? Number(ctx.guideWeight[cov]) : NaN
      if (Number.isFinite(gw) && gw > 0) w *= gw
      if (now + 1 === need) {
        // 2026-11-15 01:2x（用户 m08866「凑出 3 个盟约」）：小盟约不在核心目标里，w 会被压到 0.12，
        // 「补上就激活」只剩约 0.7 分 → 抢不过叠层核心/阶数，卡片永远买不进来。给激活一个地板 0.7。
        score += 6 * Math.max(w, 0.7)
        completes = true
        bits.push('正好把【' + cov + '】凑到 ' + need + ' 人激活')
      } else if (now >= need) {
        score += 2 * w
        bits.push('【' + cov + '】已激活，继续叠')
      } else if (now > 0) {
        // 2026-11-15 01:5x：按「离激活还差多少」加权 —— 2/3 比 1/3 值钱，逼着往同一个盟约里堆人。
        // 真机 trace 16-56-05 第 5 回合：场上 5 人摊在 6 个盟约上（奥术1/2 坚守1/2 迅捷1/2 谢拉格1/3 叙拉古1/3 伊比利亚1/3），一个都激活不了。
        score += (2 + 1.5 * (now / need)) * w
        bits.push('【' + cov + '】' + now + '/' + need + ' 再补一只')
      } else {
        // 已经摊了 3 个以上半成品盟约时别再开新的（开新的等于把已有进度稀释掉）。
        const partials = [...counts.values()].filter((c) => c.count > 0 && c.count < c.need).length
        score += 0.6 * w * (partials >= 3 ? 0.35 : 1)
      }
      // 核心盟约 3 人激活 / 6 人进阶（docs/covenants-规程.md §0.5）。核心成员每补一个都比附加盟约更值钱，
      // 尤其「2/3 → 3/3」这一张，直接解锁整队的核心效果。
      if (cores.has(cov)) {
        if (now + 1 === need) score += 2.5 * w
        else if (now > 0) score += 2.0 * w
        else score += 1.2 * w
      }
    }
    if (isStacker(name, map)) { score += 1.2; bits.push('叠层核心') }
    // 2026-11-13 15:3x 用户 m06639「可以抄攻略的作业，但要注意每局不同的干员禁用」：
    // 攻略核心干员的盟约被禁得多（≥4 张）就不再加分，只记一笔，免得硬凑凑不齐的盟约。
    const banMax = covs.length ? Math.max(...covs.map((cv) => banCov.get(cv) || 0)) : 0
    if (GUIDE_CORE.has(name)) {
      if (banMax >= 4) bits.push('攻略核心但本局被禁 ' + banMax + ' 张')
      else { score += 1.5; bits.push('社区高频核心') }
    }
    score += 0.8 * tier
    if (Number.isFinite(cost)) score -= 0.15 * cost
    if (copies === 2) { score += 5.0; bits.push('已有 2 张，这张立刻三合一升阶（额外经济+高阶卡）') }
    else if (copies === 1) { score += 1.5; bits.push('已有 1 张，买第 2 张凑三合一') }
    // 后期减少低阶干员（用户 m03497）：8 回合起，明确不为凑盟约的 1 阶卡扣分，别把整备区塞满杂牌。
    if (lateRound && tier <= 1 && !completes) { score -= 1.5; bits.push('后期：1 阶且不凑盟约 → 扣分') }
    // 计划内优先：兜底卡能买，但别抢在凑盟约/核心前面（真机 m10875「根据阵容补齐」不是「有就乱买」）。
    if (inPlan) score += 0.8
    if (offPlanCard) {
      // 兜底分：阶数越高越值钱（高阶杂牌上场也比低阶扛得住），对子/三合一的加分在上面已经算过。
      score += 0.25 + 0.35 * tier
      bits.push('阵容补齐/兜底（不在目标盟约里）')
    }
    const cand = { card, score, reason: (bits.length ? bits.join('、') : '没盟约加成') + '；' + tier + ' 阶' + (Number.isFinite(cost) ? '/' + cost + ' 块' : '') }
    if (!best || cand.score > best.score) best = cand
  }
  if (best) best.offPlan = offPlan
  return best
}

/**
 * 该卖掉谁（用户 m03796「台下不用的干员就卖掉」）。
 * 卖的顺序：不在计划盟约里的先卖 → 阶数低的先卖 → 左边（买得早）的先卖。
 * 对子素材（同名 ≥2 张）一律不动：那是凑三合一的料。
 * @param {object} ctx
 * @param {Array<{name:string}>} ctx.bench 整备区（按甲板 x 升序，index 就是甲板序）
 * @param {Array<{name:string}>} [ctx.board] 场上
 * @param {string[]} [ctx.covenants] 目标盟约
 * @returns {Array<{index:number,name:string,tier:number,score:number,reason:string}>}
 */
export function pickSellChips(ctx = {}) {
  const map = ctx.map || loadCovenantMap()
  const want = new Set((ctx.covenants || []).map((s) => String(s || '').trim()).filter(Boolean))
  const bench = (Array.isArray(ctx.bench) ? ctx.bench : []).filter((x) => x && x.name)
  const board = (Array.isArray(ctx.board) ? ctx.board : []).filter((x) => x && x.name)
  const qty = new Map()
  for (const n of board.map((b) => b.name).concat(bench.map((b) => b.name))) qty.set(n, (qty.get(n) || 0) + 1)
  const boardTiers = board.map((b) => tierOf(b.name, map)).filter((v) => v > 0)
  const minBoard = boardTiers.length ? Math.min.apply(null, boardTiers) : 0
  const rows = []
  bench.forEach((b, i) => {
    const n = qty.get(b.name) || 1
    if (n >= 2) return
    const covs = covenantsOf(b.name, map)
    const inPlan = covs.some((c) => want.has(c) || OUTPUT_COVS.has(c))
    const tier = tierOf(b.name, map)
    // 2026-11-15 00:0x（用户 m08866「要凑 3 个盟约并叠层」）：计划内的牌一律不卖。
    // 原来「计划内但阶不高就卖」，真机 trace-night-2026-11-14T15-50-51 里刚买的 1 阶盟约牌
    // 烈夏 被同一回合卖掉（买 烈夏 → 卖 烈夏 149,898），盟约永远凑不齐。
    if (inPlan) return
    let score = 0
    if (!inPlan) score += 3
    score += Math.max(0, 4 - tier)
    if (minBoard && tier <= minBoard) score += 1
    rows.push({
      index: i, name: b.name, tier, score,
      reason: (inPlan ? '计划内但阶不高' : '不在计划盟约') + '、' + tier + ' 阶',
    })
  })
  rows.sort((a, b) => b.score - a.score || a.tier - b.tier || a.index - b.index)
  return rows
}

/**
 * 换人：整备区谁能上、场上谁该换下来（用户 m02613「整备区有高阶的要换上」）。
 *
 * 挑选顺序：盟约贡献高的先上；要下来的那个人先挑「不在本局盟约里、阶数又低」的。
 * @param {object} ctx
 * @param {Array<{name:string, index?:number}>} ctx.bench 整备区（按甲板 x 升序）
 * @param {Array<{name:string, px?:number[]}>} ctx.board 场上（按上场先后，与 occupiedPx 同序）
 * @param {string[]} [ctx.covenants]
 * @returns {{add:object, addIndex:number, drop:object|null, dropIndex:number, reason:string}|null}
 */
export function pickSwap(ctx = {}) {
  const map = ctx.map || loadCovenantMap()
  const bench = (ctx.bench || []).filter((x) => x && x.name)
  const board = (ctx.board || []).filter((x) => x && x.name)
  if (!bench.length) return null
  const want = new Set((ctx.covenants || []).map((s) => String(s || '').trim()).filter(Boolean))
  const boardNames = board.map((b) => b.name)
  const counts = new Map(covenantCounts(boardNames.concat(bench.map((b) => b.name)), map).map((c) => [c.name, c]))
  const mainCov = String(ctx.mainCovenant || '') || mainCovenantOf(boardNames, map, [...want])

  const gainOf = (name, baseNames) => {
    const covs = covenantsOf(name, map)
    let s = 0
    for (const cov of covs) {
      const rec = counts.get(cov)
      const need = rec ? rec.need : covenantNeed(cov, map)
      const now = (rec ? rec.members : []).filter((n) => baseNames.includes(n)).length
      let w = (want.size ? (want.has(cov) ? 1 : 0.12) : 1) * covenantWeight(cov)
      // 只有「没给定目标盟约、靠本局进度推断」时才压非主盟约；OCR 已经给了目标清单时不要再双重降权
      if (!want.size && mainCov && cov !== mainCov && !OUTPUT_COVS.has(cov)) w *= 0.45
      if (OUTPUT_COVS.has(cov)) w *= 1.35
      if (now + 1 === need) s += 6 * w
      else if (now >= need) s += 1.5 * w
      else if (now > 0) s += 3 * w
      else s += 0.5 * w
    }
    if (isStacker(name, map)) s += 1.2
    // 2026-11-15 00:1x（用户 m08866「台下的高阶干员怎么就不上呢」）：名额只剩 1~2 个时
    // 甲板上再多个 1 阶杂牌毫无意义，该先把整备区的高阶干员顶上去（真机 15-56-58 R9：
    // 名额 1 → 上了 1 张认不出名字的 1 阶牌，整备区 3~4 阶的一张没上）。
    const tight = Number(ctx.slotsLeft) >= 0 && Number(ctx.slotsLeft) <= 2
    s += (tight ? 2.4 : 0.8) * tierOf(name, map)
    return s
  }

  let add = null
  let addIndex = -1
  let addScore = -Infinity
  bench.forEach((b, i) => {
    // 场上已经有这只了：再上一只同名对盟约计数没帮助（盟约按「不同的干员名」数人）
    if (boardNames.includes(b.name)) return
    const s = gainOf(b.name, boardNames)
    if (s > addScore) { addScore = s; add = b; addIndex = i }
  })

  let drop = null
  let dropIndex = -1
  let keepScore = Infinity
  let dropTier = 99
  // 2026-11-13 12:0x 用户 m05478「重复干员检测是在场上放满了干员之后再检测」：
  // 场上名额满了才会走到这里（换人），此时场上同名的第二只先下来 —— 同名对盟约计数没贡献。
  const dupNames = new Set(boardNames.filter((n, i) => boardNames.indexOf(n) !== i))
  // 2026-11-13 15:3x 用户 m06639「你用高阶的换掉低阶干员就行了」→ 挑「谁下」时阶数优先，
  // 同阶才比盟约贡献（以前是按盟约留场价值挑，会出现「3 阶换 3 阶」甚至低阶换高阶）。
  // 2026-11-15 03:3x（用户 m08866「凑出 3 个盟约并叠层」）：场上已激活的盟约不许被换人拆掉。
  // 真机 trace 19-10-23 第 8~9 回合：聚合 2/2✓ 刚激活，下一回合就被「低阶优先」换掉了，
  // 结果永远只有一个盟约在亮 —— 激活要叠层，得先让它活着。
  // 只按「场上」算激活（整备区的人还没上场，游戏不给他们算盟约）。
  const boardCounts = new Map(covenantCounts(boardNames, map).map((c) => [c.name, c]))
  const protectActive = (name) => {
    let pen = 0
    for (const cov of covenantsOf(name, map)) {
      const rec = boardCounts.get(cov)
      if (!rec) continue
      const need = rec.need
      const onBoard = rec.members.filter((n) => boardNames.includes(n)).length
      if (onBoard >= need && onBoard - 1 < need) pen += 8
    }
    return pen
  }
  board.forEach((b, i) => {
    // 场上这只的「留场价值」：剔除它以后，它所属盟约里其他已激活的会不会掉激活
    const others = boardNames.filter((n, j) => j !== i)
    const withoutIt = gainOf(b.name, others) - 0.8 * tierOf(b.name, map)
    const pen = dupNames.has(b.name) ? -5 : 0
    const tr = tierOf(b.name, map)
    const val = withoutIt + pen
    const valProtected = val + protectActive(b.name)
    const better = tr < dropTier || (tr === dropTier && valProtected < keepScore)
    if (better) { dropTier = tr; keepScore = valProtected; drop = b; dropIndex = i }
  })

  const addTier = tierOf(add ? add.name : '', map)
  const dupDrop = !!(drop && dupNames.has(drop.name))
  const tierUp = !!(drop && addTier > dropTier)
  // 换上来不划算就别换：重复同名、或阶数真升级、或盟约增益差 ≥1 分，三者有一个就换。
  // 2026-11-14 12:1x 用户 m03497「后期要减少低阶干员」：8 回合起只认「阶数真升级」，
  // 不再允许用同阶/低阶牌靠盟约分挤掉别人（会把场上越换越低阶）。
  const lateRound = Number(ctx.round) >= 8
  // 2026-11-14 22:1x（用户 m08251「直接修了重开，打了好几天了不见进步」）：
  // 原来 8 回合起只认「阶数真升级」，而整备区全是 1~2 阶、场上 2~4 阶 → 一次都换不动，
  // 整备区卡在 6 张（BENCH_STOP_BUY）→ 不买卡 → 连续 0 上场到死（上一局第 12 回合）。
  // 现在同阶也允许换，但要「盟约增益差 ≥ 2」才算划算；降阶仍然禁止（用户 m03497「后期减少低阶干员」）。
  // 2026-11-15 01:0x（用户 m08866「能凑出 3 个盟约并且叠层就可以」）：
  // 这个人一上场就能把一个盟约凑到激活时，就算阶数/分数不划算也要换 ——
  // 真机 trace 16-30-24 第 6~8 回合反复「换人不划算（角峰 1阶 增益 5.2 ≤ 场上最弱 慕斯 1阶 留场 1.9）」，
  // 结果谢拉格一直卡在 2/3，整备区的雪猎/初雪躺着上不去。
  const completesActivation = !!(add && covenantsOf(add.name, map).some((cov) => {
    const rec = counts.get(cov)
    const need = rec ? rec.need : covenantNeed(cov, map)
    const now = (rec ? rec.members : []).filter((n) => boardNames.includes(n)).length
    return now + 1 === need
  }))
  const margin = !!(add && drop) ? addScore - keepScore : -99
  const sameTierGain = !!(drop && add && addTier === dropTier && margin >= 2)
  // 降阶但盟约增益差 ≥ 4 也放行：1 阶凑出激活（+6*w）常常比 2 阶白板值钱，上一局就卡在这条上。
  const bigGain = margin >= 4
  // 2026-11-15 03:4x：这个人一下场，场上某个已激活盟约会掉激活 → 除非这次换人本身能激活另一个，否则不换。
  // （tierUp 升级也要让路：凑 3 个盟约是用户 m08866 的验收标准，升一阶换掉一个激活的盟约不划算。）
  const protectedDrop = !!(drop && protectActive(drop.name) > 0)
  if (!add || !drop
    || (protectedDrop && !completesActivation && !dupDrop)
    || (!dupDrop && !(tierUp || sameTierGain || bigGain || completesActivation || (!lateRound && margin >= 1)))) {
    return { add, addIndex, drop: null, dropIndex: -1, reason: '换人不划算（' + (add ? add.name + ' ' + addTier + '阶' : '无') + ' 增益 ' + addScore.toFixed(1) + ' ≤ 场上最弱 ' + (drop ? drop.name + ' ' + dropTier + '阶 留场 ' + (protectedDrop ? '（这一下去会掉激活的盟约，先留着）' : '') : '') + (Number.isFinite(keepScore) ? keepScore.toFixed(1) : '—') + '）' }
  }
  return {
    add, addIndex, drop, dropIndex,
    reason: '换人：' + add.name + '(' + addTier + '阶/增益' + addScore.toFixed(1) + ') 上 ← ' + (drop ? drop.name + '(' + dropTier + '阶/留场' + keepScore.toFixed(1) + ')' : '无') + ' 下',
  }
}

/**
 * 上台优先序：整备区这几张牌先上谁。
 * 2026-11-15 00:0x（用户 m08866「台下的高阶干员怎么就不上呢」）：
 * 以前 queue 就是甲板从左往右，名额只够 1~2 张时永远只碰最早买到的那几张，
 * 后面买到的高阶/凑盟约的牌一直躺在整备区（trace-night-2026-11-14T15-14-21 里
 * 「按人排位跳过：这 3 张名字全都认不出来」+「名额 0 → 收手」连着好几回合）。
 * 排序口径与 pickSwap 的 gainOf 一致：补激活/凑人数 > 叠层核心 > 阶数高；
 * 认不出名字的排最后（它们只能按池序放，先放它们等于浪费名额）。
 * @param {string[]} names 甲板左→右的名字（认不出给空串）
 * @param {object} ctx {boardNames, covenants, map}
 * @returns {number[]} 原数组下标的优先序
 */
export function benchDeployOrder(names = [], ctx = {}) {
  const map = ctx.map || loadCovenantMap()
  const list = (Array.isArray(names) ? names : []).map((n) => String(n == null ? '' : n).trim())
  const boardNames = (Array.isArray(ctx.boardNames) ? ctx.boardNames : []).map((n) => String(n || '')).filter(Boolean)
  const want = new Set((Array.isArray(ctx.covenants) ? ctx.covenants : []).map((s) => String(s || '').trim()).filter(Boolean))
  const counts = new Map(covenantCounts(boardNames, map).map((c) => [c.name, c]))
  const scoreOf = (name) => {
    if (!name) return -1
    if (boardNames.includes(name)) return -2
    let s = 0
    for (const cov of covenantsOf(name, map)) {
      const rec = counts.get(cov)
      const need = rec ? rec.need : covenantNeed(cov, map)
      const now = rec ? rec.count : 0
      const wBase = (want.size ? (want.has(cov) ? 1 : 0.12) : 1) * covenantWeight(cov)
      let w = wBase
      if (OUTPUT_COVS.has(cov)) w *= 1.35
      // 2026-11-15 01:1x（用户 m08866 要「凑出 3 个盟约」）：小幅小盟约（坚守/精准/迅捷/不屈…2 人激活）不在
      // 核心目标清单里，wBase 会被压到 0.12 →「补上就激活」只有约 0.7 分，抢不过叠层核心(1.2)+阶数(0.8/阶)，
      // 整备区里正好能把小盟约凑到 2 人的牌就永远排最后。给激活优先一个地板 0.7：凑满必 ≥4.2 分。
      if (now + 1 === need) s += 6 * Math.max(wBase, 0.7)
      else if (now >= need) s += 1.5 * w
      else if (now > 0) s += 3 * w
      else s += 0.5 * w
    }
    // 2026-11-15 01:3x：阵容缺口也算上台价值 —— 真机 R9 一波掉 21 血（trace 16-30-24），
    // 整备区躺着医疗/重装却先上了杂牌。场上没医疗先补医疗（+3），阻挡不足 2 个先补近战/重装（+1.6）。
    try {
      const rg = roleGroup(name)
      const healers = boardNames.filter((n) => roleGroup(n) === 0).length
      const blockers = boardNames.filter((n) => roleGroup(n) === 2).length
      if (rg === 0 && healers === 0) s += 3
      if (rg === 2 && blockers < 2) s += 1.6
    } catch { /* 职业表读不到就按纯盟约打分 */ }
    if (isStacker(name, map)) s += 1.2
    s += 0.8 * tierOf(name, map)
    return s
  }
  const rows = list.map((n, i) => ({ i, s: scoreOf(n) }))
  rows.sort((a, b) => (b.s - a.s) || (a.i - b.i))
  return rows.map((r) => r.i)
}

/**
 * 名额满（剩余可放置 0）时的唯一换人手法：撤回场上一个 → 回整备区 → 再正常部署。
 * 用户 m05970「撤回并部署」。那条「把甲板牌拖到已占格」真机反复全灭（牌拎不起来/游戏拒收），已从 drive.js 删掉。
 *
 * @param {object} ctx
 * @param {Array<{name:string,index?:number}>} ctx.bench 整备区（按甲板 x 升序）
 * @param {Array<{name:string,px?:number[]}>} ctx.board 场上
 * @param {string[]} [ctx.covenants] 目标盟约
 * @param {number} [ctx.round]
 * @param {Iterable<string|number[]>} [ctx.occupiedPx] 棋盘实测占格（名册空时兜底）
 * @returns {{drop:{name:string,px:number[]}|null, add:{name:string}|null, reason:string}}
 */
export function planRecallSwap(ctx = {}) {
  const map = ctx.map || loadCovenantMap()
  // 2026-11-15 01:0x：同一回合已经规划过「让谁上场」时，后面的换人不许再选同一个人 ——
  // 真机（trace-night-2026-11-14T16-30-24 第 6 回合）连着换两次都上「角峰」，第二次白撤掉场上的慕斯。
  const avoidAdd = new Set((Array.isArray(ctx.avoidAdd) ? ctx.avoidAdd : []).map((x) => String(x || '')).filter(Boolean))
  const benchAll = (Array.isArray(ctx.bench) ? ctx.bench : []).filter((x) => x && x.name)
  const bench = benchAll.filter((x) => !avoidAdd.has(String(x.name)))
  // 名册里的人都规划过了 → 明确说「不换」，别掉进下面「没有名册」那条盲撤分支。
  if (benchAll.length && !bench.length) return { drop: null, add: null, reason: '本回合要上的人都规划过了，不重复换人' }
  const board = (Array.isArray(ctx.board) ? ctx.board : []).filter((x) => x && x.name)
  if (bench.length && board.length) {
    const sw = pickSwap({ bench, board, covenants: ctx.covenants || [], round: Number(ctx.round) || 0, map })
    if (sw && sw.drop && Array.isArray(sw.drop.px)) {
      return {
        drop: { name: sw.drop.name || '', px: sw.drop.px.slice() },
        add: sw.add ? { name: sw.add.name } : null,
        reason: sw.reason || '盟约换人',
      }
    }
    // 名册齐、结论却是「换人不划算」→ 不撤。用户 m03497：后期只认阶数真升级，别越换越低阶。
    return { drop: null, add: null, reason: (sw && sw.reason) || '挑不出值得换的人' }
  }
  // 接手局：名册空（认不出人），只能按棋盘实测占格撤一个 —— 优先撤最靠右（离出怪点最近）的那格。
  const pts = []
  const raw = ctx.occupiedPx
  const list = raw && typeof raw[Symbol.iterator] === 'function' ? [...raw] : []
  for (const v of list) {
    let x = NaN
    let y = NaN
    if (Array.isArray(v)) { x = Number(v[0]); y = Number(v[1]) }
    else if (v && Array.isArray(v.px)) { x = Number(v.px[0]); y = Number(v.px[1]) }
    else if (typeof v === 'string') {
      const i = v.indexOf(',')
      if (i > 0) { x = Number(v.slice(0, i)); y = Number(v.slice(i + 1)) }
    }
    if (Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y])
  }
  if (!pts.length) return { drop: null, add: null, reason: '没有名册、也没有占格可撤' }
  pts.sort((a, b) => (b[0] - a[0]) || (b[1] - a[1]))
  return { drop: { name: '', px: pts[0] }, add: null, reason: '没有名册 → 撤最右一格（x 最大的）' }
}
/** 日志用的一句话摘要：本局在叠哪些盟约、各差几个。 */
export function describeCovenants(names, map = loadCovenantMap(), limit = 6) {
  const rows = covenantCounts(names, map).filter((c) => c.count > 0).slice(0, limit)
  if (!rows.length) return '（还没数出盟约：名单里没有认识的干员）'
  return rows.map((c) => '【' + c.name + '】' + c.count + '/' + c.need + (c.active ? '✓' : '')).join(' ')
}
