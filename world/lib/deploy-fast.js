/**
 * deploy-fast.js —— 2026-11-12 凌晨真机实测定下来的「上场」配方（替代旧的 placeBatch 落位流程）
 *
 * 真机结论（两次复现成功，配额/甲板数都验证过）：
 *  1. 起手点必须落在待命区干员的**精灵身体中心**（≈ 头顶徽章 + (47,88)）。
 *     按在徽章、锁链、箱子上完全没反应；按太短（110ms）游戏当单击 → 弹干员详情面板。
 *  2. 拖到目标格松手后，游戏**不会自己落位**：进入「待确认」态 —— 全场绿格、左上红「点击取消」、
 *     干员变成白色幽灵站在格上、头顶出现 ∧ 箭头。用绿格像素数判：正常 ~30，待确认 10 万量级。
 *  3. 确认动作是**向上滑**，且必须走 `adb shell input swipe`（minitouch 发同样轨迹无效）：
 *     从幽灵身上 (x, y-50) 滑到 (x, y-200)，400ms。
 *  4. 落点必须是**该干员的合法格**。落在不合法格上，幽灵会吸到最近的合法格，上滑就滑空了 → 取消。
 *     合法格用「待确认」那一帧的绿格算（sidecar/_validtiles.py），每回合探一次就够。
 *  5. 判成功不能只看绿格归零（取消也会归零），要看**待命区少了一张卡**。
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { toRaw } from './touch.js'
import { adbPath, currentDevice, adb, screenshot, swipe } from './adb.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const TMP = join(ROOT, '.tmp')
const PY = process.env.COOP_OCR_PYTHON || 'python'

/** 待命区：按徽章定位干员精灵身体用的偏移（真机实测两例：+50/+97、+44/+87、+50/+82） */
export const BODY_OFFSET = { dx: 47, dy: 88 }
/** 确认手势默认参数 */
export const CONFIRM = { fromDy: -50, toDy: -200, ms: 400 }
/**
 * pending 判据：绿格像素数。
 * 2026-11-12 09:2x 实测两极：真待确认帧 green 118652 / red 1818；刚卖完卡或普通休整帧
 * green 1320 / red 8~13。原阈值 1200 会把「卖完卡」误判成还在待确认（isPending 的 green 分支），
 * 所以抬到 3000 —— 1320 与 118652 之间留了 90 倍余量。
 */
export const PENDING_GREEN = 3000
/**
 * 「待确认」态判据。只数绿格会漏：有的地图这一帧绿格本来就少（2026-11-12 实测 green=771
 * 的真待确认帧被当成没拎起来，白换一次按压点）。红色「点击取消」X 一出现就是上千像素，
 * 所以 green 或 red 任一到位都算。
 */
export function isPending(st, { green = 20000, red = 600 } = {}) {
  if (!st) return false
  // 2026-11-13 19:4x 真机定案：绿格像素判不了「待确认态」—— wz-01 这张图的黄绿地块本身就绿，
  // 干净休整帧 green≈3400，而真待确认帧只有 1874~2591（.tmp/dep-a-*.png 全是 pending）→
  // 旧阈值 3000 把「已经拎起来」判成「没拎起来」，程序不去滑朝向，牌留在待确认态，整回合 0 上场。
  // 改用「点击取消」红徽章（_state.py 的 cancel）：真 pending 1746~2150，干净帧 0。
  // green > 20000 只作兜底（有的地图绿块面积巨大）。
  if (Number(st.cancel) > 0) return true
  return Number(st.green) > green || Number(st.red) > red
}
/**
 * 起手按压 / 移动时长实测（2026-11-12 00:5x，同一张牌各 3 次全部进待确认态）：
 *   按压 0/10/20/30/40/60/70/80/90/100/120/150/200/250/300/400/600/800ms —— 全部 100% 拎起；
 *   移动 150/220/300/420ms —— 全部 100%。
 * 起手按住本身不关键（game 看的是「按下后有连续移动」），所以取最小值省时间：
 * 纯手势 hold20 + move150 + 上滑确认 400 ≈ 0.57s（旧配方 600+1200+70px 定朝向 是它的 3 倍）。
 * 真机完整落位验证：hold=20/move=150 一次成功（deck 3→2）。
 */
