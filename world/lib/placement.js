/**
 * placement.js — 站位打分（纯函数，不碰设备）
 *
 * 输入是一张已经网格化的地图（见 data/maps/*.json）和一个干员（职业 + 攻击范围），
 * 输出「站哪一格 + 朝哪个方向」。
 *
 * 约定：
 *   - 格子坐标用整数格 (gx, gy)，gx 向右为正、gy 向下为正，跟 PRTS 的范围数据一致。
 *   - 范围数据来自 data/operator-ranges.json，形如 [[0,0],[1,0],...]，[0,0] 是干员自己那格。
 *   - 地图：{ name, cols, rows, tiles:[{gx,gy,kind}], path:[{gx,gy}], redDoor:{gx,gy}, blueDoor:{gx,gy} }
 *     kind: 'ground'（地面，近战可站）/ 'high'（高台，远程可站）/ 'blocked'（不能站）/'fence'（栅栏，只远程）
 *
 * 打分（2026-11-10 用户的约束：范围重叠没关系，所以没有「和友军重叠」惩罚项）：
 *   score = 路线覆盖 × 职业权重
 *         + 医疗：罩住的友军数 × w.ally
 *         + 重装：离红门越近越好（挡在敌人来路上）
 *         + 远程站高台/栅栏的安全加成
 *         + 近战站地面
 * 朝向：四个方向各算一遍，取覆盖路线最多；平局朝红门。
 */

export const DIRS = ['right', 'down', 'left', 'up']

/** 把 (dx,dy) 按方向旋转。right 不转，down 顺时针 90°，left 180°，up 270°。 */
export function rotate(dx, dy, dir) {
  switch (dir) {
    case 'right': return z(dx, dy)
    case 'down': return z(-dy, dx)
    case 'left': return z(-dx, -dy)
    case 'up': return z(dy, -dx)
    default: throw new Error('bad dir ' + dir)
  }
}

/** 把 -0 归一成 0：deepEqual 里 -0 !== 0，测试会被这个绊倒。 */
function z(x, y) {
  return [x === 0 ? 0 : x, y === 0 ? 0 : y]
}

/** 干员站在 (gx,gy)、朝 dir 时覆盖的格集（含自身格）。 */
export function coveredCells(gx, gy, range, dir) {
  const out = new Set()
  for (const [dx, dy] of range || []) {
    const [rx, ry] = rotate(dx, dy, dir)
    out.add((gx + rx) + ',' + (gy + ry))
  }
  out.add(gx + ',' + gy)
  return out
}

/**
 * 职业打分权重。数值是相对值，来自 placement-design-2026-11-10.md，
 * 核心几条：医疗罩友军最要紧、重装挡路、输出覆盖路线。
 */
export const CLASS_W = {
  重装: { path: 1.0, ally: 0.0, door: 3.0, safe: 0.0, ground: 2.0 },
  医疗: { path: 0.3, ally: 2.5, door: 0.0, safe: 1.5, ground: 1.0 },
  狙击: { path: 2.0, ally: 0.2, door: 0.0, safe: 1.5, ground: 0.0 },
  术师: { path: 2.0, ally: 0.2, door: 0.0, safe: 1.5, ground: 0.0 },
  近卫: { path: 1.5, ally: 0.0, door: 1.0, safe: 0.0, ground: 1.5 },
  先锋: { path: 1.2, ally: 0.0, door: 2.0, safe: 0.0, ground: 1.5 },
  辅助: { path: 1.2, ally: 0.3, door: 0.0, safe: 1.2, ground: 0.0 },
  特种: { path: 1.0, ally: 0.0, door: 1.0, safe: 1.0, ground: 1.0 },
}

const DEFAULT_W = { path: 1.2, ally: 0.3, door: 0.5, safe: 1.0, ground: 1.0 }

/**
 * 友军加权：医疗的职责是奶住最能扛的那个。
 * 用户原话（m03053）：「至少一个医疗放后面，攻击范围覆盖最前面的重装」。
 * 所以罩住重装算的分比罩住别人高。
 */
