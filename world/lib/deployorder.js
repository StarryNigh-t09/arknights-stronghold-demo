// 按地图指定的部署顺序（用户 m02460，2026-11-12 原话）：
//   「站位会根据每张地图改变，所以你的基础部署位置逻辑是我根据每张地图给出的……
//     比如这张图，近战优先放 5 6 4 然后远程放 2 8（3,2），接下来的干员就围绕这几个点放就行」
//
// 所以站位不再由「最上面一排 + 覆盖度贪心」决定，而是由地图数据里的 deployOrder 决定：
//   1) 近战先占 melee 列出的格（按给定顺序）
//   2) 远程再占 ranged 列出的格（按给定顺序）
//   3) 剩下的干员「围绕这几个点放」——按到已占优先格的最近距离排序
//
// 约定：deployOrder 里的坐标是 [col, row]，与 data/maps/<id>.json 的 cells[].col/row 同口径；
// 像素一律从 cells 查表，不在这里手写。没有 deployOrder 的老地图返回 null，调用方退回旧逻辑。
//
// 本模块只吃 map 对象、不 import 别的 lib 文件，避免和 gamemap.js 形成循环依赖。

/** 角色分组来自 gamemap.roleGroup()：0=医疗 1=远程 2=近战。 */
export function roleOfGroup(group) {
  const g = Number(group)
  if (g === 0) return 'healer'
  if (g === 1) return 'ranged'
  return 'melee'
}

/**
 * 职业名 → deployOrder 的序列键（用户 m02616：重装往右、输出往左）。
 *
 * 为什么要按职业而不是按 roleGroup：roleGroup 把「近卫/重装/先锋/特种」全归成 2（近战），
 * 于是角峰、泡泡这种重装被塞进 (3,1)(4,1)(5,1) 的中间格 —— 敌人根本不从那儿走进来，
 * 重装等于白站（用户 m02616 原话：「角峰泡泡这种重装，你放在后面，敌人不经过的地方没用」）。
 * 重装要单独一条靠右的序列，最多上 2 个（用户 m02614「重装只要 1~2 个就够」）。
 */
export function roleKeyOfClass(cls) {
  const c = String(cls || '').trim()
  if (!c) return null
  if (c === '重装') return 'tank'
  if (c === '医疗') return 'healer'
  if (c === '狙击' || c === '术师' || c === '辅助') return 'ranged'
  if (c === '近卫' || c === '先锋' || c === '特种') return 'melee'
  return null
}

/** 场上最多几个重装占靠右的格（m02614）。多出来的按近卫序列放。 */
export const MAX_TANK = 2

/** 表里给了 deployOrder 才算「这张图有指定站位」。 */
export function hasOrder(map) {
  const o = map && map.deployOrder
  return !!(o && (Array.isArray(o.melee) && o.melee.length || Array.isArray(o.ranged) && o.ranged.length
    || Array.isArray(o.healer) && o.healer.length || Array.isArray(o.tank) && o.tank.length))
}

/**
 * deployOrder 的 [col,row] → 带 px 的格对象。查不到的（越界/不可部署）丢进 dropped，
 * 调用方负责把它写进日志，别静默吞掉。
 */
export function orderOf(map) {
  if (!map || !Array.isArray(map.cells)) return null
  const byKey = new Map()
  for (const c of map.cells) if (c && c.deploy) byKey.set(c.col + ',' + c.row, c)
  const o = map.deployOrder || {}
  // 朝向也跟着格子一起给（用户 m00002：「朝向要一起给」）。单个格写成 [col,row,"right"]，
  // 没写就用整张图的 defaultFacing，再没有就朝右（敌人从右侧红门进来）。
  const defFacing = String(o.defaultFacing || 'right')
  const dropped = []
  const pick = (list) => {
    const out = []
    const seen = new Set()
    for (const pair of Array.isArray(list) ? list : []) {
      const col = Number(pair && pair[0])
      const row = Number(pair && pair[1])
      const facing = (Array.isArray(pair) && pair[2]) ? String(pair[2]) : defFacing
      const k = col + ',' + row
      const c = byKey.get(k)
      if (!c) { dropped.push([col, row]); continue }
      if (seen.has(k)) continue
      seen.add(k)
      out.push({ col, row, facing, px: c.px.slice(), kind: c.kind })
    }
    return out
  }
  const res = {
    source: o.source || '',
    tank: pick(o.tank),
    melee: pick(o.melee),
    ranged: pick(o.ranged),
    healer: pick(o.healer),
    dropped,
  }
  if (!res.tank.length && !res.melee.length && !res.ranged.length && !res.healer.length) return null
  return res
}