export const DEPLOY_HOLD_MS = 20
// 2026-11-13 12:4x 用户 m05738：「你拖动干员没有拖动到位，可以稍微拖慢一点，但一定要拖到位置上」。
// 原来 150ms 分 12 步滑完（单步 20ms、最长一拖 900px ≈ 75px/步）—— 幽灵跟不上，落点常被吸到隔壁格/弹回甲板。
// 现在 900ms 分 24 步（37ms/步），到位后再原地停两次确认指针在格心，才松手。
export const DEPLOY_MOVE_MS = 550

export function bodyOf(badge, off = BODY_OFFSET) {
  return { x: Math.round(badge.x + off.dx), y: Math.round(badge.y + off.dy) }
}

function pyArgs(script, ...args) {
  const env = { ...process.env }
  // PIL 只装在 work 区那个名字叫 ~ 的 site-packages 里（2026-11-12 实测）
  if (!env.PYTHONPATH) env.PYTHONPATH = join(ROOT, '~', 'Python', 'Python314', 'site-packages')
  env.PYTHONIOENCODING = 'utf-8'
  env.PYTHONUTF8 = '1'
  const r = spawnSync(PY, [join(ROOT, 'sidecar', script), ...args], { encoding: 'utf8', cwd: ROOT, env, timeout: 60000 })
  return (r.stdout || '').trim()
}

/** 当前画面状态：{green, red, redCenter, shop}。green > PENDING_GREEN 就是「待确认」态。 */
export function screenState(png, { tiles = false } = {}) {
  try { return JSON.parse(pyArgs('_state.py', png, ...(tiles ? ['--tiles'] : []))) }
  catch { return { green: -1, red: -1, redCenter: null, shop: -1 } }
}

/** 详情面板是否挡着：返回 {open, mean, mean2}。
 *  2026-11-15 03:0x 实测：休整期点中场上干员/装置会弹左侧详情面板（阻隔工事/干员卡），
 *  面板开着时甲板拖拽全被判成单击（green=794、手势 1.6s、每格都拎不起来），
 *  而 peek() 仍返回 wz_rest，所以只能靠画面判：左中区域均值 63 vs 关闭时 120，阈值 85。
 */
export function panelOpenOf(png) {
  try { return JSON.parse(pyArgs('panelopen.py', png)) }
  catch { return { open: false, mean: -1, mean2: -1 } }
}
/** 从「待确认」截图里算合法格：返回 [{x,y,ratio}]，按绿占比降序。 */
export function validTilesOf(png) {
  try {
    const o = JSON.parse(pyArgs('_validtiles.py', png))
    return (o.pts || []).map((t) => ({ ratio: t[0], x: t[1], y: t[2] }))
  } catch { return [] }
}


// ── 按压点自校准（2026-11-12 01:0x）──────────────────────────────────────────
// 镜头会因「打开干员详情/平移视角/商店开合」而变，甲板整排的位置跟着漂：
// 实测同一排徽章 y 从 783 漂到 594，按原来的 chip 坐标会点开场上干员的详情面板。
// 所以不再信任任何写死的偏移，直接拿绿格当探针，现场试出一组能用的增量，缓存到
// data/press-offset.json（每回合至少校验一次，失败就重校）。
const DELTAS = [
  [0, 0], [0, 16], [0, -16], [-18, 8], [18, 8],
  [-36, 16], [36, 16], [-18, -14], [18, -14], [0, 32], [0, -32],
]
const DROPS = [[964, 350], [1196, 353], [845, 348], [1080, 447]]

export function loadPressOffset() {
  try { return JSON.parse(readFileSync(join(ROOT, 'data', 'press-offset.json'), 'utf8')) } catch { return null }
}
export function savePressOffset(o) {
  try { mkdirSync(join(ROOT, 'data'), { recursive: true }); writeFileSync(join(ROOT, 'data', 'press-offset.json'), JSON.stringify(o), 'utf8') } catch {}
}

/**
 * 现场校准：从 chips[0] 出发，逐个试增量 + 落点，能进「待确认」态的就是可用按压点。
 * 命中后点红 X 取消（不消耗名额），把 {dx, dy, at} 落盘。
 * @returns {Promise<{ok:boolean, dx:number, dy:number, press?:{x:number,y:number}, tries:number}>}
 */
