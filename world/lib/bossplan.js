/**
 * bossplan.js — 第 14 回合「BOSS 关」的站位与换人规则（纯函数，不碰设备）。
 *
 * 用户 m00xxx 原话（handoff-2026-11-13.md §3）：
 *  「第 14 回合是 boss 关，阵容要大调。部署格和普通回合一样（所有地图部署位不变）。
 *    x=7、8 放近战；x=5、6 放医疗和远程；医疗尽量覆盖全部干员；远程攻击范围要够到 x=9；
 *    全部朝右（朝 boss）；第 14 回合不升级，只刷新+买干员补强。」
 *
 * 这里只回答四件事：
 *  1) 这一回合是不是 BOSS 关（回合号 == 总回合数，默认 14）；
 *  2) 这个医疗是「行医」（只能治前方 → x=5）还是「群奶/护佑」（能顾到后方 → x=6）；
 *  3) BOSS 关的 8 个目标格，以及按职业把干员分到这些格上；
 *  4) 场上站位不对时，从整备区挑谁去换。
 * 真机落点、手势、确认帧都在 drive.js / deploy-fast.js，那边只用这里算出来的坐标。
 */
import { operatorInfo, loadGameMap } from './gamemap.js'

/** 一局的休整期总数（data/economy.json 的 totalRounds 也是 14）。BOSS 关 = 最后一回合。 */
export const BOSS_ROUND = 14

/** BOSS 关统一朝右（boss 在右边）。 */
export const BOSS_FACING = 'right'

/**
 * 「群奶/护佑」白名单：射程里含 dx<0（能顾到身后）的医疗，以及本身是辅助但带治疗范围、
 * 实际要当奶用的淬羽赫默（operator-ranges.json 里 class=辅助，range dx -1..2）。
 * 名单来自 2026-11-13 实读 data/operator-ranges.json 的 11 名医疗。
 */
export const COVER_HEALERS = new Set(['莎草', '瑰盐', '乌啾', '风絮', '夜莺', 'Mon3tr', '淬羽赫默'])

/** 这一回合是不是 BOSS 关。roundNo 读不出（NaN/0）时一律按「不是」处理，绝不误伤普通回合。 */
export function isBossRound(roundNo, totalRounds = BOSS_ROUND) {
  const r = Number(roundNo)
  const t = Number(totalRounds) || BOSS_ROUND
  if (!Number.isFinite(r) || r <= 0) return false
  return r === t
}

/** 取射程里最小的 dx（朝右时的「身后」覆盖）。没有 range 时返回 0。 */
export function minDxOf(info) {
  const rg = info && Array.isArray(info.range) ? info.range : []
  let m = 0
  let seen = false
  for (const p of rg) {
    const dx = Array.isArray(p) ? Number(p[0]) : NaN
    if (!Number.isFinite(dx)) continue
    if (!seen || dx < m) { m = dx; seen = true }
  }
  return seen ? m : 0
}

/** 取射程里最大的 dx（朝右时能打到多远）。 */
export function maxDxOf(info) {
  const rg = info && Array.isArray(info.range) ? info.range : []
  let m = 0
  for (const p of rg) {
    const dx = Array.isArray(p) ? Number(p[0]) : NaN
    if (Number.isFinite(dx) && dx > m) m = dx
  }
  return m
}

/**
 * 医疗细分：返回 'cover'（群奶/护佑，放 x=6）/ 'front'（行医，只能治前方，放 x=5）/ null（不是医疗）。
 * 判据：白名单 → cover；射程含 dx<0 → cover；其余医疗 → front。
 */
export function healerKindOf(name, info) {
  const who = String(name || '')
  const inf = info || operatorInfo(who)
  const cls = String((inf && inf.class) || '')
  if (cls !== '医疗' && !COVER_HEALERS.has(who)) return null
  if (COVER_HEALERS.has(who)) return 'cover'
  return minDxOf(inf) < 0 ? 'cover' : 'front'
}

/** 站在 col 列朝右时，能不能够到 targetCol（默认 x=9 的 boss）。 */
export function reachesCol(info, col, targetCol = 9) {
  const c = Number(col)
  if (!Number.isFinite(c)) return false
  // 查不到射程的人不能假设够得着（宁可少用 col5 这个格，也不把远程摆在打不到 boss 的位置）
  if (!info || !Array.isArray(info.range) || !info.range.length) return false
  return c + maxDxOf(info) >= targetCol
}