/**
 * 某个角色该先占的格。医疗没单独给格子时就并入远程序列的尾部
 * （医疗本身是远程职业，放远程位不算错）。
 */
/**
 * 角色能不能站这一格（用户 m03497，2026-11-14）：
 *   「斥罪是重装应该放在前面的你却放在了对面不会走的地方，灰喉是远程你却放在了前方。」
 * 本图 cells 的 kind/walk 已经标清楚了：ground+walk = 敌人走的通道（绿），high = 敌人不走的高台（黄）。
 * 于是：近战/重装只认敌人通道（挡得住才叫前排）；远程/医疗只认高台。
 * 地图数据写错、或某类格子占完了，调用方会退回「不限职业」兜底，不会因此一个人都不上。
 */
export function roleAcceptsCell(roleKey, cell) {
  if (!cell) return false
  const walk = cell.walk === true || cell.kind === 'ground'
  const high = cell.walk !== true && cell.kind === 'high'
  if (roleKey === 'tank' || roleKey === 'melee') return walk
  if (roleKey === 'ranged' || roleKey === 'healer') return high
  return true
}

export function tilesForRole(map, roleKey) {
  const o = orderOf(map)
  if (!o) return null
  if (roleKey === 'healer') return o.healer.length ? o.healer.slice() : o.ranged.slice()
  if (roleKey === 'ranged') return o.ranged.slice()
  // 重装：这张图没给重装格就退到近战序列（老图不受影响）
  if (roleKey === 'tank') return o.tank.length ? o.tank.slice() : o.melee.slice()
  return o.melee.slice()
}

/** 按职业名取序列（认不出职业时返回 null，调用方退回 roleGroup）。 */
export function tilesForClass(map, cls) {
  const key = roleKeyOfClass(cls)
  if (!key) return null
  return tilesForRole(map, key)
}

/** 已经用掉的格（Set/数组，元素 'col,row' 或 [col,row]）→ 统一的 Set。 */
function usedSet(used) {
  const s = new Set()
  if (!used) return s
  const arr = used instanceof Set ? Array.from(used) : Array.from(used || [])
  for (const k of arr) s.add(Array.isArray(k) ? k[0] + ',' + k[1] : String(k))
  return s
}

/**
 * 剩下的可部署格，按「离已占优先格的最近距离」升序 —— 就是「围绕这几个点放」。
 * 距离用像素欧氏距离（透视会让同一列不同行的 px 不同，用 px 才和游戏一致）；
 * 同距离按 row、col 升序，保证结果稳定可测。
 */
export function orderRemaining(map, used) {
  if (!map || !Array.isArray(map.cells)) return []
  const skip = usedSet(used)
  // 优先格的锚点：deployOrder 里出现过的所有格（不管现在占没占）
  const o = orderOf(map)
  const priority = o ? [...o.tank, ...o.melee, ...o.ranged, ...o.healer] : []
  const anchorPx = priority.length ? priority.map((t) => t.px) : []
  const dist = (px) => {
    if (!anchorPx.length) return 0
    let m = Infinity
    for (const a of anchorPx) {
      const d = Math.hypot(px[0] - a[0], px[1] - a[1])
      if (d < m) m = d
    }
    return m
  }
  const defFacing = String((map.deployOrder && map.deployOrder.defaultFacing) || 'right')
  const left = map.cells.filter((c) => c && c.deploy && !skip.has(c.col + ',' + c.row))
  return left
    .map((c) => ({ col: c.col, row: c.row, facing: defFacing, px: c.px.slice(), kind: c.kind, d: dist(c.px) }))
    .sort((a, b) => (a.d - b.d) || (a.row - b.row) || (a.col - b.col))
    .map(({ d, ...rest }) => rest)
}

