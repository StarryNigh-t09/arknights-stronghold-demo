
// 当面试跑 3 个回合（用户 m01928）：
//   第 1 回合：买干员 → 买装备 → 上干员 → 装备上身 → 卖干员
//   第 2 回合：先升级商店，再照常买
//   第 3 回合：恢复自动
// 每一步都截图 + 记耗时，落在 <workspace>/showcase-<时间>/ 。
import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { screenshot } from '../lib/adb.js'
import { probeState } from '../lib/ocr.js'
import { peek, tapAt, sleep, enterRun, shopAction, scanDeckChips, sellDeckUnit, placeEquip, findDeckEquip, placeDeckUnit, playRound, POINTS, leaveSettle } from '../lib/run.js'
import { senseRun, autoRest } from '../lib/drive.js'
import { deployTilesRanked } from '../lib/gamemap.js'

const HERE = resolve(process.cwd())
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const OUT = resolve(HERE, '..', '..', 'showcase-' + stamp)
mkdirSync(OUT, { recursive: true })
const T0 = Date.now()
let N = 0
const tsec = () => ((Date.now() - T0) / 1000).toFixed(1)
function log(msg) { const l = '[' + tsec() + 's] ' + msg; console.log(l); appendFileSync(join(OUT, 'run.log'), l + '\n') }
async function shot(tag) {
  N += 1
  const name = String(N).padStart(3, '0') + '-' + tag + '.png'
  try { writeFileSync(join(OUT, name), screenshot()) } catch { return }
  appendFileSync(join(OUT, 'steps.jsonl'), JSON.stringify({ n: N, t: Number(tsec()), tag, file: name }) + '\n')
}
async function act(tag, fn) {
  log('▶ ' + tag)
  const s = Date.now()
  try {
    const r = await fn()
    log('✓ ' + tag + '（' + ((Date.now() - s) / 1000).toFixed(1) + 's）')
    await shot(tag)
    return r
  } catch (e) {
    log('✗ ' + tag + ' 失败：' + e.message)
    await shot('FAIL-' + tag)
    throw e
  }
}

// 装备名表（用来分辨店里哪张是装备、哪张是干员）
const EQUIP = new Set()
try {
  const j = JSON.parse(readFileSync(resolve(HERE, 'data', 'equipment.json'), 'utf8'))
  for (const it of [...(j.items || []), ...(j.equipment || []), ...(j.jobChangeItems || [])]) if (it && it.name) EQUIP.add(it.name)
} catch (e) { log('读装备表失败：' + e.message) }
const isEquip = (c) => EQUIP.has(c.name)

let level = 1
async function sense(round, tag) {
  const st = await senseRun(level, { expect: 'rest', round })
  if (!st.ok) throw new Error('认不出画面：' + st.error)
  log((tag || '') + ' 回合' + st.round + '｜钱' + st.money + '｜槽位' + st.slotsLeft + '｜Lv' + st.level + '/升级费' + st.upgradeCost + '｜店开' + st.shopExpanded + '｜店' + (st.shop || []).filter((c) => c && !c.empty).length + '张')
  if (st.level) level = Number(st.level)
  return st
}
async function openShop(st, round) {
  if (st.shopExpanded !== true) {
    await tapAt(POINTS.shopExpand, 1600, '展开商店')
    await sleep(600)
    st = await sense(round, '展开后')
  }
  return st
}
async function foldShop(st, round) {
  if (st.shopExpanded === true) {
    await tapAt(POINTS.collapse, 1600, '折叠商店')
    await sleep(600)
    st = await sense(round, '折叠后')
  }
  return st
}
async function buyCard(st, card, round, why) {
  const before = Number(st.money)
  await shopAction({ buyPoints: [[card.x, card.y]] })
  const after = await sense(round, '买后')
  const spent = before - Number(after.money)
  const ok = Number.isFinite(spent) && spent >= 0 && (spent > 0 || Number(after.money) === 0)
  log('  买 ' + card.name + '（' + card.price + ' 块）→ 钱 ' + before + '→' + after.money + '，' + (spent > 0 ? '成交' : '没扣钱')) 
  return { st: after, ok: spent > 0 }
}