/**
 * BOSS 关目标格（按优先级）。
 *  - 重装先占 x=7 的地面通道 (7,1)(7,2)；
 *  - 近战补 (7,3)(7,4)(8,4)；
 *  - 群奶站 (6,2)(6,3)（高台，能顾到 7/8 列）；
 *  - 行医站 (5,2)（高台，只能治前方，站最左）；
 *  - 远程补 (6,2)(6,3)，够得到 x=9 的才允许退到 (5,2)。
 * 全部朝右。
 */
export function bossTileSpecs() {
  return [
    { role: 'tank', col: 7, row: 1 },
    { role: 'tank', col: 7, row: 2 },
    { role: 'melee', col: 7, row: 3 },
    { role: 'melee', col: 7, row: 4 },
    { role: 'melee', col: 8, row: 4 },
    { role: 'cover', col: 6, row: 2 },
    { role: 'cover', col: 6, row: 3 },
    { role: 'front', col: 5, row: 2 },
    { role: 'ranged', col: 6, row: 2 },
    { role: 'ranged', col: 6, row: 3 },
    { role: 'ranged', col: 5, row: 2 },
  ]
}

/** 写死兜底坐标（data/maps/wz-01.json 读不到时用，与 handoff 的实测格心一致）。 */
const FALLBACK_PX = {
  '7,1': [1311, 354],
  '7,2': [1326, 449],
  '7,3': [1342, 552],
  '7,4': [1360, 665],
  '8,4': [1489, 665],
  '6,2': [1207, 448],
  '6,3': [1218, 552],
  '5,2': [1086, 447],
}

/** 把目标格补上真机像素坐标：优先地图 cells 里的 px，读不到用兜底表。 */
export function bossTilesFor(map = loadGameMap()) {
  const cells = map && Array.isArray(map.cells) ? map.cells : []
  const out = []
  const seen = new Set()
  for (const spec of bossTileSpecs()) {
    // 同一个格可能被两类职业共用（(6,2) 既能站群奶也能站远程），按「职业+格」去重，
    // 不能按格去重 —— 否则先登记的 cover 会把后面的 ranged 位置全吃掉。
    const key = spec.role + '|' + spec.col + ',' + spec.row
    if (seen.has(key)) continue
    seen.add(key)
    const cell = cells.find((c) => c && c.col === spec.col && c.row === spec.row && c.deploy)
    // 兜底表按「格」索引（7,1），不是按 seen 的「职业|格」键 —— 2026-11-13 修：
    // 原来拿 key 去查 FALLBACK_PX 永远是 undefined，地图读不到时 8 格全被跳过。
    const px = cell && Array.isArray(cell.px) ? cell.px.slice() : FALLBACK_PX[spec.col + ',' + spec.row]
    if (!px) continue
    out.push({ ...spec, px, facing: BOSS_FACING, kind: cell && cell.kind ? cell.kind : 'ground' })
  }
  return out
}

/** 干员在 BOSS 关的职业角色：tank / melee / ranged / cover / front。认不出按 melee（地面）。 */
export function bossRoleOf(name, info) {
  const inf = info || operatorInfo(name)
  const cls = String((inf && inf.class) || '')
  const hk = healerKindOf(name, inf)
  if (hk) return hk
  if (cls === '重装') return 'tank'
  if (cls === '狙击' || cls === '术师' || cls === '辅助') return 'ranged'
  return 'melee'
}

/** 该角色能用的格（保持优先级）。远程在 col5 必须够得到 x=9，否则跳过 (5,2)。 */
function tilesForBossRole(role, tiles, info) {
  const allowed = role === 'cover' ? ['cover']
    : role === 'front' ? ['front']
      : role === 'ranged' ? ['ranged']
        : role === 'tank' ? ['tank']
          : ['melee']
  return tiles.filter((t) => {
    if (!allowed.includes(t.role)) return false
    if (role === 'ranged' && t.col === 5 && !reachesCol(info, t.col)) return false
    return true
  })
}

/**
 * 按 BOSS 关规则给这批干员排位。返回长度与 names 相同的数组，
 * 形状与 gamemap.planTilesForNames 一致：{name, px, col, row, facing, role, fixed:true}；排不上的为 null。
 * 坦克最多 2 个（用户先前口径），其余按优先级落格。
 */