export const ALLY_W = { 重装: 2.0, 近卫: 1.3, 特种: 1.1 }
export function allyWeightOf(cls) {
  return Object.prototype.hasOwnProperty.call(ALLY_W, cls) ? ALLY_W[cls] : 1.0
}

export function weightOf(cls) {
  return CLASS_W[cls] || DEFAULT_W
}

function manhattan(a, b) {
  return Math.abs(a.gx - b.gx) + Math.abs(a.gy - b.gy)
}

/**
 * 单个「格子 + 朝向」的得分。
 * @param {{tile:{gx,gy,kind}, cls:string, range:number[][], dir:string,
 *          pathSet:Set<string>, allies:{gx,gy}[], map:{redDoor?:{gx,gy}, cols?:number, rows?:number}}} p
 */
export function scoreAt({ tile, cls, range, dir, pathSet, allies = [], map = {} }) {
  const w = weightOf(cls)
  const cells = coveredCells(tile.gx, tile.gy, range, dir)
  let pathHit = 0
  for (const c of cells) if (pathSet.has(c)) pathHit += 1
  let allyHit = 0
  for (const a of allies) if (cells.has(a.gx + ',' + a.gy)) allyHit += allyWeightOf(a.cls)

  let score = pathHit * w.path + allyHit * w.ally

  // 重装：离红门（敌人来向）越近越好，但不是站门上，用一个递减项
  if (map.redDoor && w.door) {
    const d = manhattan(tile, map.redDoor)
    score += w.door * Math.max(0, 6 - d) / 6
  }

  // 站台安全性：远程站高台/栅栏加分，近战站高台反而扣（上不去）
  const ranged = cls === '狙击' || cls === '术师' || cls === '医疗' || cls === '辅助'
  if (tile.kind === 'high' || tile.kind === 'fence') {
    score += ranged ? w.safe : -2
  } else if (tile.kind === 'ground') {
    score += w.ground
  }
  if (tile.kind === 'blocked') return -Infinity

  return score
}

/**
 * 在候选格里挑最好的一个。
 * @returns {{tile:object, dir:string, score:number, cells:Set<string>}|null}
 */
export function bestPlacement({ tiles, cls, range, pathSet, allies = [], map = {}, facing }) {
  if (!tiles || !tiles.length) return null
  let best = null
  const dirs = facing ? [facing] : DIRS
  for (const tile of tiles) {
    for (const dir of dirs) {
      const s = scoreAt({ tile, cls, range, dir, pathSet, allies, map })
      if (!Number.isFinite(s)) continue
      // 平局时优先朝红门
      let better = !best || s > best.score
      if (!better && best && s === best.score && map.redDoor) {
        const dc = Math.abs(tile.gx - map.redDoor.gx) + Math.abs(tile.gy - map.redDoor.gy)
        const db = Math.abs(best.tile.gx - map.redDoor.gx) + Math.abs(best.tile.gy - map.redDoor.gy)
        better = dc < db
      }
      if (better) best = { tile, dir, score: s, cells: coveredCells(tile.gx, tile.gy, range, dir) }
    }
  }
  return best
}

/** 把地图 JSON 里的 path 数组转成 Set，省得每次重建。 */
export function pathSetOf(map) {
  const s = new Set()
  for (const p of (map && map.path) || []) s.add(p.gx + ',' + p.gy)
  return s
}


/* ── 屏幕像素 ↔ 网格 ────────────────────────────────────────────────
 * 休整期默认镜头下，可站格是一张 110px 见方的方格网，左上角第一格中心在 (660,300)。
 * 这组常数来自 DEPLOY_TILES 里 12 个实测绿过的格心（660/770/880/990/1100 × 300/410/520）。
 * 镜头一动这组数就失效 —— 所以调用方要先确认镜头没被拖动过。
 */