export async function calibratePress(chips, { deltas = DELTAS, drops = DROPS, maxChips = 2, savePng = null } = {}) {
  const list = (chips || []).filter(Boolean)
  if (!list.length) return { ok: false, dx: 0, dy: 0, tries: 0, why: 'no_chips' }
  let tries = 0
  for (let ci = 0; ci < Math.min(maxChips, list.length); ci++) {
    const chip = list[ci]
    for (const [dx, dy] of deltas) {
      const press = { x: Math.round(chip.x + dx), y: Math.round(chip.y + dy) }
      for (const drop of drops.slice(0, 2)) {
        tries += 1
        dragFromTo([press.x, press.y], drop, { holdMs: DEPLOY_HOLD_MS, moveMs: DEPLOY_MOVE_MS, tag: 'cal' })
        await new Promise((r) => setTimeout(r, 300))
        const buf = screenshot()
        const png = savePng ? savePng(buf) : saveShot(buf, 'cal')
        let st = { green: -1, redCenter: null }
        try { st = screenState(png) } catch {}
        if (isPending(st)) {
          try { cancelPending(st) } catch {}
          await new Promise((r) => setTimeout(r, 700))
          const o = { dx, dy, at: new Date().toISOString(), from: [chip.x, chip.y], tries }
          savePressOffset(o)
          return { ok: true, dx, dy, press, tries }
        }
      }
    }
  }
  return { ok: false, dx: 0, dy: 0, tries, why: 'no_delta_worked' }
}

/**
 * 幽灵吸附修正（2026-11-12 01:0x 实测）：落点对该干员不合法时，游戏会把幽灵**吸到最近的合法格**，
 * 但我们的落点坐标不变 —— 于是上滑滑在空地上＝取消（截图上幽灵离落点 200px）。
 * 这一帧的绿格就是合法格表，取离落点最近的那个当真实落点。
 */
export function snapTile(png, cell, precomputed = null) {
  try {
    const ts = precomputed && precomputed.length
      ? precomputed
      : validTilesOf(png)
    if (!ts.length) return null
    let best = null
    let bd = Infinity
    for (const t of ts) {
      const d = (t.x - cell[0]) ** 2 + (t.y - cell[1]) ** 2
      if (d < bd) { bd = d; best = t }
    }
    if (!best) return null
    if (Math.sqrt(bd) > 400) return null      // 离得太远说明这张图不是这一格的待确认态，别乱吸
    return [best.x, best.y]
  } catch { return null }
}

function runMinitouch(lines, tag = 'fast') {
  mkdirSync(TMP, { recursive: true })
  const f = join(TMP, tag + '-' + Date.now() + '.txt')
  writeFileSync(f, lines.join('\n') + '\n', 'utf8')
  const serial = currentDevice()
  adb(['push', f, '/sdcard/_coopanion_fast.txt'], { device: serial })
  return adb(['shell', '/data/local/tmp/minitouch -f /sdcard/_coopanion_fast.txt'], { device: serial })
}

/** 一条 minitouch 拖拽：press 按住 holdMs → 分 steps 步滑到 to → 松手。返回纯手势耗时(ms)。 */
export function dragFromTo(from, to, { holdMs = 250, moveMs = 550, steps = 16, tag = 'fast' } = {}) {
  const t0 = Date.now()
  const [sx, sy] = toRaw(from[0], from[1])
  const [tx, ty] = toRaw(to[0], to[1])
  const lines = ['d 0 ' + sx + ' ' + sy + ' 50', 'c', 'w ' + holdMs]
  const stepMs = Math.max(20, Math.round(moveMs / steps))
  for (let i = 1; i <= steps; i++) {
    lines.push('m 0 ' + Math.round(sx + (tx - sx) * i / steps) + ' ' + Math.round(sy + (ty - sy) * i / steps) + ' 50', 'c', 'w ' + stepMs)
  }
  // 到位后指针在格心再停两次（不动），确认落点稳了才松手。
  lines.push('w 160', 'm 0 ' + tx + ' ' + ty + ' 50', 'c', 'w 160', 'm 0 ' + tx + ' ' + ty + ' 50', 'c', 'w 160')
  lines.push('u 0', 'c', 'w 120')
  const r = runMinitouch(lines, tag)
  return { ok: !r.error, ms: Date.now() - t0 }
}