/**
 * 全序列：近战 → 远程 → 医疗（若单独给了）→ 其余就近补位，去重。
 * 部署循环的兜底池就用这个顺序，保证「先占指定格，再围绕它们补」。
 */
export function orderedTiles(map) {
  const o = orderOf(map)
  if (!o) return []
  const out = []
  const seen = new Set()
  const push = (t) => {
    const k = t.col + ',' + t.row
    if (seen.has(k)) return
    seen.add(k)
    out.push(t)
  }
  for (const t of o.tank) push(t)
  for (const t of o.melee) push(t)
  for (const t of o.ranged) push(t)
  for (const t of o.healer) push(t)
  for (const t of orderRemaining(map, seen)) push(t)
  return out
}

/** 绿格/学到格与地图格的对齐容差（像素）。绿格是 20px 网格采样，实测和地图实测点差 10~30px。 */
export const PX_TOL = 45

/**
 * 把「现场探到的可落格」按地图 deployOrder 重排（2026-11-12 修）。
 *
 * 为什么需要：deployFromDeck 探到合法格之后会把候选池整个换成绿格池，而绿格池是
 * sidecar 按绿度排序、20px 网格采样的（sidecar/_validtiles.py 的 best.sort(key=-ratio)）。
 * 直接拿它当池子 = 地图给的顺序作废，第一个干员会站到绿度最高那格。
 * 这里把绿格池按 orderedTiles 的顺序重排：先认领近战→远程→医疗的指定格，
 * 再按「到优先格的最近距离」补剩下的；认不上的（镜头漂了/对不上）排最后。
 */
export function sortPoolByOrder(map, pool, { tol = PX_TOL } = {}) {
  const pts = (Array.isArray(pool) ? pool : [])
    .filter((p) => p && p.length >= 2 && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])))
    .map((p) => [Math.round(Number(p[0])), Math.round(Number(p[1]))])
  if (!pts.length) return []
  const seq = orderedTiles(map)
  if (!seq.length) return pts
  const taken = new Set()
  const out = []
  for (const t of seq) {
    let bi = -1
    let bd = tol
    for (let i = 0; i < pts.length; i++) {
      if (taken.has(i)) continue
      const d = Math.hypot(pts[i][0] - t.px[0], pts[i][1] - t.px[1])
      if (d <= bd) { bd = d; bi = i }
    }
    if (bi >= 0) { taken.add(bi); out.push(pts[bi]) }
  }
  const o = orderOf(map)
  const anchors = o ? [...o.tank, ...o.melee, ...o.ranged, ...o.healer].map((t) => t.px) : []
  const ref = anchors.length ? anchors : [seq[0].px]
  const dist = (p) => {
    let m = Infinity
    for (const a of ref) {
      const d = Math.hypot(p[0] - a[0], p[1] - a[1])
      if (d < m) m = d
    }
    return m
  }
  const rest = pts.filter((p, i) => !taken.has(i)).sort((a, b) => dist(a) - dist(b))
  return out.concat(rest)
}

/** 给日志用：把 deployOrder 落在哪几格说清楚，含被丢掉的坐标。 */
export function describeOrder(map) {
  const o = orderOf(map)
  if (!o) return '这张图没有 deployOrder（走旧的覆盖序）'
  const fmt = (list) => list.map((t) => '(' + t.col + ',' + t.row + ')').join(' ')
  const parts = []
  if (o.tank.length) parts.push('重装 ' + fmt(o.tank))
  if (o.melee.length) parts.push('近战 ' + fmt(o.melee))
  if (o.ranged.length) parts.push('远程 ' + fmt(o.ranged))
  if (o.healer.length) parts.push('医疗 ' + fmt(o.healer))
  const bad = o.dropped.length ? '；跳过不可部署格 ' + o.dropped.map((d) => '(' + d[0] + ',' + d[1] + ')').join(' ') : ''
  return (parts.join(' → ') || '空') + bad
}