/**
 * 换人候选格（2026-11-12 用户 m02251 第 3 条：把新干员拖到原干员所在格，落位时照样滑方向）。
 * 场上满员时「剩余可放置角色」是 0，空格放不上去，但已占格可以换 —— 直接拿已占格当候选。
 * 排序：y 小的先（前排优先），再 x 小的；limit 默认 6 个够挑了。
 * @param {Set<string>} occupiedPx 'x,y' 集合
 * @param {{limit?:number}=} opts
 * @returns {number[][]} [[x,y], ...]
 */
export function replaceTargets(occupiedPx, opts = {}) {
  const limit = Math.max(1, Number(opts.limit) || 6)
  const out = []
  if (!occupiedPx || typeof occupiedPx.forEach !== 'function') return out
  occupiedPx.forEach((key) => {
    const parts = String(key).split(',')
    const x = Number(parts[0])
    const y = Number(parts[1])
    if (Number.isFinite(x) && Number.isFinite(y)) out.push([x, y])
  })
  return out.slice().sort((a, b) => a[1] - b[1] || a[0] - b[0]).slice(0, limit)
}
export const GRID = { x0: 485, y0: 236, stepX: 118, stepY: 110 }
export const TILE_ORIGIN = [GRID.x0, GRID.y0]
export const TILE_STEP = GRID.stepX

export function pxToGrid(px) {
  return {
    gx: Math.round((px[0] - GRID.x0) / GRID.stepX),
    gy: Math.round((px[1] - GRID.y0) / GRID.stepY),
  }
}

export function gridToPx(gx, gy) {
  return [GRID.x0 + gx * GRID.stepX, GRID.y0 + gy * GRID.stepY]
}

/**
 * 上场先后（越小越早）。
 *
 * 依据 guides-2026-11-10.json 的机制推导：部署顺序决定仇恨——敌人优先打**最后部署**的干员，
 * 所以最后上场的那个是全场靶子。于是脆皮先上（早部署=安全），承伤位最后上（吃仇恨）。
 * 官方没有职业站位表，这条是推导，不是明文。
 */
export const DEPLOY_RANK = { 医疗: 2, 术师: 3, 狙击: 4, 辅助: 5, 先锋: 6, 近卫: 7, 特种: 8, 重装: 9 }

/** 职业 → 上场先后；未知职业按中间（5）算。 */
export function deployRankOf(cls) {
  return Object.prototype.hasOwnProperty.call(DEPLOY_RANK, cls) ? DEPLOY_RANK[cls] : 5
}

/**
 * 按「谁该先上场」排序，返回新数组（不改原数组）。
 * 医疗/术师/狙击这些脆皮排前面，重装排最后 —— 最后上场的那个吃仇恨。
 */
export function orderUnits(units = []) {
  return [...units].sort((a, b) => deployRankOf(a && a.cls) - deployRankOf(b && b.cls))
}

/**
 * 给整队甲板排一个上场计划：谁站哪格、朝哪。
 *
 * 注意：返回的 plan 与入参 units **逐项对齐**（plan[i] 对应 units[i] 的落点），
 * 不在这里重排——重排只管「拖的顺序」，由调用方用 orderUnits() 决定，否则 chip 与落点会错位。
 *
 * @param {{units:Array<{name?:string,cls?:string,range?:number[][]}>, tiles:number[][],
 *          closed?:Iterable<string>, map?:object, facing?:string}} p
 *        tiles 是 px 坐标；closed 是已经站人的 'x,y'
 * @returns {Array<{name:string, cls:string, tile:number[], grid:{gx:number,gy:number}, facing:string, score:number, deployRank:number}>}
 */