const main = async () => {
  log('输出目录 ' + OUT)
  let pre = peek()
  log('当前界面：' + pre.state)
  if (pre.state === 'wz_settle') { await leaveSettle(); await sleep(2500); pre = peek(); log('离开结算 → ' + pre.state) }
  if (pre.state === 'wz_hall') {
    await act('开新局', async () => { const r = await enterRun({ mode: 'independent' }); log('  ENTER ' + JSON.stringify(r)); return r })
    await sleep(3000)
  }

  // ─── 第 1 回合 ───────────────────────────────
  let st = await act('第1回合·认画面', () => sense(1, '第1回合'))
  st = await act('第1回合·展开商店', () => openShop(st, 1))
  const cards = (st.shop || []).filter((c) => c && !c.empty && c.name)
  log('  店里：' + cards.map((c) => c.name + '(' + c.price + ')').join(' / '))
  const units = cards.filter((c) => !isEquip(c)).sort((a, b) => (a.price || 99) - (b.price || 99))
  const equips = cards.filter(isEquip).sort((a, b) => (a.price || 99) - (b.price || 99))
  log('  干员卡 ' + units.length + ' 张，装备卡 ' + equips.length + ' 张')

  let bought = 0
  for (const u of units.slice(0, 2)) {
    if (Number(st.money) < Number(u.price || 99)) { log('  钱 ' + st.money + ' 不够买 ' + u.name + '（' + u.price + '）'); continue }
    const r = await act('第1回合·买干员 ' + u.name, () => buyCard(st, u, 1))
    st = r.st
    if (r.ok) bought += 1
  }
  if (!bought) log('  ⚠ 这一轮一个干员都没买成')
  if (equips.length && Number(st.money) >= Number(equips[0].price || 99)) {
    const r = await act('第1回合·买装备 ' + equips[0].name, () => buyCard(st, equips[0], 1))
    st = r.st
  } else {
    log('  这轮没有买得起的装备卡')
  }
  st = await act('第1回合·折叠商店', () => foldShop(st, 1))

  const tiles = deployTilesRanked()
  const slotsBefore = Number(st.slotsLeft)
  let chipUsed = null
  const sc1 = await act('第1回合·扫甲板', () => scanDeckChips())
  const bench1 = (sc1.chips || []).sort((a, b) => a.x - b.x)
  log('  甲板 ' + bench1.length + ' 张：' + bench1.map((c) => c.x + ',' + c.y).join(' / '))
  if (bench1.length) {
    chipUsed = bench1[0]
    await act('第1回合·上干员 (最左一张 → 格 ' + tiles[0].join(',') + ')', async () => {
      const r = await placeDeckUnit({ x: chipUsed.x, y: chipUsed.y, to: tiles[0], facing: 'right' })
      log('  ' + JSON.stringify(r).slice(0, 300))
      return r
    })
    st = await act('第1回合·上干员后核对槽位', () => sense(1, '上场后'))
    log('  剩余可放置角色：' + slotsBefore + ' → ' + st.slotsLeft)
  } else {
    log('  ⚠ 甲板没牌，跳过上干员')
  }

  // 装备上身：从甲板上方那件散着的装备拖到刚站好的干员脚下
  const eq = await act('第1回合·找甲板上的装备', () => findDeckEquip())
  const item = (eq.items || []).find((i) => !i.placed)
  if (item) {
    const from = [Math.round(item.x + item.w / 2), Math.round(item.y + item.h / 2)]
    await act('第1回合·装装备 ' + item.name + ' → 格 ' + tiles[0].join(','), async () => {
      const r = await placeEquip({ from, to: tiles[0], holdMs: 900 })
      log('  ' + JSON.stringify(r).slice(0, 300))
      return r
    })
    const after = await act('第1回合·装备复查', () => findDeckEquip())
    const left = (after.items || []).filter((i) => !i.placed).length
    log('  散在外面没装上的装备：' + left + ' 件')
  } else {
    log('  ⚠ 甲板头顶没认出装备（' + (eq.error || '没命中图库') + '），跳过装装备')
  }

  // 卖干员：把甲板最右（最早买的）那张拖到卖卡区
  const sc2 = await act('第1回合·再扫甲板', () => scanDeckChips())
  const bench2 = (sc2.chips || []).sort((a, b) => b.x - a.x)
  if (bench2.length) {
    const victim = bench2[0]
    await act('第1回合·卖干员 (最右一张 ' + victim.x + ',' + victim.y + ')', () => sellDeckUnit([victim.x, victim.y]))
    const sc3 = await act('第1回合·卖后复核', () => scanDeckChips())
    log('  甲板张数：' + bench2.length + ' → ' + (sc3.chips || []).length)
  } else {
    log('  ⚠ 甲板空了，没有可卖的干员')
  }

  await act('第1回合·开战', async () => { const r = await playRound({}); log('  ' + JSON.stringify(r).slice(0, 300)); return r })

  // ─── 第 2 回合：先升级商店 ─────────────────────
  await sleep(2000)
  st = await act('第2回合·认画面', () => sense(2, '第2回合'))
  st = await act('第2回合·展开商店', () => openShop(st, 2))
  const upPt = st.upgradePoint ? [Number(st.upgradePoint.x), Number(st.upgradePoint.y)] : POINTS.upgrade
  const lvBefore = Number(st.level), costBefore = Number(st.upgradeCost), moneyBefore = Number(st.money)
  if (Number.isFinite(costBefore) && moneyBefore >= costBefore) {
    await act('第2回合·升级商店 ' + lvBefore + '→' + (lvBefore + 1) + '（' + costBefore + ' 块）', () => shopAction({ upgrade: true, upgradePoint: upPt }))
    const after = await act('第2回合·升级后核对', () => sense(2, '升级后'))
    log('  商店：Lv' + lvBefore + '/费' + costBefore + ' → Lv' + after.level + '/费' + after.upgradeCost + '，钱 ' + moneyBefore + '→' + after.money)
    level = Number(after.level) || level
    st = after
  } else {
    log('  钱 ' + moneyBefore + ' 不够升级（要 ' + costBefore + '），这轮先不升')
  }
  const cards2 = (st.shop || []).filter((c) => c && !c.empty && c.name)
  log('  升级后店里：' + cards2.map((c) => c.name + '(' + c.price + ')').join(' / '))
  const u2 = cards2.filter((c) => !isEquip(c)).sort((a, b) => (a.price || 99) - (b.price || 99))
  for (const u of u2.slice(0, 2)) {
    if (Number(st.money) < Number(u.price || 99)) continue
    const r = await act('第2回合·买干员 ' + u.name, () => buyCard(st, u, 2))
    st = r.st
  }
  st = await act('第2回合·折叠商店', () => foldShop(st, 2))
  const slots2 = st.slotsLeft != null ? Number(st.slotsLeft) : null
  if (slots2 === null || slots2 > 0) {
    await act('第2回合·放人', async () => {
      const sc = await scanDeckChips()
      const bench = (sc.chips || []).length
      if (!bench) { log('  甲板空，跳过'); return }
      const r = await senseRun(level, { expect: 'rest', round: 2 })
      const slots = r.slotsLeft != null ? Number(r.slotsLeft) : bench
      const d = await deployFromDeckShim(bench, slots)
      log('  ' + JSON.stringify(d).slice(0, 300))
    })
  }
  await act('第2回合·开战', async () => { const r = await playRound({}); log('  ' + JSON.stringify(r).slice(0, 300)); return r })

  // ─── 第 3 回合：恢复自动 ──────────────────────
  await sleep(2000)
  st = await act('第3回合·认画面', () => sense(3, '第3回合'))
  const rest = await act('第3回合·自动买卡+放人', () => autoRest({ centerLevel: level, deck: [], wantList: 'auto', deploy: true, boardCount: 0, trace: OUT }))
  log('  ' + (rest.steps || []).join('\n  '))
  await act('第3回合·开战', async () => { const r = await playRound({}); log('  ' + JSON.stringify(r).slice(0, 300)); return r })
  log('三个回合演示结束（游戏停在第 3 回合打完的状态）')
}

let deployFromDeckShim = async (bench, slots) => {
  const { deployFromDeck } = await import('../lib/drive.js')
  const sc = await scanDeckChips()
  return deployFromDeck(new Array(bench).fill({}), { facing: 'right', slotsLeft: slots, chips: sc.chips, shopOpen: false })
}

main().then(() => process.exit(0)).catch((e) => { log('总失败：' + (e && e.stack ? e.stack : e)); process.exit(1) })