export function bossLayoutFor(names = [], map = loadGameMap(), infoOf = operatorInfo) {
  const tiles = bossTilesFor(map)
  const used = new Set()
  const out = new Array(names.length).fill(null)
  // 第一遍先算每人职业（重装最多 2 个，超出的降近战），再分两轮落格：
  // 重装/近战/群奶/行医先占，远程最后补 —— 用户口径是「医疗尽量覆盖全部干员」，
  // (6,2)(6,3) 既是群奶位也是远程位，按甲板顺序先到先得会让远程把奶的位置抢走
  // （2026-11-13 实排：灰喉排在莎草前面就吃掉了 (6,2)，第二张群奶无处可放）。
  const roles = names.map((name) => {
    const role = bossRoleOf(name, infoOf(name))
    return role
  })
  let tanks = 0
  for (let k = 0; k < roles.length; k += 1) {
    if (roles[k] !== 'tank') continue
    tanks += 1
    if (tanks > 2) roles[k] = 'melee'
  }
  const place = (k) => {
    const role = roles[k]
    const info = infoOf(names[k])
    const cand = tilesForBossRole(role, tiles, info).filter((t) => !used.has(t.col + ',' + t.row))
    const hit = cand[0]
    if (!hit) return
    used.add(hit.col + ',' + hit.row)
    out[k] = {
      name: names[k],
      px: hit.px.slice(),
      col: hit.col,
      row: hit.row,
      facing: BOSS_FACING,
      role,
      fixed: true,
    }
  }
  for (let k = 0; k < roles.length; k += 1) if (roles[k] !== 'ranged') place(k)
  for (let k = 0; k < roles.length; k += 1) if (roles[k] === 'ranged') place(k)
  return out
}

const near = (a, b, tol = 45) => Math.abs(Number(a[0]) - Number(b[0])) <= tol && Math.abs(Number(a[1]) - Number(b[1])) <= tol

/**
 * BOSS 关「先互换、再甲板补人」：场上的人站错格（职业不对）时，从整备区挑职业对得上的去换。
 * @param {Array<{name:string, px:number[]}>} board 场上干员（px 为账本坐标）
 * @param {Array<{name?:string, px:number[], role:string, col:number, row:number}>} layout bossLayoutFor 的结果
 * @param {{bench?:string[], infoOf?:Function, maxSwaps?:number}} opts bench = 整备区名字（可含空名）
 * @returns {{swaps:Array<{px:number[], name:string, replaces:string, why:string}>, ok:number}}
 */
export function planBossSwaps(board = [], layout = [], opts = {}) {
  const infoOf = opts.infoOf || operatorInfo
  const maxSwaps = Number.isFinite(opts.maxSwaps) ? Number(opts.maxSwaps) : 4
  const bench = (opts.bench || []).map((n) => String(n || '')).filter(Boolean)
  const swaps = []
  const taken = new Set()
  for (const slot of layout) {
    if (!slot || !Array.isArray(slot.px)) continue
    if (swaps.length >= maxSwaps) break
    const occupants = board.filter((b) => b && Array.isArray(b.px) && near(b.px, slot.px))
    const occ = occupants[0] || null
    const occRole = occ && occ.name ? bossRoleOf(occ.name, infoOf(occ.name)) : null
    if (occRole === slot.role) continue // 站位职业已经对了，不动
    const pick = bench.find((n) => !taken.has(n) && bossRoleOf(n, infoOf(n)) === slot.role)
    if (!pick) continue
    taken.add(pick)
    swaps.push({
      px: slot.px.slice(),
      name: pick,
      replaces: (occ && occ.name) || '',
      why: '格(' + slot.col + ',' + slot.row + ')要' + slot.role + (occRole ? '，场上是' + occRole : '，场上是空的'),
    })
  }
  return { swaps, ok: swaps.length }
}

/** 一行日志：BOSS 回合的目标阵容。 */
export function describeBossPlan(layout = []) {
  const named = layout.filter(Boolean)
  if (!named.length) return 'BOSS 关：没有可排的人'
  return 'BOSS 关(' + named.length + ' 格)：' + named
    .map((p) => p.name + '→(' + p.col + ',' + p.row + ')' + p.px.join(',') + '[' + p.role + ']')
    .join(' / ') + ' 全朝右'
}