export function planDeploy({ units = [], tiles = [], closed = null, map = {}, facing = null } = {}) {
  const pathSet = pathSetOf(map)
  const used = new Set(closed || [])
  const allies = []
  const plan = []
  for (const u of units) {
    const open = []
    for (const t of tiles) {
      if (used.has(t[0] + ',' + t[1])) continue
      const g = pxToGrid(t)
      const kind = (map && map.kindAt && map.kindAt(g.gx, g.gy)) || 'ground'
      open.push({ gx: g.gx, gy: g.gy, kind, px: t })
    }
    if (!open.length) break
    const best = bestPlacement({
      tiles: open,
      cls: u.cls || '',
      range: u.range || [[0, 0]],
      pathSet,
      allies,
      map: map || {},
      facing: facing || undefined,
    })
    if (!best) break
    used.add(best.tile.px[0] + ',' + best.tile.px[1])
    allies.push({ gx: best.tile.gx, gy: best.tile.gy, cls: u.cls || '' })
    plan.push({
      name: u.name || '',
      cls: u.cls || '',
      tile: best.tile.px,
      grid: { gx: best.tile.gx, gy: best.tile.gy },
      facing: best.dir,
      score: best.score,
      deployRank: deployRankOf(u.cls || ''),
    })
  }
  return plan
}

// 2026-11-12 08:35：升级面板几何的纯函数版（与 sidecar/ocr.py 的 panel_geometry 同公式）。
// 用途：OCR 读不到商店等级时，doUpgrade 不能再退回写死的 POINTS.upgrade(337,972)——
// 313 是 Lv2 的中心，Lv1（4 格）的真中心是 578，点上去毫无反应（回合 2 实测「升级费 4→4、
// 面板 x null→null、格数 3→3、LEVEL 1→1」）。改成按 level 现算。
// 公式：整排商店右对齐，最右卡中心 1527，卡宽 240，间距 240，格子数 = 3 + idx。
//
// 2026-11-12 09:4x 改（用户 m03312）：**不再把 x 夹到 60**。夹住等于「假装按钮还在屏幕上」，
// 点上去是屏幕左边缘的空地，白点两下还判不出失败。下标 4 的中心算出来 -141（panelLeft -228），
// 明确标 visible=false，调用方改为去截图里 OCR 认「升级」两个字。
//
// 2026-11-12 12:3x 口径统一：参数改名 idx，是**下标**不是界面等级（idx = 界面 LEVEL − 1），
// 与 sidecar/ocr.py 的 panel_geometry(idx) 严格一致。要传界面等级就用 upgradePanelCenterFor()。
export function upgradePanelCenter(idx, { rightCenter = 1527, cardW = 240, pitch = 240, panelW = 173, screenW = 1920, margin = 60 } = {}) {
  const lvRaw = Number(idx)
  const lv = Number.isFinite(lvRaw) ? Math.max(1, Math.min(6, Math.round(lvRaw))) : 1
  const n = 3 + lv
  const first = rightCenter - Math.floor(cardW / 2) - (n - 1) * pitch
  const panelLeft = first - panelW - 22
  const panelRight = first - 22
  const x = Math.round((panelLeft + panelRight) / 2)
  const visible = x >= margin && x <= screenW - margin
  return { level: lv, first, panelLeft, panelRight, x, visible }
}

// 界面等级入口（OCR 的 read_shop_level 现在返回界面等级）：实测本函数/panel_geometry 的第 L 个
// 下标画的是界面 L+1 的布局，所以界面 Ⅲ 要按 2 算（x=338，实拍 336）、界面 Ⅳ 按 3 算（x=98，实拍 95）。
export function upgradePanelCenterFor(level, opts = {}) {
  const n = Number(level)
  return upgradePanelCenter(Number.isFinite(n) ? Math.max(1, n - 1) : 1, opts)
}

export default { replaceTargets, upgradePanelCenter, upgradePanelCenterFor, DIRS, rotate, coveredCells, scoreAt, bestPlacement, pathSetOf, weightOf, CLASS_W, pxToGrid, gridToPx, planDeploy, orderUnits, deployRankOf, DEPLOY_RANK, TILE_ORIGIN, TILE_STEP, GRID }