// 2026-11-12 01:0x：查到的复刻资料（world/docs/stronghold-protocol-rules.md）说得很清楚——
// 拖到格子只是「放入」，松手后会出**方向轮盘**，往某个方向滑＝选朝向，松手才真正完成部署。
// 所以「上滑确认」其实就是把朝向选成上。朝向可以按需要给：confirmDeploy(tile, { dir: 'right' })。
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }

/** 确认落位：从幽灵身上朝 dir 方向滑（＝在方向轮盘上选朝向）。必须用 adb input swipe。 */
export function confirmDeploy(to, { dir = 'up', dist = 150, ms = CONFIRM.ms } = {}) {
  const v = DIRS[dir] || DIRS.up
  const sx = Math.round(to[0] + v[0] * 52)
  const sy = Math.round(to[1] + v[1] * 52)
  const ex = Math.round(to[0] + v[0] * (52 + dist))
  const ey = Math.round(to[1] + v[1] * (52 + dist))
  return swipe(sx, sy, ex, ey, ms)
}

/** 点掉「待确认」态（红 X），失败时用来清残留。 */
export function cancelPending(state) {
  const rc = (state && state.redCenter) || [965, 240]
  return adb(['shell', 'input', 'tap', String(rc[0]), String(rc[1])])
}

/**
 * 探一次「合法格」：拎起一张牌(会进入待确认态) → 截图算绿格 → 点红 X 取消。
 * @param {{x:number,y:number}} press 待命区干员精灵中心
 * @param {(png:Buffer)=>string} [savePng] 存图钩子（trace 用）
 */
export async function probeValidTiles(presses, { savePng = null, drop = [1000, 500] } = {}) {
  // 2026-11-12 00:5x 实测：甲板 chip 的 x/y 并不总是干员身体中心（最右那张按上去拎不起来）。
  // 所以按候选顺序逐个试，第一个能进待确认态的就用它的绿格。
  const list = Array.isArray(presses) ? presses : [presses]
  let last = { ok: false, why: 'no_candidate', green: -1, tiles: [] }
  for (const p of list) {
    if (!p) continue
    dragFromTo([p.x, p.y], drop, { holdMs: 600, moveMs: 420, tag: 'probe' })
    await new Promise((r) => setTimeout(r, 300))
    const buf = screenshot()
    const png = savePng ? savePng(buf) : saveShot(buf, 'probe')
    const st = screenState(png)
    if (!isPending(st)) { last = { ok: false, why: 'no_pending', green: st.green, tiles: [], press: p }; continue }
    const tiles = validTilesOf(png)
    cancelPending(st)
    await new Promise((r) => setTimeout(r, 600))
    return { ok: true, tiles, pending: st.green, press: p }
  }
  return last
}

/** 把截图落盘，返回路径（sidecar 只吃文件） */
export function saveShot(buf, tag = 'shot') {
  mkdirSync(TMP, { recursive: true })
  const p = join(TMP, tag + '-' + Date.now() + '.png')
  writeFileSync(p, buf)
  return p
}

/**
 * 一次完整上场：拖到合法格 + 上滑确认 + 判成败。
 * @returns {Promise<{ok:boolean, why?:string, pending:number, after:number, ms:number, gestureMs:number}>}
 */
export async function placeFast({ from, to, holdMs = 600, moveMs = 420, steps = 12, confirmMs = CONFIRM.ms, verify = true, tag = 'place' } = {}) {
  const t0 = Date.now()
  const g = dragFromTo([from.x, from.y], [to[0], to[1]], { holdMs, moveMs, steps, tag })
  const gestureMs = g.ms
  if (!verify) {
    confirmDeploy(to, { ms: confirmMs })
    return { ok: true, pending: -1, after: -1, ms: Date.now() - t0, gestureMs }
  }
  await new Promise((r) => setTimeout(r, 280))
  const a = saveShot(screenshot(), tag + '-a')
  const s1 = screenState(a)
  if (!isPending(s1)) return { ok: false, why: 'no_pending', pending: s1.green, after: s1.green, ms: Date.now() - t0, gestureMs, shot: a }
  confirmDeploy(to, { ms: confirmMs })
  await new Promise((r) => setTimeout(r, 520))
  const b = saveShot(screenshot(), tag + '-b')
  const s2 = screenState(b)
  return { ok: !isPending(s2), pending: s1.green, after: s2.green, ms: Date.now() - t0, gestureMs, shot: b }
}
