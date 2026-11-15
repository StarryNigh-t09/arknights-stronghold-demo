// planner.js —— 带目标函数的短程规划（2026-11-15 09:2x，用户 m10989 批准的第 3 项）
//
// 现在的决策是一串 if/else：先看升级、再看凑盟约、再看对子、再看空名额买、最后刷新。
// 每回合孤立决定，谁先命中谁说话，于是出现「钱全花在两次刷新上」「名额空 4 个却没买人」
// 「整备区 3 阶躺着，场上名额 1」这种局面。
//
// 这里换一种写法：把「这回合能做的事」都列出来（买 / 升级 / 换人 / 上人 / 刷新），
// 用同一个目标函数给「做完之后的样子」打分，深度 2 的 beam search 取最优。
// 不能解决长线运营，但至少每一步都在朝同一个目标走：激活盟约 > 叠层 > 高阶上场 > 留点钱。
//
// 纯函数，不碰 adb、不读文件、不写文件 —— 这样才敢真机跑之前先在测试里打擂台。
// 现在以 shadow 模式接进 drive.js（只打建议、不改动作），对比几局确认它更好再翻成主决策。
import {
  loadCovenantMap, covenantCounts, covenantsOf, tierOf, isStacker, covenantNeed,
} from './covenantplan.js'

// 权重（都能被 ctx.weights 覆盖，方便后面按局调参）
export const DEFAULT_WEIGHTS = {
  active: 4.0,        // 激活一个盟约值多少
  near: 1.2,          // 差一个人就激活的盟约，按进度给分
  tier: 0.45,         // 场上每阶
  board: 0.5,         // 场上每多一个人
  money: 0.04,        // 留钱的边际价值（别一口气花光）
  stack: 0.35,        // 叠层核心（这类干员每层都算收益）
  benchOverflow: 0.6, // 整备区超过 8 张开始扣（买不了、也换不动）
  benchFull: 3.0,     // 整备区满 10 张：想买也买不了
}

const tierNum = (name, map) => { try { return Number(tierOf(name, map)) || 0 } catch { return 0 } }
const stackFlag = (name, map) => { try { return isStacker(name, map) ? 1 : 0 } catch { return 0 } }

/** 把局面评分（给「动作做完之后的局面」用，也给当前局面用） */
export function scoreBoard(state, ctx = {}) {
  const map = ctx.map || loadCovenantMap()
  const W = { ...DEFAULT_WEIGHTS, ...(ctx.weights || {}) }
  const board = Array.isArray(state.board) ? state.board.filter(Boolean) : []
  const bench = Array.isArray(state.bench) ? state.bench.filter(Boolean) : []
  const names = board.map((b) => (typeof b === 'string' ? b : b.name)).filter(Boolean)
  const counts = covenantCounts(names, map)
  const active = counts.filter((c) => c.active).length
  const near = counts.reduce((a, c) => a + (c.count > 0 && !c.active ? c.count / Math.max(1, c.need) : 0), 0)
  const tierSum = names.reduce((a, n) => a + tierNum(n, map), 0)
  const stackN = names.reduce((a, n) => a + stackFlag(n, map), 0)
  const money = Number(state.money) || 0
  const benchN = bench.length
  let s = W.active * active + W.near * near + W.tier * tierSum + W.board * names.length
  s += W.stack * stackN + W.money * Math.min(money, 20)
  if (benchN > 8) s -= W.benchOverflow * (benchN - 8)
  if (benchN >= (ctx.benchCap || 10)) s -= W.benchFull
  return { score: Math.round(s * 100) / 100, active, near: Math.round(near * 100) / 100, tierSum, stackN, counts }
}

const clone = (s) => ({ ...s, board: (s.board || []).slice(), bench: (s.bench || []).slice(), shop: (s.shop || []).slice() })

/** 枚举这一步能做的动作（只返回不违反硬约束的） */
export function enumerateActions(state, ctx = {}) {
  const map = ctx.map || loadCovenantMap()
  const out = []
  const money = Number(state.money) || 0
  const slots = Number(state.slots)
  const benchCap = ctx.benchCap || 10
  const bench = Array.isArray(state.bench) ? state.bench : []
  const shop = Array.isArray(state.shop) ? state.shop : []
  const level = Number(state.level) || 1
  const maxLevel = ctx.maxLevel || 5

  // 1) 买：钱够、整备区没满
  if (bench.length < benchCap) {
    for (const c of shop) {
      const cost = Number(c && c.cost)
      if (!c || !c.name || !Number.isFinite(cost) || cost > money) continue
      out.push({ type: 'buy', card: c, cost, desc: '买 ' + c.name + '（' + (c.tier == null ? '?' : c.tier) + ' 阶/' + cost + ' 块）' })
    }
  }
  // 2) 升级：钱够、没到上限
  const up = Number(ctx.upgradeCost)
  if (Number.isFinite(up) && up > 0 && up <= money && level < maxLevel) {
    out.push({ type: 'upgrade', cost: up, desc: '升级 Lv' + level + ' → Lv' + (level + 1) + '（' + up + ' 块）' })
  }
  // 3) 上人：有名额、整备区有牌
  if (Number.isFinite(slots) && slots > 0 && bench.length) {
    for (const b of bench) {
      if (!b || !b.name) continue
      out.push({ type: 'deploy', card: b, desc: '上 ' + b.name + '（剩 ' + slots + ' 个名额）' })
    }
  }
  // 4) 换人：名额满时唯一能换血的动作
  if (slots === 0 && bench.length) {
    const board = Array.isArray(state.board) ? state.board : []
    const boardT = board.map((b) => ({ n: typeof b === 'string' ? b : b.name, t: tierNum(typeof b === 'string' ? b : b.name, map) }))
    const worst = boardT.slice().sort((a, b) => a.t - b.t)[0]
    if (worst) {
      for (const b of bench) {
        if (!b || !b.name) continue
        out.push({ type: 'swap', card: b, drop: worst.n, desc: '换人：' + b.name + ' 上 ← ' + worst.n + ' 下' })
      }
    }
  }
  // 5) 刷新：钱够 1 块才排（并且带惩罚 —— 刷出来的东西未知）
  if (money >= 1 && !ctx.noRefresh) out.push({ type: 'refresh', cost: 1, desc: '刷新商店（1 块）' })
  return out
}

