import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 2026-11-12（用户 m02460）：站位改成「按地图指定」，优先序列在 lib/deployorder.js。
// 这里只做「有指定序列就用、没有就退回旧的覆盖序」，不复制那边的逻辑。
import { hasOrder, orderOf, tilesForRole, tilesForClass, orderedTiles, describeOrder, roleOfGroup, roleKeyOfClass, MAX_TANK } from './deployorder.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const CANDIDATES = [
  join(HERE, '..', 'data', 'maps', 'wz-01.json'),
  join(HERE, '..', '..', 'data', 'maps', 'wz-01.json'),
]

let CACHE = null

/** 读 data/maps/wz-01.json（用户人工标注的格子语义）。读不到返回 null。 */
export function loadGameMap() {
  if (CACHE !== null) return CACHE
  for (const f of CANDIDATES) {
    if (!existsSync(f)) continue
    try {
      CACHE = JSON.parse(readFileSync(f, 'utf8'))
      return CACHE
    } catch (e) {
      CACHE = null
    }
  }
  CACHE = null
  return CACHE
}

/** 可部署格（ground/high）的屏幕像素中心，按行优先。 */
export function deployTiles(map = loadGameMap()) {
  if (!map || !Array.isArray(map.cells)) return []
  return map.cells.filter((c) => c.deploy).map((c) => c.px.slice())
}

/**
 * 按「先堵路、再靠近敌人出口」排序的可部署格。
 * 2026-11-11 13:05 实测：按 JSON 顺序（行优先）上场，全堆在左上角 (2,1)(3,1)，
 * 敌人从右侧红门 (9,1)/(9,4) 进来，根本捡不着，第 5 回合血就掉光。
 * 所以：能站在敌人路径上的格（walk）排最前，同组内按列从右往左（靠红门）、行从上往下。
 */
export function deployTilesRanked(map = loadGameMap()) {
  if (!map || !Array.isArray(map.cells)) return []
  const tiles = map.cells.filter((c) => c.deploy)
  const enRoute = tiles.filter((c) => c.walk)
  const offRoute = tiles.filter((c) => !c.walk)

  // 敌人从右边缘的红门进来（wz-01：红门在 (1547,346) 和 (1547,676) 两处，也就是第 1 行和第 4 行）。
  // 2026-11-11 14:1x 实测：上一版按「行从上往下 + 列从右往左」排，前 6 个名额全给了第 1 行，
  // 第 4 行那条道从头到尾没人站 —— 第 6 回合漏 20 点血（trace step-112 实拍：场上 3 个全在上排）。
  // 现在改成「按行分道、轮流取」，每条道都先补靠红门的那一端，两三条道同时有人堵。
  const gateRows = new Set()
  for (const g of (map.gates && map.gates.red) || []) {
    const hit = (map.cells || []).find((c) => c.px && Math.abs(c.px[0] - g[0]) <= 40 && Math.abs(c.px[1] - g[1]) <= 40)
    if (hit) gateRows.add(hit.row)
  }
  const groups = new Map()
  for (const c of enRoute) {
    if (!groups.has(c.row)) groups.set(c.row, [])
    groups.get(c.row).push(c)
  }
  for (const arr of groups.values()) arr.sort((a, b) => b.col - a.col)
  const rowOrder = [...groups.keys()].sort((a, b) => {
    const ga = gateRows.has(a) ? 0 : 1
    const gb = gateRows.has(b) ? 0 : 1
    if (ga !== gb) return ga - gb
    return a - b
  })
  const out = []
  let more = true
  for (let k = 0; more; k++) {
    more = false
    for (const r of rowOrder) {
      const arr = groups.get(r)
      if (k < arr.length) {
        out.push(arr[k].px.slice())
        more = true
      }
    }
  }
  // 不在敌人路径上的高台（walk=false）最后补，靠红门的优先。
  offRoute.sort((a, b) => (a.row - b.row) || (b.col - a.col))
  for (const c of offRoute) out.push(c.px.slice())
  return out
}

/** 敌人可走格（含红蓝门）→ placement.js 需要的 {gx,gy} 数组。 */
export function walkCells(map = loadGameMap()) {
  if (!map || !Array.isArray(map.cells)) return []
  return map.cells.filter((c) => c.walk).map((c) => ({ gx: c.col, gy: c.row }))
}

