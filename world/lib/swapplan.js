/**
 * swapplan.js —— 场上站位互换（用户 m05472/m05478）。
 *
 * 用户原话：「每一个回合都可以调整场上的站位，只要把要换位的干员长按选中之后部署在
 * 要换的干员位置就行，两个干员会互换位置，其中你选定的干员需要你滑动选定朝向，
 * 被换的干员方向和原来一致」。
 *
 * 所以这里只算「谁该挪到哪」，不碰 adb：
 *   1. 拿每张图给死的格（deployOrder：tank / melee / ranged / healer）当各职业的合法区。
 *   2. 场上有人的格按 px 对齐到这些区：人在错误的区 → 该挪。
 *   3. 目标格是空的 → 直接挪过去（move）；目标格站着人 → 两个人互换（swap）。
 *
 * 纯函数，不读盘、不 import 除 deployorder 之外的任何东西（deployorder 自己零依赖）。
 */
import { orderOf, hasOrder, PX_TOL } from './deployorder.js'

const NEAR = (a, b, tol = 80) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol

/** 某个职业的合法格（px）。地图没给这个职业就返回空数组。 */
export function zoneOf(map, role) {
  if (!hasOrder(map)) return []
  const o = orderOf(map)
  const raw = map && map.deployOrder ? map.deployOrder : {}
  const pick = (key) => {
    const fromOrder = o && Array.isArray(o[key]) ? o[key] : null
    if (fromOrder) return fromOrder.map((e) => (Array.isArray(e) ? [Number(e[0]), Number(e[1])] : e && Array.isArray(e.px) ? e.px.slice() : null)).filter((x) => Array.isArray(x) && x.length === 2)
    // 地图没带 cells（单测/旧图）时，deployOrder 里的 [col,row] 就当 px 用
    const list = Array.isArray(raw[key]) ? raw[key] : []
    return list.map((e) => (Array.isArray(e) ? [Number(e[0]), Number(e[1])] : null)).filter((x) => Array.isArray(x) && Number.isFinite(x[0]) && Number.isFinite(x[1]))
  }
  const list = pick(role)
  if (list.length) return list
  // 医疗没给专门格时按远程算（跟 deployorder.tilesForRole 的历史口径一致）
  if (role === 'healer') return pick('ranged')
  return []
}

function inZone(px, zone) {
  return Array.isArray(zone) && zone.some((z) => NEAR(px, z))
}

/**
 * 算这一回合要做的位移。
 * @param {Array<{name:string, px:number[]}>} slots 场上（我们自己记的账）
 * @param {object} map 地图（wz-01.json）
 * @param {{roleOf?:(name:string)=>string, max?:number, tol?:number}} [opts]
 *        roleOf(name) → 'tank' | 'melee' | 'ranged' | 'healer'
 * @returns {Array<{kind:'move'|'swap', name:string, from:number[], to:number[], withName?:string, reason:string}>}
 */
export function swapPlan(slots, map, opts = {}) {
  const list = (Array.isArray(slots) ? slots : [])
    .filter((s) => s && Array.isArray(s.px) && s.px.length === 2 && Number.isFinite(s.px[0]))
    .map((s) => ({ name: String(s.name || ''), px: [Math.round(s.px[0]), Math.round(s.px[1])] }))
  if (list.length < 2) return []
  const roleOf = typeof opts.roleOf === 'function' ? opts.roleOf : () => 'melee'
  const max = Number(opts.max) > 0 ? Number(opts.max) : 2
  const tol = Number(opts.tol) > 0 ? Number(opts.tol) : 80

  const zoneFor = (s) => zoneOf(map, roleOf(s.name))
  const occupied = (px) => list.find((s) => NEAR(s.px, px, tol))
  const taken = []

  const out = []
  const misplaced = (s) => {
    const z = zoneFor(s)
    return z.length > 0 && !inZone(s.px, z)
  }
  // 第一遍：站反的一对直接互换（一次拖拽就够，比「两个人都挪到空位」省一半动作）。
  for (const s of list) {
    if (out.length >= max) break
    if (taken.includes(s.name)) continue
    if (!misplaced(s)) continue
    const z = zoneFor(s)
    for (const t of z) {
      const other = occupied(t)
      if (!other || other.name === s.name || taken.includes(other.name)) continue
      if (!misplaced(other)) continue                  // 他站得对，别动他
      if (!inZone(s.px, zoneFor(other))) continue      // 我站的这格也不是他该站的 → 换了白换
      out.push({ kind: 'swap', name: s.name, from: s.px.slice(), to: t.slice(), withName: other.name, reason: '我和 ' + other.name + ' 站反了 → 互换' })
      taken.push(s.name, other.name)
      break
    }
  }
  // 第二遍：自己区里还有空格的，挪过去。
  for (const s of list) {
    if (out.length >= max) break
    if (taken.includes(s.name)) continue
    if (!misplaced(s)) continue
    for (const t of zoneFor(s)) {
      if (occupied(t)) continue
      out.push({ kind: 'move', name: s.name, from: s.px.slice(), to: t.slice(), reason: '站错区（' + roleOf(s.name) + '）→ 挪到自己的空位' })
      taken.push(s.name)
      break
    }
  }
  return out
}

/** 日志用一句话。 */
export function describeSwapPlan(plan) {
  const p = Array.isArray(plan) ? plan : []
  if (!p.length) return '（站位都对，不用换）'
  return p.map((x) => x.kind === 'swap'
    ? x.name + '(' + x.from.join(',') + ')' + ' ↔ ' + x.withName + '(' + x.to.join(',') + ')'
    : x.name + ' ' + x.from.join(',') + ' → ' + x.to.join(',')).join('；')
}