/** 施加一个动作，返回新状态（不改原对象） */
export function applyAction(state, act, ctx = {}) {
  const map = ctx.map || loadCovenantMap()
  const s = clone(state)
  if (act.type === 'buy') {
    s.money = (Number(s.money) || 0) - act.cost
    s.bench.push({ name: act.card.name, tier: act.card.tier, cost: act.cost })
    s.shop = s.shop.filter((c) => c !== act.card)
  } else if (act.type === 'upgrade') {
    s.money = (Number(s.money) || 0) - act.cost
    s.level = (Number(s.level) || 1) + 1
    if (Number.isFinite(Number(s.slots))) s.slots = Number(s.slots) + 1 // 升一级容量 +1（真机 Lv1 6 / Lv3 8 / Lv4 9 / Lv5 10）
  } else if (act.type === 'deploy') {
    const i = s.bench.findIndex((b) => b && b.name === act.card.name)
    if (i >= 0) s.bench.splice(i, 1)
    s.board.push({ name: act.card.name })
    if (Number.isFinite(Number(s.slots))) s.slots = Math.max(0, Number(s.slots) - 1)
  } else if (act.type === 'swap') {
    const i = s.bench.findIndex((b) => b && b.name === act.card.name)
    if (i >= 0) s.bench.splice(i, 1)
    const j = s.board.findIndex((b) => (typeof b === 'string' ? b : b.name) === act.drop)
    const dropped = j >= 0 ? s.board.splice(j, 1)[0] : null
    s.board.push({ name: act.card.name })
    if (dropped) s.bench.push({ name: typeof dropped === 'string' ? dropped : dropped.name })
  } else if (act.type === 'refresh') {
    s.money = (Number(s.money) || 0) - 1
    s.refreshed = (Number(s.refreshed) || 0) + 1
  }
  return s
}

/**
 * 规划这一回合：深度 2 的 beam search。
 * 返回 { score, best: [动作...], ranked: [{score, seq:[{type,desc}...]}] }
 * 只给建议，不执行 —— 调用方决定信不信。
 */
export function suggestTurn(state, ctx = {}) {
  const map = ctx.map || loadCovenantMap()
  const beam = Math.max(1, Number(ctx.beam) || 4)
  const depth = Math.max(1, Number(ctx.depth) || 2)
  const base = { ...state, board: (state.board || []).slice(), bench: (state.bench || []).slice(), shop: (state.shop || []).slice() }

  const ranked = []
  const walk = (s, seq, d) => {
    const sc = scoreBoard(s, { ...ctx, map }).score
    if (d === 0) { ranked.push({ score: sc, seq: seq.slice() }); return }
    const acts = enumerateActions(s, ctx)
      .map((a) => {
        let penal = 0
        // 刷新排最后：花 1 块换未知，除非其它选项显然更差（简化成固定罚分）
        if (a.type === 'refresh') penal = 1.6
        const ns = applyAction(s, a, ctx)
        return { a, ns, sc: scoreBoard(ns, { ...ctx, map }).score - penal }
      })
      .sort((x, y) => y.sc - x.sc)
      .slice(0, beam)
    if (!acts.length) { ranked.push({ score: sc, seq: seq.slice() }); return }
    for (const { a, ns } of acts) walk(ns, seq.concat([a]), d - 1)
  }
  walk(base, [], depth)

  ranked.sort((x, y) => y.score - x.score)
  const cur = scoreBoard(base, { ...ctx, map }).score
  const best = ranked[0] || { score: cur, seq: [] }
  return {
    now: cur,
    score: best.score,
    gain: Math.round((best.score - cur) * 100) / 100,
    best: best.seq,
    ranked: ranked.slice(0, Math.max(3, beam)),
  }
}

/** 一行可读的建议 */
export function describePlan(plan) {
  if (!plan) return '规划：没有'
  const seq = (plan.best || []).map((a) => a.desc).join(' → ')
  return '规划建议（现在 ' + plan.now + ' 分 → 做完 ' + plan.score + ' 分，+' + plan.gain + '）：' + (seq || '这回合没有更好的动作')
}

export default { suggestTurn, scoreBoard, enumerateActions, applyAction, describePlan, DEFAULT_WEIGHTS }