/** 给 planDeploy 用的 map 对象：cells / kindAt / redDoor。 */
export function mapForPlacement(map = loadGameMap()) {
  if (!map || !Array.isArray(map.cells)) return {}
  const byKey = new Map()
  for (const c of map.cells) byKey.set(c.col + ',' + c.row, c.kind)
  const red = (map.gates && map.gates.red) || []
  const redDoor = red.length
    ? { gx: Math.round((red[0][0] - map.grid.cols[0]) / map.grid.stepX), gy: 0 }
    : null
  return {
    cells: map.cells,
    path: walkCells(map),
    redDoor,
    kindAt(gx, gy) {
      const k = byKey.get(gx + ',' + gy)
      if (k === 'ground' || k === 'high') return k
      if (k === 'gate_blue' || k === 'gate_red' || k === 'path') return 'blocked'
      return 'blocked'
    },
  }
}

/**
 * 按「攻击范围覆盖」排的可部署格（用户 m02970 第 3 条：不用把行填满，看攻击范围覆盖）。
 *
 * 做法：敌人从右侧红门进来 → 干员默认朝右。给一个通用朝右攻击型（前方 1~3 列、上下各一格），
 * 逐个位置算它能盖住多少条「敌人可走格」；然后贪心取：
 *   每轮挑「能新盖住最多走格」的位置，票数相同取更靠近红门（列大）的，再取更靠下的行。
 * 这样 3~4 个人就会自动聚到覆盖面最大的几个点上，而不是把一行的 10 格平均铺开。
 */
export const FACE_RIGHT_RANGE = [[1, 0], [2, 0], [3, 0], [1, -1], [1, 1], [2, -1], [2, 1], [0, 0]];

export function deployTilesByCoverage(map = loadGameMap(), opts = {}) {
  if (!map || !Array.isArray(map.cells)) return []
  const facing = opts.facing || 'right'
  const pattern = opts.pattern || FACE_RIGHT_RANGE
  const flip = facing === 'left' ? pattern.map(([dx, dy]) => [-dx, dy]) : pattern
  const walkSet = new Set(map.cells.filter((c) => c.walk).map((c) => c.col + ',' + c.row))
  const tiles = map.cells.filter((c) => c.deploy)
  const cover = new Map()
  for (const t of tiles) {
    const cells = []
    for (const [dx, dy] of flip) {
      const k = (t.col + dx) + ',' + (t.row + dy)
      if (walkSet.has(k)) cells.push(k)
    }
    cover.set(t.col + ',' + t.row, cells)
  }
  const covered = new Set()
  const left = tiles.slice()
  const out = []
  while (left.length) {
    let best = null
    let bestGain = -1
    for (const t of left) {
      const cs = cover.get(t.col + ',' + t.row) || []
      const gain = cs.filter((k) => !covered.has(k)).length
      // 2026-11-11 21:48 用户 m04007：「干员不是叫你放最上面一排的吗」「你放的地方敌人都不经过」。
      // 于是改成**先填最上面一排、排内再看覆盖**：row 越小越优先（row0 = 最上面一排 y≈347）。
      const score = (10 - t.row) * 100000 + gain * 1000 + t.col * 10
      if (score > bestGain) { bestGain = score; best = t }
    }
    if (!best) break
    for (const k of cover.get(best.col + ',' + best.row) || []) covered.add(k)
    out.push({ px: best.px.slice(), col: best.col, row: best.row, gain: bestGain })
    left.splice(left.indexOf(best), 1)
  }
  return out
}

// ── 干员职业 / 攻击范围（data/operator-ranges.json，143 人） ──────────────
const RANGES_PATH = join(HERE, '..', '..', 'data', 'operator-ranges.json')
let RANGES = null
export function loadRanges() {
  if (RANGES !== null) return RANGES
  try { RANGES = JSON.parse(readFileSync(RANGES_PATH, 'utf8')) } catch (e) { RANGES = { operators: {} } }
  return RANGES
}

/** 干员名 → {class, range}；认不出返回 null。 */
export function operatorInfo(name) {
  const r = loadRanges()
  const ops = (r && r.operators) || {}
  return ops[name] || null
}

/**
 * 站位分组（用户 m02897：「医疗在左、然后远程、近战」）：
 * 0 = 医疗（放最左）、1 = 远程（狙击/术师/辅助）、2 = 近战（近卫/重装/先锋/特种）。
 */
export function roleGroup(name) {
  const info = operatorInfo(name)
  if (!info) return 2
  const c = String(info.class || '')
  if (c === '医疗') return 0
  if (c === '狙击' || c === '术师' || c === '辅助') return 1
  return 2
}

/**
 * 按人排站位（用户 m02897：医疗在左 → 远程 → 近战；m02970：不用填满，看攻击范围覆盖）。
 *
 * names 与甲板小牌一一对应（从左往右）。认得出职业的按「自己的攻击范围能盖住多少敌人可走格」挑位置，
 * 认不出的就当近战，用通用朝右范围算。挑过的位置不复用。
 * 返回 [{name, role, px, gain}]，长度 = names.length。
 */
// 2026-11-11 21:52 用户 m04048 的站位规则（原话）：
//   「2 3 4适合部署近战干员，1 7 8适合远程，奶如果是向前三格的就放在7，向前只有两格就放在8，
//    接下来的干员围绕这些位置放，覆盖范围大就行，覆盖3 4 5的权重大于其他格子」
// 编号 = wz-01 的 19 个可部署格按 (row, col) 排序后的序号（1..19），
// 也就是 tiles-for-you.png 上标的号：1 C3 / 2 C4 / 3 C5 / 4 C6 / 5 C7 / 6 C8 / 7 C3(第2行) / 8 C4(第2行) …
export const ROLE_SLOTS = { melee: [2, 3, 4], ranged: [1, 7, 8] }
/** 医疗：向前（朝右时 dx）能打到 3 格站 7 号，只有 2 格站 8 号。 */
export function healerSlot(info) {
  const rg = info && Array.isArray(info.range) ? info.range : []
  const fw = rg.reduce((m, [dx]) => Math.max(m, Number(dx) || 0), 0)
  return fw >= 3 ? 7 : 8
}

export function planTilesForNames(names = [], map = loadGameMap(), taken = []) {
  if (!map || !Array.isArray(map.cells) || !names.length) return []
  const walkSet = new Set(map.cells.filter((c) => c.walk).map((c) => c.col + ',' + c.row))
  // 行优先排序后的可部署格 = 用户看到的编号
  const cells = map.cells
    .filter((c) => c.deploy)
    .slice()
    .sort((a, b) => a.row - b.row || a.col - b.col)
  const byNo = (n) => cells[Number(n) - 1]
  // 「覆盖 3 4 5 的权重大于其他格子」：给 3/4/5 号格所在的坐标额外加权
  const hot = new Set(['3', '4', '5'].map((n) => { const c = byNo(n); return c ? c.col + ',' + c.row : '' }).filter(Boolean))
  const coverScore = (cell, pattern) => {
    let hotN = 0
    let walkN = 0
    for (const [dx, dy] of pattern) {
      const k = (cell.col + dx) + ',' + (cell.row + dy)
      if (hot.has(k)) hotN += 1
      if (walkSet.has(k)) walkN += 1
    }
    return hotN * 40 + walkN * 10 + (4 - cell.row) * 6
  }
  const used = new Set()
  // 2026-11-13 13:0x（trace-night-13T04-47-47 第 4 回合）：排位只按「本批内部不重复」算，
  // 不知道场上已经站了谁 → 卡达排在 (5,2) 1086,447（上一回合陨星就站在那儿）、折光排在 (6,2) 1207,448
  // （第 1 回合夜莺站那儿），拖过去游戏把幽灵吸到邻近格（实测落到 (5,1) 与 (6,3)）。
  // 现在调用方把「已占 px」传进来（'x,y' 字符串或 [x,y]），这里先折成格号塞进 used。
  if (Array.isArray(taken) && taken.length) {
    for (const t of taken) {
      let px = null
      if (Array.isArray(t)) px = t
      else if (typeof t === 'string' && t.indexOf(',') > 0) {
        const i3 = t.indexOf(',')
        px = [Number(t.slice(0, i3)), Number(t.slice(i3 + 1))]
      } else if (t && Array.isArray(t.px)) px = t.px
      if (!px || !Number.isFinite(px[0]) || !Number.isFinite(px[1])) continue
      let best = null
      let bd = 55
      for (const c of cells) {
        const d = Math.hypot(c.px[0] - px[0], c.px[1] - px[1])
        if (d < bd) { bd = d; best = c }
      }
      if (best) used.add(best.col + ',' + best.row)
    }
  }
  const out = []
  const take = (cell, name, role, fixed, facing) => {
    used.add(cell.col + ',' + cell.row)
    out.push({ name, role, px: cell.px.slice(), no: cells.indexOf(cell) + 1, col: cell.col, row: cell.row, fixed: !!fixed, facing: facing || null })
  }
  const bestFree = (pattern) => {
    let best = null
    let bs = -1e9
    for (const c of cells) {
      if (used.has(c.col + ',' + c.row)) continue
      const s = coverScore(c, pattern)
      if (s > bs) { bs = s; best = c }
    }
    return best
  }
  const ordered = names.map((name, i) => ({ name, i, role: roleGroup(name) }))
  // 医疗先站（她的规则里医疗位置最固定：7 或 8），再远程 1/7/8，再近战 2/3/4。
  //
  // 2026-11-12（用户 m02460）：这张图改成「近战 (4,1)(3,1)(5,1) → 远程 (2,1)(2,2)(3,2)」。
  // 地图里有 deployOrder 就按它给的顺序占位；没给的图继续用 ROLE_SLOTS + 就近补位。
  const fixed = hasOrder(map) ? orderOf(map) : null
  const cellByKey = new Map(cells.map((c) => [c.col + ',' + c.row, c]))
  // 2026-11-12 22:xx（用户 m02614/m02616）：重装走单独的靠右序列，最多 MAX_TANK 个；
  // 超出的重装按近卫（melee）序列放。职业认不出时退回 roleGroup 的粗分组。
  let tankUsed = 0
  const pickByRules = (u) => {
    const info = operatorInfo(u.name)
    const pattern = info && Array.isArray(info.range) && info.range.length ? info.range : FACE_RIGHT_RANGE
    const byClass = roleKeyOfClass(info && info.class)
    const roleKey = byClass === 'tank' && tankUsed >= MAX_TANK ? 'melee' : (byClass || roleOfGroup(u.role))
    if (fixed) {
      const seq = tilesForRole(map, roleKey) || []
      for (const t of seq) {
        const c = cellByKey.get(t.col + ',' + t.row)
        if (c && !used.has(c.col + ',' + c.row)) return { cell: c, pattern, fixed: true, facing: t.facing, roleKey }
      }
      // 2026-11-12：本角色的指定格用完了 → 按 deployorder 的「围绕优先格就近」序补，
      // 别退回覆盖评分（那会把干员又摊回上排，用户明确否过）。
      // 2026-11-13（用户 m04641「卡达这种远程输出放在前排」）：补位也要守职业纪律 ——
      // 远程/医疗只补「敌人不走的高台」，坦克/近卫只补「敌人走的通道」，都不行再放宽。
      const walkSet2 = new Set(map.cells.filter((c) => c.walk).map((c) => c.col + ',' + c.row))
      const strict = roleKey === 'ranged' || roleKey === 'healer'
      // 2026-11-14 21:3x（用户 m08045「医疗/远程 x=5、6 高台」+ 实测 初雪 被丢到 (7,1) 1311,354 通道格）：
      // 远程/医疗只走严格那一遍（只要高台）；高台占满就不上，不再放宽到敌人通道里送人头。
      for (const pass of (strict ? [true] : [true, false])) {
        for (const t of orderedTiles(map)) {
          const k = t.col + ',' + t.row
          const c = cellByKey.get(k)
          if (!c || used.has(k)) continue
          const isWalk = walkSet2.has(k)
          if (pass && strict && isWalk) continue
          if (pass && !strict && !isWalk) continue
          return { cell: c, pattern, fixed: false, facing: t.facing, roleKey }
        }
      }
      if (strict) return { cell: null, pattern, fixed: false, roleKey }
      return { cell: bestFree(pattern), pattern, fixed: false, roleKey }
    }
    const slots = u.role === 0 ? [healerSlot(info)] : u.role === 1 ? ROLE_SLOTS.ranged : ROLE_SLOTS.melee
    for (const n of slots) {
      const c = byNo(n)
      if (c && !used.has(c.col + ',' + c.row)) return { cell: c, pattern, fixed: true, roleKey }
    }
    return { cell: bestFree(pattern), pattern, fixed: false, roleKey }
  }
  const queue = []
  for (const role of [0, 1, 2]) for (const u of ordered) if (u.role === role) queue.push(u)
  for (const u of queue) {
    const { cell, pattern, fixed: isFixed, facing, roleKey } = pickByRules(u)
    if (!cell) {
      // 远程/医疗：高台一个不剩（或全被占）→ 这张牌这回合不上，别丢到通道格里被近战拆
      if (roleKey === 'ranged' || roleKey === 'healer') continue
      break
    }
    if (roleKey === 'tank') tankUsed += 1
    take(cell, u.name, u.role, isFixed, facing)
  }
  // 按原甲板顺序还回去（第 i 张牌 → 第 i 个位置）
  out.sort((a, b) => names.indexOf(a.name) - names.indexOf(b.name))
  return out
}

/**
 * 部署循环的兜底池顺序（2026-11-12 用户 m02460：先占指定格，再围绕它们补）。
 *
 * 有 deployOrder 的地图：近战格 → 远程格 → 其余按「离优先格最近」排序。
 * 没有的：沿用 deployTilesByCoverage 的覆盖序（老图不受影响）。
 */
export function deployPoolFor(map = loadGameMap()) {
  if (hasOrder(map)) {
    const seq = orderedTiles(map)
    if (seq.length) return seq.map((t) => t.px.slice())
  }
  return deployTilesByCoverage(map).map((t) => t.px.slice())
}

/** 日志用：这张图的指定站位落在哪几格（含被丢掉的越界坐标）。 */
export function describeDeployOrder(map = loadGameMap()) {
  return describeOrder(map)
}
