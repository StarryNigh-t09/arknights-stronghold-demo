/**
 * drive.js — 全托管的一局：看见局面 → 决策 → 动手 → 再看见。
 *
 * 这一层只做「串起来」，判断都在 decide.js，动作都在 run.js，认字在 ocr.js。
 * 目标不是打得多漂亮，是每一回合都把资金花光、能撑多远撑多远，然后把每回合的
 * 数字记下来给 wz_review 复盘。
 */
import { mkdtempSync, readFileSync, writeFileSync, rmSync, appendFileSync , mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pythonBin } from './pyenv.js'
// 2026-11-14 09:0x 用户 m02396「提高放干员的精准性，避免重试」：候选格排序 / 记忆 / 召唤物挑选的纯函数。
import { roleKeyOfName, rankTiles, loadDeployMap, saveDeployMap, recordPlace, recordIllegal, memoryOf, summonPick } from './deploy-plan.js'
import { screenshot, screenshotCached, tap } from './adb.js'
import { readState, probeState } from './ocr.js'
import { classifyBuffer } from './vision.js'
import { adviseRest, levelupTableFromEconomy } from './decide.js'
import { economy, covenantStrength, runflow, operatorPool, equipmentBook } from './knowledge.js'
import { buildWantList, wantGaps, pickFromShop } from './wants.js'
import { readCovenants, readCovenantsNow } from './covenants.js'
import { planRestStep, shopEntryPlan, judgeUpgrade, pickSellCard, reconcileLevel, BENCH_CAP, EQUIP_CAP, targetLevelFor } from './restplan.js'
import { POINTS, DECK_PICK_HOLD_MS, sleep, deselectUnit, shopAction, playRound, waitFor, peek, prepModalVisible, placeDeckUnit, scanDeckChips, pickTactic, tacticPreference, identifyDeck, identifyDeckByOcr, scanBans, tapAt, scanFreeTiles, sellDeckUnit, findDeckEquip, dragHold, diffCell, diffCells, hasFreeRefresh, readSettle, appendRunRecord } from './run.js'
import { planDeploy, pxToGrid, replaceTargets, upgradePanelCenter, upgradePanelCenterFor } from './placement.js'
import { deployTiles, deployTilesRanked, deployTilesByCoverage, planTilesForNames, mapForPlacement, deployPoolFor, describeDeployOrder, loadGameMap, operatorInfo, roleGroup } from './gamemap.js'
import { planEquipAssignments, describeEquipPlan, kindLabel, groupLabel } from './equiporder.js'
import { planDeckChips, rememberDeck, describeDeckLayout } from './decklayout.js'
import { sortPoolByOrder, PX_TOL } from './deployorder.js'
// 2026-11-13（handoff §3 / 用户原话）：第 14 回合是 BOSS 关，站位/医疗细分/换人规则在 bossplan.js。
import { isBossRound, bossLayoutFor, bossTilesFor, planBossSwaps, describeBossPlan, BOSS_ROUND } from './bossplan.js'
// 2026-11-13 12:xx 用户 m05472：每回合都可以长按拖动互换站位（只给被拖动的人滑朝向）。
import { swapPlan, describeSwapPlan } from './swapplan.js'
import { placeBatch } from './act.js'
import { dragFromTo, confirmDeploy, probeValidTiles, validTilesOf, snapTile, screenState, panelOpenOf, saveShot, isPending, PENDING_GREEN, DEPLOY_HOLD_MS, DEPLOY_MOVE_MS } from './deploy-fast.js'
import { loadRoster, saveRoster, addUnit } from './roster.js'
// 2026-11-12 22:xx（用户 m02613–m02617）：凑盟约优先于阶数；换人先比盟约贡献。纯函数在 covenantplan.js。
import { pickBuyTarget, pickSwap, pickSellChips, planRecallSwap, describeCovenants, covenantCounts, loadCovenantMap, covenantsOf, benchDeployOrder } from './covenantplan.js'
import { loadGuideRank, guideWeightMap, guideTargets } from './guideplan.js'
import { loadBoard, saveBoard, place as boardPlace, idAt } from './board.js'

/**
 * 地图问题清单（用户 m02704 第 5 条）：布阵时某个格拖不上去，不改任何策略、也不拉黑，
 * 只记一笔，回合末和日志一起给用户看 —— 地图就几张，她人工核对比我们猜快。
 * 文件：world/data/map-issues.jsonl（一行一条，可重复）。
 */
const MAP_ISSUES = fileURLToPath(new URL('../data/map-issues.jsonl', import.meta.url))
function noteTileIssue(px, why, round, extra) {
  try {
    appendFileSync(MAP_ISSUES, JSON.stringify({
      at: new Date().toISOString(),
      map: 'wz-01',
      px: [px[0], px[1]],
      why,
      round: round == null ? null : Number(round),
      extra: extra || null
    }) + '\n')
  } catch { /* 记不下来不影响主流程 */ }
}

/** OCR 给的是罗马数字（I…VI），决策层要的是 1…6。 */
const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 }

/**
 * 商店升级节奏（用户 m04440：不是甲板满了才升级，是按节奏升；甲板一般不放满）。
 *
 * 2026-11-10 晚按 6 个攻略视频校准（world/data/strategy-2026-11-10.json）：
 *   「三回合升二 / 四或五回合升三（看战力）/ 七回合升四 / 然后停本 D 牌凑对子」，
 *   而且主流「不升六本，烂在五本，用五本商店碰六本卡」（六本池太脏）。
 * 所以上限压到 5：升到 6 本在我们这个自动局里只会稀释卡池、还贵。
 */
export function targetShopLevel(round) {
  // 2026-11-11 22:35 用户 m05971「按照节奏升级」：节奏表搬到 restplan.js 的 PACE，
  // 这里只做委托，避免两处口径打架（原来这边写死成 3/4/7/10，改节奏得改两个地方）。
  return targetLevelFor(round)
}

/** 干员名 → 阶数（1…6）。数据来自 covenants-map × 攻击范围表，143 人全覆盖。 */
let TIER_CACHE = null
// 2026-11-12 03:4x 实测（trace-2026-11-11T19-14-04）：名额真为 0 的那几回合，每回合都要白花
// ~38s 才认命（4 次尝试 × 4.5s + 买卡/读屏）。记一下「上一回合名额就是 0 且一个都没上去」，
// 下一回合直接跳过部署，省掉这一整段。
let QUOTA_STUCK_ROUND = -1
export function opTierOf(name) {
  if (!name) return null
  if (!TIER_CACHE) {
    TIER_CACHE = new Map()
    for (const op of operatorPool()) if (op && op.name) TIER_CACHE.set(op.name, Number(op.tier) || 1)
  }
  return TIER_CACHE.get(name) || null
}

/**
 * 卖低阶干员凑钱（用户 m04261 定的时机：升级商店差几块就卖掉几个低阶的）。
 * 只卖 1 阶、且不在目标清单里的人；从右往左卖（卖掉后甲板不重排，从右往左最不容易点错）。
 * 返回实际卖到的钱（每张固定 1 块）。
 */
// ── 步骤追踪（用户 m00832：每一步截图 + 执行了什么 + 花了多久，开战前再截一张）
// 截图或写盘失败不能打断主流程，所以全包 try。
const TRACE = { dir: null, n: 0, t: 0, t0: 0 }
/**
 * 细粒度性能日志（2026-11-11 14:5x）：一条 5 秒的 OCR 好解释，但真机上动辄出现 20~30 秒的
 * 「不知道花在哪」的空档。凡是可能慢的调用前后都打一行，写进 COOP_PERF_LOG（默认 cwd/_perf.log），
 * 别用 step() —— 那个每行还要抓一张截图（1.1s），反而更慢。
 */
function perf(msg) {
  try {
    appendFileSync(process.env.COOP_PERF_LOG || join(process.cwd(), '_perf.log'),
      new Date().toISOString() + ' ' + msg + '\n')
  } catch { /* 忽略 */ }
}
/**
 * 阶段计时（2026-11-13）：休整期 70s 的目标靠 _perf.log 里可比的 PHASE 行推进。
 * 用法：const t = now(); ... ; phaseLog('买卡', t, 'Lv3')
 */
function now() { return Date.now() }
function phaseLog(name, t0, extra) {
  try { perf('PHASE ' + name + ' ' + (now() - t0) + 'ms' + (extra ? ' ' + extra : '')) } catch { /* 没 perf 就算了 */ }
}
async function timed(label, fn) {
  const t0 = Date.now()
  try { return await fn() } finally {
    const ms = Date.now() - t0
    if (ms > 1200) perf(label + ' ' + ms + 'ms')
  }
}
export function setTrace(dir) {
  TRACE.dir = dir || null
  TRACE.n = 0
  TRACE.t = Date.now()
  TRACE.t0 = TRACE.t
}
/**
 * 一步一条：截图 + 日志。第三个参数 own 是「这一步自己的耗时（ms）」，由调用方用 Date.now() 量。
 *
 * 2026-11-11 18:0x（用户 m02704 第 1 条）：早先把 since（距上一步的间隔）写成 ms，看日志的人
 * 会把它当动作耗时 —— 「折叠商店 8.5s」其实是折叠 1s + 中间几张截图。现在三个数分开记：
 *   since — 距上一步多少毫秒（含等待/截图）
 *   own   — 这一步自己的动作耗时（没量就 null）
 *   total — 从 setTrace 起的累计毫秒
 */
async function step(opts, steps, msg, own) {
  const now = Date.now()
  const since = TRACE.t ? now - TRACE.t : 0
  TRACE.t = now
  const total = TRACE.t0 ? now - TRACE.t0 : 0
  perf('step +' + Math.round(since / 1000) + 's' + (own == null ? '' : ' own ' + Math.round(own) + 'ms') + ' ' + String(msg).trim().slice(0, 40))
  steps.push(msg)
  const dir = (opts && opts.trace) || TRACE.dir
  if (!dir) return
  try {
    // 2026-11-11 22:42：调用方只传 trace 路径、没建目录时，writeFileSync 会 ENOENT 被 catch 吞掉，
    // 结果「开了 trace 却一张截图都没有」。这里自己补建目录。
    mkdirSync(dir, { recursive: true })
    const n = String(++TRACE.n).padStart(3, '0')
    writeFileSync(join(dir, 'step-' + n + '.png'), screenshotCached(1200))
    appendFileSync(
      join(dir, 'steps.jsonl'),
      JSON.stringify({
        n: Number(n),
        since,
        own: own == null ? null : Math.round(own),
        total,
        at: new Date().toISOString(),
        action: msg
      }) + '\n'
    )
  } catch (e) {}
}

/** 只写 steps.jsonl 的一行（不抓截图），给布阵那种「一步要好几次重试」的细账用。 */
function note(opts, msg) {
  const dir = (opts && opts.trace) || TRACE.dir
  if (!dir) return
  try {
    appendFileSync(join(dir, 'steps.jsonl'), JSON.stringify({ n: null, since: null, own: null, total: TRACE.t0 ? Date.now() - TRACE.t0 : 0, at: new Date().toISOString(), action: msg }) + '\n')
  } catch { /* 忽略 */ }
}

// 2026-11-15 02:4x：休整期「按一下场上干员」会弹干员详情面板（wz_buydetail），面板开着时甲板拖拽全被判成单击。
// 原来这个函数定义在 autoRest（撤回那段闭包）里，deployFromDeck 里调用直接
// `ReferenceError: dismissPanelIfOpen is not defined`（trace-night-2026-11-14T17-19-54 CRASH，之后每局开局就崩）。
// 提到模块级、显式接 opts，取消按钮 (965,240) 与 run.js playRound 里点的是同一个。
// 2026-11-15 10:0x 实测（trace-night-2026-11-15T01-41-45 第 13 回合打完）：中途也会弹「2/3 选择策略」页，
// 以前只有开局流程认这一页 → oneshot 读到 wz_strategy 就整局停手。这里统一「点第一张 + 确认」再继续等休整期。
const pickStrategyMidRun = async (opts, why) => {
  try {
    await tapAt(POINTS.strategyCard0, 1000, '选策略卡（' + why + '）')
    await sleep(900)
    await tapAt(POINTS.setupReady, 1600, '确认选择（' + why + '）')
    await sleep(1200)
    return true
  } catch (e) { note(opts, '  选策略卡失败：' + e.message); return false }
}
const dismissPanelIfOpen = async (opts, why) => {
  try {
    const pv = peek()
    const st = pv && pv.state
    if (st === 'wz_buydetail' || st === 'wz_buy' || st === 'wz_shopdetail') {
      tap(965, 240)
      await sleep(700)
      note(opts, '  面板挡着（' + st + '）→ 点了取消' + (why ? '（' + why + '）' : ''))
      return true
    }
    // 2026-11-15 03:1x：休整期点中场上干员/装置弹出的左侧详情面板，peek 永远报 wz_rest，状态机看不出来。
    // 面板开着时甲板拖拽全被判单击（每格 green≈794、手势 1.6s、整回合 0 上场），只能按画面判暗块。
    // 2026-11-15 03:2x 修正：screenshot() 返回 Buffer，直接喂给 python 脚本会抛（argv 必须是字符串），
    // 这个异常被外层 catch 吞掉 → 面板一直判不出来（实测整回合 green=795 拖拽全失败却一条日志都没有）。
    // 必须先落盘再用路径，跟 recall 那段 screenState(saveShot(png1, 'recall')) 一个写法。
    const png = opts.__panelPng || saveShot(screenshot(), 'panel')
    const po = panelOpenOf(png)
    if (po && po.open) {
      tap(965, 240)
      await sleep(700)
      const po2 = panelOpenOf(saveShot(screenshot(), 'panel2'))
      const closed = !(po2 && po2.open)
      note(opts, '  面板挡着（画面左侧暗块 mean=' + po.mean + (why ? '，' + why : '') + '）→ 点了取消' + (closed ? '，已关掉' : '，还是开着（mean=' + po2.mean + '）'))
      return closed
    }
  } catch { /* 读不到状态就不管 */ }
  return false
}

export async function sellToAfford({ need, steps = [], maxSell = 3 } = {}) {
  const want = Math.min(Number(need) || 0, Number(maxSell) || 3)
  if (!(want > 0)) return 0
  // 不认人：identifyDeck 要逐个轻按甲板牌，可能把状态机推进「购买详情」把整局卡住
  // （2026-11-10 16:35 真踩过：stop=当前不是休整期（wz_buydetail））。
  // 甲板从左到右就是获取顺序，最左几张通常是早期低阶过渡卡 —— 直接按位置卖，卖价固定 1 块（用户 m04231）。
  const sc = await scanDeckChips()
  if (!sc || sc.ok === false || !sc.chips || !sc.chips.length) {
    steps.push('  想卖卡凑钱，但甲板上扫不到牌')
    return 0
  }
  const chips = sc.chips.slice().sort((a, b) => a.x - b.x)
  if (chips.length <= 1) { steps.push('  想卖卡凑钱，但甲板只剩 1 个'); return 0 }
  let sold = 0
  for (const c of chips) {
    if (sold >= want || chips.length - sold <= 1) break
    const r = await sellDeckUnit([c.x, c.y])
    if (r && r.ok !== false) {
      sold += 1
      steps.push('  卖甲板第 ' + (sold) + ' 张（最左）→ +1 块')
    } else {
      steps.push('  卖卡没成功（' + ((r && r.error) || '未知') + '）')
      break
    }
  }
  return sold
}

export function tierOf(v) {
  if (typeof v === 'number' && v >= 1 && v <= 6) return v
  const s = String(v || '').trim().toUpperCase()
  if (ROMAN[s]) return ROMAN[s]
  const n = Number(s)
  return n >= 1 && n <= 6 ? n : 0
}

/** vision 的状态名 → OCR 的状态名（OCR 自己那套命名更细，但两者要能对上） */
const VISION_TO_OCR = {
  wz_rest: 'rest',
  wz_prep: 'prep',
  wz_battle: 'battle',
  wz_settle: 'settle',
  wz_buydetail: 'rest',
  // 「作战结束 / 生命值减少 N」黑底横条：OCR 会把它当成休整期（底排卡还在），
  // 2026-11-09 真机踩到 —— autoRest 在这个过场里空转、playRound 点准备就绪无效。
  wz_warbanner: 'warbanner',
}

/**
 * 截图 → 临时文件 → OCR。OCR 要读文件，所以落一次盘。
 *
 * 为什么还要跑一次 vision：OCR 的界面判定依赖「商店那一排卡」，商店一折叠就判成 unknown，
 * 整个 autoRest 直接退出（2026-11-09 真机踩到）。vision 的 8x8 模板不吃这套，折叠态照样认
 * 得出是休整期。所以让 vision 兜底：只要它给出明确状态，就用它的状态名覆盖 OCR 的。
 */
/**
 * 便宜探针：截图 → 只判「商店展开/折叠」+ 金币，约 2s（整套 senseRun 约 6s）。
 * 切面板、买完核对成交这类只关心一两个值的地方用它，别整套 OCR。
 */
async function senseProbe() {
  let dir
  try {
    dir = mkdtempSync(join(tmpdir(), 'coop-probe-'))
    const p = join(dir, 's.png')
    writeFileSync(p, screenshot())
    const r = await probeState(p)
    if (!r || !r.ok) return { ok: false, error: (r && r.error) || 'probe 失败' }
    return {
      ok: true,
      open: r.shopExpanded === true,
      brightness: r.shopBrightness,
      money: r.money == null ? null : Number(r.money)
    }
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) }
  } finally {
    if (dir) setTimeout(() => { try { rmSync(dir, { recursive: true, force: true }) } catch { /* 忽略 */ } }, 500)
  }
}

export async function senseRun(level, hints = {}) {
  let dir
  try {
    dir = mkdtempSync(join(tmpdir(), 'coop-sense-'))
    const p = join(dir, 's.png')
    const buf = screenshot()
    writeFileSync(p, buf)
    // level 由调用方自己数（进局 1，每成功升一次 +1）。OCR 认 LEVEL 面板的罗马数字不可靠
    // （截图里 "II" 就是两根竖线），而它又决定商店格数，所以不让 OCR 猜。
    // hints.expect='rest' / hints.round 是提速用的：确认界面和回合号各省 1~1.7s（2026-11-11 13:5x）。
    const o = {}
    if (level) o.level = level
    if (hints.expect) o.expect = hints.expect
    if (hints.round) o.round = hints.round
    if (hints.lite) o.lite = true
    let st = await readState(p, o)
    // 升级点识别花了多久、是不是被「商店折叠」闸门挡掉了（ocr.py 里 read_upgrade_point 计时）。
    // 闸门命中时这一步是 0ms，未命中要扫一遍底边（实测 320~385ms），写进 _perf.log 好对比。
    if (st && st.upgradePointMs != null) {
      perf('ocr ' + st.upgradePointMs + 'ms upgrade-point' +
           (st.upgradePointGated ? ' gated(商店折叠)' : ''))
    }
    // 用户 m02001（2026-11-11 15:2x）：商店等级「靠自己记得，每成功升一次 +1」。
    // 2026-11-12 12:3x：read_shop_level 改成认罗马数字后返回值与界面一致（界面 Ⅲ 就是 3），
    // 所以 shopLevelOcr 和调用方记的 level 现在是同一把尺子，对账不会再差一级。
    if (st && st.shopLevel != null) {
      st.shopLevelOcr = Number(st.shopLevel)
      if (!level) st.level = st.shopLevelOcr
    }
    // 商店格数 = 3 + 等级，等级错一位整排卡片坐标就整排错（2026-11-11 首测：传 1、实际 Lv2，
    // 于是只认出 3 格，买卡点位全偏）。等级对不上就用手上这张图按正确等级重读一遍，不再截图。
    // 只在调用方明确要求（hints.fixLevel）时才按 OCR 等级重读一遍：重读是整套 OCR（6s+），
    // 2026-11-11 13:5x 实测每回合因此多花 10~20s。等级本来就由调用方数，误差靠 buy 失败兜。
    if (st && st.ok && hints.fixLevel && level && st.level && Number(st.level) !== Number(level) && st.screen === 'rest') {
      try {
        const fixed = await readState(p, { level: Number(st.level) })
        if (fixed && fixed.ok) {
          fixed.level = Number(st.level)
          st = fixed
        }
      } catch { /* 重读失败就用第一次的结果 */ }
    }
    // 界面已由 OCR 文本 + 商店卡确认是休整期时，不再叫 vision（另起一个 python，1~2s）。
    let v = null
    const restConfirmed = st && st.ok && st.screen === 'rest' &&
      (hints.expect === 'rest' || (st.shop || []).some((c) => c && !c.empty))
    if (!restConfirmed) {
      try { v = classifyBuffer(buf) } catch { /* vision 挂了不影响 OCR */ }
    }
    if (v && v.state && Number(v.dist) <= 0.12) {
      st.vision = v.state
      const mapped = VISION_TO_OCR[v.state]
      if (mapped && st.screen !== mapped) {
        st.screenOcr = st.screen
        st.screen = mapped
      }
    }
    // 2026-11-10 夜间实测：休整期被 vision 误判成 wz_admin/wz_hall，整局提前停。
    // 用 OCR 文本兜底：出现「休息一下 / 准备就绪」就认定是休整期。
    const blob = String((st && st.raw && st.raw.top) || st.text || '')
    if (/休息一下|准备就绪/.test(blob) && st.screen !== 'rest') {
      // 注意：senseRun 对外用的是短名（rest/prep/...），这里必须写 'rest' 而不是 'wz_rest'，
      // 否则 autoRest 的守卫（st.screen !== 'rest'）会一直判「不在休整期」，整局不买卡。
      st.screenOcr = st.screenOcr || st.screen
      st.screen = 'rest'
    }
    return st
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) }
  } finally {
    if (dir) setTimeout(() => { try { rmSync(dir, { recursive: true, force: true }) } catch { /* 忽略 */ } }, 500)
  }
}

/**
 * 2026-11-13 00:1x（夜里实测）：商店卡名的 OCR 会把界面上的功能字读成卡名。
 * 16:12 那回合连买两次「无法购买」「拉无法购买」（钱没少、卡还在店里），
 * 整备区账本因此虚增到 7 张，接着布阵整回合白跑。这里把 UI 噪声词剔掉。
 */
const UI_NOISE_RE = /无法购买|无法放置|点击取消|准备就绪|收起|展开|刷新|冻结|升级|查看|休息一下|剩余可放置|模拟中断|通过回合/

export function cleanCardName(name) {
  const s = String(name == null ? '' : name).replace(/^[^\u4e00-\u9fffA-Za-z0-9（(]+/, '').trim()
  if (s.length < 2) return ''
  if (UI_NOISE_RE.test(s)) return ''
  return s
}

/**
 * OCR 的商店 → 决策层的候选表。slot 是格子下标（0..3），买的时候要用。
 * 空格子（empty）直接扔掉，别当成 0 费的好卡。
 */
export function toCandidates(shop) {
  const out = []
  for (let i = 0; i < (shop || []).length; i++) {
    const it = shop[i]
    if (!it || it.empty || !it.name) continue
    const nm = cleanCardName(it.name)
    if (!nm) continue
    out.push({
      name: nm,
      tier: tierOf(it.tier),
      cost: it.price == null ? null : Number(it.price),
      slot: i,
      x: it.x,
      y: it.y,
      tags: it.tags || []
    })
  }
  return out
}

/**
 * 把甲板上的干员逐个拖上战场。
 *
 * 2026-11-10 07:40 真机实测：**【默认关闭，不要再接回自动流程】**
 *   - 卫戍协议「整备区 → 战场」是游戏**自动部署**，不需要拖：战斗页顶部「已部署/总数」
 *     在完全零输入的情况下自己从 0/8 涨到 5/8；
 *   - 休整期那排立绘只是展示：用 input swipe / input mouse motionevent / sendevent 三种手势
 *     从甲板干员身上往地图格拖，前后截图对比**画面完全没变**（连选中态都不出现），slotsLeft 一直是 8。
 * 所以 autoRest 默认不调用本函数，只有显式 opts.deploy === true 才跑（见 autoRest 尾部）。
 * 函数留着是为了以后客户端改版、或需要手动提前布阵/改朝向时还能用。
 *
 * 关键前提（2026-11-09 深夜真机验证，已作废，仅留作手势参考）：
 *   - 商店**展开**时拖动无效、还会带偏镜头，必须先折起来（右下绿框 toggle）；
 *   - 折叠后干员脚下格子在 y≈860、最右一格 x≈1565、往左每格 180px；
 *   - 拖走一个之后**剩下的不重排**，留在原格位；
 *   - 但格位本身会随「商店展开 / 折叠」和商店格数变（展开态测到过 x≈1075/1180 和
 *     1270/1380，折叠态是 1385/1565），所以**不能靠序号盲算**。折叠之后重新截一张，
 *     用 ocr.py 的 deckUnits（16x16 分块标准差）拿真实位置。
 *     deck 里的 index 只在检测失败时兜底。
 *
 * @param {Array<{index:number,name:string}>} deck
 * @param {{facing?:string, slotFrom?:number}} opts
 */
const DECK_XS = [1575, 1412, 1249, 1086, 923, 760] // 折叠态甲板格位，最右优先

/**
 * 布阵开关：**默认开**，只有调用方显式 `deploy: false` 才关。
 * 2026-11-12 用户 m01970 第 3 条：「你一个干员都没有上」—— 之前默认关（注释说「战场会自动部署」）
 * 的结果是整局一个干员都没放上去，第 3 回合就「模拟中断」。自动部署那条观察不再成立。
 */
export function shouldDeploy(opts = {}) {
  return !(opts && opts.deploy === false)
}

/**
 * 默认落点候选（1920x1080，休整期默认镜头）。都是实测绿过的可站格中心。
 * 拖动时幻影偏移由 placeUnit 内部的 PHANTOM 处理，这里写的是**格子中心**。
 */
/** 整备区（甲板）最多能放几个干员。满了再买游戏只弹提示，不成交。 */
/** 装备的归属偏好：攻击类给输出，防御类给承伤（用户 m04231 原话「攻击属性给输出，防御给重装」）。
 *  没有职业信息时退化成「谁的格子最近给谁」。 */
export function equipTargetClass(effect = '') {
  const t = String(effect)
  if (/防御|生命上限|法抗|阻挡/.test(t)) return ['重装', '近卫', '特种']
  if (/攻击|攻速|伤害|技力/.test(t)) return ['狙击', '术师', '近卫', '辅助']
  return []
}

/**
 * 把甲板上散着的装备拖给干员。
 *
 * 2026-11-10 17:40 实测到的两件事：
 *  1. 装备是**可拖物件**，摆在干员头顶那一排；长按 450ms → 拖到目标**格子**松手 = 装上（用户 m04723 / m04828：一切按格子判定）。
 *  2. 认装备不能靠模板匹配（88 张图标灰度相关最高 0.4，和 Q 版小人叠在一起），得轻按图标读左侧面板 —— findDeckEquip 已能认出
 *     「歌利亚头盔」「灵巧涡轮手套」并给出所属干员的格子。
 *
 * ⚠️ 装完**复查**还没做成：轻按会平移镜头，再点一次读出来的就是新布局。
 *    下一步改成数「干员头顶白条」（装一件多一条，最多两条）来确认，别再靠再点一次。
 */
/** 甲板牌名字对齐：甲板左→右＝最早买到→最新买到（run.js 卖卡分支同口径）。 */
export function alignDeckNames(chips = [], deckNames = null) {
  const cs = (chips || []).slice().sort((a, b) => a.x - b.x)
  if (!Array.isArray(deckNames) || !deckNames.length) return cs.map(() => '')
  if (deckNames.length === cs.length) return deckNames.slice()
  if (deckNames.length < cs.length) {
    // 牌比名字多：前面补空（新买的名字都对齐右边），多出来的当认不出
    return new Array(cs.length - deckNames.length).fill('').concat(deckNames)
  }
  // 名字比牌多：从左边截掉（老牌可能已经被卖掉/上场）
  return deckNames.slice(deckNames.length - cs.length)
}

/**
 * 装备的目标干员：甲板牌 → 名字 → 职业组（0 医疗 / 1 远程 / 2 近战）。
 * 名字认不出就返回 null，这一张不给它分装备。
 */
function unitOfChip(chip, name) {
  let g = null
  let cls = ''
  try {
    if (name) { const info = operatorInfo(name); cls = (info && info.class) || ''; const r = roleGroup(name); if (r != null) g = Number(r) }
  } catch { /* 查不到就是没职业信息 */ }
  return { name: name || '', cls, roleGroup: g, chip }
}

export async function equipDeck({ steps = [], maxItems = 4, deckNames = null } = {}) {
  const before = await findDeckEquip()
  if (!before.ok || !before.items.length) {
    if (before.ok) steps.push('  甲板头顶没有散落的装备')
    return 0
  }
  // 2026-11-12 19:2x（用户 m00999）：装备原来只拖到「它本来就悬在头上那张牌」，不看属性也不看职业。
  // 现在先算一遍：谁该拿哪件（lib/equiporder.js 纯函数），再按计划拖过去。
  const chips = []
  for (const it of before.items) if (it.chip && !chips.some((c) => Math.abs(c.x - it.chip.x) < 20 && Math.abs(c.y - it.chip.y) < 20)) chips.push(it.chip)
  const names = alignDeckNames(chips, deckNames)
  const sortedChips = chips.slice().sort((a, b) => a.x - b.x)
  const units = sortedChips.map((c) => unitOfChip(c, names[sortedChips.indexOf(c)]))
  const known = units.filter((u) => u.roleGroup != null)
  let plan = { plan: [], held: [] }
  try {
    plan = planEquipAssignments(before.items, known)
  } catch (e) {
    steps.push('  装备分配算不出来（' + e.message + '），按原样就近装')
    plan = { plan: [], held: [] }
  }
  if (plan.plan.length || plan.held.length) steps.push('  装备分配：' + describeEquipPlan(plan))
  let n = 0
  const queue = plan.plan.length
    ? plan.plan
    : before.items.filter((it) => !it.placed && it.chip).map((it) => ({ item: it, unit: { name: '', chip: it.chip }, reason: '就近（没有职业信息）' }))
  for (const a of queue.slice(0, maxItems)) {
    const it = a.item
    if (!it || it.placed) continue
    const chip = a.unit.chip
    if (!chip) continue
    const gx = Math.round(it.x + it.w / 2)
    const gy = Math.round(it.y + it.h / 2)
    // 落点 = 目标干员那张甲板牌（用户 m04828：一切按格子判定）
    await dragHold([gx, gy], [chip.x, chip.y], { holdStartMs: 50, holdMs: 800, steps: 12, stepMs: 45 })
    await sleep(700)
    steps.push('  装装备：' + it.name + '（' + (it.effect || '').slice(0, 12) + '）→ ' + (a.unit.name || '甲板 x' + Math.round(chip.x)) + '（' + a.reason + '）')
    n += 1
  }
  // 复查：纯看图。装上的标志是「原来悬在头顶那一排的那件不见了/挪位了」，
  // 不能数 placed —— 装到干员头顶后图标会被等级小牌压住，图库反而认不到。
  const after = await findDeckEquip()
  if (after.ok) {
    const left = after.items.filter((it) => !it.placed).length
    steps.push('  装备复查：还剩 ' + left + ' 件散在外面（装之前 ' + before.items.filter((it) => !it.placed).length + ' 件）')
  }
  return n
}

export const DECK_CAP = 10

export const DEPLOY_TILES = [
  [880, 300], [770, 300], [990, 300],
  [880, 410], [770, 410], [990, 410], [1100, 410],
  [660, 410], [660, 300], [1100, 300],
  [880, 520], [990, 520],
]

/**
 * 2026-11-12 19:0x 实测（world/logs/rest-2026-11-12T10-34-53.log）：第 9~11 回合四个候选格
 * （964,350 / 845,348 / 1081,351 / 725,347）一个都拎不起来（no_pending），程序据此判「名额大概是 0」，
 * 整回合 0 上场。真因是那些格上已经站着干员（跨回合占用）：occupiedPx 只在内存里，续打启动时是空的，剔不掉。
 * 所以把「拖上去进不了待确认态」的格记成死格 —— 本轮之内不再用它，也不再因为连试 2 格就认定名额为 0。
 */
// 认人是否已经试过（跨回合，一局只试一次；autoRun 开头重置）
let IDENTIFY_TRIES = 0
// 绿格探测一局只做一次（每次 8~9s，失败还会再试）
let GREEN_PROBED = false
// 2026-11-13 17:1x（用户 m04520 休息期 ≤70s）：probeValidTiles 每回合要拎牌+截图+取消，实测 8~11s。
// 地图格本来就是权威（用户 m06560「所有地图部署位不变」），只有「上一回合拖不上去过」或「第一回合」才需要重探。
let PROBE_NEEDED = true
let PROBE_FAILS = 0
export function noteDeployFail(n = 1) { PROBE_FAILS += Number(n) || 0; if (PROBE_FAILS > 0) PROBE_NEEDED = true }
// 上一次成功读到盟约的回合号（盟约一局基本不变，别每回合烧一次整屏 OCR）
let COV_LAST_OK = -99
const DEAD_TILES = new Set()
// 2026-11-13 06:0x 真机（trace-night-2026-11-12T21-39-57 第 8~10 回合）：名额 0 时换人也拖不动
// （拖到已占格确认后牌照样回甲板），之后每回合都白试 11~17s。记下「上次验证拖不动」的时间，7 分钟内不再试。
let QUOTA_ZERO_AT = 0
// 2026-11-13 12:0x 用户 m05478「补齐盟约是看你的目标盟约」：
// 目标盟约 = 开局选的 + 画面读到的（一局里不变）。画面偶尔整屏 OCR 读不出，
// 这时别退回「按阶数乱买」，用上一回合记下的目标盟约接着补。
let TARGET_COV = []
// 2026-11-13 12:0x 用户 m05472「一回合可以只升级，但是不要连续几回合只升级，一般要呆两三个回合，
// 4级5级可以呆久一点」→ 记住上次升级的回合号，restplan 按「在当前等级待了几回合」放行。
let LAST_UPGRADE_ROUND = -99
export function clearDeadTiles() { DEAD_TILES.clear() }
export function deadTilesOf() { return [...DEAD_TILES] }
// 2026-11-13 07:5x：每个新进程（监督每代重启一次）都从零开始认格，前几轮把已占格重新试一遍，
// 每张牌白花 4~5s。把「拖上去没上去」的格落盘，新进程直接跳过（30 分钟内有效，干员死了/换防后自然过期）。
const OCCUPIED_PATH = fileURLToPath(new URL('../data/occupied-tiles.json', import.meta.url))
export function loadDeadTiles(now = Date.now()) {
  try {
    const raw = JSON.parse(readFileSync(OCCUPIED_PATH, 'utf8'))
    const list = Array.isArray(raw && raw.tiles) ? raw.tiles : []
    let kept = 0
    for (const it of list) {
      if (!it || !Array.isArray(it.px)) continue
      const at = Number(it.at) || 0
      if (now - at > 30 * 60 * 1000) continue
      DEAD_TILES.add(it.px[0] + ',' + it.px[1])
      kept += 1
    }
    return kept
  } catch { return 0 }
}
export function saveDeadTiles() {
  try {
    const now = Date.now()
    let prev = []
    try {
      const raw = JSON.parse(readFileSync(OCCUPIED_PATH, 'utf8'))
      prev = Array.isArray(raw && raw.tiles) ? raw.tiles : []
    } catch { prev = [] }
    const map = new Map()
    for (const it of prev) {
      if (!it || !Array.isArray(it.px)) continue
      if (now - (Number(it.at) || 0) > 30 * 60 * 1000) continue
      map.set(it.px[0] + ',' + it.px[1], it)
    }
    for (const k of DEAD_TILES) map.set(k, { px: k.split(',').map(Number), at: now })
    writeFileSync(OCCUPIED_PATH, JSON.stringify({ at: new Date().toISOString(), tiles: [...map.values()].slice(-24) }, null, 1))
  } catch { /* 落盘失败不影响本回合 */ }
}

// 2026-11-13 13:2x 用户 m06083：「松手时在哪个格子就会放到哪个格子，如果那个格子有干员，那么将放到最靠右的空格」。
// 真机验证（.tmp/rb-t2.png）：在**格心**按住 400ms → 拖到甲板 (665,883) 松手 → 该干员回到整备区、
// 「剩余可放置角色」4→5、木台上多一个小人。撤回是名额 0 时腾地方的正规手段（比换人更釜底抽薪）。
// ⚠️ 起手点必须用格心（tile center），按干员体（-24,-95 处）拖不动。
export async function recallBoardUnit(px, { benchX = 665, steps = [], opts = {} } = {}) {
  if (!Array.isArray(px) || px.length !== 2) return { ok: false, error: '没有格心坐标' }
  const shot = () => { try { return screenshot() } catch { return null } }
  // 2026-11-14 18:0x 真机（第 14 回合 trace steps 24~26）：「撤回 1360,665 没成（甲板 9→7 张）」，
  // 可屏幕上是成功了 —— 旧判据数整备区张数，牌被拖回后跟别的牌重叠/错位，张数反而变少。
  // 现在判据是「拖完原格还有没有干员」，张数只在棋盘读不出来时兜底。
  const unitStillOnTile = (png) => {
    if (!png || png.length < 1000) return null
    const mp = loadGameMap()
    const occ = detectOccupiedTiles(png, mp)
    if (!occ.ok) return null
    // 2026-11-15 00:0x 真机（trace-night-2026-11-14T15-56-58 第 10 回合）：
    // 撤回 964,350（= 4,1）报「原格还站着人」，其实这格是木板箱 —— boardocc 的已知误报
    // （sd 68.9 / dark 0.202），地图里已列进 boardoccIgnorePx，但这里没过滤 → 撤回成功了却判失败，
    // 下一格 1218,552 又白试一次，整回合 0 上场。误报格不参与「原格是否还有人」的判定。
    const ignore = (mp && Array.isArray(mp.boardoccIgnorePx)) ? mp.boardoccIgnorePx : []
    const isIgnored = (t) => ignore.some((g) => Array.isArray(g) && Math.abs(Number(g[0]) - t.x) <= 45 && Math.abs(Number(g[1]) - t.y) <= 45)
    // 2026-11-15 04:2x 真机（trace-night-2026-11-14T19-52-08 第 9 回合）：「撤回 1081,351 没成（原格还站着人）」，
    // 但同一句紧跟着「棋盘实测：站着人的格 10 个」—— boardocc 对木板箱/边框这类纹理给 sd 68~70、dark 0.14~0.20，
    // 刚好越过判据 sd>60 && dark>0.12。标定的真占格是 sd 88~138，所以这里再收一道 sd<80 的闸：
    // 只是撤回判据，不改 boardocc 本身（它还要给「哪些格有人」当线索，宁可多报）。
    const detail = Array.isArray(occ.detail) ? occ.detail : []
    const near = detail.find((d) => d && !isIgnored(d) && Math.abs(Number(d.x) - px[0]) <= 45 && Math.abs(Number(d.y) - px[1]) <= 45)
    if (near && Number(near.sd) < 80) return false
    return occ.tiles.some((t) => !isIgnored(t) && Math.abs(t.x - px[0]) <= 45 && Math.abs(t.y - px[1]) <= 45)
  }
  const countBench = async () => {
    try {
      const sc = await scanDeckChips({ minPressY: 560 })
      return (sc && sc.chips ? sc.chips : []).filter((c) => c && Number.isFinite(c.y) && c.y >= 560 && c.y <= 1010).length
    } catch { return -1 }
  }
  const wasThere = unitStillOnTile(shot())
  const b0 = await countBench()
  await dragFromTo([px[0], px[1]], [benchX, 883], { holdMs: 400, moveMs: 900, steps: 24, tag: 'recall' })
  await sleep(900)
  const png1 = shot()
  // 拖到甲板后若冒出「点击取消」红徽章（待确认态），先取消，否则后面整回合的点击都会被吃掉。
  try {
    const st = png1 ? screenState(saveShot(png1, 'recall')) : null
    if (st && isPending(st)) { await deselectUnit(); await sleep(300) }
  } catch { /* 判不出来就算了 */ }
  const nowThere = unitStillOnTile(png1)
  const b1 = await countBench()
  let ok
  if (nowThere === false) ok = true
  else if (nowThere === true) ok = false
  else ok = b0 >= 0 ? b1 > b0 : true
  note(opts, ok
    ? '  撤回 ' + px.join(',') + ' → 整备区（原格已空' + (nowThere === false ? '' : '；甲板 ' + b0 + '→' + b1 + ' 张') + '，名额 +1）'
    : '  撤回 ' + px.join(',') + ' 没成（原格还站着人' + (nowThere === null ? '／棋盘没读准；甲板 ' + b0 + '→' + b1 + ' 张' : '') + '）')
  return { ok, before: b0, after: b1, wasThere, nowThere }
}

/**
 * 被动读棋盘：这一回合哪几个可部署格此刻站着干员（2026-11-14 00:1x 新增）。
 *
 * 为什么需要：账本（slot-ledger / board-state）不可信 —— 实测第 8 回合场上站着 7 个干员、
 * 账本只记 2 个占格，于是布阵拿「已占的格」当空格去试，每格白烧 5.7s
 * （trace steps：「试 1196,353 没上去」→ 那格正是 (6,1) 站着人），一回合只够试 4~5 格、上场 1 个。
 *
 * 怎么认：sidecar/boardocc.py 对每个可部署格取中心 68x68 方块，算颜色标准差 sd 与暗像素比 dark。
 * 2026-11-14 标定（trace-night-13T16-04-09/step-011.png）：站人的格 sd 88~138 / dark 0.2~0.6；
 * 空格 sd 19.7~43 / dark 0.000~0.104。判据 sd>60 && dark>0.12，标注图里红框正好落在干员身上
 * （唯一误报是显示「!」不可部署图标的格子，跳过它无害）。
 */
export function detectOccupiedTiles(png, map = null) {
  if (!png || png.length < 1000) return { ok: false, tiles: [], error: '没有截图' }
  const m = map || loadGameMap()
  if (!m || !Array.isArray(m.cells)) return { ok: false, tiles: [], error: '没有地图' }
  const stamp = Date.now() + '-' + Math.round(Math.random() * 1e6)
  const frame = fileURLToPath(new URL('../.tmp/board-' + stamp + '.png', import.meta.url))
  const mapFile = fileURLToPath(new URL('../.tmp/board-' + stamp + '-map.json', import.meta.url))
  const out = fileURLToPath(new URL('../.tmp/board-' + stamp + '.json', import.meta.url))
  const py = fileURLToPath(new URL('../sidecar/boardocc.py', import.meta.url))
  try {
    mkdirSync(fileURLToPath(new URL('../.tmp', import.meta.url)), { recursive: true })
    writeFileSync(frame, png)
    writeFileSync(mapFile, JSON.stringify({ cells: m.cells }))
    const r = spawnSync(pythonBin(), [py, mapFile, frame, out], { windowsHide: true, stdio: 'ignore', timeout: 60000 })
    if (r.status !== 0) {
      return { ok: false, tiles: [], error: 'boardocc.py status=' + r.status + ' ' + String(r.error ? r.error.message : '').slice(0, 80) }
    }
    const j = JSON.parse(readFileSync(out, 'utf8'))
    return { ok: true, tiles: Array.isArray(j.tiles) ? j.tiles : [], detail: Array.isArray(j.detail) ? j.detail : [] }
  } catch (e) {
    return { ok: false, tiles: [], error: e.message }
  }
}

export async function deployFromDeck(deck, opts = {}) {
  const t0 = Date.now()
  const steps = []
  if (!deck || !deck.length) { note(opts, '  布阵跳过：账本是空的（整备区可能有牌没记账）'); return { ok: true, steps, placed: 0, deckStale: true } }
  const facing = opts.facing || 'right'
  // 2026-11-11 18:35（用户 m02970 第 3 条「不用填满，看攻击范围覆盖」）：
  // 候选格改成按「能盖住多少敌人可走格」贪心排序，几个干员会自己聚到覆盖面最大的点上，
  // 而不是把一行 10 格平均铺开。覆盖序算不出来才退回原来的分道序。
  let mapTiles = []
  try {
    // 2026-11-12（用户 m02460）：地图里给了 deployOrder 就按它给的顺序铺（近战→远程→就近补），
    // 没给的图 deployPoolFor 内部退回原来的覆盖序，老图行为不变。
    const pool = deployPoolFor()
    if (pool.length) mapTiles = pool
  } catch (e) { mapTiles = [] }
  if (!mapTiles.length) {
    try {
      const cov = deployTilesByCoverage(undefined, { facing })
      if (cov.length) mapTiles = cov.map((x) => x.px)
    } catch (e) { mapTiles = [] }
  }
  if (!mapTiles.length) mapTiles = deployTilesRanked()
  let tiles = opts.tiles && opts.tiles.length ? opts.tiles : (mapTiles.length ? mapTiles : DEPLOY_TILES)
  // 2026-11-14 00:1x：布阵前先被动读一帧棋盘，把「真的站着人」的格并进占格集合。
  // 账本不可信（实测场上 7 人、账本 2 个占格），旧逻辑拿已占格当空格去试、每格白烧 5.7s。
  let occPx = opts.occupiedPx instanceof Set ? new Set(opts.occupiedPx) : new Set(Array.isArray(opts.occupiedPx) ? opts.occupiedPx : [])
  if (opts.readBoard !== false) {
    try {
      const boardShot = screenshot()
      const occ = detectOccupiedTiles(boardShot, loadGameMap())
      if (occ.ok) {
        let added = 0
        // 2026-11-14 21:5x（用户 m08045「远程又乱摆」+ trace 13-43-52 第 2 回合实测）：
        // boardocc 对 (5,2) 1086,447（旧木板 sd 69.7/dark .14）和 (4,1) 964,350（木箱 sd 68.9/dark .202）会误报。
        // 当时场上只站了 2 人却报「站着人的格 5 个」，把 5 列高台剔掉 → 远程只能退到最左的 2 列、打不到人。
        // 地图里给了 boardoccIgnorePx 就跳过这些点；账本（opts.occupiedPx）里明确记着的仍当真的占格。
        const ignorePx = (() => {
          try {
            const gm = loadGameMap()
            const arr = gm && Array.isArray(gm.boardoccIgnorePx) ? gm.boardoccIgnorePx : []
            return arr.filter((p) => Array.isArray(p) && p.length >= 2).map((p) => [Number(p[0]), Number(p[1])])
          } catch { return [] }
        })()
        const isIgnored = (t) => ignorePx.some((p) => Math.abs(p[0] - t.x) <= 25 && Math.abs(p[1] - t.y) <= 25)
        const ledgerHas = (t) => [...occPx].some((k) => {
          const i = String(k).indexOf(',')
          if (i < 0) return false
          return Math.abs(Number(String(k).slice(0, i)) - t.x) <= 25 && Math.abs(Number(String(k).slice(i + 1)) - t.y) <= 25
        })
        let skipped = 0
        for (const t of occ.tiles) {
          if (isIgnored(t) && !ledgerHas(t)) { skipped++; continue }
          const k = Math.round(t.x) + ',' + Math.round(t.y)
          if (occPx.has(k)) continue
          occPx.add(k); added++
        }
        if (skipped) note(opts, '  棋盘实测剔掉已知误报格 ' + skipped + ' 个（地面上是木板/木箱，不是干员）')
        note(opts, '  棋盘实测：站着人的格 ' + occ.tiles.length + ' 个（账本原有 ' + ((opts.occupiedPx && opts.occupiedPx.size) || 0) + ' 个，新认 ' + added + ' 个）')
      } else {
        note(opts, '  棋盘实测没成：' + (occ.error || '未知') + ' → 只用账本里的占格')
      }
    } catch (e) { note(opts, '  棋盘实测出错（' + e.message + '）→ 只用账本里的占格') }
  }
  // 2026-11-11 19:05 实测（trace-11-01-21 第 3 回合）：候选格第 1、2 个（1196,353 / 1342,552）上一回合已经站了人，
  // 拖上去当然没反应，白花 7.6s。用调用方传进来的「本局已占格」剔掉（内存 Set，不依赖 board-state.json，
  // 那个文件是上一局留下的，拿它过滤会把好好的空格也删掉）。
  // 2026-11-13 07:5x（trace-night-2026-11-12T23-51-42）：账本里的占格 px 和地图格心差 10~15px
  // （1207,448 vs 1207,448 对得上，730,340 vs 750,340 差 20），精确相等比对上就漏了，
  // 于是每张牌都拿已占格去试、每次白花 5s。改成 45px 容差比对。
  const nearAny = (t, keys) => keys.some((k) => {
    const i = String(k).indexOf(',')
    if (i < 0) return false
    const ox = Number(String(k).slice(0, i))
    const oy = Number(String(k).slice(i + 1))
    return Math.abs(ox - t[0]) <= 45 && Math.abs(oy - t[1]) <= 45
  })
  if (occPx.size) {
    const keys = [...occPx]
    const before = tiles.length
    tiles = tiles.filter((t) => !nearAny(t, keys))
    if (before !== tiles.length) note(opts, '  候选格剔掉已占的 ' + (before - tiles.length) + ' 个 → 剩 ' + tiles.length + ' 个')
  }
  if (DEAD_TILES.size) {
    const b2 = tiles.length
    const keys = [...DEAD_TILES]
    const kept = tiles.filter((t) => !nearAny(t, keys))
    if (b2 !== kept.length) note(opts, '  候选格剔掉已知死格 ' + (b2 - kept.length) + ' 个 → 剩 ' + kept.length + ' 个')
    // 2026-11-13 09:4x（真实 bug，trace-night-13T01-31-27 第 3~6 回合）：死格记忆攒到 11 个，
    // 把整张图的候选格全剔光 → 「候选格用完了」一次都不试，连续四回合 0 上场、整备区堆到 5 张。
    // 死格记忆只是「这格刚才没拎起来」，不是「这格永久不能用」：剔光了就忽略它，按已占格过滤后的池子重试。
    if (kept.length) tiles = kept
    else note(opts, '  已知死格把 ' + b2 + ' 个候选格全剔光了 → 忽略死格记忆，按已占格过滤后的池子重试')
  }
  // 2026-11-13 14:0x 真机（06:00~06:05 第 7~9 回合）：新一代 oneshot 接手时场上账本是空的
  // （slot-ledger 被清成 []），候选格里混着自己人站着的格。名额 >0 时拖到已占格游戏一律不收
  // （用户 m06018：名额 0 才能换人）→ 连续 4 次全败、整回合 0 上场、空格 8 个也上不去。
  // 绿格 = 这张牌此刻真正能落的空格：账本为空时先拿一张牌探一次，用它当候选。
  if (!GREEN_PROBED && !occPx.size && opts.probeFree !== false && !opts.tiles) {
    GREEN_PROBED = true // 一局只探一次：失败时它要花 8~9s，下一回合再试毫无收益（2026-11-13 15:5x 提速）
    try {
      const pf = await scanFreeTiles({ cells: mapTiles })
      if (pf && pf.ok && pf.tiles.length) {
        const near2 = (t) => mapTiles.some((m) => Math.abs(m[0] - t[0]) <= 45 && Math.abs(m[1] - t[1]) <= 45)
        const greenPool = pf.tiles.filter(near2)
        if (greenPool.length >= 2) {
          tiles = sortPoolByOrder(loadGameMap(), greenPool)
          note(opts, '  账本里没有占格信息 → 探一张牌的绿格：' + pf.tiles.length + ' 个（对得上地图 ' + greenPool.length + ' 个）→ 只用这些当候选')
        } else {
          note(opts, '  绿格探测：' + pf.tiles.length + ' 个，对得上地图的只有 ' + greenPool.length + ' 个 → 不用')
        }
      } else {
        note(opts, '  绿格探测没成：' + ((pf && pf.error) || '未知') + '（照旧用地图池）')
      }
    } catch (e) { note(opts, '  绿格探测出错（' + e.message + '）→ 照旧用地图池') }
  }
  // 换人模式（2026-11-12 用户 m02251 第 3 条「把新干员拖到原干员所在格，落位时照样滑方向」）：
  // 场上满员时名额是 0，空格拖不上去，但已占格可以换。候选格直接换成已占格，
  // 预算由 opts.slotsLeft 限（autoRest 一回合只换 1~2 个，不整场推平）。
  let replacing = false
  if (opts.replace === true && occPx.size) {
    // 2026-11-13 15:2x 崩溃：CRASH TypeError: Cannot read properties of undefined (reading 'join') at drive.js:683
    // 账本里的条目偶尔不是 [x,y]（旧局残留/对象形态），map 时拿不到坐标 → 先统一成数组再往下降。
    const rpRaw = replaceTargets(occPx, { limit: Math.max(1, Number(opts.replaceMax) || 2) })
    const fmtPt = (v) => (Array.isArray(v) ? v.join(',') : (v && Array.isArray(v.px) ? v.px.join(',') : String(v)))
    const rp = (Array.isArray(rpRaw) ? rpRaw : []).map((v) => (Array.isArray(v) ? v : (v && Array.isArray(v.px) ? v.px : null))).filter(Boolean)
    if (rp.length) {
      // 2026-11-13 12:5x：账本里的 px 常是「吸附后的近似点」（例如 870,400，真格是 840,445），
      // 拖到近似点会被游戏判成落在一半缝里 → 「换人被拒」。落点先对齐到最近的地图格心。
      const m1 = loadGameMap()
      const all1 = deployTiles(m1)
      const snapMap = (pp) => {
        let best = null
        let bd = 80
        for (const t of all1) {
          const d = Math.hypot(t[0] - pp[0], t[1] - pp[1])
          if (d < bd) { bd = d; best = t }
        }
        return best
      }
      const snapped = []
      for (const pp of rp) {
        const t = snapMap(pp)
        // 对不上任何地图格心 = 账本里的假坐标（旧局残留/吸附偏差），换人拖上去必失败，直接丢掉
        if (t && !snapped.some((q) => q[0] === t[0] && q[1] === t[1])) snapped.push(t)
      }
      tiles = snapped
      if (tiles.some((t, i2) => t !== rp[i2])) note(opts, '  换人落点对齐到最近格心：' + rp.map((pp, i2) => fmtPt(pp) + '→' + fmtPt(tiles[i2])).join(' / '))
      replacing = true
      note(opts, '  换人模式：候选换成 ' + rp.length + ' 个已占格 ' + rp.map((p) => fmtPt(p)).join(' / ') + '（拖上去照样滑方向）')
    }
  }
  // 2026-11-13 13:2x 真机（.tmp/x-1.png / x-2.png）：名额 4、把甲板卡按 20ms 拎起、900ms 拖到
  // 明确站着人的格 (3,1)=845,348 → 白色菱形 + 绿格出现，朝右滑后新干员真的站上去了、甲板 2 张→1 张。
  // 所以换人是可用的，之前「换人被拒」的样本其实是落点落在了空格上（空格在名额 0 时确实拖不上去）。
  // 冷却闸门已删：不再因为上一轮换人失败就整回合不布阵。

  // 2026-11-13 19:1x（用户 m07403「每张地图甲板都做一下适配，整体识别速度会快得多」）：
  // 2026-11-15 03:1x 真机（trace-night-2026-11-14T18-47-50 第 8 回合）：休整期点中场上干员/装置会弹左侧详情面板，
  // 面板开着时下面每一次拖拽都被判成单击（每格 green≈794、手势 1.6s、整回合 0 上场，撤了 63s 才收手）。
  // 布阵前先关掉它，别等「连续 2 格拎不起来」才补救。
  try { await dismissPanelIfOpen(opts, '布阵前') } catch { /* 关不掉就照常试 */ }
  // 甲板按压点按「地图 + 商店开合 + 张数」缓存，命中就不扫（省 1.5~2.5s，也绕开
  // scanDeckChips 的「扫不到 / 木台被遮 / 两排混排」失败模式）；没命中才真扫，扫完记下来。
  const mapId = (() => { try { const m = loadGameMap(); return m && m.id } catch { return null } })()
  let scan0 = null
  if (opts.chips && opts.chips.length) scan0 = { ok: true, chips: opts.chips }
  if (!scan0 && opts.useDeckLayout === true) {
    // 2026-11-14 00:2x：**默认关掉**。缓存 key 只有「地图+商店开合+张数」，不含模式；
    // 上一局按 148 小牌记下的坐标（wz-01 折叠态 xs=1264/1413/1562、y=882）在卫戍协议的大卡模式里
    // 整排偏右 ~474px，按下去全落在 [NO INFO] 空位、拖两次 5s 全废（trace-night-2026-11-13T15-45-01
    // 第 3 回合整回合 0 上场）。scanDeckChips 实测只要 1.42s，省这点时间不值。
    const guess = planDeckChips(mapId, opts.shopOpen === true, Math.max(1, deck.length))
    if (guess && guess.length) {
      scan0 = { ok: true, chips: guess }
      steps.push('  甲板按压点用地图缓存（' + (opts.shopOpen === true ? '展开' : '折叠') + '态 ' + guess.length + ' 张，y=' + guess[0].y + '）')
    }
  }
  if (!scan0) {
    scan0 = await scanDeckChips({ minPressY: opts.shopOpen === true ? 0 : 840 })
    try { rememberDeck(mapId, opts.shopOpen === true, scan0 && scan0.chips) } catch {}
  }
  // 2026-11-14 00:2x（用户 m08866「台下的高阶干员怎么就不上」+ trace-night-2026-11-14T16-04-21 第 12 回合实测）：
  // 本回合先「撤回再部署」过 → 被撤的人插到整备区最左、所有牌整体右移一格，撤回前缓存的 chips0 坐标全错位，
  // 日志出现「试 964,350 没拎起来」「试 715,444 没拎起来」→ 整回合 0 上场、白扔 1 个名额。
  // 撤过人的回合一律重扫一次甲板（1.4s），不用缓存、也不用调用方传进来的旧坐标。
  if (opts.recalledThisRound === true && opts.chips && opts.chips.length) {
    try {
      const scFresh = await scanDeckChips({ minPressY: opts.shopOpen === true ? 0 : 840 })
      const nFresh = ((scFresh && scFresh.chips) || []).length
      const nOld = (opts.chips && opts.chips.length) ? opts.chips.length : -1
      if (nFresh > 0) {
        scan0 = scFresh
        steps.push('  本回合撤回过人 → 甲板重扫 ' + nFresh + ' 个按压点（撤回前' + (nOld >= 0 ? ' ' + nOld + ' 个' : '没记') + '，牌会整体右移）')
      }
    } catch (e) { steps.push('  撤回过人，想重扫甲板但出错（' + e.message + '）→ 沿用旧坐标') }
  }
  let chipsFromCache = !!(scan0 && Array.isArray(scan0.chips) && scan0.chips.some((c) => c && c.guess === true))
  let chips0 = scan0.chips
  // 2026-11-12 21:4x 实测（trace-2026-11-12T13-26-18 第 4~5 回合）：调用方传进来的 chips 有时是「商店展开时扫的」，
  // y=786 落在商店行上，按下去永远拎不起来（日志反复「没拎起来 → 换按压点 1554,786」，整回合 0 上场）。
  // 甲板行的 y 实测在 830~1010，超出这个范围的一律丢掉。
  // 2026-11-13 01:2x：整备区人一多，木台会摆成两排，上排按压点 y≈640~680（不在 800~1010 里）→
  // 「账本 7 张却扫不到牌」。商店折叠时下界放宽到 600；商店展开时仍用 800~1010（那行是商店卡）。
  // 2026-11-13 13:5x 实测（trace-night-2026-11-13T05-42-24 第 5 回合）：yLo 放宽到 600 后，
  // 「收起/展开」那一行的假按压点 y≈737/786 又溜进来了 → 日志「试 1326,449 没拎起来 → 换按压点 1554,786」，
  // 整回合 0 上场。真甲板只有两排：整备区上排 y≈640~680、下排 y≈830~1010；700~810 是商店行，一律剔掉。
  const yLo = opts.shopOpen === true ? 800 : 600
  if (Array.isArray(chips0) && chips0.length) {
    const noShop = chips0.filter((c) => !(c && Number.isFinite(c.y) && c.y > 700 && c.y < 810))
    if (noShop.length !== chips0.length) {
      steps.push('  甲板坐标剔掉商店行（y 700~810）的 ' + (chips0.length - noShop.length) + ' 个')
      chips0 = noShop
    }
    const good = chips0.filter((c) => c && Number.isFinite(c.y) && c.y >= yLo && c.y <= 1010)
    if (good.length !== chips0.length) {
      steps.push('  甲板坐标剔掉不像甲板行的 ' + (chips0.length - good.length) + ' 个（y 不在 800~1010）')
      chips0 = good
    }
  }
  // 2026-11-13 14:1x（trace-night-2026-11-13T06-12-12 第 10 回合）：deck.py 只认出 2 张（真实 6 张），
  // 按出来的点 (369,884) 是空格位，拖到哪都是「牌还在甲板」，整回合 0 上场。
  // 甲板是固定 10 格（data/maps/wz-01.json unitDeck，x 217..1551、y 911~921），折叠商店后牌总是从最左开始排，
  // 所以扫到的张数不够时直接按格位补（钱够了才买，牌不会凭空消失）。
  // 2026-11-13 16:4x：整备区人多时摆两排（y≈640~680 / y≈830~1010），两排混在一起按 x 排序会让「名字↔牌」
  // 全错位。只留张数最多的那一排（同一排的牌才按 x 连续编号）。
  if (Array.isArray(chips0) && chips0.length > 1) {
    const buckets = new Map()
    for (const c of chips0) {
      const key = Math.round((Number(c.y) || 0) / 60) * 60
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key).push(c)
    }
    let bestKey = null
    let bestN = -1
    for (const [k2, arr] of buckets) { if (arr.length > bestN) { bestN = arr.length; bestKey = k2 } }
    const best = buckets.get(bestKey) || []
    if (best.length < chips0.length) {
      steps.push('  甲板扫到两排（y≈' + [...buckets.keys()].sort((a, b) => a - b).join('/') + '）→ 只留张数最多的一排 ' + best.length + ' 张')
      chips0 = best
    }
  }
  // 2026-11-14 00:3x 真机（trace-night-2026-11-13T15-45-01 第 3 回合）：卫戍协议这一关的甲板是**大卡**
  // （牌距 243、卡框 233 宽），而 wz-01 的 unitDeck 格位是按 148 小牌排的（x 217..1551、pitch 148）。
  // 按 148 格位去「吸点」会把 843/1086/1329 改成 819/1077/1285（越改越偏），按格位「右对齐补点」更是
  // 直接造出 148 间距的假坐标。牌距 > 200 就认定是另一种甲板布局，两段格位逻辑都跳过。
  const bigCardMode = (() => {
    const xs = chips0.map((c) => Number(c && c.x) || 0).filter((v) => v > 0).sort((a, b) => a - b)
    if (xs.length < 2) return false
    const gaps = []
    for (let i = 1; i < xs.length; i++) gaps.push(Math.abs(xs[i] - xs[i - 1]))
    gaps.sort((a, b) => a - b)
    const med = gaps[Math.floor(gaps.length / 2)]
    if (med > 200) steps.push('  甲板是大卡布局（牌距 ' + Math.round(med) + '）→ 跳过 148 格位吸附/补点')
    return med > 200
  })()

  // 2026-11-13 19:2x 真机（trace-night-2026-11-13T11-15-32 第 2 回合）：4 张牌只认出 x=370,1265 两个按压点，
  // 370 是木台上站着的小人 —— 按上去永远「拎不起来」，整回合 0 上场。真牌实测在 1115/1264/1413/1562，
  // 正好是 unitDeck 格位 1106/1255/1403/1551 加 ~10px。所以按压点一律吸到最近的格位上，偏太远的丢掉。
  if (chips0.length && !bigCardMode) {
    let gridSnap = []
    try {
      const m = loadGameMap() || {}
      gridSnap = (Array.isArray(m.unitDeck) ? m.unitDeck : [])
        .map((p) => (Array.isArray(p) ? Number(p[0]) : Number(p && p.x)))
        .filter((v) => Number.isFinite(v) && v > 0)
    } catch { gridSnap = [] }
    if (gridSnap.length >= 2) {
      const out = []
      let dropped = 0
      for (const c of chips0) {
        const x = Number(c.x) || 0
        let best = null
        for (const gx of gridSnap) if (best == null || Math.abs(gx + 10 - x) < Math.abs(best + 10 - x)) best = gx
        if (best == null || Math.abs(best + 10 - x) > 120) { dropped += 1; continue }
        const nx = best + 10
        if (out.some((o) => Math.abs(o.x - nx) < 20)) { dropped += 1; continue }
        out.push({ ...c, x: nx })
      }
      if (out.length) {
        if (dropped) steps.push('  甲板按压点吸到格位：丢掉不在格位上的 ' + dropped + ' 个')
        chips0 = out
      }
    }
  }

  // 2026-11-13 19:0x 真机（trace-night-2026-11-13T10-51-49 第 9 回合）：整备区 4 张只扫出 2 个按压点
  // （x=370,1265；370 是木台上站着的小人，不是牌），结果整回合按 370 拎牌 → 「牌还在 370,884」，0 上场。
  // 甲板几何是固定的：折叠态牌右对齐排在 unitDeck 的最后 N 格。所以「扫到的点数 < 账本张数，
  // 且已经扫到靠右的牌（maxX ≥ 1200）」时，按格位把缺的补到左边 —— 不依赖 deck.py 认牌。
  if (!bigCardMode && opts.shopOpen !== true && chips0.length && chips0.length < deck.length) {
    const xsReal = chips0.map((c) => Number(c.x) || 0).filter((v) => v > 0)
    const maxX = xsReal.length ? Math.max(...xsReal) : 0
    const ysReal = chips0.map((c) => Number(c.y) || 0).filter((v) => v > 0).sort((a, b) => a - b)
    const medY = ysReal.length ? ysReal[Math.floor(ysReal.length / 2)] : 0
    let gridXs = []
    try {
      const m = loadGameMap() || {}
      gridXs = (Array.isArray(m.unitDeck) ? m.unitDeck : [])
        .map((p) => (Array.isArray(p) ? Number(p[0]) : Number(p && p.x)))
        .filter((v) => Number.isFinite(v) && v > 0)
        .sort((a, b) => a - b)
    } catch { gridXs = [] }
    const need = Math.max(0, Math.min(Number(opts.slotsLeft) || 0, deck.length))
    if (maxX >= 1200 && medY >= 560 && medY <= 1010 && gridXs.length >= deck.length) {
      // 2026-11-14 00:3x 真机（trace-night-2026-11-13T16-23-10 第 6 回合）：整备区 1 张、deck 账本 2 张时，
      // 这里原先是「按右对齐格位重建」→ 把真扫到的按压点 x=1265 换成了格位 1551，整回合按空位，上场 0。
      // 真点永远优先：只用格位往左边补缺口（牌是右对齐的，缺的必然在左边）。
      const out = chips0.slice()
      const scannedMin = out.length ? Math.min(...out.map((c) => Number(c.x) || 0)) : Infinity
      const cands = gridXs.filter((gx) => gx + 10 < scannedMin - 60)
      const target = Math.max(need, out.length)
      while (out.length < target && cands.length) {
        const gx = cands.pop()
        out.push({ x: gx + 10, y: medY })
      }
      if (out.length > chips0.length) {
        steps.push('  甲板只扫到 ' + chips0.length + ' 个按压点（最大 x=' + Math.round(maxX) + '）→ 保留真点，左边按格位补到 ' + out.length + ' 个（x=' + out.map((c) => Math.round(c.x)).join(',') + '）')
      } else {
        steps.push('  甲板只扫到 ' + chips0.length + ' 个按压点（最大 x=' + Math.round(maxX) + '），格位补不了 → 就按这几个点试')
      }
      chips0 = out
      chipsFromCache = false
    }
  }

  // 2026-11-14 00:3x（trace-night-2026-11-14T16-04-21 第 12 回合）：撤回再部署后整备区多一张，牌整体右移；
  // deck.py 只扫到 8 个按压点（真实 9 张，最左那张没认出来）→ 按左起第一张 green=2339 拎不起来，整回合 0 上场。
  // 用相邻点的中位间距往左补点：间距取自这一帧的真实牌距，比地图格位表可靠。
  if (!bigCardMode && opts.shopOpen !== true && chips0.length >= 2 && chips0.length < deck.length) {
    const xsS = chips0.map((c) => Number(c.x) || 0).filter((v) => v > 0).sort((a, b) => a - b)
    const gapsS = []
    for (let gi = 1; gi < xsS.length; gi++) { const g = xsS[gi] - xsS[gi - 1]; if (g >= 60 && g <= 320) gapsS.push(g) }
    if (gapsS.length) {
      gapsS.sort((a, b) => a - b)
      const sp = gapsS[Math.floor(gapsS.length / 2)]
      const outS = chips0.slice()
      let leftMost = xsS[0]
      const yS = Number(chips0[0] && chips0[0].y) || 882
      let addedS = 0
      while (outS.length < deck.length && leftMost - sp > 120 && addedS < 4) {
        leftMost -= sp
        outS.push({ x: leftMost, y: yS })
        addedS += 1
      }
      if (addedS > 0) {
        chips0 = outS.sort((a, b) => a.x - b.x)
        chipsFromCache = false
        steps.push('  按压点比账本少 ' + (deck.length - xsS.length) + ' 个 → 按中位间距 ' + Math.round(sp) + ' 往左补 ' + addedS + ' 个（x=' + chips0.map((c) => Math.round(c.x)).join(',') + '）')
      }
    }
  }
  // 2026-11-13 16:3x 真机（trace-night-2026-11-13T08-27-10 第 12 回合）：扫到 0 张时这里曾按 unitDeck
  // 「从最左格位补」→ 造出 x=217/366 的假按压点，牌其实在 369/667（整备区两排），按上去「没拎起来」，整回合白试。
  // 格位数 ≠ 真牌位置（牌靠右、还分两排），所以不再合成坐标；张数不够就重扫一次（含上排），扫到几张算几张。
  if (opts.shopOpen !== true) {
    try {
      const need = Math.max(0, Math.min(Number(opts.slotsLeft) || 0, deck.length))
      if (need > 0 && chips0.length < need) {
        const sc3 = await scanDeckChips({})
        const more = (sc3 && Array.isArray(sc3.chips) ? sc3.chips : [])
          .filter((c) => c && Number.isFinite(c.y) && c.y >= 560 && c.y <= 1010)
        if (more.length > chips0.length) {
          steps.push('  扫到 ' + chips0.length + ' 张 < 要放 ' + need + ' 张 → 不设下限重扫，拿到 ' + more.length + ' 张（x=' + more.map((c) => Math.round(c.x)).join(',') + '）')
          chips0 = more
          try { rememberDeck(mapId, false, more) } catch {}
        }
      }
    } catch (e) { steps.push('  重扫甲板失败（' + e.message + '）') }
  }
  // 商店展开时底排是商店卡，甲板被顶到上面一行，牌和卡会混（用户 m08714：换人/上装备要先折叠商店）。
  // 商店开没开，调用方从 OCR 已经知道，直接听它，不自己猜。
  if (opts.shopOpen === true) {
    tap(POINTS.collapse[0], POINTS.collapse[1])
    await sleep(1000)
    scan0 = await scanDeckChips({ minPressY: 840 })
    chips0 = scan0.chips
    steps.push('  商店展开中 → 先折叠再上场（甲板 ' + chips0.length + ' 张）')
  }
  // 2026-11-12 23:4x 实测（trace-cont-15-25-52 第 3/4 回合）：调用方传进来的 chips 可能整批是
  // 「商店展开态」扫的（y=786 的收起点 + y≈936 的商店卡），过滤后一张不剩，于是白白跳过整回合。
  // 这里不信调用方的判定，自己点一次折叠再扫；扫出来都算真甲板，扫不到才算「看不清」。
  if (!chips0.length) {
    try {
      tap(POINTS.collapse[0], POINTS.collapse[1])
      await sleep(900)
      const sc2 = await scanDeckChips({ minPressY: 840 })
      let good2 = (sc2 && sc2.chips ? sc2.chips : []).filter((c) => c && Number.isFinite(c.y) && c.y >= 600 && c.y <= 1010)
      if (!good2.length) {
        // 再试一次不设绝对 y 下限的（镜头拉远、两排人时按压点会整体上移）
        const sc3 = await scanDeckChips({})
        const g3 = (sc3 && sc3.chips ? sc3.chips : []).filter((c) => c && Number.isFinite(c.y) && c.y >= 560 && c.y <= 1010)
        if (g3.length) {
          good2 = g3
          steps.push('  甲板重扫（不设 y 下限）拿到 ' + g3.length + ' 张')
        }
      }
      if (good2.length) {
        chips0 = good2
        steps.push('  甲板看不清 → 折叠商店重扫，拿到 ' + good2.length + ' 张')
      }
    } catch (e) {
      steps.push('  折叠后重扫甲板失败（' + e.message + '）')
    }
  }
  if (!chips0.length) {
    // 2026-11-13 01:0x：先折叠再扫都还是空 → 多半是账本虚高（牌早上了，账没删）。这条必须打出来，
    // 否则 steps.push 不进 trace，复盘时只看到「布阵：上场 0 个」不知道为什么。
    note(opts, '  扫不到甲板小牌（折叠重扫也空）→ 本回合不拖，账本按空处理')
    steps.push('  扫不到甲板小牌，跳过拖上场')
    return { ok: true, steps, placed: 0, deckLeft: deck.length, benchUnknown: true, deckStale: true }
  }
  note(opts, '  甲板 ' + chips0.length + ' 张｜候选格 ' + tiles.length + (mapTiles.length ? '（地图）' : '（写死）'))

  // 地图池留一份当兜底：学到的合法格池可能只有 1~2 个（幽灵挡住绿格 / 那一帧没截好），
  // 用完了就「候选格用完了」停手 —— 2026-11-12 01:5x 实测第 6 回合整回合 0 上场就是这么来的。
  const baseTiles = tiles.slice()
  if (opts.freeScan === true) {
    try {
      const free = await scanFreeTiles()
      if (free.ok && free.tiles.length) {
        const near = (p2, q) => Math.abs(p2[0] - q[0]) <= 40 && Math.abs(p2[1] - q[1]) <= 40
        const extra = free.tiles.filter((t) => !tiles.some((o) => near(o, t)))
        if (extra.length) {
          tiles = tiles.concat(extra)
          steps.push('  空可站格补 ' + extra.length + ' 个（共 ' + tiles.length + '）')
        }
      }
    } catch (e) {
      steps.push('  空格扫描失败（' + e.message + '），用现有格')
    }
  }

  // ── 2026-11-12 凌晨真机实测的新配方（详见 lib/deploy-fast.js 顶部注释）────────────
  // ① 拖到格上松手**不会落位**，游戏停在「待确认」态（全场绿格 + 红X + 白色幽灵 + 头顶 ∧）；
  //    确认动作是**向上滑**，且必须走 adb input swipe（minitouch 发同样轨迹无效）。
  // ② 落点必须是该干员的**合法格**，落错会吸到最近合法格 → 上滑滑空 → 取消（配额不减）。
  // ③ 合法格每回合变。拎起一张牌进入待确认态、用绿格算出本回合的合法格，再点红X取消（不耗配额）。
  // ④ 判成功别只看绿格归零（取消也会归零），要看**待命区少了一张牌**。
  let probePress = null
  let learnedTiles = false
  const SWIPE_CONFIRM = opts.useSwipeConfirm !== false && !process.env.COOP_NO_SWIPE
  const MOVE_MS = Number(opts.moveMs || process.env.COOP_DEPLOY_MOVE_MS) || DEPLOY_MOVE_MS
  if (SWIPE_CONFIRM) {
    try {
      // 候选按压点：最新的那张（chips 末位）优先，其次最右、再逐个 —— 甲板 chip 不一定压在精灵中心
      const candPress = []
      const pushCand = (c) => { if (c && !candPress.some((x) => Math.abs(x.x - c.x) < 8 && Math.abs(x.y - c.y) < 8)) candPress.push({ x: c.x, y: c.y }) }
      pushCand(chips0[chips0.length - 1]); pushCand(chips0[0])
      for (const c of chips0) pushCand(c)
      const pr = PROBE_NEEDED
      ? await probeValidTiles(candPress.slice(0, 4), { savePng: (b) => saveShot(b, 'probe') })
      : { ok: false, why: '跳过（上一回合没失败，地图格够用，省 8~11s）' }
      if (pr.ok && pr.tiles && pr.tiles.length) {
        const seen = new Set()
        const pool = []
        for (const t of pr.tiles) {
          const k = Math.round(t.x / 40) + ',' + Math.round(t.y / 40)
          if (seen.has(k)) continue
          seen.add(k)
          pool.push([t.x, t.y])
        }
        // 合法格优先：计划里的 want 若不在合法格里，pickCell 会自动退到合法格队列。
        // 2026-11-12 修：绿格池是 sidecar 按绿度排序的（_validtiles.py 的 best.sort(key=-ratio)），
        // 直接用会把地图给的站位顺序冲掉 —— 第一个干员会站到绿度最高那格。按 deployOrder 重排一次。
        if (replacing) {
          // 2026-11-12 22:4x 实测（trace-2026-11-12T13-59-56 第 8 回合）：名额 0 换人时，
          // 探到的绿格是「空格」，可名额 0 根本放不上去 → 拖 12 格全失败。换人只认已占格，别被绿格池冲掉。
          steps.push('  换人模式：探到 ' + pool.length + ' 个绿格，但名额 0 只能替换已占格 → 保持已占格池')
        } else {
          tiles = sortPoolByOrder(loadGameMap(), pool)
        }
        probePress = pr.press || null
        PROBE_NEEDED = false
        PROBE_FAILS = 0
        steps.push('  本回合合法格 ' + pool.length + ' 个（拎牌探的，已取消，不耗名额）')
        note(opts, '  合法格 ' + pool.length + ' 个：' + pool.slice(0, 8).map((t) => t.join(',')).join(' '))
      } else {
        steps.push('  没探到合法格（' + (pr.why || '待确认态没出现') + '），沿用候选格')
      }
    } catch (e) {
      steps.push('  合法格探测失败（' + e.message + '），沿用候选格')
    }
  }

  // 2026-11-13 23:5x（实测 trace-night-2026-11-13T14-08-08）：账本里的名字可能是「已经站在场上的人」——
  // 上一回合布阵没删干净（或删错了位置），这些名字下回合会把甲板牌全判成「重复干员」剔空 → 整回合 0 上场。
  // 名字账本和场上账本矛盾时以场上为准：这些人（连同名副本）整条剔掉。
  {
    const onBoard = new Set((Array.isArray(opts.boardSlots) ? opts.boardSlots : [])
      .map((b) => (b && b.name ? String(b.name) : '')).filter(Boolean))
    if (onBoard.size && deck.length) {
      const deckBefore = deck.length
      for (let k = deck.length - 1; k >= 0; k--) {
        const nm = deck[k] && deck[k].name ? String(deck[k].name) : ''
        if (nm && onBoard.has(nm)) deck.splice(k, 1)
      }
      if (deck.length !== deckBefore) steps.push('  账本剔掉 ' + (deckBefore - deck.length) + ' 张「已经在场上」的旧名字 → 账本剩 ' + deck.length + ' 张')
    }
  }
  // 2026-11-12 23:4x：账本（deck）会漂移——买卡点击没生效、商店展开时木台被遮、接手局只数了牌。
  // 甲板看得见就以真实牌数为准：多了截掉最右（最新）那几张，少了在最左补无名牌。
  let ledgerFixed = 0
  if (deck.length > chips0.length) {
    ledgerFixed = deck.length - chips0.length
    deck.splice(chips0.length)
    steps.push('  账本 ' + (chips0.length + ledgerFixed) + ' 张 > 甲板 ' + chips0.length + ' 张 → 按甲板截掉 ' + ledgerFixed + ' 张无名账')
  } else if (deck.length < chips0.length) {
    const pad = []
    for (let k = deck.length; k < chips0.length; k++) pad.push({ index: -1, name: '' })
    deck.splice(0, 0, ...pad)
    steps.push('  账本 ' + (chips0.length - pad.length) + ' 张 < 甲板 ' + chips0.length + ' 张 → 前面补 ' + pad.length + ' 张无名牌')
  }
  const left = Number(opts.slotsLeft)
  // 2026-11-13 23:5x 实测（trace-night-2026-11-13T14-08-08）：名额读数读到 2、画面写着 6，
  // 旧 budget 被这个 2 掐死 —— 整回合最多只敢碰 2 张牌，那 2 张又都被同名规则剔掉 → 连续 6 回合 0 上场。
  // 名额读数只用来「别放太多」，不再当硬上限：至少给 3 张牌机会，真没名额会连续拎不起来自己收手。
  const slotCap = Number.isFinite(left) && left > 0 ? Math.max(3, left) : Infinity
  const budget = Math.min(deck.length, chips0.length, slotCap)
  if (!budget) {
    steps.push('  没有可上场名额（剩 ' + (Number.isFinite(left) ? left : '?') + '）')
    return { ok: true, steps, placed: 0, deckLeft: chips0.length, ledgerFixed }
  }

  // 2026-11-13 09:0x（用户 m04520：休息期 ≤70s）：给整次布阵一个墙钟预算。
  // trace-night-13T00-40-06 第 11 回合试了 4 次、每次 5.5s、外加 4 次重探甲板 = 47.7s，
  // 全是「牌拎不起来」的死循环，把休息期拖到 75.5s。超过预算本回合就收手，剩下的下回合再来。
  const DEPLOY_BUDGET_MS = Number(opts.deployBudgetMs) > 0 ? Number(opts.deployBudgetMs) : 90000
  const DEPLOY_T0 = Date.now()
  const deployOver = () => Date.now() - DEPLOY_T0 > DEPLOY_BUDGET_MS

  let plan = []
  if (opts.smart && typeof opts.identity === 'function') {
    try {
      const known = []
      for (const c of chips0.slice(0, budget)) known.push(await opts.identity(c))
      plan = planDeploy({ units: known, tiles: tiles, closed: opts.closed, map: opts.map || mapForPlacement() })
      steps.push('  站位计划：' + plan.map((x) => (x.name || '?') + '→' + x.tile.join(',') + '朝' + x.facing).join(' / '))
    } catch (e) {
      steps.push('  站位计划算不出来（' + e.message + '），按地图格顺序放')
      plan = []
    }
  }

  // 甲板顺序：按 x 从左到右＝最早买到 → 最新买到。
  // 2026-11-12 17:5x 实测（trace-2026-11-12T09-52-54 第 1 回合）：先买 拜松 落在 x=1413、后买 灰喉 落在 x=1562，
  // 跟 run.js 卖卡分支「最左＝最早买入」（drive.js sell 分支 chips[0]）一致。
  // 以前这里 deck.slice().reverse() 反过来取，名字和牌错位一格 → 灰喉（狙击）被排到近战格 (4,1) 964,350，
  // 落点不合法被游戏吸到 1050,360；拜松（重装）被排到高台附近 830,340。按人排位等于白算。
  chips0 = chips0.slice().sort((a, b) => a.x - b.x)
  // deck 只记「这一局我买过的名字」，甲板上可能还躺着接手前的旧卡（名字空）。
  // 张数对不上就按「空名字垫在最左」对齐，别直接放弃按人排位。
  const deckNames = deck.map((x) => x.name)
  const names = deckNames.length < chips0.length
    ? new Array(chips0.length - deckNames.length).fill('').concat(deckNames)
    : deckNames.slice(0, chips0.length)
  // 2026-11-11 18:45（用户 m02897「医疗在左 → 远程 → 近战」+ m02970「看攻击范围覆盖」）：
  // 认得出人名就按每个人自己的攻击范围挑位置；认不出就退回覆盖序（tiles 已经是覆盖序）。
  let plannedNames = null
  let whyPlan = ''
  try {
    // 只给「这回合真要上场的那几张」排位：名额有限时 budget < 甲板张数，
    // 2026-11-12 18:0x 实测 bug：拿整甲板名字（2 个）跟 budget（1）比 → 永远不等 → 按人排位整场没生效。
    const want = chips0.slice(0, budget)
    const topNames = names.slice(0, want.length)
    if (topNames.length !== want.length) whyPlan = '要排位 ' + topNames.length + ' 个 ≠ 甲板空格 ' + want.length + ' 个'
    else {
      // 2026-11-12 19:1x 实测（trace-11-03-53 第 1 回合）：开局甲板最左那张是「初始送的干员」，
      // 名字没认出来 → 整队不排位 → 远程被放进了近战格 (3,1) 一带。
      // 改成「认得出的按人排，认不出的排在后面按池序补」，别再因为一张无名牌整队不排。
      const knownIdx = []
      const knownNames = []
      topNames.forEach((n, k) => { if (n && n.length) { knownIdx.push(k); knownNames.push(n) } })
      if (!knownNames.length) whyPlan = '这 ' + topNames.length + ' 张名字全都认不出来'
      else {
        const p2 = planTilesForNames(knownNames, loadGameMap(), [...occPx])
        if (p2 && p2.length === knownNames.length) {
          plannedNames = new Array(topNames.length).fill(null)
          knownIdx.forEach((k, j) => { plannedNames[k] = p2[j] })
          const unknown = topNames.length - knownNames.length
          if (unknown) note(opts, '  按人排位：' + knownNames.length + ' 张认得出 → 按人排，' + unknown + ' 张无名牌按池序补')
        } else whyPlan = 'planTilesForNames 只给了 ' + (Array.isArray(p2) ? p2.length : String(p2)) + ' 个位置'
      }
    }
  } catch (e) { plannedNames = null; whyPlan = '算位置时出错：' + e.message }
  // 2026-11-13（handoff §3 用户原话）：BOSS 关阵容大调 —— x=7/8 放近战、x=5/6 放医疗和远程、
  // 远程够得到 x=9、全部朝右。这里直接覆盖常规的 planTilesForNames 结果，其余流程（拖拽/确认/判牌）不变。
  if (opts.boss === true) {
    try {
      const topNames2 = names.slice(0, budget)
      const knownIdx = []
      const knownNames = []
      topNames2.forEach((n, k) => { if (n && String(n).length) { knownIdx.push(k); knownNames.push(String(n)) } })
      if (!knownNames.length) {
        note(opts, '  BOSS 站位跳过：这 ' + topNames2.length + ' 张牌名字全认不出来，按池序放')
      } else {
        const bl = bossLayoutFor(knownNames, loadGameMap())
        plannedNames = new Array(topNames2.length).fill(null)
        knownIdx.forEach((k, j) => { plannedNames[k] = bl[j] })
        // BOSS 目标格里 (6,3) 这类不在 deployOrder 里的格，必须补进候选池，否则 pickCell 找不到它。
        const bossPx = bossTilesFor(loadGameMap()).map((t) => t.px)
        const pushPx = (pool) => {
          for (const p of bossPx) {
            if (!pool.some((t) => t && Math.hypot(t[0] - p[0], t[1] - p[1]) <= 25)) pool.push(p.slice())
          }
        }
        pushPx(tiles)
        pushPx(baseTiles)
        note(opts, '  ' + describeBossPlan(bl))
        const swaps = planBossSwaps(Array.isArray(opts.boardSlots) ? opts.boardSlots : [], bl, {
          bench: topNames2.filter(Boolean),
        })
        if (swaps.ok) note(opts, '  BOSS 换人建议 ' + swaps.ok + ' 个：' + swaps.swaps.map((sw) => sw.name + '→' + sw.px.join(',') + '（' + sw.why + '）').join(' / '))
      }
    } catch (e) {
      note(opts, '  BOSS 站位算不出来（' + e.message + '）→ 退回常规排位')
    }
  }
  if (!plannedNames) note(opts, '  按人排位跳过：' + (whyPlan || '未知原因'))
  else note(opts, '  甲板左→右 x=' + chips0.slice(0, budget).map((c) => Math.round(c.x)).join(',') + ' ↔ 名字 ' + names.slice(0, budget).map((n) => n || '?').join(','))
  if (plannedNames) {
    // 2026-11-12（用户 m02460）：日志带上格子 (col,row) 和「固定/就近」，实测时一眼能对；
    // 再把这张图的指定站位原样打一行，出问题能直接看出是数据错还是落点错。
    try { note(opts, '  地图站位：' + describeDeployOrder(loadGameMap())) } catch (e) {}
    note(opts, '  按人排位：' + plannedNames.map((p, k) => p
      ? p.name + '→(' + p.col + ',' + p.row + ') ' + p.px.join(',') + (p.role === 0 ? '(医疗)' : p.role === 1 ? '(远程)' : '(近战)') + (p.fixed ? '' : '(就近)')
      : (names[k] || '无名牌') + '→按池序').join(' / '))
  }
  // 2026-11-12 19:3x（用户 m00999 的副作用）：甲板最左那张可能是装备卡，拖到地面格永远非法，
  // 会把后面能上的牌全挡死。名字能认出来、且命中装备表的，直接不进布阵队列，交给 equipDeck。
  let equipCards = 0
  // 2026-11-13 09:1x（新 bug）：同一名干员不能上场两次。甲板里买到重复卡很常见（实测卡达×2、波登可×2），
  // 以前照拖，游戏毫无反应（连待确认态都不出现），被当成「名额大概是 0」白试 4~9 次（每回合 20~47s）。
  const boardNames = new Set((Array.isArray(opts.boardSlots) ? opts.boardSlots : [])
    .map((b) => (b && b.name ? String(b.name) : '')).filter(Boolean))
  let dupeCards = 0
  // 2026-11-15 00:1x（用户 m08866「台下的高阶干员怎么就不上呢」）：
  // 以前 queue 恒按甲板 x 从左往右拖 —— 名额只够 1~2 张时永远只碰最早买到的那几张，
  // 后面买到的高阶牌/凑盟约的牌一直躺着（trace-night-2026-11-14T15-14-21 连续几回合 0~1 上场）。
  // 现在先按「补哪个盟约最缺 > 叠层核心 > 阶数高」排一次序，认不出名字的排最后。
  let deployOrder = chips0.slice(0, budget).map((c, k) => k)
  try {
    if (budget > 1) {
      const prio = benchDeployOrder(names.slice(0, budget), {
        boardNames: [...boardNames],
        covenants: Array.isArray(opts.activeCovenants) ? opts.activeCovenants : [],
        // 名额越紧越该先上高阶（用户 m08866）—— 交给 benchDeployOrder 自己按槽位加权
        slotsLeft: Number.isFinite(Number(opts.slotsLeft)) ? Number(opts.slotsLeft) : -1,
        map: loadCovenantMap(),
      })
      if (Array.isArray(prio) && prio.length === budget) {
        deployOrder = prio
        note(opts, '  上台优先序：' + prio.map((k) => (names[k] || '无名')).join(' > '))
      }
    }
  } catch (e) { note(opts, '  上台优先序算不出来（' + e.message + '）→ 按甲板从左往右') }
  // 2026-11-14 23:54 实测：原来写成 deployOrder.map((k) => chips0[k]).map((c, idx2) => ...)，
  // 链式 map 的第二个回调不在第一个回调作用域里 → ReferenceError: k is not defined（整局 CRASH）。
  // 先配对成 { k, c } 再映射，k 就不丢。
  const queue = deployOrder.map((k) => ({ k, c: chips0[k] })).map(({ k, c }) => ({
    x: c.x,
    y: c.y,
    name: (plan[k] && plan[k].name) || names[k] || '',
    want: (plannedNames && plannedNames[k] && plannedNames[k].px) || (plan[k] && plan[k].tile) || null,
    // 朝向跟着格走（用户 m00002：「朝向要一起给」）。没有就退回全局 opts.facing。
    facing: (plannedNames && plannedNames[k] && plannedNames[k].facing) || (plan[k] && plan[k].facing) || null,
    rank: (plan[k] && plan[k].deployRank) || 5,
  })).filter((q) => {
    if (q.name && equipNameSet().has(q.name)) { equipCards += 1; return false }
    if (q.name && boardNames.has(q.name)) { dupeCards += 1; return false }
    return true
  })
  if (dupeCards) note(opts, '  甲板上有 ' + dupeCards + ' 张已在场上的同名干员 → 不重复部署（先留着，缺钱再卖）')
  // 2026-11-13 23:5x 实测（trace-night-2026-11-13T14-08-08，连续 6 回合 0 上场）：这里原来是「忽略同名规则照拖」——
  // 同一个人已经在场上时游戏根本不让放，拖 3 格必然全失败，还被 noPendingTiles 判成「场上大概已满」整回合收手。
  // 名字账本和场上矛盾，就当账本脏了：清空这几张的名字，按无名牌照拖（真同名会失败，但不会再连累整回合）。
  if (!queue.length && dupeCards && !!(Number(opts.slotsLeft) > 0)) {
    note(opts, '  同名规则把 ' + dupeCards + ' 张全剔空了，但名额还有 ' + opts.slotsLeft + ' → 当账本脏了：清名字后按无名牌照拖')
    for (const c of chips0.slice(0, budget)) {
      queue.push({ x: c.x, y: c.y, name: '', want: null, facing: null, rank: 5 })
    }
  }
  queue.sort((a, b) => a.rank - b.rank)
  // 2026-11-12 22:xx（用户 m02613/m02614）：换人时按盟约挑「谁上、换掉谁」。
  // replacePx 是挑好的那一格（要换下来的那个人的格），headName 是这一轮优先拖的牌。
  if (opts.replace === true && Array.isArray(opts.replacePx) && opts.replacePx.length) {
    for (const q of queue) q.want = opts.replacePx.slice()
    note(opts, '  换人目标格（盟约挑的）：' + opts.replacePx.join(','))
  }
  if (opts.headName) {
    const hn = String(opts.headName)
    queue.sort((a, b) => ((b.name === hn ? 1 : 0) - (a.name === hn ? 1 : 0)) || (a.rank - b.rank))
    note(opts, '  优先拖：' + hn + (queue.length && queue[0].name === hn ? '（已在队首）' : '（队里没找到同名牌，按原序）'))
  }
  if (equipCards) note(opts, '  甲板上有 ' + equipCards + ' 张装备卡 → 不参与布阵，留给装装备')

  // 2026-11-14 09:0x（用户 m02396）：站位记忆。上过哪格、哪格对这张牌上不去，都记到 data/deploy-map.json，
  // 下一回合/下一局直接用，少盲试一格就是省 5.8s。
  const dpMap = opts.map || loadGameMap()
  const dpMapId = (dpMap && dpMap.id) || 'wz-01'
  const dpStore = loadDeployMap()
  const dpCells = Array.isArray(dpMap && dpMap.cells) ? dpMap.cells.filter((c) => c && c.deploy) : []
  let dpDirty = false
  let dpMemHits = 0
  // 像素点 → 地图格 {col,row}（60px 容差；认不出返回 null）
  const cellColRowOf = (pxArr) => {
    if (!Array.isArray(pxArr) || !dpCells.length) return null
    let best = null
    let bd = 60
    for (const c of dpCells) {
      if (!c || !Array.isArray(c.px)) continue
      const d = Math.hypot(c.px[0] - pxArr[0], c.px[1] - pxArr[1])
      if (d < bd) { bd = d; best = c }
    }
    return best ? { col: Number(best.col), row: Number(best.row) } : null
  }
  // 这张牌这一轮该先试哪些格：记忆格 → 职业序列 → 就近补位（已剔掉棋盘占格/标死格/本回合用过的格）
  const rankFor = (item) => {
    try {
      const mem = item.name ? memoryOf(dpStore, dpMapId, item.name) : null
      if (mem) dpMemHits += 1
      return rankTiles({ name: item.name || '', role: item.role || roleKeyOfName(item.name || '') }, {
        map: dpMap,
        takenPx: [...occPx],
        deadPx: [...DEAD_TILES],
        usedPx: [...used],
        memory: mem,
      })
    } catch { return [] }
  }
  // 把池子按 rankFor 的顺序重排（认不上序的点排最后），pickCell 仍然负责「离 want 最近 + 不被占用」。
  const poolFor = (item, pool) => {
    const ranked = rankFor(item)
    if (!ranked.length || !Array.isArray(pool) || !pool.length) return pool
    const keyed = pool.map((t) => {
      let idx = ranked.length
      let bd = 55
      for (let i = 0; i < ranked.length; i++) {
        const d = Math.hypot(ranked[i].px[0] - t[0], ranked[i].px[1] - t[1])
        if (d < bd) { bd = d; idx = i }
      }
      return { t, idx }
    })
    keyed.sort((a, b) => a.idx - b.idx)
    return keyed.map((x) => x.t)
  }

  // 2026-11-14 19:1x 真机（trace-night-2026-11-14T11-00-48 第 5 回合）：卡涅利安（术师）计划落 (6,2)，
  // 第一格「拎不起来」被标死后，兜底「就近挑空位」把她扔到 (7,2)/(7,1) —— 那是敌人走的通道格，
  // 远程被塞进前排（用户 m06708「把灰喉放这么前面」骂的就是这个）。兜底也必须守职业纪律。
  const walkPxKeys = new Set(((dpMap && Array.isArray(dpMap.cells)) ? dpMap.cells : [])
    .filter((c) => c && c.walk && Array.isArray(c.px)).map((c) => c.px[0] + ',' + c.px[1]))
  const roleSafePool = (item, arr) => {
    if (!Array.isArray(arr) || !arr.length) return arr
    let rk = item && item.role
    if (!rk) { try { rk = roleKeyOfName((item && item.name) || '') } catch { rk = null } }
    if (rk !== 'ranged' && rk !== 'healer') return arr
    // 2026-11-15 00:25 真机（本局第 1 回合）：重装 角峰 计划 (7,1)，拖失败后兜底就近扔到 (6,2) 高台 ——
    // 重装站高台等于白占一个远程位。和远程反向：近战/重装只留通道格（walk=true），没有才退回全池。
    if (rk === 'tank' || rk === 'melee') {
      const fy = arr.filter((t) => t && walkPxKeys.has(t[0] + ',' + t[1]))
      return fy.length ? fy : arr
    }
    const f = arr.filter((t) => t && !walkPxKeys.has(t[0] + 
 + t[1]))
    // 2026-11-15 07:1x（用户 m10907「干员依旧是乱摆」）：远程/医疗没有高台就不许兜底到通道格，
    // 宁可这回合少上一个（通道格上的狙/术打到谁都不知道，还挡住近战的位置）。
    return f.length ? f : []
  }
  const used = new Set()
  // want 是地图格中心（用户手画实测点），池子里的格可能是 sidecar 20px 网格采样的绿格
  // （实测差 10~30px：地图 845,348 vs 绿格 830,340），所以按 45px 容差认；落点仍用池子里的那个点 ——
  // 游戏只认绿格，拖到不在池子里的坐标会被吸走或直接取消。
  const WANT_TOL = 45
  const pickCell = (item, pool) => {
    if (item.want) {
      let bi = -1
      let bd = WANT_TOL
      for (let i = 0; i < pool.length; i++) {
        const t = pool[i]
        if (!t) continue
        if (used.has(t[0] + ',' + t[1])) continue
        if (DEAD_TILES.has(t[0] + ',' + t[1])) continue
        const d = Math.hypot(t[0] - item.want[0], t[1] - item.want[1])
        if (d <= bd) { bd = d; bi = i }
      }
      if (bi >= 0) {
        const t = pool[bi]
        used.add(t[0] + ',' + t[1])
        return t
      }
      // 池子里没有够近的点：退到离 want 最近的空闲点，别随手拿第一个（那会把人扔到地图另一头）。
      let bi2 = -1
      let bd2 = Infinity
      for (let i = 0; i < pool.length; i++) {
        const t = pool[i]
        if (!t) continue
        if (used.has(t[0] + ',' + t[1])) continue
        const d = Math.hypot(t[0] - item.want[0], t[1] - item.want[1])
        if (d < bd2) { bd2 = d; bi2 = i }
      }
      if (bi2 >= 0) {
        const t = pool[bi2]
        used.add(t[0] + ',' + t[1])
        return t
      }
    }
    for (const t of pool) {
      const k = t[0] + ',' + t[1]
      if (used.has(k)) continue
      if (DEAD_TILES.has(k)) continue
      used.add(k)
      return t
    }
    return null
  }

  const record = (b, diff) => {
    if (opts.roster && opts.board) {
      try {
        const u = addUnit(opts.roster, { name: b.name, tier: 0 })
        const g0 = pxToGrid(b.to)
        const grid = [g0.gx, g0.gy]
        boardPlace(opts.board, u.id, grid)
        u.cell = grid
        steps.push('  ' + u.id + (b.name ? '(' + b.name + ')' : '') + ' → 格 ' + grid.join(','))
      } catch (e) {
        steps.push('  记名册失败：' + e.message)
      }
    }
  }

  // 一次一个：拖 → 判「那张牌离开甲板了没有」 → 成了再拖下一个。
  //
  // 2026-11-11 18:0x 改判据（用户 m02704 第 2/3/4/5 条）：
  // ①原来靠「拖之前/拖之后两张截图做像素差」判成功。落在 UI 上的格（wz-01 的 (1489,665)
  //   其实是「冻结」按钮）像素永远不变 → 每回合必白试，而且每次多花约 2.7s 截图+对比。
  // ②现在只认一个事实：刚才那张牌还在不在甲板上。牌没了 = 上场成功；牌还在 = 没上去。
  // ③失败不拉黑，只记一笔（world/data/map-issues.jsonl），换下一个候选格继续；回合末汇总。
  // 2026-11-14 09:0x 用户 m02396「避免重试」：每张牌最多试 2 格（原来 4 格 × 5.8s = 23s 白烧）。
  // 宁可这张牌留到下回合，也不在一回合里把休息期烧光。
  const MAX_TRIES_PER_UNIT = Number(opts.triesPerUnit) || 2
  // 2026-11-12 04:0x：快速模式。逐张上场时不再每张都扫一遍甲板（那一步约 1.5s/张），
  // 只在整批结束后扫一次收尾；「没拎起来」当场就能判（看有没有待确认态），不依赖扫甲板。
  const FAST_BATCH = opts.fastBatch === true || process.env.COOP_FAST_BATCH === '1'
  // 起手时长（用户 m02704 第 4 条：600ms 太久，要多试、尽量短）。支持调用方/env 覆盖，
  // 实测扫描脚本 world/scripts/probe-hold.mjs 会在这个值上做 90/150/200/300/600 的对比。
  // 2026-11-12 00:5x 真机实测（deploy-fast.js 顶部有表）：起手按压本身不关键，
  // 0ms 也能 100% 拎起（game 看的是按下后的连续移动）。默认改成 DEPLOY_HOLD_MS=20。
  // 只有退回旧的 minitouch 单手势（COOP_NO_SWIPE / useSwipeConfirm:false）时才需要 ≥80。
  const holdStart = opts.holdStartMs != null
    ? Math.max(SWIPE_CONFIRM ? 0 : 80, Number(opts.holdStartMs))
    : (Number(process.env.COOP_DEPLOY_HOLD_MS) || (SWIPE_CONFIRM ? DEPLOY_HOLD_MS : DECK_PICK_HOLD_MS))
  let placed = 0
  let attempts = 0
  let skippedUnits = 0
  const failedTiles = []
  const placedCells = []
  // 2026-11-14 加：牌距（中位间距）。每成功上一张牌整排左移一格，用它在本地推剩下的按压点，
  // 省掉「每上一张牌就重扫一次甲板（3~5s）」—— 布阵 42~78s 里有一半是这个开销。
  const deckPitch = (() => {
    const xs = chips0.map((c) => Number(c && c.x) || 0).filter((v) => v > 0).sort((a, b) => a - b)
    if (xs.length < 2) return 0
    const gaps = []
    for (let i = 1; i < xs.length; i++) gaps.push(Math.abs(xs[i] - xs[i - 1]))
    gaps.sort((a, b) => a - b)
    const med = gaps[Math.floor(gaps.length / 2)]
    return med >= 90 && med <= 320 ? med : 0
  })()
  let liveChips = chips0.slice()
  // 2026-11-12 00:5x 实测：甲板 chip 不一定压在干员精灵中心（最右那张按上去拎不起来）。
  // 建一个候选表轮着按：先探合法格成功的那点，再逐个 chip；拎不起来就换下一个点，而不是换格。
  const pressCands = []
  const addPress = (c) => { if (c && !pressCands.some((x) => Math.abs(x.x - c.x) < 10 && Math.abs(x.y - c.y) < 10)) pressCands.push({ x: c.x, y: c.y }) }
  addPress(probePress); for (const c of liveChips) addPress(c)
  // 2026-11-13 14:5x 真机（trace-night-2026-11-13T06-25-51 第 5 回合）：deck.py 扫出 2 张、x=217,366，
  // 可牌实际排在右边（1413/1562）—— 按左边空格当然拎不起来，整回合白烧 24s。
  // 甲板是固定 10 格（data/maps/wz-01.json unitDeck），把「最右 5 格 + 最左 5 格」也塞进候选按压点，
  // 拎不起来就顺着轮着按，总能按到真牌（每换一个点约 2s，只在失败路径上花）。
  try {
    const mdD = JSON.parse(readFileSync(new URL('../data/maps/wz-01.json', import.meta.url), 'utf8'))
    const slotsD = Array.isArray(mdD.unitDeck) ? mdD.unitDeck : []
    // 2026-11-13 15:5x 实测（.tmp/deckprobe.mjs）：商店折叠后甲板整排抬到 y≈675，展开时在 y≈883；
    // 原来固定用 unitDeck 的 y-28（≈893）→ 折叠态全按在空处，整回合「拎不起来」0 上场。
    // 现在按「扫到的行 y 优先，再补 883 / 675 两行」建点，按不到就换行。
    const liveY = liveChips.length ? Math.round(liveChips.reduce((a, c) => a + (Number(c.y) || 883), 0) / liveChips.length) : null
    const rowYs = Array.from(new Set([liveY, 883, 675].filter((v) => Number.isFinite(v))))
    for (let k = slotsD.length - 1; k >= Math.max(0, slotsD.length - 5); k--) for (const yy of rowYs) addPress({ x: slotsD[k][0], y: yy })
    for (let k = 0; k < Math.min(5, slotsD.length); k++) for (const yy of rowYs) addPress({ x: slotsD[k][0], y: yy })
  } catch { /* 读不到地图就只用扫到的点 */ }
  let pressRot = 0
  let pressFailStreak = 0
  const placedNames = []
  // 2026-11-13 13:2x：换人成功后，被换下来的干员会回到整备区（用户 m06018「换人就是把新干员部署在老干员位置」）。
  // 不把它记回甲板账本，下一回合就会「账本少一张 → 布阵 0 个」。
  const swappedOut = []
  let noPendingTiles = 0
  let quotaEmpty = false
  let quotaFullFails = 0
  const pickPress = (fallback) => {
    const list = pressCands.length ? pressCands : liveChips
    if (!list.length) return fallback
    return list[pressRot % list.length]
  }
  const sameChip = (c, f) => Math.abs(c.x - f.x) <= 34 && Math.abs(c.y - f.y) <= 34
  // 2026-11-13 15:0x 真机（trace-night-2026-11-13T06-54-27）：甲板只剩 1~2 张时，牌排在**最右边**
  // （连续多次都是 1562,882 / 1413,883 拎起来的），可 deck.py 常报 x=217 这种空格位 →
  // 每张牌开头都白按两下。这里按「右对齐 10 格」直接算出第一按压点。
  let deckGridX = []
  let deckGridY = 883
  try {
    const mdD2 = JSON.parse(readFileSync(new URL('../data/maps/wz-01.json', import.meta.url), 'utf8'))
    const sd = Array.isArray(mdD2.unitDeck) ? mdD2.unitDeck : []
    const n0 = Math.max(1, Math.min(sd.length, chips0.length || deck.length))
    for (let q = 0; q < n0; q++) deckGridX.push(sd[sd.length - n0 + q][0])
    if (chips0[0] && Number.isFinite(chips0[0].y)) deckGridY = chips0[0].y
    else if (liveY != null) deckGridY = liveY
    else deckGridY = 883
  } catch { /* 没地图就退回扫到的点 */ }
  let itemIdx = -1
  for (const item of queue) {
    // 2026-11-13 19:2x 真机（trace-night-2026-11-13T11-15-32 第 1 回合，名额 7 只上 1 个）：
    // attempts 原来是整轮共享的，第 1 张牌试 4 格失败就把整轮「收手」用掉了，后面能上的牌一个都不试。
    // 改成每张牌单独计数（每张最多 6 格），整轮时间仍由 deployOver() 兜住。
    attempts = 0
    // 每张牌单独算「连续拎不起来」：不然上一张牌失败 3 次会把后面所有牌一起判死（2026-11-13 23:5x）。
    noPendingTiles = 0
    itemIdx += 1
    if (placed >= budget || quotaEmpty) break
    if (deployOver()) {
      note(opts, '  布阵用了 ' + Math.round((Date.now() - DEPLOY_T0) / 1000) + 's 还没完 → 本回合收手（剩下的下回合再说）')
      break
    }
    let done = false
    // 这张牌这一轮标死的格；它一张都上不去时全部撤销（装备卡会把 19 格全标死，后面的干员就没格可用了）
    let cardMarks = []
    // 2026-11-13 12:4x（实测 trace-night-13T04-26-29 第 5 回合：泡泡 4 格全「牌还在甲板」，-35s/0 上场）：
    // 换下一张牌时把候选池还原成地图池 —— 学到的绿格只对**上一个干员**合法，别带给下一个。
    if (learnedTiles) { tiles = baseTiles.slice(); learnedTiles = false }
    for (let k = 0; k < MAX_TRIES_PER_UNIT && !done; k++) {
      let cell = pickCell(item, poolFor(item, roleSafePool(item, tiles)))
      if (!cell && baseTiles.length && tiles !== baseTiles) {
        cell = pickCell(item, poolFor(item, roleSafePool(item, baseTiles)))
        if (cell) note(opts, '  学到的合法格用完了，退回地图格 ' + cell.join(','))
      }
      if (!cell) {
        // 2026-11-12 21:2x（用户 m02340）：「候选格用光了就摆在附近」。
        // 学到的合法格 / 地图格被 used、DEAD 吃完后，从全图格子里挑离目标最近的空位接着试，别整回合 0 上场。
        // 2026-11-13 06:1x 崩溃（trace-night-2026-11-12T22-10-05）：failedTiles 里存的是 {cell, from}，
        // 直接拿来当坐标会 `refPt.join is not a function`。这里统一抠出 [x, y]，类型不对就退回默认格。
        const coordOf = (v) => {
          if (!v) return null
          if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number') return [v[0], v[1]]
          if (Array.isArray(v) && v.length) return coordOf(v[0])
          if (Array.isArray(v.cell)) return coordOf(v.cell)
          if (Array.isArray(v.px)) return coordOf(v.px)
          return null
        }
        const refPt = coordOf(item.want) || coordOf(failedTiles.length ? failedTiles[failedTiles.length - 1] : null) || [964, 350]
        const allT = mapTiles.length ? mapTiles : DEPLOY_TILES
        const nearT = allT.filter((t) => t && !used.has(t[0] + ',' + t[1]) && !DEAD_TILES.has(t[0] + ',' + t[1]))
          .sort((a, b) => Math.hypot(a[0] - refPt[0], a[1] - refPt[1]) - Math.hypot(b[0] - refPt[0], b[1] - refPt[1]))
        if (replacing) {
          // 名额 0 换人：候选就是那几个已占格，用完了就换下一张牌，别兜底到空格
          note(opts, '  换人候选用完了（名额 0，只能替换已占格）')
          break
        }
        if (nearT.length) {
          tiles = nearT
          note(opts, '  候选格用光了 → 就近兜底 ' + nearT.length + ' 格（离 ' + refPt.join(',') + ' 最近 ' + nearT[0].join(',') + '）')
          cell = pickCell(item, poolFor(item, roleSafePool(item, tiles)))
        }
        if (!cell) { note(opts, '  候选格用完了'); break }
      }
      // 2026-11-11 23:10（用户 m06404）：重试时**重新探一次甲板**，别拿第一次那个点一直按。
      // 甲板会随收牌/买牌整体平移，按老坐标就是按在空白处 → 牌永远不离手。
      let from = pickPress({ x: item.x, y: item.y })
      // 2026-11-13 16:3x 真机（trace-night-2026-11-13T08-17-52 第 11 回合）：牌在 x=667，却按右对齐格位去按 518
      // → 按在空格上「没拎起来」，整回合白试两格。牌自己的 chip 坐标优先，格位只在完全没有坐标时兜底。
      if (k === 0 && deckGridX.length && !(Number(item.x) > 0)) {
        const gx = deckGridX[Math.min(itemIdx, deckGridX.length - 1)]
        from = { x: gx, y: deckGridY }
      }
      // 起手点收进牌心：牌下沿（y>900）往上收到 890，避免按在卡片边缘/甲板缝上。
      if (from.y > 900) from = { x: from.x, y: 890 }
      attempts += 1
      // 2026-11-13 08:3x 实测（trace-night-13T00-16-42 第 12 回合）：一次尝试 5s，落位被拒时能连试 9 次
      // = 46s 一个干员都没上去，把休息期从 60s 拖到 92s。给尝试次数封顶，剩下的下回合再说。
      if (!replacing && (attempts >= 6 || deployOver())) {
        note(opts, '  布阵已试 ' + attempts + ' 次 / 用了 ' + Math.round((Date.now() - DEPLOY_T0) / 1000) + 's 都不成 → 本回合收手（省时间，剩下的下回合再说）')
        break
      }
      // 2026-11-13 13:2x：换人已实证可行，不再「试 3 次就收手」，交给下面的格级失败/标死逻辑处理。
      const t1 = Date.now()
      if (SWIPE_CONFIRM) {
        // 拖到格心 → 判「待确认」态 → 上滑确认 → 判牌还在不在甲板
        const g = dragFromTo([from.x, from.y], cell, { holdMs: holdStart, moveMs: MOVE_MS, tag: 'dep' })
        await sleep(300)
        let pdoc = saveShot(screenshot(), 'dep-a')
        let stA = screenState(pdoc, { tiles: !learnedTiles })
        // 2026-11-12 02:4x 实测：有些「没拎起来」的帧 green=595/2400 —— 绿格覆盖动画还没画完，
        // 截图早了一点，其实已经进待确认态了，白记一次失败。灰区（300~3000）再等 260ms 复核一次。
        if (!isPending(stA) && stA.green > 300) {
          // 2026-11-13 19:4x：绿格淡入时先补拍一帧再判（现在 pending 主要看红徽章，这里只是兜底）。
          await sleep(300)
          const again = saveShot(screenshot(), 'dep-a2')
          const st2 = screenState(again, { tiles: false })
          if (isPending(st2) || st2.green > stA.green) { stA = { ...st2, green: st2.green }; pdoc = again }
        }
        if (!isPending(stA)) {
          // 没拎起来：不是牌按偏了，就是这一格非法（落错会立刻取消）。记一笔换下一格。
          // 拎不起来有两种可能：按偏了（换按压点），或这一格对该干员不合法（换格）。
          // 先换按压点试；候选都试过了才记一笔换格。
          // 2026-11-12 01:5x：先换格（落点不合法是这个游戏最常见的失败），同一按压点连错两次才换点。
          // 原来一失败就换按压点，每回合固定白花一次 5s 的手势。
          pressFailStreak += 1
          if (pressFailStreak >= 2 && pressRot + 1 < Math.max(2, pressCands.length)) {
            pressRot += 1
            pressFailStreak = 0
            note(opts, '  试 ' + cell.join(',') + ' 没拎起来（green=' + stA.green + '）→ 换按压点 ' + pickPress(from).x + ',' + pickPress(from).y)
            k -= 1
            continue
          }
          pressRot = 0
          DEAD_TILES.add(cell[0] + ',' + cell[1])
          if (item.name) { try { const crBad = cellColRowOf(cell); if (crBad) { recordIllegal(dpStore, dpMapId, item.name, crBad); dpDirty = true } } catch { /* 记忆写不进不影响布阵 */ } }
          cardMarks.push(cell[0] + ',' + cell[1])
          failedTiles.push({ cell, from: [from.x, from.y], why: 'no_pending' })
          noPendingTiles += 1
          // 2026-11-13 02:0x 实测（world/.tmp/diag0.png，第 11 回合）：底部弹条「干员已满，无法继续调度干员」，
          // 这时甲板卡根本拎不起来——拖拽毫无反应，换按压点/换格都不行（试了 964,350 与 1489,665 两格 + 7 张牌）。
          // 换人模式下传进来的 slotsLeft 是 min(2, 甲板张数)，所以下面那条「名额读作 0」永远不成立，
          // 于是每回合都拿这个假额度去试 8~10 格，白烧 30~60s。换人模式第一格就拎不起来 = 游戏不让调度，直接收手。
          // 2026-11-13 13:2x：这一格拎不起来多半是这格其实没人站着（名额 0 时空格拖不上去）。
          // 换人已实证可行，别整回合收手，标死这格继续试下一格。

          note(opts, '  试 ' + cell.join(',') + ' 没拎起来（green=' + stA.green + '，手势 ' + g.ms + 'ms；第 ' + noPendingTiles + ' 格）')
      noteDeployFail(1)
      // 2026-11-14 19:2x 真机（本局第 8 回合，trace-night-2026-11-14T11-00-48）：
      // 「撤回换人 → 名额 +1 → 正常部署上 1 个」之后名额又归零，可 opts.slotsLeft 还是回合开头读到的那个 1，
      // 于是剩下 5 张牌各试 3~4 格全是「没拎起来（green=4238 起）」，白烧 62s（布阵 84.5s），
      // 还把 829,667 / 692,667 / 1489,665 这些好格标死写进 map-issues（下回合真能在这些格上放人时又被剔掉）。
      // 名额是「一次性」的：这里连续 2 格拎不起来就当场重读一帧，读到 0 直接交给下面 quotaN2<=0 那条收手 + 撤销标死。
      if (noPendingTiles === 2) {
        let fres2 = null
        try { fres2 = await senseRun(null, { expect: 'rest' }) } catch { /* 读不到就按老逻辑走 */ }
        const fs2 = (fres2 && fres2.ok && fres2.slotsLeft != null && Number.isFinite(Number(fres2.slotsLeft))) ? Number(fres2.slotsLeft) : null
        if (fs2 != null) {
          opts.slotsLeft = fs2
          note(opts, '  连续 2 格拎不起来 → 重读名额：' + fs2 + (fs2 <= 0 ? '（真满了，收手，撤销标死）' : '（还有名额，继续换格）'))
          // 2026-11-15 01:0x 真机（trace-night-2026-11-14T16-30-24 第 8 回合，.tmp/look-r7.png）：
          // 名额明明还有 2，甲板 8 张却一格都拎不起来 —— 截图里左边压着一个「阻隔工事」干员详情面板。
          // 面板开着时拖拽全被判成单击，跟名额/格位无关。取消按钮仍是 (965,240)（run.js playRound 同一处）。
          if (fs2 > 0) await dismissPanelIfOpen(opts, '连续拎不起来')
        }
      }
          // 2026-11-13 06:4x 实测（trace-night-2026-11-12T22-30-49 第 6 回合）：名额读作 1，场上其实已满，
          // 19 次「拎不起来」白烧 91.5s、还写脏 map-issues。连续 6 格拎不起来就当满员，本回合收手 + 7 分钟冷却。
      // 2026-11-13 19:1x：甲板坐标来自地图缓存（没扫）时，先别判「拎不起来」——
      // 缓存失配（换了地图/镜头动过）会让整回合白试。连续 2 格拎不起来就先真扫一次。
          if (noPendingTiles >= 3) {
            // 2026-11-13 23:5x（实测连续 6 回合 0 上场）：名额读数还有、3 格却拎不起来，多半是这张牌本身的问题
            // （同名已上场 / 装备卡 / 不可上场），不是场上满了。原来这里一律 quotaEmpty 收手，整回合就此报废。
            // 现在：名额 >0 → 只跳过这张牌（撤销它标死的格，换下一张）；名额真的 <=0 才整回合收手。
            {
              const quotaN3 = opts.slotsLeft == null ? NaN : Number(opts.slotsLeft)
              let undone3 = 0
              for (const kk of cardMarks) if (DEAD_TILES.delete(kk)) undone3 += 1
              cardMarks = []
              if (!(Number.isFinite(quotaN3) && quotaN3 <= 0)) {
                note(opts, '  这张牌连续 ' + noPendingTiles + ' 格拎不起来（名额显示 ' + (opts.slotsLeft == null ? '?' : String(opts.slotsLeft)) + '，多半是牌本身不能上场）→ 跳过它，换下一张' + (undone3 ? '，撤销标死 ' + undone3 + ' 格' : ''))
                break
              }
              noPendingTiles = 0
              quotaEmpty = true
              QUOTA_ZERO_AT = Date.now()
              note(opts, '  连续 3 格拎不起来且名额读作 ' + String(quotaN3) + ' → 本回合不布阵' + (undone3 ? '，撤销标死的 ' + undone3 + ' 格' : ''))
              break
            }
          }
          // 2026-11-12 00:53 实测：剩余可放置角色=0 时（截图 world/.tmp/slots7.png 字面「剩余可放置角色：0」），
          // 甲板卡根本拎不起来——拖拽毫无反应、green 不涨。连续两格、多个按压点都拎不起来就按「配额用完」收手，
          // 不写 map-issues（那是脏数据，会烂掉失败样本），也不空转。
          // 2026-11-12 19:0x 修：原来「连试 2 格拎不起来」就判名额为 0 收手，可实测那些格上已经站着人。
          // 现在只有「候选格全被标死」或「名额读作 0」才收手，否则换下一格继续。
          const quotaN2 = opts.slotsLeft == null ? NaN : Number(opts.slotsLeft)
          const freeLeft = tiles.filter((t) => t && !DEAD_TILES.has(t[0] + ',' + t[1])).length
          if (Number.isFinite(quotaN2) && quotaN2 <= 0) {
            quotaEmpty = true
            for (const kk of cardMarks) DEAD_TILES.delete(kk)
            cardMarks = []
            note(opts, '  名额读作 0 → 停止本次部署（撤销本张标死的格）')
            break
          }
          if (!freeLeft) {
            // 2026-11-12 19:4x：候选格全拎不起来 = 这张牌可能根本不能上场（装备卡），或者场上真的占满了。
            // 不再整回合收手：跳出这张，走上面的「跳过换下一张」，并把它标死的格撤销。
            note(opts, '  候选格全拎不起来（这张牌标死 ' + cardMarks.length + ' 格）→ 先当它不能上场，换下一张核对')
            // 只有「整池都被这张牌标死」才撤销：装备卡拖哪都拎不起来，会把后面的干员一起堵死。
            // 只标死几格（格上真站着人）就别撤销，否则每张牌都要重试一遍占着的格，白花 5s×8。
            let undone = 0
            for (const kk of cardMarks) if (DEAD_TILES.delete(kk)) undone += 1
            cardMarks = []
            if (undone) note(opts, '  撤销这张牌标死的 ' + undone + ' 格（换下一张重试）')
            break
          }
          note(opts, '  这格拎不起来 → 标死换下一格（还剩 ' + freeLeft + ' 格）')
          // 2026-11-13 00:0x 实测（接手局第 6 回合）：deployOrder 那几格上站着上几回合的人，
          // 4 次「没拎起来」把 MAX_TRIES_PER_UNIT 吃光 → 这张牌直接放弃、整回合 0 上场。
          // 「格上有人」不是这张牌的问题，不该占它的重试次数：标死后把这 1 次退回去（最多退 12 次防死循环）。
          if (noPendingTiles < 12) k -= 1
          continue
        }
        pressFailStreak = 0
        // 2026-11-12 00:5x：进入待确认态的这一帧，绿格就是**这个干员**的合法格。
        // 第一张牌成功落下时顺手把格子池换成它，后面的干员直接按合法格挑，省掉一次专门探测。
        if (!learnedTiles) {
          try {
            const vt = (stA.pts || []).map((t) => ({ x: t[1], y: t[2] }))
            if (!vt.length) { const v2 = validTilesOf(pdoc); for (const it of v2) vt.push({ x: it.x, y: it.y }) }
            if (vt && vt.length) {
              const seen = new Set()
              const pool = []
              for (const t of vt) {
                const kk = Math.round(t.x / 40) + ',' + Math.round(t.y / 40)
                if (seen.has(kk)) continue
                seen.add(kk)
                pool.push([t.x, t.y])
              }
              if (pool.length >= 5) {
                // 2026-11-12：绿格只对**这张牌**合法（近战牌只亮地面、远程牌只亮高台），
                // 直接拿它当全队池子会丢掉另半边地形（第 3 回合 泡泡→(4,1) 就是这么被判「落点不合法」再吸走的）。
                // 所以并进地图格：地图格给准确坐标 + 另一侧地形，绿格负责证明「这侧这一帧确实是绿的」。
                const m0 = loadGameMap()
                const merged = pool.slice()
                for (const c of deployTiles(m0)) {
                  if (!merged.some((p) => Math.abs(p[0] - c[0]) <= PX_TOL && Math.abs(p[1] - c[1]) <= PX_TOL)) merged.push(c)
                }
                // 2026-11-13 10:2x 修：绿格≠空位，学习池会把「已经站着人」的格带回来，
                // 于是同一回合前一张刚落位、后一张又撞同一格被拒（trace 02:02 试 1196,353 / 1081,351）。
                // 并进地图格之后按已占格 + 死格再滤一次，全滤空才退回原池。
                const occK = [...occPx]
                // 2026-11-13 12:4x（trace-night-13T04-26-29 第 5 回合：泡泡 4 格全「牌还在甲板」、整回合 0 上场 35s）：
                // 这一帧的绿格 = 这张牌此刻「合法且空」的格（占着的格不亮）。接手局的 occupiedPx 是空的、账本又短，
                // 并进地图格就等于把「可能站着人」的格也塞回候选池。所以这张牌后面的重试只用绿格（滤掉死格），
                // 绿格全死光了才退回地图池。见 item 循环开头：换下一张牌时把池子还原。
                const green = pool.filter((t) => !nearAny(t, occK) && !DEAD_TILES.has(t[0] + ',' + t[1]))
                const usePool = green.length ? green : pool
                tiles = sortPoolByOrder(m0, usePool)
                learnedTiles = true
                note(opts, '  本回合合法格 ' + pool.length + ' 个（从这张牌的待确认帧学到的，只用绿格 ' + usePool.length + ' 个，地图池共 ' + merged.length + ' 个）')
              } else if (pool.length) {
                // 池子太小说明这一帧绿格被幽灵/UI 挡了大半，别拿它当全世界
                note(opts, '  合法格只学到 ' + pool.length + ' 个（太少，不用它替换候选格）')
              }
            }
          } catch { /* 学不到就沿用候选格 */ }
        }
        // 2026-11-12 18:3x 实测（world/.tmp/q1-ghost / q2-after-ok）：
        // 拖到 (2,3)=704,550 松手后幽灵就停在格心（白色范围菱形的中心≈格心），从格心朝右滑一次就上场了。
        // 而 snapTile 拿的是 _validtiles.py 的绿点（只给 14 个、按绿度排序、60px 去重），**不是幽灵位置**，
        // 它会返回离目标格几百像素外的噪声点，拿那个点去滑就是滑在空地上，牌当然不掉 ——
        // 这就是「落点 X 不合法，幽灵吸到 Y → 按吸附格确认」后永远失败的来源。
        // 所以确认一律按**计划格**；真放不上去就换下一格，让游戏自己去吸附/拒绝。
        const realCell = cell
        const wantDir = item.facing || opts.facing || 'right'
        const dir = (wantDir === 'left' || wantDir === 'up' || wantDir === 'down') ? wantDir : 'right'
        confirmDeploy(realCell, { dir, ms: Number(opts.confirmMs) || 400 })
        await sleep(420)
      } else {
        await placeBatch([{ from: [from.x, from.y], to: cell, facing: item.facing || facing, holdStartMs: holdStart }])
        await sleep(260)
      }
      // 2026-11-14 09:0x 用户 m02396「布阵结束之后再扫一次确认」：成功判据不再每张牌截两次图重扫甲板
      // （每张 2 次扫描 ≈ 10s，一回合 6 张就是 60s）。这里直接记账，收尾统一扫一次算总账。
      placed += 1
      placedCells.push([cell[0], cell[1]])
      try { record({ name: item.name, to: cell }, null) } catch { /* 记失败不影响上场 */ }
      if (item.name) {
        placedNames.push(item.name)
        const crPlace = cellColRowOf(cell)
        if (crPlace) { try { recordPlace(dpStore, dpMapId, item.name, crPlace, item.facing || facing); dpDirty = true } catch { /* 记忆写不进不影响上场 */ } }
      }
      note(opts, '  上场 ' + (item.name || ('#' + placed)) + ' (' + from.x + ',' + from.y + ' → ' + cell.join(',') + ') 朝' + (item.facing || facing) + ' 起手 ' + holdStart + 'ms 用时 ' + ((Date.now() - t1) / 1000).toFixed(1) + 's' + (replacing ? '（换人：替换原本站在该格的干员）' : ''))
      if (replacing) {
        const bs = (Array.isArray(opts.boardSlots) ? opts.boardSlots : [])
          .filter((b) => b && Array.isArray(b.px) && Math.abs(b.px[0] - cell[0]) <= 70 && Math.abs(b.px[1] - cell[1]) <= 70)
          .sort((a, b) => Math.hypot(a.px[0] - cell[0], a.px[1] - cell[1]) - Math.hypot(b.px[0] - cell[0], b.px[1] - cell[1]))[0]
        if (bs && bs.name) {
          swappedOut.push({ name: bs.name, px: bs.px.slice() })
          note(opts, '  换下的 ' + bs.name + ' 回到整备区（记账里补回一张）')
        } else note(opts, '  换下的干员认不出名字 → 下一回合靠认人补')
      }
      // 甲板整体左移一格 → 按压点跟着左移，剩下的牌不用重扫
      if (deckPitch > 0 && liveChips && liveChips.length) liveChips = liveChips.map((c) => ({ x: c.x - deckPitch, y: c.y }))
      pressRot = 0
      pressFailStreak = 0
      done = true
      // 2026-11-13 08:2x 提速：换人一次成功要 ~20s，休息期总预算才 70s。一回合只换一个，换完就收。
      if (replacing) {
        note(opts, '  换人成功 1 个 → 本回合收手（换人一次 20s 上下，一回合只换一个）')
        break
      }
      continue
    }
    if (!done) {
      // 2026-11-12 18:4x：一张牌试完四格还上不去时，别整回合停手 —— 甲板最左那张可能是装备卡
      // （世界 5/6/7 回合都是「第一张拖不上去 → 上场 0 个 → 整备区剩 2 张」），把后面能上的挡死了。
      // 跳过它继续下一张；连跳 3 张才停手（那才是真·名额为 0 / 界面异常）。
      // 2026-11-12 19:4x：撤销这张牌标死的格 —— 「拎不起来」是相对这张牌说的，
      // 对下一张（真干员）那些格可能完全合法。留着会把整回合的格全耗光。
      skippedUnits += 1
      note(opts, '  第 ' + skippedUnits + ' 张（' + (item.name || '未知') + '）四格都没成 → 跳过，换下一张')
      if (skippedUnits >= 3) {
        note(opts, '  连跳 ' + skippedUnits + ' 张都上不去 → 停手（疑似装备卡/名额为 0）')
        break
      }
      continue
    }
  }

  // 2026-11-14 09:0x 用户 m02396：布阵结束后扫一次甲板确认实际上场数；剩下的牌里若有召唤物就补上（不占名额）。
  let endChips = null
  try {
    const chkEnd = await scanDeckChips({ minPressY: 840 })
    if (chkEnd && chkEnd.ok && Array.isArray(chkEnd.chips)) endChips = chkEnd.chips
  } catch { /* 扫不到就按过程数记 */ }
  if (endChips) {
    const leftover = endChips.length
    const calc = Math.max(0, chips0.length - leftover - equipCards)
    if (opts.replace !== true && calc !== placed) {
      note(opts, '  布阵收尾复核：甲板还剩 ' + leftover + ' 张（开始 ' + chips0.length + ' 张，装备卡 ' + equipCards + '）→ 实际上场 ' + calc + ' 个（过程记 ' + placed + ' 个，以复核为准）')
      placed = calc
      if (placed === 0 && opts.round != null) QUOTA_STUCK_ROUND = Number(opts.round)
    } else {
      note(opts, '  布阵收尾复核：甲板还剩 ' + leftover + ' 张（开始 ' + chips0.length + ' 张）→ 实际上场 ' + placed + ' 个')
    }
    // 召唤物：名额 0 时甲板上还能拎起来的牌，拖上去不占部署名额（用户 m02396「如果有召唤物就摆上」）。
    if (opts.placeSummons !== false) {
      const picks = summonPick({ chips: endChips, slotsLeft: opts.slotsLeft, placed, max: 2 })
      if (picks.length) {
        const SU_T0 = Date.now()
        let su = 0
        for (const p of picks) {
          if (Date.now() - SU_T0 > 12000) break
          let ranked = []
          try { ranked = rankTiles({ name: '', role: 'melee' }, { map: dpMap, takenPx: [...occPx], deadPx: [...DEAD_TILES], usedPx: [...used] }) } catch { ranked = [] }
          const spots = ranked.slice(0, 2).map((t) => t.px)
          for (const spot of spots) {
            if (Date.now() - SU_T0 > 12000) break
            try { dragFromTo([p.x, p.y], spot, { holdMs: holdStart, moveMs: DEPLOY_MOVE_MS, tag: 'su' }) } catch { break }
            await sleep(300)
            let stSu = null
            try { stSu = screenState(saveShot(screenshot(), 'su-a'), { tiles: false }) } catch { stSu = null }
            if (!stSu || !isPending(stSu)) continue
            confirmDeploy(spot, { dir: 'right', ms: Number(opts.confirmMs) || 400 })
            await sleep(420)
            su += 1
            note(opts, '  召唤物 上场 #' + su + ' (' + p.x + ',' + p.y + ' → ' + spot.join(',') + ') 不占名额')
            break
          }
        }
        if (!su) note(opts, '  召唤物试放 ' + picks.length + ' 张没成（可能不是召唤物/没有合法格）')
      }
    }
  }
  // 站位记忆落盘（下一次开跑直接命中，少盲试）
  if (dpDirty) { try { saveDeployMap(dpStore) } catch { /* 记忆写不进去不影响本局 */ } }
  if (dpMemHits) note(opts, '  站位记忆：命中 ' + dpMemHits + ' 次历史站位（data/deploy-map.json）')
  const ms = Date.now() - t0
  note(opts, '  本回合上场 ' + placed + ' 个｜试了 ' + attempts + ' 次｜起手 ' + holdStart + 'ms｜合计 ' + (ms / 1000).toFixed(1) + 's')
  // 2026-11-11 20:40：定朝向那一步可能把干员留在「按住等落位」状态，收尾点一下空地取消，
  // 否则整局会在「准备就绪」处卡死（trace-11-09-05 第 8 回合、trace-12-19-53 第 6 回合各一次）。
  try { await deselectUnit() } catch {}
  if (failedTiles.length) {
    steps.push('  拖不上去的格 ' + failedTiles.length + ' 个（已记 map-issues.jsonl，等用户核对地图）：' + failedTiles.map((x) => x.cell.join(',')).join(' '))
  }
  return { ok: true, steps, placed, placedNames, placedCells, swappedOut, deckLeft: Math.max(0, chips0.length - placed), ms, attempts, holdStart, failedTiles, replacing }
}

/* ──────────────────── 商店面板 / 买卡执行（m00211 + m00233） ──────────────────── */

/** 能看见几张商店卡（只用来打日志，判展开/折叠别用它 —— 折叠态也会误认出一张）。 */
function shopVisible(st) {
  return (st && st.shop ? st.shop : []).filter((x) => x && !x.empty).length
}

/**
 * 面板是不是展开的。主判据是像素（ocr.py 给的 shopExpanded：展开时底排被深色面板盖住）；
 * 像素标定失败才退回「可见卡数 > 1」——折叠态常误认出 1 张，所以单用卡数是错的
 * （2026-11-11 10:05 首测就是被这个骗了：明明折上了，日志还报「1 张卡」继续点）。
 */
function shopIsOpen(st) {
  if (st && typeof st.shopExpanded === 'boolean') return st.shopExpanded
  // 文字判据读不出来时，退回亮度（展开 134 上下、折叠 386 上下；卡面亮时展开能到 240）
  if (st && Number.isFinite(Number(st.shopBrightness))) return Number(st.shopBrightness) < 300
  return shopVisible(st) > 1
}

/**
 * 把商店面板切到指定状态（true = 展开），返回切换后的最新局面。
 * 用户 m00233：「只有在买卡的时候商店才处于展开状态，其他情况都要折叠商店操作」
 * —— 展开态整套甲板会平移 40~150px，在展开态取甲板坐标必错。
 * 右下角绿框是展开/折叠开关，点完必须复核，最多点两次（免得点空或点过头）。
 */
async function ensureShop(open, st, steps = [], opts = {}) {
  if (!st || !st.ok) return st
  // 不在休整期就别去点面板（2026-11-11 14:4x 实测：结算页上连点三次「展开」，
  // 白花 20 秒，还顺手点进了下一局）。
  if (st.screen !== 'rest' && st.screen !== 'prep') return st
  // 2026-11-14 00:4x 真机（trace-night-2026-11-14T00-32-58 第 1 回合）：缓存标志说「已折叠」、画面其实展开
  // （认人点卡片会把底部面板重新展开），旧逻辑 `known === open` 直接 return —— 一次都没点，
  // 布阵前折叠三次全空转（底排亮度一直 177），整回合 0 上场。现在缓存和最新快照**都**对上才免点。
  const probed = shopIsOpen(st)
  const known = SHOP_OPEN_NOW == null ? probed : SHOP_OPEN_NOW
  if (known === open && probed === open) {
    SHOP_OPEN_NOW = open
    return st
  }
  let last = st
  for (let k = 0; k < 3; k++) {
    // 展开时那个按钮在右下角写「收起」、折叠时写「展开」，两个点分别验证过；
    // 折叠时点 shopExpand（1770,1005），展开时点 collapse（1763,953）。
    const pt = shopIsOpen(last) ? POINTS.collapse : POINTS.shopExpand
    tap(pt[0], pt[1])
    await sleep(1300)
    // 提速（2026-11-11 13:5x）：核对只问「展开没展开」，用 2s 的探针，别每次整套 OCR（6s+）。
    // 切对了再整套读一次，把商店内容交给调用方。
    const pr = await senseProbe()
    if (!pr.ok) {
      await step(opts, steps, '  切商店后认不出状态（' + pr.error + '），按现状继续')
      return last
    }
    await step(opts, steps, '  商店' + (pr.open ? '展开' : '折叠') + '（点 ' + (k + 1) + ' 次，底排亮度 ' +
      (pr.brightness == null ? '?' : pr.brightness) + '）')
    SHOP_OPEN_NOW = pr.open
    if (pr.open === open) {
      // 提速（2026-11-11 14:4x）：折叠这一步不需要商店内容，别再整套 OCR（5s）。
      // 展开才读——买卡要用卡片名字/价格。折叠完直接把手上的 st 标成折叠态交回去。
      if (!open) return { ...last, shopExpanded: false, shopBrightness: pr.brightness, shop: [] }
      const full = await senseRun(undefined, { round: last.round })
      return full && full.ok ? full : last
    }
    last = { ...last, shopExpanded: pr.open, shopBrightness: pr.brightness }
  }
  await step(opts, steps, '  商店要' + (open ? '展开' : '折叠') + '但没切成，按现状继续（后续点位可能偏）')
  return last
}

/** 最近一次「可信」的整备区张数（木台锚点生效时才有值）。 */
let LAST_BENCH_N = null

/** 商店现在到底展开还是折叠（我们自己点过的 + 每次探针更新的）。
 *  2026-11-13 07:5x 真机：restBuyTurn 返回的 st 是「折叠前」的快照，收尾再调一次 ensureShop(false)
 *  会按陈旧状态去点折叠位（折叠态那个位置写的是「展开」）→ 把商店又展开，白花 16s，甲板坐标还歪。
 *  现在统一问这个变量，只有「它和 st 都不确定」时才真去点。 */
let SHOP_OPEN_NOW = null

/** 整备区现在有几张干员牌（折叠态用 deck.py 数；扫不出来返回 null，调用方退回账本）。 */
async function senseBench(steps = [], opts = {}) {
  try {
    const r = await timed('scanDeckChips(bench)', () => scanDeckChips())
    if (!r || !r.ok) {
      await step(opts, steps, '  整备区扫不出来（' + ((r && r.error) || '?') + '），退回账本')
      return null
    }
    // 2026-11-12 10:2x：商店展开/面板压住底部时木台锚点失效，这时数出来的张数不可信
    // （旧逻辑还会把道具行当成干员行，报「整备区 3 张」）。宁可沿用上次的可信值，也别拿脏数覆盖。
    if (r.lowConfidence) {
      await step(opts, steps, '  整备区张数不可信（木台被遮住）→ 沿用上次 ' + (LAST_BENCH_N == null ? '未知' : LAST_BENCH_N + ' 张'))
      senseBench.last = null
      return LAST_BENCH_N
    }
    LAST_BENCH_N = r.chips.length
    await step(opts, steps, '  整备区实测 ' + r.chips.length + ' 张')
    // 顺带把牌位返回：紧接着的「先放人」可以直接用，别再扫一遍（扫描一次约 9s）
    senseBench.last = r.chips
    return r.chips.length
  } catch (e) {
    await step(opts, steps, '  整备区实测失败：' + e.message)
    return null
  }
}
senseBench.last = null

/** 装备名集合：商店卡按名字认，命中装备表就是装备（不占整备区名额，用户 m00211）。 */
let EQUIP_NAMES = null
function equipNameSet() {
  if (EQUIP_NAMES) return EQUIP_NAMES
  EQUIP_NAMES = new Set()
  try {
    const book = equipmentBook() || {}
    for (const it of [...(book.items || []), ...(book.jobChangeItems || [])]) {
      if (it && it.name) EQUIP_NAMES.add(it.name)
    }
  } catch { /* 没有装备表就当店里没有装备 */ }
  return EQUIP_NAMES
}

/**
 * 点两次升级按钮并核对是否真升上去了。三个判据任一成立就算成功：
 *   1) 升级费变了（同一回合必然变）
 *   2) 升级按钮的 x 变了（面板随格数左移，每升一级 -240）
 *   3) 商店可见卡数变了
 * Lv3 之后升级费徽章的 x 会跑到屏幕最左边（负数坐标），单靠读升级费会一直读成 null，
 * 于是「升级成功」被误判成失败、钱白花（2026-11-10 第 5 回合踩到）。
 */
async function doUpgrade({ st, level, steps = [], opts = {} }) {
  // 判据抽到 restplan.judgeUpgrade（纯函数、有单测）。这里只负责读四个数：
  // 自己看到的 LEVEL 读数、升级费、升级面板 x、商店格数。
  const readSig = (s) => ({
    level: s && s.ok && s.shopLevelOcr != null ? Number(s.shopLevelOcr) : null,
    cost: s && s.ok && s.upgradeCost != null ? Number(s.upgradeCost) : null,
    x: s && s.ok && s.upgradePoint ? Number(s.upgradePoint.x) : null,
    cards: s ? shopVisible(s) : 0,
    money: s && s.money != null && Number.isFinite(Number(s.money)) ? Number(s.money) : null
  })
  // 2026-11-12 实测：调用方传的 level 一旦虚高，panel_geometry 算出来的「升级」坐标就整体偏左，
  // 点上去毫无反应（第 3 回合就是 Lv1 被记成 Lv2 → 之后每次升级都点在左边的空地）。
  // 所以点之前先让 OCR 自己认一次等级（不传 hint），用它算出来的 upgradePoint。
  // 2026-11-13 07:4x 提速：调用方通常刚做过一次完整 OCR（展开态、带 upgradePoint），
  // 再拍一次是白花的 5s。只有 st 里没有升级按钮坐标时才补拍。
  const stFresh = st && st.ok && st.shopExpanded !== false && st.upgradePoint && Number.isFinite(Number(st.upgradePoint.x))
  let pre = null
  if (!stFresh) { try { pre = await senseRun(null) } catch { /* 认不出就退回调用方给的 st */ } }
  const base = pre && pre.ok && pre.upgradePoint ? pre : st
  if (base !== st) {
    const lvOcr = base.shopLevelOcr != null ? Number(base.shopLevelOcr) : null
    if (lvOcr != null && lvOcr !== Number(level)) {
      await step(opts, steps, '  升级前校准：自己记 Lv' + level + '，画面 Lv' + lvOcr + ' → 按画面算坐标')
      level = lvOcr
    }
  }
  const before = readSig(base)
  // 商店折叠时 OCR 不会再认「升级」二字（ocr.py 的闸门，用户 m00601 要求），这里把原因写进步骤，
  // 免得回放时看到 upgradePoint=null 以为是识别挂了。
  if (base && base.shopExpanded === false) {
    await step(opts, steps, '  商店是折叠态 → 跳过「升级」认字（只可能走几何或放弃）')
  }
  // 2026-11-12 08:37：OCR 读不到商店等级时 upgradePoint 是 null，旧代码退回写死的 POINTS.upgrade(337,972)，
  // 那是 Lv2 的中心；Lv1（4 格）真中心 578 → 点空。实测回合 2「升级费 4→4、面板 x null→null、格数 3→3」。
  // 现在按自己记的 level 现算（与 ocr.py 的 panel_geometry 同公式）。
  // 2026-11-12 09:5x（用户 m03312 的根因修复）：优先用 OCR 认出来的「升级」两个字中心。
  // 等级 ≥4 时按几何算出来的中心跑到屏幕外（Lv4 = -141，panelLeft 已是 -228），点上去是空地，
  // 还白点两下判不出失败 —— 这就是「打到第九回合商店还在低等级」的死结。
  // 认不到字时，只有几何坐标确实落在屏幕内才用它；否则明确放弃，不再「夹到 60」假装能点。
  let pt = null
  const upSrc = base && base.upgradePointSrc ? String(base.upgradePointSrc) : null
  if (base && base.upgradePoint) {
    const px = Number(base.upgradePoint.x)
    const py = Number(base.upgradePoint.y)
    if (Number.isFinite(px) && Number.isFinite(py) && px >= 60 && px <= 1860) {
      pt = [px, py]
      await step(opts, steps, '  升级按钮 ' + (upSrc === 'ocr' ? 'OCR 认字' : '按 Lv' + level + ' 几何') + ' (' + pt[0] + ',' + pt[1] + ')')
    }
  }
  if (!pt) {
    // 2026-11-12 12:3x：level 现在是界面等级（read_shop_level 认罗马数字后与界面一致），
    // 几何要按下标算，用 upgradePanelCenterFor 换一层。
    const geo = upgradePanelCenterFor(level)
    if (!geo.visible) {
      await step(opts, steps, '  升级按钮在屏幕外（Lv' + geo.level + ' 几何中心 ' + geo.x + '，OCR 也没认到「升级」）→ 放弃这次升级，不点空地')
      return { ok: false, level, st, clicks: 0, signals: [], offscreen: true, error: 'upgrade-offscreen' }
    }
    pt = [geo.x, POINTS.upgrade[1]]
    await step(opts, steps, '  读不到升级面板 → 按 Lv' + geo.level + ' 现算按钮 (' + pt[0] + ',' + pt[1] + ')')
  }
  await shopAction({ upgrade: true, upgradePoint: pt })
  await sleep(1200)
  const costBefore = before.cost
  const xBefore = before.x
  const cardsBefore = before.cards
  // 2026-11-13 08:1x 提速：点完升级的整屏复核（~8s OCR）和下回合开头那次「校准等级」完全重复。
  // 先用廉价 probe（~4s）判「钱正好少了升级费」＝真升级；钱没少才退回整屏复核。
  let after = null
  try { after = await senseProbe() } catch { after = null }
  const paidNow = before.money != null && after && after.ok &&
    Number.isFinite(Number(after.money)) && Number(after.money) < Number(before.money)
  if (paidNow) {
    const got = level + 1
    // 2026-11-14 19:0x 真机（.tmp/verify-fix1.log 第 3 回合休整）：点完升级 probe 把钱读成 0，
    // 买卡逻辑据此报「店里有想要的 真理（1 块）但钱已花光 → stop」，整回合一张卡没买（用户 m06708「其他买卡」）。
    // probe 只读金币那一小块，升级动画/浮层盖住时会给 0；所以「升级前有钱、升级后 0」时复核一次整屏 OCR。
    let moneyAfter = after.money
    if (moneyAfter != null && Number(moneyAfter) === 0 && before.money != null && Number(before.money) > 0) {
      try {
        const chk = await senseRun(null)
        if (chk && chk.ok && chk.money != null && Number.isFinite(Number(chk.money))) {
          moneyAfter = Number(chk.money)
          await step(opts, steps, '  升级后金币复核：probe 读成 0 → 整屏 OCR 读成 ' + moneyAfter)
        }
      } catch { /* 复核失败就按 probe 的值走 */ }
      // 2026-11-14 21:0x 真机（.tmp/verify-fix6.log R3 休整）：升级前钱 7、升级费 3，
      // probe 与整屏 OCR **都**读成 0（升级动画盖住金币那块）→ 记成「钱 7→0」，
      // 整回合报「钱已花光 → 不冻结」，明明还剩 4 块一张卡没买（用户 m06708「其他买卡」）。
      // 两次都读 0 时按账算：钱 = 升级前 − 升级费，并明确记一笔是估算。
      if (Number(moneyAfter) === 0) {
        const paid = Number(costBefore)
        if (Number.isFinite(paid) && paid > 0 && paid < Number(before.money)) {
          moneyAfter = Math.max(0, Number(before.money) - paid)
          await step(opts, steps, '  升级后钱两次都读成 0 → 按账算 ' + moneyAfter + '（升级前 ' + before.money + ' − 升级费 ' + paid + '，估算）')
        }
      }
    }
    await step(opts, steps, '  升到 Lv' + got + '（判据：钱 ' + before.money + '→' + moneyAfter + '；等级下回合开头核）')
    return { ok: true, level: got, st: { ...st, ...after, money: moneyAfter, upgradeCost: null, shopExpanded: true }, clicks: 1, signals: ['钱 ' + before.money + '→' + moneyAfter], levelRead: null }
  }
  after = await senseRun(null)
  let verdict = judgeUpgrade(before, readSig(after))
  if (!verdict.ok && pt) {
    // 2026-11-12 实测：面板有时「第一下只选中、第二下才生效」，旧代码的两次 tap 之间只隔 1.2s 且会被
    // 面板高亮吞掉一次。这里再补一次单击（同一坐标），然后重读。
    await step(opts, steps, '  升级判据不成立（' + (verdict.signals.join('；') || '无信号') + '）→ 原地再点一次')
    await tapAt(pt, 1200, '升级重试')
    await sleep(900)
    after = await senseRun(null)
    verdict = judgeUpgrade(before, readSig(after))
  }
  let costAfter = readSig(after).cost
  let xAfter = readSig(after).x
  let cardsAfter = readSig(after).cards
  // 判据（restplan.judgeUpgrade）：只认「升级费变高 / 格数变多 / 面板左移 / LEVEL 读数变高」。
  // 升级费变小一律不算（旧代码就是这样把 Lv1 记成 Lv3 的）。
  if (verdict.costDropped) {
    await step(opts, steps, '  升级费变小（' + costBefore + '→' + costAfter + '）不像真升级 → 重读一次确认')
  }
  if (!verdict.ok) {
    const again = await senseRun(null)
    const sig2 = readSig(again)
    const v2 = judgeUpgrade(before, sig2)
    if (v2.ok) {
      after = again
      verdict = v2
      costAfter = sig2.cost != null ? sig2.cost : costAfter
      xAfter = sig2.x != null ? sig2.x : xAfter
      cardsAfter = sig2.cards
    } else {
      verdict = {
        ok: false,
        signals: verdict.signals.concat(v2.signals),
        costDropped: verdict.costDropped || v2.costDropped,
        level: v2.level != null ? v2.level : verdict.level
      }
    }
  }
  if (verdict.ok) {
    await step(opts, steps, '  升到 Lv' + (level + 1) + '（判据：' + verdict.signals.join('；') + '）')
    return { ok: true, level: level + 1, st: after, clicks: 1, signals: verdict.signals, levelRead: verdict.level }
  }
  await step(opts, steps, '  升级没生效（升级费 ' + costBefore + '→' + costAfter + '，面板 x ' + xBefore + '→' + xAfter + '，格数 ' + cardsBefore + '→' + cardsAfter + '，LEVEL 读数 ' + before.level + '→' + verdict.level + '）')
  return { ok: false, level, st: after.ok ? after : st, clicks: 0, signals: [] }
}

/**
 * 买一张卡并核对成交：钱变少了、或者那张卡从店里没了，都算买到。
 * 旧代码买完无条件记账 —— 点歪了也记，账本一路虚高，闸门就常驻了（交接第 7 节的「钱 3 买不进」就是它）。
 */
async function doBuy({ st, level, card, steps = [], opts = {} }) {
  const before = Number(st.money) || 0
  if (card.x) await shopAction({ buyPoints: [[card.x, card.y]] })
  else await shopAction({ buy: [card.slot] })
  await sleep(900)
  // 提速（2026-11-11 14:0x）：买卡只要知道「钱少没少」，探针 2s 就够；
  // 钱确实少了就把这张卡在本地标成空格、钱记下来，调用方不用再整套 OCR（原来每买一张 15s）。
  const pr = await senseProbe()
  if (pr.ok && Number.isFinite(pr.money) && pr.money < before) {
    const shop = (st.shop || []).map((c) =>
      (c && !c.empty && c.name === card.name ? { ...c, name: null, empty: true } : c))
    return { ok: true, st: { ...st, shop, money: pr.money }, money: pr.money, probed: true }
  }
  const after = await senseRun(level, { expect: 'rest' })
  if (!after.ok) return { ok: false, st, money: before, error: after.error }
  const moneyAfter = Number(after.money)
  const still = (after.shop || []).some((c) => c && !c.empty && c.name === card.name)
  if (Number.isFinite(moneyAfter) && moneyAfter < before) return { ok: true, st: after, money: moneyAfter }
  if (!still) {
    // 2026-11-13 01:0x 实测：钱 OCR 一直读不出变化，卡却真买下来了。原来这里把 money 保持成 before，
    // 外层以为钱还在 → 同一回合连买 3 张（海沫、罗比菈塔、海沫），整备区 5→7。
    // 卡消失了就是买到了，钱按卡价自己扣。
    const cost = Number(card.cost)
    const moneyFixed = Number.isFinite(moneyAfter) && moneyAfter < before ? moneyAfter : Math.max(0, before - (Number.isFinite(cost) && cost > 0 ? cost : 0))
    await step(opts, steps, '  钱数没读出变化，但「' + card.name + '」从店里消失了 → 算买到（钱按卡价自扣 ' + before + '→' + moneyFixed + '）')
    return { ok: true, st: { ...after, money: moneyFixed }, money: moneyFixed }
  }
  await step(opts, steps, '  买 ' + card.name + ' 没成交（钱还是 ' + before + '，卡还在店里）')
  return { ok: false, st: after, money: before }
}

/** 刷新一次并核对（免费时钱不该变，付费时钱应该正好少 1）。 */
/** 商店内容指纹：名字 + 阶，空格算占位。刷新前后比对，一变就算生效。 */
function shopSig(st) {
  return (st && Array.isArray(st.shop) ? st.shop : [])
    .map((c) => (c && !c.empty ? String(c.name) + '/' + (c.tier == null ? '' : c.tier) : '-'))
    .join('|')
}

/**
 * 刷新一次并核对。判据只看「店里的卡换没换」——免费刷新钱不变是正常的，
 * 光看钱会把 36 次空点全当成成功（2026-11-11 10:20 实测就是这么坑的）。
 */
async function doRefresh({ st, level, free, steps = [], opts = {} }) {
  const before = Number(st.money) || 0
  const sig0 = shopSig(st)
  await shopAction({ refresh: 1 })
  // 2026-11-11 16:0x 提速：等待 1300→800（换店动画很快），读状态改 lite（只读店/钱/免费次数）。
  // 一回合刷十几次时这一步原来每次 ~9s，现在 ~4s。
  await sleep(800)
  const raw = await senseRun(level, { expect: 'rest', lite: true })
  if (!raw.ok) return { ok: false, st, money: before, error: raw.error }
  // lite 不读升级费/剩余可放置/甲板/开关文字，把上一次的值并回来（那些只在升级、放人、切面板时变）
  const after = {
    ...st,
    ...raw,
    upgradeCost: raw.upgradeCost == null ? st.upgradeCost : raw.upgradeCost,
    slotsLeft: raw.slotsLeft == null ? st.slotsLeft : raw.slotsLeft,
    shopExpanded: st.shopExpanded,
  }
  const moneyAfter = Number(after.money)
  const sig1 = shopSig(after)
  if (sig1 && sig1 !== sig0) {
    if (free && Number.isFinite(moneyAfter) && moneyAfter < before) {
      await step(opts, steps, '  免费刷新却扣了钱（' + before + ' → ' + moneyAfter + '），徽章计数不准')
    }
    return { ok: true, st: after, money: Number.isFinite(moneyAfter) ? moneyAfter : before }
  }
  if (!Number.isFinite(moneyAfter)) return { ok: true, st: after, money: before }
  await step(opts, steps, '  刷新没生效（店没换、钱 ' + moneyAfter + (free ? '、免费' : '') + '）')
  return { ok: false, st: after, money: before }
}

/**
 * 走完一段买卡：一步一个动作，直到冻结 / 停手。
 * 顺序在 restplan.js（纯函数、有单测），这里只管点击、核对成交、更新账本。
 * seq 是「甲板原始序号」的持有者（拖走一个剩下的不重排，必须按原序号算起手点）。
 */
async function restBuyTurn({ st, level, wantList, owned, deck, seq, bench, equipCount, benchBlock = false, slotsLeft = null, steps = [], opts = {}, covenantCtx = null }) {
  let cur = st
  // 2026-11-11 18:47 实测：第 3 回合金币 18，但这一轮 OCR 没读到钱（money=null），
  // 旧写法 Number(null) || 0 → 0，决策器当场判「钱花光了」→ 整回合一分钱没花（战前截图金币还是 18）。
  // 现在读不到钱就先重读一次，真读不到才按 0 算。
  let money = cur.money != null && Number.isFinite(Number(cur.money)) ? Number(cur.money) : null
  if (money == null) {
    let reread = null
    try { reread = await senseRun(level, { expect: 'rest', round: cur.round }) } catch { /* 读不到就按 0 */ }
    if (reread && reread.ok) cur = { ...cur, ...reread }
    money = cur.money != null && Number.isFinite(Number(cur.money)) ? Number(cur.money) : 0
    if (money > 0) await step(opts, steps, '  钱没读到，重读一次读到 ' + money + ' 块')
  }
  let benchNow = bench == null ? deck.length : bench
  let equipNow = Number(equipCount) || 0
  let refreshUsed = 0
  let fails = 0
  // 2026-11-11 20:07：一回合最多升一次（见 restplan.js 的说明）。
  let upgradedThisTurn = false
  // 2026-11-12 用户 m02251「辅以自己记忆点了几次升级」：本回合点成功的升级次数，用来对账等级。
  let upgradeClicks = 0
  // 同一回合只卖一张（卖完买，买完再看，别把整备区卖空）。
  let soldThisTurn = false
  const bought = []
  // 2026-11-13 13:5x 用户 m06164：「三张免费高阶卡…只能选一张，买完之后回到刷新之前的状态」。
  // 三合一后商店会特殊刷新，这一轮只准买一张，买完就收工（剩下两张会消失）。
  let tripleShop = false
  const wantNames = new Set((wantList || []).map((w) => w && w.name).filter(Boolean))
  const equipNames = equipNameSet()

  for (let guard = 0; guard < 60; guard++) {
    const units = []
    let equips = []
    // 2026-11-11 21:45 用户口径：只买「本局盟约」的转职/盟约装备，别的盟约的一律不买。
    // 认不出本局盟约时宁可一件不买，也不乱花钱。
    const covNow = (Array.isArray(opts.covenants) ? opts.covenants : Array.isArray(opts.activeCovenants) ? opts.activeCovenants : [])
      .map((x) => String(x || '')).filter(Boolean)
    const equipAllowed = (name) => covNow.some((n) => String(name).includes(n) || n.includes(String(name)))
    // 2026-11-12 21:2x（用户 m02339）：「装备不是必须，你现在先不买装备」。
    // 默认一件都不买，钱留给买卡/升级；要恢复老口径（只买本局盟约装备）就传 noEquip:false。
    const wantEquip = opts.noEquip === false
    for (const c of toCandidates(cur.shop)) {
      if (equipNames.has(c.name)) { if (wantEquip && equipAllowed(c.name)) equips.push(c) }
      else {
        const have = Number(owned[c.name]) || 0
        units.push({ ...c, have, want: wantNames.has(c.name) ? 0 : have >= 1 ? 1 : null })
      }
    }
    // 2026-11-12 22:xx（用户 m02613/m02617）：凑盟约排在阶数/便宜前面。
    // 名单 = 这一局上过场的人（board）+ 整备区的人（bench），都是我们自己记的，不读顶栏。
    // 选中的那张打上 want=0（买得起就直接买，买不起就走「冻结留给下回合」）。
    let prefer = null
    try {
      const cc = covenantCtx || {}
      const benchN = (Array.isArray(cc.bench) ? cc.bench : deck.map((x) => x && x.name)).filter(Boolean)
      const pick = pickBuyTarget(units.map((u) => ({ name: u.name, tier: u.tier, cost: u.cost })), {
        board: cc.board || [],
        bench: benchN,
        covenants: cc.covenants || [],
        owned,
        banned: cc.banned || [],
        coreCovenants: cc.coreCovenants || (Array.isArray(opts.coreCovenants) ? opts.coreCovenants : []),
        round: Number(opts.roundNo) || 0,
      })
      if (pick) {
        prefer = pick
        const hit = units.find((u) => u.name === pick.card.name)
        if (hit) {
          for (const u of units) if (u.want === 0 && u.name !== hit.name) u.want = null
          hit.want = 0
        }
      }
    } catch (e) {
      await step(opts, steps, '  盟约选卡算不出来（' + e.message + '）→ 退回清单/对子')
    }
    // 免费次数优先用 OCR 读到的徽章数字（FREEX4 → 4）；读不到才退回像素判据（有/没有）。
    // 2026-11-11 10:35 踩过：像素只知道「徽章在」，不知道「剩几次」，于是一路空点 36 下。
    const freeLeft = Number.isFinite(Number(cur.freeRefresh)) ? Number(cur.freeRefresh) : null
    const free = freeLeft == null ? await hasFreeRefresh() : freeLeft > 0
    // 2026-11-14 12:1x 用户 m03796「台下不用的干员就卖掉」：先算出整备区里哪些是计划外的杂牌
    // （covenantplan.pickSellChips：不在目标盟约、不是对子素材、阶数最低的先卖），再交给 restplan 决定卖不卖。
    const sellPlan = (() => {
      try {
        const cc = covenantCtx || {}
        const nm = (x) => (typeof x === 'string' ? x : (x && x.name)) || ''
        return pickSellChips({
          bench: deck.map((x) => ({ name: nm(x) })),
          board: (Array.isArray(cc.board) ? cc.board : []).map((n) => ({ name: nm(n) })),
          covenants: (cc.covenants || []).map(String),
        })
      } catch (e) { return [] }
    })()
    let plan = planRestStep({
      money,
      level,
      // 2026-11-11 21:58 用户 m04079「为什么不升级商店了」：升级后 OCR 常读不出新的升级费（null），
      // 于是决策器永远不升级、只买卡。这里用本局最近一次读到的升级费兜底。
      upgradeCost: cur.upgradeCost != null && Number(cur.upgradeCost) > 0
        ? Number(cur.upgradeCost)
        : (opts.lastUpgradeCost != null ? Number(opts.lastUpgradeCost) : null),
      targetLevel: targetShopLevel(Number(cur.round) || 1),
      // 2026-11-11 22:36 发现：restplan 里「一回合最多升一次」靠 ctx.upgraded，
      // 但这里从来没传过 → 闸门是空的（20:07 那次连升两级就是这么来的）。补上。
      upgraded: upgradedThisTurn,
      // m05472：在当前等级待了几个回合（不含升级那一回合），restplan 用它拦「连续升级」。
      roundsSinceUpgrade: (Number(cur.round) || 1) - LAST_UPGRADE_ROUND,
      // 整备区≥6 张时只关买卡（买进来也放不上场），升级/刷新照常判（m02102）。
      benchBlock: benchBlock === true,
      // 名额 0 时买不了也放不上去（真机：拖不动），买卡这一路一起关掉。
      slotsLeft: slotsLeft == null ? null : Number(slotsLeft),
      // m02251「满员了先卖卡」：本回合已经卖过就不再卖。
      soldThisTurn,
      bench: benchNow,
      equipCount: equipNow,
      units,
      equips,
      refreshUsed,
      freeRefresh: free ? 1 : 0,
      canRefresh: cur.refreshEnabled === false ? false : true,
      // m02897 的三条开局规则要用到：回合号、本回合已买到的干员名、目标盟约。
      round: Number(cur.round) || 1,
      bought,
      covenants: Array.isArray(opts.covenants) ? opts.covenants : [],
      // 2026-11-14 08:2x 用户 m02396「尤其是盟约内的三合一」：卡面没写 covenants 时用它查干员所属盟约。
      covenantOf: covenantsOf,
      // 整备区里有几张计划外/最低阶的牌可以卖（pickSellChips 的结果数），restplan 到 BENCH_STOP_BUY 时先卖一张再买。
      sellReady: sellPlan.length,
      // 盟约优先的那张（restplan 里排在 PACE 升级之后、阶数必买之前）
      prefer: prefer ? { card: prefer.card, reason: prefer.reason } : null,
      // 2026-11-13（handoff §3 用户口径）：BOSS 回合不升级，钱只刷新+买卡补强。
      boss: isBossRound(Number(cur.round) || 1, opts.totalRounds)
    })
    // 2026-11-15 09:5x（用户 m11286「可以，你慢慢做吧」）：planner 从影子转真开车的开关。
    // COOP_PLANNER_MODE=apply 时，若 planner 第一步是买/升级且比现状多 ≥1.2 分，就覆盖 restplan 的决定；
    // 不设这个环境变量时行为与以前完全一致（纯影子）。
    let p0 = null
    await step(opts, steps, '  买卡 → ' + plan.action + '：' + plan.reason)
    // 2026-11-15 09:4x（用户 m10989 批准的第 3 项）：planner 影子模式。
    // 只打建议、不改动作 —— 先拿几局对比「restplan 的决定」和「目标函数算出来的决定」，谁对再让谁开车。
    if (process.env.COOP_PLANNER !== '0') {
      try {
        const { suggestTurn, describePlan } = await import('./planner.js')
        const bNames = (Array.isArray(opts.boardSlots) ? opts.boardSlots : []).map((b) => ({ name: b && b.name }))
        p0 = suggestTurn({
          money, level, slots: slotsLeft == null ? null : Number(slotsLeft),
          board: bNames,
          bench: (Array.isArray(deck) ? deck : []).map((d) => ({ name: d && d.name, tier: d && d.tier })),
          shop: (Array.isArray(units) ? units : []).map((u) => ({ name: u && u.name, tier: u && u.tier, cost: u && u.cost })),
        }, { upgradeCost: cur.upgradeCost != null ? Number(cur.upgradeCost) : null, maxLevel: 5 })
        await step(opts, steps, '  ' + describePlan(p0))
        // 2026-11-15 09:5x：影子期也留证据 —— 每回合「restplan 选了什么 / planner 首选什么 / 差多少分」。
        try {
          const first0 = p0.best && p0.best[0] ? p0.best[0] : null
          appendFileSync(fileURLToPath(new URL('../data/planner-compare.jsonl', import.meta.url)), JSON.stringify({
            at: new Date().toISOString(), round: Number(cur.round) || 1,
            actual: plan.action, why: String(plan.reason || '').slice(0, 80),
            bestType: first0 ? first0.type : null, bestDesc: first0 ? first0.desc : null,
            gain: p0.gain, agree: !!(first0 && first0.type === plan.action)
          }) + '\n')
        } catch { /* 对比日志失败不影响跑局 */ }
      } catch (e) { await step(opts, steps, '  规划建议失败：' + e.message) }
    }
    if (p0 && process.env.COOP_PLANNER_MODE === 'apply') {
      try {
        const first = p0.best && p0.best[0] ? p0.best[0] : null
        if (first && Number(p0.gain) >= 1.2) {
          const better = Number(p0.gain) >= 1.2 && first.type !== plan.action
          if (better && first.type === 'buy') {
            const cardA = units.find((u) => u && u.name === first.card.name)
            const costA = Number(cardA && cardA.cost)
            if (cardA && Number.isFinite(costA) && costA <= money && benchNow < BENCH_CAP) {
              await step(opts, steps, '  规划接管：改成买 ' + cardA.name + '（planner +' + p0.gain + ' 分，restplan 原本 ' + plan.action + '）')
              plan = { action: 'buy', kind: 'unit', card: cardA, reason: 'planner 接管（+' + p0.gain + ' 分）' }
            }
          } else if (better && first.type === 'upgrade') {
            const upA = Number(cur.upgradeCost)
            if (Number.isFinite(upA) && upA > 0 && upA <= money && level < 5) {
              await step(opts, steps, '  规划接管：改成升级 Lv' + level + '（planner +' + p0.gain + ' 分，restplan 原本 ' + plan.action + '）')
              plan = { action: 'upgrade', cost: upA, reason: 'planner 接管（+' + p0.gain + ' 分）' }
            }
          }
        }
      } catch (e) { await step(opts, steps, '  规划接管失败：' + e.message) }
    }
    if (plan.action === 'stop') {
      return { ok: true, st: cur, level, bench: benchNow, equip: equipNow, money, stopped: plan.reason, bought }
    }

    if (plan.action === 'upgrade') {
      const up = await doUpgrade({ st: cur, level, steps, opts })
      if (up.ok) {
        level = up.level
        cur = up.st
        money = Number(cur.money) || 0
        fails = 0
        upgradedThisTurn = true
        LAST_UPGRADE_ROUND = Number(cur.round) || 1
        upgradeClicks += Number(up.clicks) || 1
        // m02251：等级以自己数的为准，点击次数当第二证据，OCR 只在对得上时才采信。
        const rec = reconcileLevel({ tracked: level, ocr: up.levelRead, clicks: upgradeClicks })
        await step(opts, steps, '  升级记账：自己记 Lv' + rec.level + '，本回合点过 ' + upgradeClicks +
          ' 次' + (rec.notes.length ? '；' + rec.notes.join('；') : '（与点击次数一致）'))
        continue
      }
      fails += 1
      if (fails >= 2) return { ok: true, st: cur, level, bench: benchNow, equip: equipNow, money, stopped: '升级连续两次没生效', bought }
      continue
    }

    // m02251「满员了先卖卡」：整备区满 10 张时先卖掉一张过渡卡，腾格子 + 回收 1 块，
    // 同一回合只卖一张（卖完接着走买卡/升级，别把整备区卖空）。
    if (plan.action === 'sell') {
      const sc = await scanDeckChips({ minPressY: 840 })
      const chips = ((sc && sc.chips) || []).slice().sort((a, b) => a.x - b.x)
      if (!chips.length) {
        await step(opts, steps, '  想卖卡，但甲板上扫不到牌 → 本回合收手')
        return { ok: true, st: cur, level, bench: benchNow, equip: equipNow, money, stopped: '卖卡失败：甲板扫不到', bought, upgradeClicks }
      }
      // 卖谁由 pickSellChips 决定（不在计划盟约/最低阶的优先），拿不到名字时退回最左那张（最早买入的过渡卡）。
      // 同样不认人（identifyDeck 会轻按甲板把状态机推进详情页）。
      const picked = (sellPlan.length && chips[sellPlan[0].index]) ? sellPlan[0] : null
      const target = picked ? chips[picked.index] : chips[0]
      const r = await sellDeckUnit([target.x, target.y])
      if (r && r.ok !== false) {
        soldThisTurn = true
        benchNow = Math.max(0, benchNow - 1)
        money += 1
        // 账本跟着卖：卖掉的是第 picked.index 张就从那里删（没名字退回最左 = 最早买入的过渡卡）。
        if (Array.isArray(deck) && deck.length) {
          const idx = picked && picked.index >= 0 && picked.index < deck.length ? picked.index : 0
          deck.splice(idx, 1)
        }
        await step(opts, steps, '  卖出 ' + ((picked && picked.name) || '最左') + ' ' + target.x + ',' + target.y +
          (picked ? '（' + picked.reason + '）' : '') + ' → +1 块（整备区 ' + benchNow + '/' + BENCH_CAP + '）')
        continue
      }
      await step(opts, steps, '  卖卡没成功（' + ((r && r.error) || '未知') + '）→ 本回合收手')
      return { ok: true, st: cur, level, bench: benchNow, equip: equipNow, money, stopped: '卖卡没成功', bought, upgradeClicks }
    }

    if (plan.action === 'buy') {
      let mergedThisBuy = false
      const r = await doBuy({ st: cur, level, card: plan.card, steps, opts })
      if (r.ok) {
        cur = r.st
        money = r.money
        if (plan.kind === 'equip') {
          equipNow += 1
          await step(opts, steps, '  买下装备 ' + plan.card.name + '（装备 ' + equipNow + '/' + EQUIP_CAP + '）')
        } else {
          benchNow += 1
          const n = (Number(owned[plan.card.name]) || 0) + 1
          if (n >= 3) {
            owned[plan.card.name] = 1
            // 三张合成一张：账本上要多减 2 张（benchNow 上面加了 1，这里补回 -2）
            benchNow = Math.max(0, benchNow - 2)
            if (Array.isArray(deck)) {
              let removed = 0
              for (let dk = deck.length - 1; dk >= 0 && removed < 2; dk--) {
                if (deck[dk] && deck[dk].name === plan.card.name) { deck.splice(dk, 1); removed += 1 }
              }
            }
            tripleShop = true
            mergedThisBuy = true
            // 特殊商店 = 三张免费高阶卡，重读一次画面拿到它们（旧 cur.shop 已经是上一轮的了）
            try {
              const fresh = await senseRun(level, { expect: 'rest', round: cur.round })
              if (fresh && fresh.ok) { cur = { ...cur, ...fresh }; if (Number.isFinite(Number(fresh.money))) money = Number(fresh.money) }
            } catch { /* 读不到就用旧图，下一轮还会重读 */ }
            await step(opts, steps, '  三合一：' + plan.card.name + ' 变精锐（二级），商店特殊刷新三张免费高阶卡（只能选一张）')
          } else {
            owned[plan.card.name] = n
          }
          // 2026-11-13 08:4x 实测：店里买进的「伊利亚骨刺刀」既不在 operator-ranges.json、也不在
          // covenants-map.json —— 是装备/遗物（equipment.json 里名字不同，没被装备闸门拦住）。
          // 旧写法无条件 deck.push，账本里就多一张「干员」（游戏里根本不是），整备区虚高、
          // 布阵时拿它去拖地面格永远上不去。认不出是干员的，只进「买过」清单、不进甲板账本。
          const isOp = (() => {
            try { const info = operatorInfo(plan.card.name); if (info && info.class) return true } catch { /* 查不到 */ }
            try { const cm = loadCovenantMap(); if (cm && cm[plan.card.name]) return true } catch { /* 查不到 */ }
            return false
          })()
          if (!isOp) {
            benchNow = Math.max(0, benchNow - 1)
            await step(opts, steps, '  买到 ' + plan.card.name + '（认不出是干员 → 不进甲板账本，也不占名额）')
            bought.push(plan.card.name)
            fails = 0
            continue
          }
          deck.push({ index: seq.v++, name: plan.card.name })
          bought.push(plan.card.name)
          if (opts.onChange) opts.onChange({ bought: plan.card.name, money })
          await step(opts, steps, '  买到 ' + plan.card.name + '（整备区 ' + benchNow + '/' + BENCH_CAP + '）')
        }
        fails = 0
        if (tripleShop && !mergedThisBuy) {
          await step(opts, steps, '  三合一特殊商店：拿下 ' + plan.card.name + '（只能选一张）→ 本回合收工')
          return { ok: true, st: cur, level, bench: benchNow, equip: equipNow, money, stopped: '三合一特殊商店只选一张', bought, upgradeClicks }
        }
        continue
      }
      fails += 1
      cur = r.st || cur
      // 2026-11-11 12:40 实测：装备买不进是因为游戏端上限（弹「装备已满，无法继续购买装备」），
      // 中途接手时自己数的件数不准。碰到就把计数拉满，不再白点第二次。
      if (plan.kind === 'equip') {
        equipNow = EQUIP_CAP
        await step(opts, steps, '  装备买不进（' + plan.card.name + '）→ 按游戏上限 ' + EQUIP_CAP + ' 件计，本局不再买装备')
        fails = 0
        continue
      }
      if (fails >= 2) return { ok: true, st: cur, level, bench: benchNow, equip: equipNow, money, stopped: '连续两次没买成', bought }
      continue
    }

    if (plan.action === 'refresh') {
      const r = await doRefresh({ st: cur, level, free: plan.free, steps, opts })
      refreshUsed += 1
      cur = r.st || cur
      money = r.money
      // 2026-11-13 10:3x 实测（trace 02:18 第 7 回合）：一次刷新 = 点一下 + 整屏 OCR ≈ 10s，
      // 那回合连刷 4 次花了 40s，把休息期顶到 98.7s。钱少的时候连刷也刷不出想要的，
      // 所以一回合最多刷 2 次，剩下的留到下回合（用户 m00211 口径不变：没想要的照样刷）。
      // 2026-11-13 15:3x 用户 m06639「钱多了继续刷新补强阵容」：钱 ≤11 还是封 2 次（省时间），
      // 钱 ≥12 放宽到 4 次（一次刷新约 10s，4 次 40s，压在 70s 预算内）。
      // 2026-11-13 15:5x：一次刷新约 9s，休息期预算 70s → 已花 45s 就不再刷（钱留给下回合）。
      const refreshCap = Number(money) >= 12 ? (Date.now() - REST_T0 > 45000 ? 1 : 4) : 2
      if (refreshUsed >= refreshCap) {
        await step(opts, steps, '  本回合已刷 ' + refreshUsed + ' 次没买到（上限 ' + refreshCap + '）→ 收工')
        return { ok: true, st: cur, level, bench: benchNow, equip: equipNow, money, stopped: '本回合刷新次数用完', bought }
      }
      if (!r.ok) {
        fails += 1
        if (fails >= 2) return { ok: true, st: cur, level, bench: benchNow, equip: equipNow, money, stopped: '连续两次刷新没生效', bought }
      } else {
        fails = 0
      }
      continue
    }

    if (plan.action === 'freeze') {
      tap(POINTS.freeze[0], POINTS.freeze[1])
      await sleep(1200)
      await step(opts, steps, '  冻结住了' + (plan.then === 'upgrade' ? '，接着升级（m02897：第 2 回合命中就冻结再升级）' : '，本回合收工（店里有 ' + plan.card.name + '，下回合再买）'))
      // 用户 m02897：「有想要的就冻结然后升级，剩下的钱没了就没了」——冻结不再等于本回合结束。
      if (plan.then === 'upgrade') {
        const up = await doUpgrade({ st: cur, level, steps, opts })
        if (up.ok) {
          level = up.level
          cur = up.st
          money = Number(cur.money) || 0
          LAST_UPGRADE_ROUND = Number(cur.round) || 1
        }
      }
      return { ok: true, st: cur, level, bench: benchNow, equip: equipNow, money, stopped: plan.then === 'upgrade' ? '已冻结+升级' : '已冻结', bought }
    }

    return { ok: false, error: '未知的买卡动作：' + plan.action, st: cur }
  }
  return { ok: true, st: cur, level, bench: benchNow, equip: equipNow, money, stopped: '动作次数到 60，收手', bought }
}

/** 干员在站位表里的职业分组：tank（重装）/ healer / ranged / melee。 */
export function swapRoleOf(name) {
  const n = String(name || '')
  if (!n) return 'melee'
  try {
    const cls = String((operatorInfo(n) || {}).class || '')
    if (cls.includes('重装')) return 'tank'
    if (cls.includes('医疗')) return 'healer'
    if (cls.includes('狙击') || cls.includes('术师') || cls.includes('辅助')) return 'ranged'
  } catch { /* 查不到就按近战 */ }
  try {
    const g = roleGroup(n)
    if (g === 0) return 'healer'
    if (g === 1) return 'ranged'
  } catch { /* 同上 */ }
  return 'melee'
}

/**
 * 场上互换站位（用户 m05472：长按选中 → 拖到要换的人所在格 → 两个人互换；只给被拖动的那个滑朝向）。
 * 只在「休整期、有 ≥2 个人、还没花太长时间」时调用；一次最多换 2 对，省时间是第一位的。
 */
async function swapBoardOnce({ slots = [], steps = [], opts = {}, map = null }) {
  const list = (Array.isArray(slots) ? slots : []).filter((b) => b && Array.isArray(b.px))
  if (list.length < 2) return { moved: 0, msg: '场上不到 2 个人，不用换' }
  const plan = swapPlan(list, map || loadGameMap(), { roleOf: swapRoleOf, max: 2 })
  if (!plan.length) return { moved: 0, msg: '站位都对' }
  let moved = 0
  let tried = 0
  for (const p of plan) {
    tried += 1
    // 2026-11-13 21:3x：拖完不再固定 sleep(500) 直接 confirm —— 没进「待确认」时 confirm 等于点空
    // （历史 4 次 1 成）。照 deploy-fast.placeFast 的范式：拖 → 截图判 isPending（cancel 徽章优先；
    // 地块本来就可能绿，green 单独不能当判据）→ 进了 pending 才滑朝向；没进就换个按压点重拖一次。
    let ok = false
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      const from = attempt === 0 ? [p.from[0], p.from[1]] : [p.from[0] + 40, p.from[1] + 30]
      await dragFromTo(from, [p.to[0], p.to[1]], { holdMs: 500, moveMs: 900, steps: 24, tag: 'swap' })
      await sleep(300)
      let stA = null
      try { stA = screenState(saveShot(screenshot(), 'swap-a')) } catch { stA = null }
      if (!stA || !isPending(stA)) {
        // 第一帧可能刚好卡在松手动画里，再补一帧
        await sleep(240)
        try { stA = screenState(saveShot(screenshot(), 'swap-a2')) } catch { stA = null }
      }
      if (!stA || !isPending(stA)) {
        steps.push('  站位互换：第 ' + (attempt + 1) + ' 次没拎起来（green=' + (stA && stA.green) + ' cancel=' + (stA && stA.cancel) + '）')
        continue
      }
      confirmDeploy(p.to, { dir: 'right', ms: 400 })
      await sleep(600)
      const st = peek()
      if (st && st.state === 'wz_rest') { ok = true; break }
      steps.push('  站位互换：确认后没停在休整期（' + (st && st.state) + '）')
    }
    if (!ok) break
    // 账本跟着变：被拖的人 → to；被换的人 → from
    const me = list.find((b) => b && b.name === p.name && Math.abs(b.px[0] - p.from[0]) <= 80 && Math.abs(b.px[1] - p.from[1]) <= 80)
    if (me) me.px = [p.to[0], p.to[1]]
    if (p.kind === 'swap' && p.withName) {
      const other = list.find((b) => b && b.name === p.withName && Math.abs(b.px[0] - p.to[0]) <= 80 && Math.abs(b.px[1] - p.to[1]) <= 80)
      if (other) other.px = [p.from[0], p.from[1]]
    }
    moved += 1
  }
  steps.push('  换人：试 ' + tried + ' 成 ' + moved)
  return { moved, msg: describeSwapPlan(plan.slice(0, moved)) }
}

/**
 * BOSS 关专用换位（2026-11-14 18:2x）：BOSS 回合名额早就是 0（场上满 10 人），bossplan 的目标站位
 * 以前只打日志、一次没执行过。这里按 planBossSwaps 的结果直接做**场上互换** —— 不花名额。
 * 一次最多 3 对；拎不起来就停（跟 swapBoardOnce 同套路，cancel 徽章优先判 pending）。
 */
async function bossSwapOnce({ slots = [], steps = [], opts = {} } = {}) {
  const list = (Array.isArray(slots) ? slots : []).filter((b) => b && Array.isArray(b.px) && b.name)
  if (list.length < 2) return { moved: 0, msg: '场上认得出的干员不到 2 个' }
  let plan = null
  try {
    const map = loadGameMap()
    const names = list.map((b) => String(b.name))
    const bl = bossLayoutFor(names, map)
    plan = planBossSwaps(list, bl, { bench: names })
  } catch (e) {
    return { moved: 0, msg: 'BOSS 站位算不出来（' + e.message + '）' }
  }
  if (!plan || !plan.ok) return { moved: 0, msg: 'BOSS 站位不用换' + (plan && plan.why ? '（' + plan.why + '）' : '') }
  let moved = 0
  let tried = 0
  for (const sw of plan.swaps.slice(0, 3)) {
    const me = list.find((b) => b && b.name === sw.name)
    if (!me) continue
    if (Math.abs(me.px[0] - sw.px[0]) <= 20 && Math.abs(me.px[1] - sw.px[1]) <= 20) continue
    tried += 1
    const from = [me.px[0], me.px[1]]
    let ok = false
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      const press = attempt === 0 ? from : [from[0] + 40, from[1] + 30]
      await dragFromTo(press, [sw.px[0], sw.px[1]], { holdMs: 500, moveMs: 900, steps: 24, tag: 'bossswap' })
      await sleep(300)
      let stA = null
      try { stA = screenState(saveShot(screenshot(), 'bossswap-a')) } catch { stA = null }
      if (!stA || !isPending(stA)) {
        await sleep(240)
        try { stA = screenState(saveShot(screenshot(), 'bossswap-a2')) } catch { stA = null }
      }
      if (!stA || !isPending(stA)) {
        steps.push('  BOSS 换位：第 ' + (attempt + 1) + ' 次没拎起来（cancel=' + (stA && stA.cancel) + '）')
        continue
      }
      confirmDeploy([sw.px[0], sw.px[1]], { dir: 'right', ms: 400 })
      await sleep(600)
      const st = peek()
      if (st && st.state === 'wz_rest') { ok = true; break }
      steps.push('  BOSS 换位：确认后没停在休整期（' + (st && st.state) + '）')
    }
    if (!ok) break
    // 互换语义：被拖的人到目标格，目标格上的人回到起点格。
    const other = list.find((b) => b !== me && Array.isArray(b.px) && Math.abs(b.px[0] - sw.px[0]) <= 40 && Math.abs(b.px[1] - sw.px[1]) <= 40)
    me.px = [sw.px[0], sw.px[1]]
    if (other) other.px = from
    moved += 1
  }
  steps.push('  BOSS 换位：试 ' + tried + ' 成 ' + moved)
  return { moved, msg: moved ? plan.swaps.slice(0, moved).map((x) => x.name + '→' + x.px.join(',')).join(' / ') : '没换成' }
}

export async function autoRest(opts = {}) {
  // 2026-11-13 16:2x 真机：扫禁用干员/认人之后，「本局信息」面板有时没关（classify 会报 wz_hall_joint），
  // 之后整回合按什么都落在面板上 → 布阵 0 个、认人全 null。每回合开头先把它关掉。
  try {
    const stG = peek()
    if (stG && (stG.state === 'wz_hall_joint' || stG.state === 'wz_db')) {
      tap(1768, 56)
      await sleep(900)
      const stG2 = peek()
      if (stG2 && stG2.state !== 'wz_hall_joint') await step(opts, steps, '  关掉残留的「本局信息」面板（' + stG.state + ' → ' + stG2.state + '）')
    }
  } catch { /* 关了就好，失败留给后面的状态判断 */ }
  const REST_T0 = Date.now()

  const maxSteps = Math.max(1, Number(opts.maxSteps) || 6)
  const owned = { ...(opts.owned || {}) }
  const steps = []
  // 2026-11-13（handoff §3）：BOSS 回合 = 回合号等于总回合数。BOSS 回合不升级（restplan 里 ctx.boss 闸门），
  // 布阵改走 bossplan 的 8 格规则。普通回合 boss=false，行为完全不变。
  const boss = isBossRound(opts.roundNo, opts.totalRounds)
  if (boss) await step(opts, steps, '  BOSS 回合（第 ' + opts.roundNo + ' 回合）：不升级，只刷新/买卡补强；站位 x=7/8 近战、x=5/6 医疗+远程、全朝右')
  let level = Math.max(1, Number(opts.centerLevel) || 1)
  let last = null
  const bought = []          // 本回合买到的卡名（给 autoRun 记录用）
  let bench = null            // 整备区实测张数（折叠态扫 deck.py 得到；扫不到退回账本）
  // 「剩余可放置角色」自己数：OCR 读过的那张图可能是放人之前的，收尾布阵按它判会白扫一遍
  // 甲板（每次 9~33s，2026-11-11 14:05 实测）。用它当闸门，只减不增。
  let slotsNow = null
  let equipCount = Number(opts.equipCount) || 0
  // 最近一次读到的升级费（OCR 在升级后常读不出 → 用它兜底，否则整局都不升级，见 m04079）
  let lastUpCost = null
  // 认人只做一次：接手局名字账本是空的，后面每回合都靠这一份名字排位（identifyDeck 有副作用，别反复调）。
  // 2026-11-13 00:5x：标志挪到模块级（IDENTIFY_TRIED）—— 原来声明在 autoRest 里，每回合重置 → 认人失败后
  // 每个回合都重试一次（14~50s），且每回合都可能失败后又「上场 0 个」。
  const identifyTried = IDENTIFY_TRIES >= 99
  // 买来的卡记在甲板队列里（买卡逻辑不变）。2026-11-10 实测：战场是自动部署，
  // 甲板不需要手动拖（deployFromDeck 默认关闭）。index 是「甲板原始序号」（最右为 0），
  // 手动拖时拖走一个剩下的不重排，必须用原序号算起手点。
  // deck 由调用方（autoRun）跨回合传进来 —— 上个回合买了的，这个回合还在队列里。
  const deck = Array.isArray(opts.deck) ? opts.deck.slice() : []
  let deckSeq = Number(opts.deckSeq) || 0
  // 目标阵容清单（用户 m03884：开局列清单照着买）。空数组 = 不启用，行为与旧版一致。
  let wantList = Array.isArray(opts.wantList) ? opts.wantList : []
  // 清单按回合阶段收窄：前期钱少（4–7 块），只列 1–2 阶；后面再放开。
  // 买卡阶数上限：商店只卖「商店等级」以内的卡（Lv4 的店里没有 6 阶）。
  // 旧版按回合数拍了个 6，第 12 回合还想买 6 阶 → 清单里全是没有的卡，pickFromShop 永远 null，
  // 于是一整回合什么都不买（2026-11-10 19:00 第 7/9 回合踩到）。
  const tierCap = (r, lv) => Math.min(6, Math.max(2, Number(lv) || 2))
  // 本局盟约（用户 m02381「这次加入决策层」）：决策层的 wantScore = 阶数 + 命中盟约×2.5，
  // 而 activeCovenants 以前只能由调用方手填，senseRun 又不返回盟约名 —— 清单其实从没按盟约算过。
  // 优先级：调用方给的 > 画面读到的 > 空（空着就只按阶数打分，行为与旧版一致）。
  let activeCov = Array.isArray(opts.activeCovenants) ? opts.activeCovenants.filter(Boolean) : TARGET_COV.slice()
  const poolForCov = () => (Array.isArray(opts.pool) && opts.pool.length ? opts.pool : operatorPool())

  for (let i = 0; i < maxSteps; i++) {
    const tHead = now()
    let st = await senseRun(level)
    if (!st.ok) return { ok: false, error: st.error, steps, last }
    // 2026-11-13 14:39 真机（world/.tmp/now-b.jpg）：上一回合点「准备就绪」弹出的
    // 「确认准备吗？剩余资金将在离开休整期时清空」模态没关掉，整屏被暗色盖住 ——
    // 之后所有按压都落在模态上，日志整片「没拎起来 / green=0」，连着三回合 0 上场。
    // 每进休整期先确认没有残留模态，有就点「确认」继续。
    try {
      if (await prepModalVisible()) {
        await tapAt([1394, 742], 900, '确认（资金清空提示，残留模态）')
        await sleep(900)
        st = await senseRun(level)
        steps.push('  关掉残留的「确认准备吗」模态')
      }
    } catch { /* 检测不了就按没模态走 */ }
    if (st.screen === 'rest') SHOP_OPEN_NOW = shopIsOpen(st)
    // 「作战结束」过场：等它自己滑走再动手（2~3 秒），别在过场里点卡、点准备就绪
    for (let k = 0; k < 4 && st.ok && st.screen === 'warbanner'; k++) {
      await sleep(2200)
      st = await senseRun(level)
      if (k === 0) await step(opts, steps, '  作战结束过场，等它过去')
    }
    // 休整期有「展开/折叠」两种形态。m00233：只有买卡时才展开，其他操作（装装备、拖人、
    // 卖卡、取甲板坐标）一律折叠态 —— 展开时那排甲板会整体平移 40~150px，坐标全错。
    // 2026-11-13 07:4x 提速（用户 m04520：休息期压到 70s 内）：商店本来就是展开的（上回合末没折叠），
    // 先折叠（~15s）再展开（~7s）纯属白花。改成「已展开就别动」，买完在收尾统一折叠一次。
    // 2026-11-13 14:1x 用户原话：「先折叠商店再放干员」——这条写进底层，不再图省事跳过。
    // 商店展开时底排是商店卡、木台被遮住，甲板扫描出来的坐标全是错的（整回合 0 上场都是这么来的）。
    // 2026-11-14 20:1x 实测（world/.tmp/verify-fix3.log 第 5 回合）：一回合打完回到休整期的那一瞬，
    // sense 先读到 battle（过场还没走完 / 战术三选一还没弹），旧代码等到 ensureShop 之后才判 screen!=='rest'
    // → 整个 autoRun 报「休整期处理失败：不在休整期（screen=battle）」，第 5 回合就停了整局。
    // 这里先等一手：战斗/过场就等回休整期，战术三选一就选掉；只有结算才收手。
    if (st.ok && (st.screen === 'battle' || st.screen === 'warbanner' || st.screen === 'tactic')) {
      const wasScreen = String(st.screen)
      let w = await waitFor(['wz_rest', 'wz_prep', 'wz_settle', 'wz_tactic', 'wz_strategy'], { timeoutMs: 180_000, gapMs: 1500 })
      if (w.state === 'wz_tactic') {
        const tk = await pickTactic({ preferList: tacticPreference({ covenants: opts.activeCovenants }).order })
        steps.push('  战术决策（进休整期前）：' + (tk.ok ? '选了第 ' + tk.picked + ' 张' : '没选成（' + tk.reason + '）'))
        if (tk.ok) w = await waitFor(['wz_rest', 'wz_prep', 'wz_settle'], { timeoutMs: 40_000, gapMs: 1200 })
      }
      // 中途「2/3 选择策略」：点第一张 + 确认，再等回休整期（2026-11-15 10:0x 实测会卡在这）。
      if (w.state === 'wz_strategy') {
        const sk = await pickStrategyMidRun(opts, '进休整期前')
        steps.push('  中途选策略（2/3）：' + (sk ? '点了第一张 + 确认' : '没点成'))
        if (sk) w = await waitFor(['wz_rest', 'wz_prep', 'wz_settle'], { timeoutMs: 40_000, gapMs: 1200 })
      }
      if (w.state === 'wz_settle') return { ok: false, error: '结算了', steps, last }
      if (w.state !== 'wz_rest' && w.state !== 'wz_prep') {
        return { ok: false, error: '等战斗结束没回到休整期（' + w.state + '）', steps, last }
      }
      st = await senseRun(level)
      if (!st.ok) return { ok: false, error: st.error, steps, last }
      steps.push('  上一回合没收干净（先前读到 ' + wasScreen + '）→ 等回休整期再动手')
    }
    st = await ensureShop(false, st, steps, opts)
    if (!st.ok) return { ok: false, error: st.error, steps, last }
    if (st.screen !== 'rest') return { ok: false, error: '不在休整期（screen=' + st.screen + (st.screenOcr ? '/OCR=' + st.screenOcr : '') + '）', steps, last }
    last = st
    phaseLog('回合头（sense+折叠）', tHead, 'round ' + (st.round == null ? '?' : st.round) + ' Lv' + level)
    // 盟约：调用方没给就现拍一帧读顶栏（~2s）。读不到就空着继续跑，不阻断。
    // 2026-11-12 实测（trace decision-2026-11-11T23-53-08）：第 3 回合顶栏有「精准 聚合 炎」，
    // 但第一次截图只认出了「精准」（图标还在淡入）。所以不能只在 i===0 读一次、也不该
    // 用「读到的结果整体覆盖」—— 改成每回合读、把新认出来的并进 activeCov（只增不减）。
    // 2026-11-13 07:5x 提速：每次读盟约 = 一次整屏 OCR（实测 7~13s），而 i 恒为 0 所以以前每回合都读。
    // 盟约一局里只在开局/解锁时变：读到 ≥3 个之后就不再读了（一次整屏 OCR 实测 7~14s，而且常常读两次）。
    const covRound = Number(st.round) || 1
    // 2026-11-13 08:2x 提速：盟约是开局选定的、一局里基本不变，而每读一次就是一次整屏 OCR（7~13s）。
    // 改成「认到 ≥3 个之后，隔 6 回合才再读一次」，不再每 3 回合烧 10s。
    // 2026-11-13 21:5x：注释说的「隔 6 回合再读」以前没实现（covStale 只看 length<3），
    // 每回合照样烧 7~13s 整屏 OCR。补上回合差闸门：只增不减的盟约账 ≥3 个后每 6 回合才复核一次。
    const covRoundDiff = covRound - COV_LAST_OK
    const covStale = activeCov.length < 3 || (COV_LAST_OK > 0 && covRoundDiff >= 6)
    // 2026-11-15 05:0x：调用方一开局就给了 3 个核心盟约（run-covenants.json）→ activeCov.length>=3 → covStale=false
    // → 整局一次都不读画面，于是「顶栏盟约（实测，名字/层数）」这条验收证据根本不出现（真机 trace 20-56-25 就是这样）。
    // 每局至少读一次画面（约 7~13s），把顶栏层数落一份。
    // 2026-11-15 07:0x（用户 m10875「层数不用读具体多少，结算画面有，你只管叠高」）：
    // 顶栏层数不再每 3 回合读一次（一次整屏 OCR 7~13s），只在每局第一次落一份备查。
    const covShouldRead = opts.covFromScreen !== false && (covStale || opts.__barReadOnce !== true)
    const tCov = now()
    if (covShouldRead) {
      try {
        const cov = await readCovenantsNow({ saveAs: opts.trace ? join(opts.trace, 'cov-' + Date.now() + '.png') : undefined })
        if (cov.ok) {
          // 读成功就记下这一回合（哪怕名字不够），否则读不清时每回合都会重烧一次 10s OCR。
          COV_LAST_OK = Number(st.round) || COV_LAST_OK
          const fresh = cov.names.filter((n) => !activeCov.includes(n))
          if (fresh.length) {
            const before = activeCov.length
            activeCov = [...activeCov, ...fresh]
            await step(opts, steps, '  本局盟约（画面）：' + activeCov.join(' ') + (before ? '（新认出 ' + fresh.join(' ') + '）' : ''))
          } else if (i === 0) {
            await step(opts, steps, '  本局盟约（画面）：' + activeCov.join(' '))
          }
        } else if (i === 0) {
          await step(opts, steps, '  盟约读不到（识别 ' + cov.texts.length + ' 段文本）→ 清单只按阶数打分')
        }
        // 2026-11-15 04:2x：用户验收标准是「凑出 3 个盟约并叠层」，这条只有游戏顶栏能作证 ——
        // 名字是我们自己的账本，层数是游戏给的，两个都对上才算数。顺手落一份 data/covenant-bar.jsonl 备查。
        if (Array.isArray(cov.bar) && cov.bar.length) {
          const barTxt = cov.bar.map((b) => b.name + ' ' + (b.stacks == null ? '?' : b.stacks)).join(' / ')
          const live = cov.bar.filter((b) => Number(b.stacks) > 0)
          await step(opts, steps, '  顶栏盟约（实测，名字/层数）：' + barTxt + '｜层数>0 的 ' + live.length + ' 个')
          // 2026-11-15 06:0x：层数那排小号数字 OCR 常常读不出来（实测全是 ?），光靠层数判会永远不达标。
          // 改成两条口径任一成立就算达标：①顶栏层数>0 的盟约 ≥3 个；②顶栏出现的盟约里，有 ≥3 个在我们账本上已激活。
          let activeNames = []
          try {
            const bs = (opts.boardSlots || []).map((x) => x && x.name).filter(Boolean)
            activeNames = describeCovenants(bs, loadCovenantMap(), 8).filter((c) => c.active).map((c) => c.name)
          } catch { /* 账本算不出来就只按层数判 */ }
          const barNames = cov.bar.map((b) => b.name).filter(Boolean)
          const bothHit = barNames.filter((n) => activeNames.includes(n))
          if (live.length >= 3 || bothHit.length >= 3) {
            const detail = live.length >= 3 ? live.map((b) => b.name + ' ' + b.stacks).join('、') : bothHit.join('、') + '（顶栏+账本都对上）'
            await step(opts, steps, '  ★ 验收项达到：' + Math.max(live.length, bothHit.length) + ' 个盟约已激活并叠层（' + detail + '）')
            opts.covGoalMet = true
          }
          try {
            appendFileSync(fileURLToPath(new URL('../data/covenant-bar.jsonl', import.meta.url)),
              JSON.stringify({ at: new Date().toISOString(), round: Number(st.round) || null, bar: cov.bar }) + '\n')
            opts.__barReadOnce = true
          } catch { /* 记日志失败不影响对局 */ }
        }
      } catch (e) {
        if (i === 0) await step(opts, steps, '  盟约读取失败：' + e.message + ' → 清单只按阶数打分')
      }
    } else if (i === 0 && activeCov.length) {
      await step(opts, steps, '  本局盟约（调用方）：' + activeCov.join(' '))
    }
    phaseLog('读盟约', tCov, covShouldRead ? activeCov.length + ' 个' : '跳过（' + activeCov.length + ' 个，上次 R' + COV_LAST_OK + '）')
    if (activeCov.length) { opts.activeCovenants = activeCov; TARGET_COV = activeCov.slice() }
    // 2026-11-12 22:xx（用户 m02617「你识别场上干员，自己根据盟约加」）：
    // 每回合打一行盟约账 —— 场上谁、整备区谁，各自把哪个盟约推到几人（差几个到激活）。
    // 全部来自我们自己的记账（boardSlots + deck），不读顶栏层数。
    {
      const bNames = (Array.isArray(opts.boardSlots) ? opts.boardSlots : []).map((b) => b && b.name).filter(Boolean)
      const dNames = deck.map((x) => x && x.name).filter(Boolean)
      try {
        // 2026-11-15 05:0x：原来的 ✓ 是把「场上 + 整备区」合起来算的，而游戏只给场上的人算盟约 ——
        // 「聚合 2/2✓」经常是 1 个在场 + 1 个躺在整备区，于是保护/补人都按假的激活走。
        // 拆成两行：场上那份带 ✓（真激活），整备区单独一行（还没上场，只是候选）。
        const dscB = describeCovenants(bNames, loadCovenantMap(), 6)
        const dscD = describeCovenants(dNames, loadCovenantMap(), 6)
        await step(opts, steps, '  盟约账（场上 ' + bNames.length + '）：' + dscB)
        if (dNames.length) await step(opts, steps, '  盟约账（整备区 ' + dNames.length + '，还没上场）：' + dscD)
      } catch (e) {
        await step(opts, steps, '  盟约账算不出来（' + e.message + '）')
      }
    }

    // 装备自动佩戴（用户 m04629 / m04620 连着提醒「装备依旧没有装」）：
    // 纯看图认装备（equipkb.py 图库匹配，不轻按）+ 长按拖到干员脚下的格子。每回合休整期第一轮做一次。
    // 整备区上限 10 张（用户 m00211），但甲板账本只增不减，早就虚高 —— 每回合开头实测一次。
    if (i === 0) {
      // 2026-11-13 07:4x 提速：scanDeckChips 每回合 2~9s，而且常报「木台被遮住不可信」。
      // 账本 deck（买到就 push、上场才删）已经够用来判 BENCH_STOP_BUY，直接拿它当整备区张数。
      bench = deck.length > 0 ? deck.length : await senseBench(steps, opts)
      if (bench == null) bench = deck.length
      // 2026-11-13 00:3x（夜里实测）：木台被商店遮住时 senseBench 退回「上次的数」，常常还是 1，
      // 于是 restplan 的 benchBlock 永远不开，一边场地名额 0、一边继续买卡，整备区真涨到 9 张。
      // 账本 deck 是「买到就 push、上场才删」，比脏读数可靠 → 取两者较大者（只更保守，不会多买）。
      if (!(Number(bench) >= deck.length) && deck.length) {
        await step(opts, steps, '  整备区读数 ' + bench + ' < 账本 ' + deck.length + ' 张 → 按账本算')
        bench = deck.length
      }
    }
    // 2026-11-11 18:0x（用户 m02704 第 1 条）：不再「有位置就先放人」—— 先把卡买完，
    // 回合末在收尾布阵里一次性依次放下。原来先放人会在买卡前把整备区清一遍，
    // 之后用钱买来的新人反而留在甲板上（还多扫一次甲板）。这里只把槽位记下来给收尾用。
    if (i === 0 && st.slotsLeft != null) {
      const s0 = Number(st.slotsLeft)
      if (Number.isFinite(s0)) slotsNow = s0
    }
    // 2026-11-11 14:0x：本局一件装备都没买过（equipCount 0）时直接跳过 —— 装装备要扫整排
    // 图库匹配，每次 11s，白跑。
    if (i === 0 && opts.equip !== false && equipCount > 0) {
      try {
        const nEq = await equipDeck({ steps, deckNames: deck.map((d) => d.name || '') })
        if (!nEq) await step(opts, steps, '  这轮没有要装的装备')
      } catch (e) {
        await step(opts, steps, '  装装备失败：' + e.message)
      }
    }

    // 清单：没显式给、或者开了 wantAuto，就自动生成（空清单等于「什么都不要」，
    // 买卡阶段会把钱全刷掉 —— 2026-11-11 实测踩到这点，所以默认兜上）。
    if (opts.wantAuto || !wantList.length) {
      wantList = buildWantList({
        pool: poolForCov(),
        activeCovenants: activeCov,
        quota: { 重装: 2, 医疗: 1, 狙击: 2, 术师: 2, 辅助: 1 },
        limit: 8,
        maxTier: tierCap(Number(st.round) || 1, level),
      })
      if (i === 0) await step(opts, steps, '  清单 ' + wantList.length + ' 人：' + wantList.map((w) => w.name).join(' '))
      // 2026-11-15 09:0x（用户 m10989 批准的第 1 项）：每回合一行结构化快照。
      // 以前出事只能翻十几行零散日志对账；现在一行摆开「我以为的」血量/金币/名额/等级/占格/整备区/盟约，
      // 和真实画面一比就知道是感知错了还是决策错了。这里复用已经读到的 st/deck，不额外截图 OCR。
      if (i === 0) {
        try {
          const { formatSnapshot } = await import('./snapshot.js')
          await step(opts, steps, '  快照：' + formatSnapshot({
            at: new Date().toISOString(),
            screen: { state: 'wz_rest' },
            round: st.round, hp: st.hp, money: st.money, slots: st.slotsLeft, level,
            board: (Array.isArray(opts.boardSlots) ? opts.boardSlots : []).map((b) => ({ px: b && b.px })),
            bench: (Array.isArray(deck) ? deck : []).map((d) => ({ name: d && d.name ? d.name : null })),
            covenants: { names: activeCov, bar: [] },
            issues: [],
          }))
        } catch (e) { await step(opts, steps, '  快照失败：' + e.message) }
      }    }
    // OCR 认出的商店等级优先（以前靠「进局 1，每升一次 +1」自己数，接手对局就会从 1 数起）
    // 只接受「变高」：折叠态 LEVEL 面板被甲板压着，读出来的等级经常低一档，
    // 一降格子数就少一排，整排卡坐标全偏（2026-11-11 10:34 / 10:52 两次实测误降 Lv4→Lv3、Lv2→Lv1）。
    // 用户 m02001：等级以自己记的为准，OCR 只当参考 —— 这里不再改 level，只在对不上时记一笔。
    if (shopIsOpen(st) && st.shopLevelOcr != null && Number(st.shopLevelOcr) !== level) {
      const lvOcr = Number(st.shopLevelOcr)
      // 2026-11-12 08:0x：接手对局时 tracker 从 1 数起，而商店其实已经是 Lv2 →
      // 目标等级、升级费、升级卡片坐标全按 Lv1 算（「升级费 8」对 Lv2，判断必然错）。
      // 所以「画面比记账高」时反过来校准记账（低的不采信：折叠态面板被压着会读低一档，
      // 2026-11-11 10:34 / 10:52 误降过 Lv4→Lv3、Lv2→Lv1）。回合第一次展开商店时校准。
      if (lvOcr > level && i === 0) {
        await step(opts, steps, '  校准商店等级：自己记 Lv' + level + '，画面 Lv' + lvOcr + ' → 按画面继续')
        level = lvOcr
      } else {
        await step(opts, steps, '  （OCR 读成 Lv' + lvOcr + '，按自己记的 Lv' + level + ' 继续）')
      }
    }
    // ── 买卡：用户 m00211 的顺序（先判升级 → 买 → 没有要的刷新 → 钱不够买要的冻结）
    // 规则在 restplan.js（纯函数 + 单测），执行在 restBuyTurn。
    // m00233：展开只为了买卡，买完立刻折叠 —— 展开态整备区会平移，后面所有甲板操作都会歪。
    // 2026-11-12 02:0x 真机确认（截图 world/.tmp/r8.png）：场上 10 个干员站满、右上写着
    // 「剩余可放置角色：0」（这是真的 0，不是 OCR 错读），下面整备区还站着 7 张。这时再买卡
    // 只会把整备区塞满 10 张 → 之后连卡都买不了，而且一分钱都换不来战斗力。
    // 所以在「整备区已经≥6 张、明显放不上去」时先不买（钱下回合会清空，不囤）。
    // 2026-11-12 07:2x 用户 m02102：「为什么不升级商店，打到第九回合还是1级商店」。
    // 旧写法在这里整段 return 掉商店阶段，升级跟着一起没了（_perf.log 23:03 起每回合只剩
    // 「整备区 N 张（场上满员放不上去）→ 本回合先不买」，一次升级判定都没跑）。
    // 现在只关买卡：钱够、又没到本回合该到的等级时，照常展开商店去升级。
    // 判定做成纯函数（restplan.shopEntryPlan），单测覆盖；这里只喂参数。
    // 钱和回合号都从这一帧的 OCR 里取 —— autoRest 这一层没有 money 变量（写 money 会 ReferenceError）。
    const tShop = now()
    const gate = shopEntryPlan({
      money: st.money,
      level,
      targetLevel: targetShopLevel(Number(st.round) || 1),
      upgradeCost: st.upgradeCost != null ? Number(st.upgradeCost) : lastUpCost,
      bench,
      forceBuy: opts.forceBuy === true
    })
    const benchBlock = gate.benchBlock
    if (benchBlock) {
      await step(opts, steps, '  整备区 ' + bench + ' 张（场上满员放不上去）→ 本回合不买卡' +
        (gate.mayUpgrade ? '，只走升级' : '，也没到升级时点 → 跳过商店'))
    }
    if (!gate.enterShop) {
      // 不展开商店（省 3~5s），直接收工
    } else {
      st = await ensureShop(true, st, steps, opts)
      if (!st.ok) return { ok: false, error: st.error, steps, last }
      last = st
      // 商店格数 = 3 + 商店等级，等级错一位整排卡片的点击坐标就整排偏。折叠态左下的 LEVEL
      // 面板被甲板压着读不到，展开后才认得出 —— 所以在这里再校一次，并用新等级重拍一张。
      if (st.shopLevelOcr != null && Number(st.shopLevelOcr) !== level) {
        const lvOcr = Number(st.shopLevelOcr)
        // 展开后 LEVEL 面板才露出来。画面比记账高 → 按画面校准（接手对局时 tracker 从 1 数起）；
        // 比记账低不采信（2026-11-11 10:34/10:52 折叠态压着读低一档，误降过 Lv4→Lv3）。
        if (lvOcr > level && i === 0) {
          await step(opts, steps, '  校准商店等级：自己记 Lv' + level + '，画面 Lv' + lvOcr + ' → 按画面继续')
          level = lvOcr
        } else {
          await step(opts, steps, '  （OCR 读成 Lv' + lvOcr + '，按自己记的 Lv' + level + ' 继续）')
        }
      }
      if (st.upgradeCost != null && Number(st.upgradeCost) > 0) {
        lastUpCost = Number(st.upgradeCost)
        opts.lastUpgradeCost = lastUpCost
        await step(opts, steps, '  升级费 ' + st.upgradeCost)
      }
      const seq = { v: deckSeq }
      const r = await restBuyTurn({
        st, level, wantList, owned, deck, seq, bench, equipCount, benchBlock, slotsLeft: slotsNow, steps, opts,
        restElapsedMs: Date.now() - REST_T0,
        covenantCtx: {
          board: Array.isArray(opts.boardSlots) ? opts.boardSlots.map((b) => b && b.name).filter(Boolean) : [],
          bench: deck.map((x) => x && x.name).filter(Boolean),
          covenants: Array.isArray(activeCov) ? activeCov : [],
            round: Number(opts.roundNo) || 0,
          banned: Array.isArray(opts.banned) ? opts.banned : [],
          bannedCovenants: Array.isArray(opts.bannedCovenants) ? opts.bannedCovenants : [],
          // 2026-11-14 20:5x：本局核心盟约（开局落盘），让 pickBuyTarget 知道该往哪几家凑。
          coreCovenants: Array.isArray(opts.coreCovenants) ? opts.coreCovenants : [],
          // 2026-11-14 23:1x：攻略热度权重（与 coreCovenants 配套）。
          guideWeight: opts.guideWeight || null,
        },
      })
      deckSeq = seq.v
      if (!r.ok) {
        await ensureShop(false, r.st || st, steps, opts)
        return { ok: false, error: r.error, steps, last }
      }
      level = r.level
      bench = r.bench
      equipCount = r.equip
      st = r.st || st
      last = st
      if (Array.isArray(r.bought)) bought.push(...r.bought)
      if (r.stopped) await step(opts, steps, '  收工：' + r.stopped)
      await ensureShop(false, st, steps, opts)
      }
    // 2026-11-13 07:5x：不管这回合有没有进商店，收尾都折叠一次（幂等）。
    // 展开态甲板整体平移，认人/布阵必须折叠态 —— 以前只有「进过商店」才折叠，没进商店的回合坐标会歪。
    st = await ensureShop(false, st, steps, opts)
    phaseLog('商店+买卡', tShop, 'bought ' + bought.length + ' money ' + (st.money == null ? '?' : st.money))
    break
  }
  // 2026-11-10 07:40 真机实测：休整期拖拽无效、战场自动部署，默认关闭。
  // 证据：① 战斗页顶部「已部署/总数」在完全零输入下自己从 0/8 涨到 5/8；
  //       ② 休整期用 input swipe / input mouse motionevent / sendevent 三种手势，从甲板干员
  //          身上往地图格拖，前后截图对比画面完全没变（连选中态都没有），slotsLeft 始终 8。
  // 整备区位置 = 自动部署顺序，买来的干员自己会上场，所以默认不调 deployFromDeck。
  // 只有显式 deploy:true 才保留旧行为（以后要手动布阵/改朝向再用）。
  // 默认路径因此整段跳过：deployFromDeck 里每个格位一次 senseRun（最多 6 次 OCR），
  // autoRest 收尾不再被拖拽拖住。
  let deployed = 0
  // 2026-11-13 11:4x：一回合里布阵可能被调好几轮（trace 03:09 那回合 29s+21s=55s，整段休息期 101s）。
  // 一回合布阵总时长封顶 45s，超了就收手，剩下的名额留到下回合。
  const DEPLOY_ROUND_T0 = Date.now()
  // 2026-11-13 19:1x：换人目标（swapHead/swapPx）在「名额 0」分支就要用到（撤回最弱那个腾名额），
  // 声明必须放在回合开头。之前声明在下面 200 行处，前面引用会抛
  // ReferenceError: Cannot access 'swapPx' before initialization —— 两代进程都是这么崩的。
  let swapHead = null
  let swapPx = null
  // 2026-11-12 22:xx（用户 m02613）：场上都有谁、站在哪 —— 盟约换人要靠这份账挑「换下谁」。
  // 只记我们自己拖上去的（接手局里原有的干员认不出来，先不管）。
  const deployedSlots = []
      let quotaCooling = false
  const droppedPx = []
  if (shouldDeploy(opts)) {
    // 名册/棋盘状态：调用方没传就自己从磁盘读，用完再写回（跨进程、跨回合都能续）
    const roster = opts.roster || loadRoster()
    const board = opts.board || loadBoard()
    // 2026-11-11 12:52 实测：这里原本按上一张 OCR 的 shop 判展开，但上面刚 ensureShop(false) 折叠过一次，
    // 再按「展开中」处理就会去点折叠位（折叠态那个位置是「展开」按钮）→ 把商店又展开了，
    // 然后在展开态里拖甲板，抢到的是商店卡的坐标，格差永远 0（上午三次「上场 0 个」就是这个原因）。
    //
    // 2026-11-11 14:1x 改成「一直放到没名额」的循环（用户 m01225：干员优先级高于装备；m01372：有位置就先放人）：
    // 上一版只放一轮，买卡买进来的新人就留在甲板上不上了 —— trace step-112 实拍：第 6 回合开战前
    // 场上 3 个、木台上还站着 5 个，右上角「剩余可放置角色 5」，那回合掉 20 点血。
    // 2026-11-11 14:4x 修：这里原来 `Number.isFinite(Number(slotsNow)) ? Number(slotsNow) : 99`
    // 有个坑 —— Number(null) === 0，slotsNow 没设上时会被当成「一个名额都没有」，
    // 于是甲板上站着 3 张、右上角明明写着「剩余可放置角色 5」，却直接跳过布阵
    // （trace-2026-11-11T06-16-57 / step-095 实测，那回合掉 10 点血）。
    // 现在：先扫甲板；只有真的还有名额才布阵；名额是旧值/没设上时当场重读一次 OCR 定夺。
    // 2026-11-11 18:0x（用户 m02704 第 2 条 + 「除了我标记过的格子其他都是废格子」）：
    // 候选格先问游戏自己 —— 抓着牌时能站人的格整格变绿，比 wz-01.json 里的手画坐标可靠。
    // 整回合只扫一次（约 3s），共用；扫不出来才退回地图坐标。
    // 2026-11-11 18:31（用户 m02970 第 1 条「可以」）：候选格只用地图那 19 格。
    // 抓牌态的绿格是连成片的，按格心数会数出 35 个（相邻格的绿边黏在一起），所以不再从绿格取坐标；
    // 也不再为了验证去抓一次牌（每次约 5s）。能不能放，靠「拖完那张牌有没有离手」判定。
    // 2026-11-11 18:3x 实测：19 格在抓牌态全部是亮的（含 (1489,665)，之前判它不能放是我裁图遮罩挡掉了）。
    const greenTiles = null
    let remaining = slotsNow == null ? null : Number(slotsNow)
    // 2026-11-15 04:4x（用户 m08866「台下的高阶干员怎么就不上」；真机 trace-night-2026-11-14T19-52-08 第 8~10 回合）：
    // 场上上限 = 5 + 调度中心等级（真机反推：Lv1 6 人 / Lv3 8 人 / Lv5 10 人）。
    // 名额 OCR 在「已满」时仍读成 1~2（字小、暗态），于是每回合拿假额度试 6~10 格、白烧 60~120s，
    // 而且 remaining 一直 >0 → 永远走不到下面的「撤回换人」，整备区 3~4 阶的高阶干员一张都上不去。
    // 这里只在「占格数已经顶到容量附近」时收紧名额（OCR 0 或 >2 都不动，避免误撤好人）：
    // remaining = min(OCR, 上限 − 已占格数)；收紧到 0 就自然进「名额 0 → 撤回再部署」那条路。
    try {
      const lvNow = Math.max(1, Number(level) || 1)
      const lvCap = 5 + lvNow
      const occN = opts.occupiedPx && typeof opts.occupiedPx.size === 'number' ? opts.occupiedPx.size : null
      if (occN != null && occN >= lvCap && (remaining == null || Number(remaining) <= 2)) {
        const byCap = Math.max(0, lvCap - occN)
        if (remaining == null || Number(remaining) > byCap) {
          await step(opts, steps, '  名额按容量口径收紧：读作 ' + (remaining == null ? '?' : remaining) + ' → 场上 ' + occN + '/' + lvCap + '（Lv' + lvNow + '）→ 先按 ' + byCap + ' 个算')
          remaining = byCap
        }
      }
    } catch { /* 算不出来就按 OCR */ }
    // 2026-11-11 15:48 修：这段原来会「越放越空转」——trace-07-46-18 / step-013~022 实测，
    // 明明「剩余可放置 0」，却每轮都重读一次 OCR（7.8s）再「试放一次」（5.7s），连做 5 轮空转 ~30s。
    // 三个原因：①读到 0 还被当成「读数靠不住」继续试；②没有校验甲板张数真少了；
    // ③落到兜底时把 remaining 拨回 2，永远回不到「没名额」这个结论。
    // 现在：明确读到 0 就收工；只有「读不到（null）」才试放一次，且一回合只试一次；每轮复核甲板张数，没少就停。
    let triedFallback = false
    // 本回合已做过几次「撤回换人」（名额 0 → 撤回一个 → 再正常部署）。
    // 2026-11-15 00:2x（用户 m08866「台下的高阶干员怎么就不上呢」）：以前一回合只允许撤 1 次，
    // 而场上满员时每个名额都得靠撤回腾 —— 整备区躺着一堆高阶牌，一回合却只能换 1 个上场，
    // 剩下的继续躺着（trace-night-2026-11-14T15-14-21 R7~R8 每回合只换 1 个）。
    // 现在放到 3 次（opts.maxRecallsPerRound 可调），每次都要过时间预算，超预算就收手。
    let replaceTurn = false
    let recallSwapCount = 0
    // 2026-11-15 01:0x 真机（trace 16-30-24 第 6 回合）：名额 0 已经换了一次「角峰 上」，
    // 紧接着名额 1 又换了一次「角峰 上 ← 慕斯 下」——同一个 add 被规划两次，白丢场上一个人。
    // 每成功换一次就把要上的人记下来，后面的换人规划都不许再选他。
    const swapAdds = []
    const maxRecalls = Number(opts.maxRecallsPerRound) > 0 ? Number(opts.maxRecallsPerRound) : 3
    let prevBench = -1
    let lastPlaced = 0
    // 收尾那行「布阵：…」要用的最后一轮整备区张数（循环内的 benchLeft 出不了作用域）
    let benchSeen = null
    // 那个「N 张」可不可信（低置信度沿用旧值 / 甲板没看清时不可信），决定要不要报「布阵失败」
    let benchTrusted = true
    for (let guard = 0; guard < 9; guard++) {
      const sc = await timed('scanDeckChips(final)', () => scanDeckChips({ minPressY: 840 }))
      let benchLeft = sc && sc.ok && sc.chips ? sc.chips.length : 0
      if (sc && sc.ok && sc.lowConfidence) {
        await step(opts, steps, '  甲板张数不可信（木台被遮住）→ 沿用上次 ' + (LAST_BENCH_N == null ? '未知' : LAST_BENCH_N + ' 张'))
        // 2026-11-14 10:2x 真机（本局 R4~R6 每回合「整备区空了」→ 上场 0，场上只剩 2 人）：
        // 新进程第一回合 LAST_BENCH_N 是 null，低置信度时就把 benchLeft 按 0 处理 →
        // 直接「整备区空了，布阵结束」，甲板上 6 张牌白躺。改用调用方传进来的账本长度兜底。
        if (LAST_BENCH_N != null) benchLeft = LAST_BENCH_N
        else if (Array.isArray(deck) && deck.length) {
          benchLeft = deck.length
          await step(opts, steps, '  甲板张数不可信且没有上次值 → 按账本 ' + deck.length + ' 张继续试')
        }
      } else if (sc && sc.ok) {
        LAST_BENCH_N = benchLeft
      }
      benchSeen = benchLeft
      // 这回合的「整备区 N 张」可不可信：低置信度时是沿用上一回合的旧值（商店展开把木台遮住），
      // 拿它当布阵失败判据会误报（2026-11-12 23:3x 实测：木台明明空的，账本还在喊 1 张）。
      benchTrusted = !(sc && sc.ok && sc.lowConfidence)
      // 2026-11-13 01:5x 实测（trace-night-2026-11-12T17-33-23）：第一张放上去之后游戏又把商店展开、木台被遮住，
      // 这一轮扫出来的「甲板」是假的（按压点落到 1554,786 那个收起点/商店行上），连试 8 个格全「没拎起来」，白烧 30s。
      // 已经上过人、甲板又看不清 → 本回合到此为止，剩下的名额下回合再说。
      // 2026-11-13 14:3x：这条以前是 break（已经上过人、甲板看不清就收手）。
      // 现在甲板扫不准也不怕了——deployFromDeck 会按 wz-01.json 的 10 个固定格位补按压点，
      // 所以只提示、不提前收手（用户 m06373：上一局就是这么每回合只上 1 个、其余名额全浪费）。
      // 2026-11-14 10:2x：以前只在「已上过人」时才折面板重扫；一个都没上成的时候甲板看不清，
      // 就直接判「整备区空了」跳过整回合布阵（本局 R4~R6 就这么空了三回合）。现在一律先折再扫。
      if (!benchTrusted) {
        await step(opts, steps, '  已上 ' + deployed + ' 个，甲板这次没扫准 → 先折一次面板再看（不盲试格位）')
        // 2026-11-14 00:4x 真机：商店面板展开时木台被遮住，scanDeckChips 报 lowConfidence，
        // 旧逻辑「按固定格位继续试」会连试 2~6 格、每格 ~5.5s（第 3~4 回合各白烧 28s）全失败。
        // 现在：先探一次折叠状态 → 展开就点收起 → 重扫；还看不清就收手，绝不盲试。
        let fixedByFold = false
        try {
          const stp = await probeState()
          const shopOpen = !!(stp && stp.ok && (stp.shopExpanded === true || (stp.shopBrightness != null && stp.shopBrightness < 300)))
          if (shopOpen) { tap(POINTS.collapse[0], POINTS.collapse[1]); SHOP_OPEN_NOW = false; await sleep(900); await step(opts, steps, '  面板是展开的 → 点收起后再扫') }
          const sc2 = await timed('scanDeckChips(retry)', () => scanDeckChips({ minPressY: 840 }))
          if (sc2 && sc2.ok && !sc2.lowConfidence) {
            benchLeft = sc2.chips ? sc2.chips.length : 0
            LAST_BENCH_N = benchLeft
            benchSeen = benchLeft
            benchTrusted = true
            fixedByFold = true
            await step(opts, steps, '  重扫：整备区 ' + benchLeft + ' 张')
          }
        } catch { /* 探不到/点不动 → 走收手 */ }
        if (!fixedByFold) {
          await step(opts, steps, '  折叠后还是看不清甲板 → 不盲试，本回合收手（已上 ' + deployed + ' 个）')
          break
        }
      }
      if (!benchLeft) {
        await step(opts, steps, '  整备区空了，布阵结束（本回合共上 ' + deployed + ' 个）')
        break
      }
      // 2026-11-11 18:56 修：这条原来只看「甲板张数没少」就收手，可 scanDeckChips 会假阳性
      // （trace-10-36-22 实测：摆渡人已经站到 (1196,353)、右上「剩余可放置 7」，甲板明明是空的，
      // 它还是报「整备区还是 1 张」）。所以只有「上一轮一个都没放上去」才算卡住。
      if (prevBench >= 0 && benchLeft >= prevBench && lastPlaced === 0) {
        await step(opts, steps, '  上一轮一个都没放上去（整备区还是 ' + benchLeft + ' 张）→ 收手')
        break
      }
      prevBench = benchLeft
      // 2026-11-14 用户 m05970「撤回并部署」：名额满时唯一的换人手法。
      // 撤回 = 格心按住 400ms → 拖到甲板 (665,883)（落点有干员时游戏会挪到最靠右的空格），
      // 成功判据 = 甲板牌数变多。整备区满 10 张时撤回放不下，先卖一张腾格子。
      // 2026-11-15 01:0x：休整期「按一下场上干员」会弹干员详情面板（wz_buydetail），面板开着时
      // 甲板拖拽全被判成单击 —— 名额还有、格也有，就是一格都拎不起来（.tmp/look-r7.png 实测）。
      // 取消按钮 (965,240) 与 run.js playRound 里点的是同一个。
      // dismissPanelIfOpen 已提到模块级（deployFromDeck 里连续拎不起来时也要用，见文件上部）。
      const recallViaBench = async (victimPx, victimName, why) => {
        if (!Array.isArray(victimPx) || victimPx.length !== 2) return false
        const usedNow = Date.now() - DEPLOY_ROUND_T0
        const budgetNow = Math.min(120000, Math.max(90000, 175000 - (DEPLOY_ROUND_T0 - REST_T0)))
        if (usedNow >= budgetNow) {
          await step(opts, steps, '  撤回前预算不够（布阵已用 ' + Math.round(usedNow / 1000) + 's / 预算 ' + Math.round(budgetNow / 1000) + 's）→ 不撤')
          return false
        }
        if (benchLeft >= BENCH_CAP) {
          let sold = false
          try {
            const scSell = await scanDeckChips({ minPressY: 840 })
            const chipsSell = ((scSell && scSell.chips) || []).slice().sort((a, b) => a.x - b.x)
            if (chipsSell.length) {
              const sellPlan = pickSellChips({
                bench: deck.map((x, k) => ({ name: x && x.name, index: k })).filter((x) => x.name),
                board: Array.isArray(opts.boardSlots) ? opts.boardSlots : [],
                covenants: Array.isArray(activeCov) ? activeCov : [],
              })
              const pickIdx = (sellPlan.length && chipsSell[sellPlan[0].index]) ? sellPlan[0].index : 0
              // 2026-11-14 18:0x 真机（第 14 回合）：甲板扫出来的 chip 里混着「升级/LEVEL」框和孤立假成员 ——
              // 卖 (220,882) 拖了个寂寞，屏幕上却弹「出售 +1」面板，于是程序以为腾出了格子，
              // 撤回时整备区其实还是满的。现在卖完必须复核张数，没少就换下一个候选（最多 3 个）。
              const order = [pickIdx, ...chipsSell.map((_, k) => k)].filter((v, k, arr) => arr.indexOf(v) === k).slice(0, 3)
              for (const idx of order) {
                const target = chipsSell[idx]
                if (!target) continue
                const n0 = chipsSell.length
                const sr = await sellDeckUnit([target.x, target.y])
                await sleep(500)
                let n1 = -1
                try {
                  const sc2 = await scanDeckChips({ minPressY: 840 })
                  n1 = ((sc2 && sc2.chips) || []).length
                } catch { n1 = -1 }
                if (sr && sr.ok !== false && n1 >= 0 && n1 < n0) {
                  sold = true
                  benchLeft = Math.max(0, benchLeft - 1)
                  if (deck.length) deck.splice(Math.min(idx, deck.length - 1), 1)
                  await step(opts, steps, '  整备区满 ' + BENCH_CAP + ' 张 → 先卖 ' + (((sellPlan[0] && sellPlan[0].name)) || ('第 ' + (idx + 1) + ' 张')) + '（' + target.x + ',' + target.y + '）腾一格，再撤回（甲板 ' + n0 + '→' + n1 + ' 张）')
                  break
                }
                await step(opts, steps, '  卖 ' + target.x + ',' + target.y + ' 没成（甲板 ' + n0 + '→' + n1 + ' 张）→ 换下一个候选')
              }
            }
          } catch (e) {
            await step(opts, steps, '  整备区满，想卖一张腾格子但出错（' + e.message + '）')
          }
          if (!sold) {
            await step(opts, steps, '  整备区满 ' + BENCH_CAP + ' 张、卖卡也没成 → 撤回放不下，本回合收手')
            return false
          }
        }
        const rr = await recallBoardUnit(victimPx, { steps, opts })
        if (!(rr && rr.ok)) { await dismissPanelIfOpen(opts, '撤回没成'); return false }
        droppedPx.push(victimPx.slice())
        // 撤回后这个人已经不在场上了：把场上账本和占格集合一起抹掉，
        // 否则 deployFromDeck 会按「名字还在场上」把账本里这张剔掉，名字和甲板错位一格。
        if (Array.isArray(opts.boardSlots)) {
          const bi = opts.boardSlots.findIndex((b) => b && Array.isArray(b.px) &&
            Math.abs(b.px[0] - victimPx[0]) <= 45 && Math.abs(b.px[1] - victimPx[1]) <= 45)
          if (bi >= 0) opts.boardSlots.splice(bi, 1)
        }
        if (opts.occupiedPx && typeof opts.occupiedPx.delete === 'function') {
          opts.occupiedPx.delete(victimPx[0] + ',' + victimPx[1])
        }
        // 2026-11-14 00:2x：撤回成功后账本里同名的其它条目还挂着（实测同一回合又「撤回重复的 真理」，白花一次手势），
        // 统一按名字抹干净，免得下一轮把已经不在场上的人当重复干员再撤一次。
        if (Array.isArray(opts.boardSlots) && victimName) {
          let cut = 0
          for (let bi2 = opts.boardSlots.length - 1; bi2 >= 0; bi2--) {
            const b2 = opts.boardSlots[bi2]
            if (b2 && String(b2.name || '') === String(victimName)) {
              if (!(Array.isArray(b2.px) && Math.abs(b2.px[0] - victimPx[0]) <= 45 && Math.abs(b2.px[1] - victimPx[1]) <= 45)) cut += 1
              opts.boardSlots.splice(bi2, 1)
            }
          }
          if (cut > 0) await step(opts, steps, '  撤回后按名字清账本：' + victimName + ' 还挂着 ' + cut + ' 个占格，一起抹掉')
        }
        benchLeft = Math.min(BENCH_CAP, benchLeft + 1)
        deck.push({ index: deckSeq++, name: victimName || '' })
        remaining = 1
        replaceTurn = false
        recallSwapCount += 1
        await step(opts, steps, '  名额 0 → 撤回 ' + (victimName || ('占格 ' + victimPx.join(','))) + '（' + victimPx.join(',') + '）' + (why ? '｜' + why : '') + ' → 整备区 ' + benchLeft + ' 张、名额 +1 → 本回合正常部署')
        return true
      }
      if (remaining == null || remaining <= 0) {
        let fresh = null
        try { fresh = await senseRun(level, { expect: 'rest', round: last && last.round }) } catch { /* 读不到就按没名额处理 */ }
        // ⚠️ Number(null) === 0：OCR 没读到槽位时 slotsLeft 是 null，直接 Number 会当「一个名额都没有」，
        // 于是甲板上站着人也不放（trace-06-43-13 / step-031 实测：读出来 null，白白空过一回合）。
        const freshSlots = (fresh && fresh.ok && fresh.slotsLeft != null && Number.isFinite(Number(fresh.slotsLeft)))
          ? Number(fresh.slotsLeft) : null
        if (freshSlots != null) remaining = freshSlots
        await step(opts, steps, '  剩余可放置 ' + (remaining == null ? '?' : remaining) + '｜整备区 ' + benchLeft + ' 张（重读槽位）')
        if (remaining != null && remaining <= 0) {
          // 2026-11-12 01:4x 真机实测（本局最痛的一次）：整备区 10 张、场上空着，
          // 「剩余可放置角色」OCR 连读两次都报 0 —— 于是整整 4 个回合一个干员都没放，
          // 第 12 回合掉 9 点血、第 13 回合归零。
          // OCR 这个 0 完全不可信（同一帧里它把 6 读成过 0、把 O 读成 0）。
          // 改成「试放一个」定夺：能上去＝有额度（继续按 1 个 1 个放）；上不去＝真没额度（收手）。
          // 代价只是没额度时白花一次手势（约 5s），比整回合不布阵便宜太多。
          // 有了换人（m02251）之后，上一回合名额 0 也不再跳过 —— 至少还能换 1 个，别整回合不布阵。
          if (last && last.round && QUOTA_STUCK_ROUND === Number(last.round) - 1) {
            await step(opts, steps, '  上一回合名额就是 0：本回合直接走「撤回再部署」腾名额')
          }
          // 2026-11-14（用户 m05970「撤回并部署」）：名额 0 唯一验证过能用的手法是
          // 「格心按住 400ms → 拖到甲板 (665,883) 松手 → 干员回整备区、名额 +1」，再用正常部署补人。
          // 以前那条「把甲板牌拖到已占格」真机全灭（多份 trace「试 964,350 没上去（牌还在 1285,890）」），
          // 已删掉，别再退回去。
          // 2026-11-14 17:58 真机（本局第 13 回合，trace-night-2026-11-14T09-56-23）：
          // 整备区 9 张、剩余名额 0、账本全空（接手局没认名字）→ planRecallSwap 只拿到空的 occupiedPx
          // → 报「没有名册、也没有占格可撤」→ 整回合 0 上场，白掉一轮血。
          // occupiedPx 平时是 autoRun 里跨回合累积的，重启/接手局时是空的；这里现读一帧棋盘补上，
          // 比等 deployFromDeck 里面的被动读早一步（那条路在名额 0 时根本走不到）。
          if (!opts.occupiedPx || (typeof opts.occupiedPx.size === 'number' && opts.occupiedPx.size === 0)) {
            try {
              const occNow = detectOccupiedTiles(screenshot(), loadGameMap())
              if (occNow.ok) {
                let addedNow = 0
                for (const t of occNow.tiles) {
                  const kNow = Math.round(t.x) + ',' + Math.round(t.y)
                  if (opts.occupiedPx && typeof opts.occupiedPx.add === 'function' && !opts.occupiedPx.has(kNow)) {
                    opts.occupiedPx.add(kNow)
                    addedNow++
                  }
                }
                await step(opts, steps, '  棋盘实测：站着人的格 ' + occNow.tiles.length + ' 个（新认 ' + addedNow + ' 个）')
              } else {
                await step(opts, steps, '  棋盘实测没成：' + (occNow.error || '未知') + ' → 只能靠账本挑人')
              }
            } catch (e) {
              await step(opts, steps, '  棋盘实测出错（' + e.message + '）→ 只能靠账本挑人')
            }
          }
          if (recallSwapCount >= maxRecalls) {
            await step(opts, steps, '  名额 0，本回合已撤回换人 ' + recallSwapCount + ' 次（上限 ' + maxRecalls + '）→ 收手（不反复撤）')
            if (last && last.round) QUOTA_STUCK_ROUND = Number(last.round)
            break
          }
          // 场上重复干员先撤：同名对盟约计数没贡献，撤下来再上新的纯赚。
          const bsAll = (Array.isArray(opts.boardSlots) ? opts.boardSlots : []).filter((b) => b && b.name && Array.isArray(b.px))
          const nameCnt = new Map()
          for (const b of bsAll) nameCnt.set(b.name, (nameCnt.get(b.name) || 0) + 1)
          const dupBoard = bsAll.filter((b) => (nameCnt.get(b.name) || 0) >= 2)
          let recallOk = false
          if (opts.recall !== false && dupBoard.length) {
            const victim = dupBoard[dupBoard.length - 1]
            recallOk = await recallViaBench(victim.px, victim.name)
            if (recallOk) await step(opts, steps, '  名额 0 → 撤回重复的 ' + victim.name + '（省下 1 个名额）→ 本回合正常上人')
          }
          if (!recallOk && opts.recall !== false) {
            // 时间闸门以前写死 45s/55s，而布阵实测 35~105s —— 走到这里早就超时，撤回一次都没执行过。
            // 改成跟布阵收手同一个预算口径（至少 90s），够就撤一次。
            const usedNow = Date.now() - DEPLOY_ROUND_T0
            const budgetNow = Math.min(120000, Math.max(90000, 175000 - (DEPLOY_ROUND_T0 - REST_T0)))
            if (usedNow >= budgetNow) {
              await step(opts, steps, '  名额 0，但布阵已用 ' + Math.round(usedNow / 1000) + 's（预算 ' + Math.round(budgetNow / 1000) + 's）→ 不再撤回，本回合收手')
              if (last && last.round) QUOTA_STUCK_ROUND = Number(last.round)
              break
            }
            const rp = planRecallSwap({
              bench: deck.slice(0, Math.min(deck.length, 8)).map((x, k) => ({ name: x && x.name, index: k })).filter((x) => x.name),
              board: bsAll,
              covenants: Array.isArray(activeCov) ? activeCov : [],
              round: Number(opts.roundNo) || 0,
              occupiedPx: opts.occupiedPx,
              avoidAdd: swapAdds,
            })
            if (!rp || !rp.drop || !Array.isArray(rp.drop.px)) {
              await step(opts, steps, '  名额 0 → 挑不出该撤的人（' + ((rp && rp.reason) || '账本/占格都空') + '）→ 本回合收手')
              if (last && last.round) QUOTA_STUCK_ROUND = Number(last.round)
              break
            }
            recallOk = await recallViaBench(rp.drop.px, rp.drop.name || '', rp.reason)
            if (recallOk && rp.add && rp.add.name) swapAdds.push(String(rp.add.name))
          }
          if (!recallOk) {
            await step(opts, steps, '  名额 0 → 撤回也没成 → 本回合收手（不再拖已占格，实测全败）')
            if (last && last.round) QUOTA_STUCK_ROUND = Number(last.round)
            break
          }
        }
        if (remaining == null) {
          if (triedFallback) break
          triedFallback = true
          remaining = 1
          await step(opts, steps, '  槽位读不出来，试放 1 个看有没有名额')
        }
      }
      // 2026-11-15 00:4x（用户 m08866「台下的高阶干员怎么就不上」）：名额只剩 1 个时也主动换一次人。
      // 以前只有名额 0 才撤 —— 实测第 9~12 回合名额恒为 1，整备区 3~4 阶的牌一张都上不去，名额白扔。
      // 判据沿用 planRecallSwap（它自己会拒掉「换人不划算」），撤成功名额回到 2，再照常布阵。
      if (remaining === 1 && opts.recall !== false && recallSwapCount < maxRecalls && Array.isArray(opts.boardSlots) && opts.boardSlots.length) {
        try {
          const rp1 = planRecallSwap({
            bench: deck.slice(0, Math.min(deck.length, 8)).map((x, k) => ({ name: x && x.name, index: k })).filter((x) => x.name),
            board: opts.boardSlots.filter((b) => b && b.name && Array.isArray(b.px)),
            covenants: Array.isArray(activeCov) ? activeCov : [],
            round: Number(opts.roundNo) || 0,
            occupiedPx: opts.occupiedPx,
            avoidAdd: swapAdds,
          })
          if (rp1 && rp1.drop && Array.isArray(rp1.drop.px)) {
            const ok1 = await recallViaBench(rp1.drop.px, rp1.drop.name || '', '名额 1 也换：' + (rp1.reason || ''))
            if (ok1) {
              remaining = Math.max(2, remaining)
              if (rp1.add && rp1.add.name) swapAdds.push(String(rp1.add.name))
              await step(opts, steps, '  名额只有 1 也换了人：' + (rp1.drop.name || '') + ' 下 → 名额 ' + remaining + '，继续布阵')
            }
          }
        } catch (e) { await step(opts, steps, '  名额 1 换人出错（' + e.message + '）→ 照常布阵') }
      }
      // 接手局（名字账本空）先把人认出来：不认就只剩池序，远程会被塞进近战格（用户 m01079 骂的就是这个）。
      // 认人 = 轻按每张牌读详情面板大字名字（run.js identifyDeck），一局只试一次。
      // 风险已知：identifyDeck 会把状态机临时推进 wz_buydetail（2026-11-10 16:35 真踩过），
      // 所以认完立刻验状态；不在休整期就整局停手，绝不带着半开的面板往下跑。
      // 失败允许下回合再试，但一整局最多 3 次（每次 14~50s，别把回合时间全花在认人上）。
            // 2026-11-13 08:0x：认人一次 20s 上下（要连点 10 张甲板牌 + 一次整屏 OCR）。只有「认不出的牌 ≥2 张」
      // 才值得花这笔，单张漏账按池序补位就够（座位只差一格，20s 更亏）。
      const unknownN = deck.filter((x) => !x || !x.name).length
      // 2026-11-13 09:3x：门槛从 unknownN>=2 收回 >=1 —— 实测甲板只有 1 张无名牌时整代都不触发认人，
      // 于是整局 9 个回合全是「上场 #1 → 随便一个格」，站位全丢（trace-night-13T01-09-59）。
      // 现在整代只认一次（IDENTIFY_TRIES < 1），一次约 20s，换回整局的站位正确性。
      // 2026-11-13 16:0x：整代最多试 2 次（第一次失败且无名牌 ≥2 才再来一次），别把整局时间花在认人上。
      const identifyCap = IDENTIFY_TRIES >= 1 ? 2 : 1
      // 2026-11-14 18:5x 真机（.tmp/verify-boss3.log 每回合「整备区张数不可信 → 沿用上次 0 张」）：
      // 旧闸门要求 benchLeft > 0，而 deck.py 在空甲板/遮挡时永远给 0 → 认人一次都没触发 → 全牌无名
      // → 排位退回池序，远程（灰喉/陨星）被塞进前排地面格（用户 m06708 骂的就是这个）。
      // 现在只要「甲板上有牌」就认：账本有数、有无名牌、或扫到了牌位（sc.chips）三者任一即可。
      if (!identifyTried && IDENTIFY_TRIES < identifyCap && (benchLeft > 0 || unknownN > 0 || (Array.isArray(sc.chips) && sc.chips.length > 0)) && (!deck.length || unknownN >= (IDENTIFY_TRIES >= 1 ? 2 : 1))) {
        IDENTIFY_TRIES += 1
        let id = null
        // 2026-11-13 16:0x 真机（.tmp/deckocr-probe.png 是战斗帧，休整帧同理）：
        // 整备区（甲板）上只有干员小人和 Ⅰ/Ⅱ/Ⅲ 阶牌，**没有名字文字** —— 名字只出现在商店卡（y≈1008）和
        // 点开的详情面板里。所以「一张截图认整排」这条快路对甲板无效（只会白花 7s），
        // 认人还是得逐张轻按读详情面板。identifyDeckByOcr 保留给别处用，这里不再调。
        try {
        const guessChips = planDeckChips((loadGameMap() || {}).id, false, Math.max(1, deck.length))
        const tId = now()
        // 2026-11-13 23:5x：count 原来只取 deck.length（账本张数），账本只剩 2 张时只点 2 张牌，
        // 甲板上另外 4 张永远认不出来。改成取「账本张数」和「甲板实际张数」的较大者。
        id = await identifyDeck({ chips: undefined, count: Math.max(1, deck.length, Array.isArray(sc.chips) ? sc.chips.length : 0), shopOpen: false, useDeckLayout: guessChips !== null })
        phaseLog('认人', tId, 'deck ' + deck.length)
      } catch (e) { id = { ok: false, error: String((e && e.message) || e) } }
        const idUnits = (id && id.ok && Array.isArray(id.units)) ? id.units.filter((u) => u && u.name).sort((a, b) => a.x - b.x) : []
        if (idUnits.length) {
          // 2026-11-12 19:36：identifyDeck 每张牌各点一次，读回条数可能多于/少于甲板牌数（实测 4 条名字对 1 张牌）。
          // 按下标硬配会把名字挂到错的人身上 —— 那正是「重装在后、远程在前」的病根。
          // 所以先用「与甲板牌 x 最近」配对（容差 140px），配不上才退回下标。
          const deckChipsX = (Array.isArray(sc.chips) ? sc.chips.slice().sort((a, b) => a.x - b.x) : []).map((c) => c.x)
          const usedUnit = new Set()
          const pickUnitFor = (k) => {
            const tx = deckChipsX[k]
            if (tx != null) {
              let best = null
              let bd = 1e9
              for (const u of idUnits) {
                if (usedUnit.has(u)) continue
                const d = Math.abs(u.x - tx)
                if (d < bd) { bd = d; best = u }
              }
              if (best && bd <= 140) { usedUnit.add(best); return best }
              return null
            }
            const u = idUnits[k]
            if (u && !usedUnit.has(u)) { usedUnit.add(u); return u }
            return null
          }
          // 2026-11-12 20:1x 实测（trace-cont-12-10-02）：deck 只有 2 条（本进程买过的），甲板却有 8 张。
          // 而下游 names 是「右对齐补空」（假定 deck 条目=最新买的在右边）→ 最左 2 张被补成空名，
          // 认人明明认得出来，排位还是跳过。认完人就直接按「甲板 x 序」重建整份 deck，长度对齐甲板张数，
          // 下游的右对齐分支就不再触发（2026-11-12 20:0x 的 2/2 回填就是这么白填的）。
          let filled = 0
          let ledgerKept = 0
          let conflict = 0
          {
            const n = Math.max(deckChipsX.length, idUnits.length)
            // 2026-11-13 00:4x（夜里实测）：identifyDeck 连点 10 张牌时有 4 张读回同一个名字
            // （「青枳×4」「角峰×3」都是这么来的），按 OCR 覆盖账本会把名字挂错人。
            // 账本是「买到就记、上场才删」，顺序就是甲板左→右 → 优先用账本名，OCR 只补空位。
            const ledNames = deck.map((x) => (x && x.name ? String(x.name) : ''))
            deck.length = 0
            for (let k = 0; k < n; k++) {
              const u = pickUnitFor(k)
              const ocrName = u && u.name ? String(u.name) : ''
              const led = ledNames[k] || ''
              const name = led || ocrName
              if (led) ledgerKept += 1
              else if (ocrName) filled += 1
              if (led && ocrName && led !== ocrName) conflict += 1
              deck.push({ index: deckSeq++, name })
            }
          }
          IDENTIFY_TRIES = 99 // 认成了就别再认（一局只认一次名字；后面靠账本+OCR 补）
          await step(opts, steps, '  认人：' + idUnits.map((u) => u.name + (u.cls ? '(' + u.cls + ')' : '')).join('、') + ' → 账本留 ' + ledgerKept + ' 张、OCR 补 ' + filled + '/' + deck.length + ' 张' + (conflict ? '（OCR 与账本不符 ' + conflict + ' 处，按账本）' : '') + (deckChipsX.length ? '（甲板 x=' + deckChipsX.map((x) => Math.round(x)).join(',') + '）' : ''))
        } else {
          await step(opts, steps, '  认人失败（' + ((id && (id.error || id.reason)) || '没读到名字') + '）→ 本局按池序布阵')
          // 失败也别再试第二次（一次 20~27s，休息期总共才 70s）：留着按池序布，下回合靠账本补。
          IDENTIFY_TRIES = Math.max(IDENTIFY_TRIES, 3)
        }
        const stId = peek()
        if (stId.state !== 'wz_rest' && stId.state !== 'wz_prep') {
          // 2026-11-12 20:0x 实测（trace-cont-11-59-40）：认完 7 张牌后停在 wz_buydetail（详情面板没关），
          // 这里还写了 stop = …（autoRest 里没有 stop 变量，当场 ReferenceError，整局崩在回合中）。
          // 现在先自己试着把面板关掉，关不掉才收手。
          let back = stId.state
          try {
            tap(965, 240)
            await sleep(900)
            back = peek().state
          } catch { /* 关不掉就看下面的判断 */ }
          if (back !== 'wz_rest' && back !== 'wz_prep') {
            const why = '认人后没停在休整期（' + back + '），停手'
            steps.push(why)
            break
          }
          steps.push('  认人后面板没关（' + stId.state + '）→ 点 965,240 关掉，回到 ' + back)
        }
      }
      // 2026-11-11 18:50：把甲板队列（带人名）传下去，才能按「医疗在左→远程→近战 + 各人攻击范围」排位。
      // 传空壳数组时 name 全是空串，只能退回覆盖序。
      // 2026-11-14（用户 m05970）：换人不再走「把甲板牌拖到已占格」——真机反复全灭（牌拎不起来/游戏拒收）。
      // 名额 0 时改由下面「撤回再部署」接手：撤回一个腾名额，再用正常部署补上更好的。
      // deployFromDeck 的 replace 能力保留（函数没删），这里不再传参、也不再算 swapHead/swapPx。
      // 2026-11-12 23:4x：以前甲板账本空就塞 benchLeft 个空壳进去，壳用完就丢 →
      // 账本永远是空的，deployFromDeck 里新加的「按真实甲板张数校准」也就没有对象可校准。
      // 直接传真账本，缺的张数由 deployFromDeck 自己补无名牌（补进来的是真实牌，能记住）。
      // 2026-11-13 00:5x：账本比整备区短（认人失败 / 漏账）时补无名牌占位，否则 budget=Math.min(deck.length,…)=0
      // → 2 秒就返回「布阵：上场 0 个」，整备区的牌白躺一个回合。
      // 每回合重新开始记死格：上一回合「这格没拎起来」多半是那张牌的问题（同名干员/装备卡），
      // 攒在内存里会越攒越多，最后把整张图剔空（见下面忽略死格记忆那段）。
      clearDeadTiles()
      // 布阵前的「甲板折叠」闸门结果：三次折不上就不布阵（见下面那段）。
      let deployFoldBlocked = false
      if (deck.length < benchLeft) {
        const padN = benchLeft - deck.length
        for (let k = 0; k < padN; k++) deck.push({ index: deckSeq++, name: '' })
        await step(opts, steps, '  账本 ' + (benchLeft - padN) + ' 张 < 整备区 ' + benchLeft + ' 张 → 补 ' + padN + ' 张无名牌占位')
      }
      // 用户硬要求（m06286）：放干员之前商店必须是折叠态。买卡过程中会反复展开，这里再确认一次。
      // 2026-11-14 00:3x 真机（trace-night-2026-11-13T15-54-07 第 5 回合）：这段以前只点一次「收起」、
      // 折完不复核。结果布阵时甲板还是展开态的大卡（那帧上还写着「收起」），按大卡按下去全被当成
      // **单击** —— 一张「坚守盾牌」的详情面板弹在左边盖住半屏，整回合 0 上场、白烧 42s。
      // 常态必须是折叠态：甲板变回木台上站着的小人，按压点（徽章 +99）落在身体上才拖得起来。
      // 现在最多试 3 轮、每轮都复核；三次还折不上就本回合不布阵，别再盲按。
      try {
        for (let kf = 0; kf < 3; kf++) {
          const stFold = await senseRun(null)
          if (!stFold || !stFold.ok) break
          if (!shopIsOpen(stFold)) { deployFoldBlocked = false; break }
          await step(opts, steps, '  布阵前折叠甲板面板（第 ' + (kf + 1) + ' 次，底排亮度 ' + (stFold.shopBrightness == null ? '?' : stFold.shopBrightness) + '）')
          await ensureShop(false, stFold, steps, opts)
          await sleep(600)
          deployFoldBlocked = true
        }
        if (deployFoldBlocked) {
          const stAfter = await senseRun(null)
          if (stAfter && stAfter.ok && !shopIsOpen(stAfter)) deployFoldBlocked = false
        }
        if (deployFoldBlocked) await step(opts, steps, '  ⚠ 甲板面板三次都没折起来 → 本回合不布阵（展开态按下去只会弹详情面板）')
      } catch { /* 读不到就按调用方状态 */ }
      const deckForDeploy = deck
      // 布阵内部用 note() 写细账，它靠 opts.trace 找目录；这里以前漏传，导致「上场 #1 …」一行都没落盘。
      const d = deployFoldBlocked
        ? { ok: false, steps: ['  布阵跳过：甲板面板没折叠（展开态按卡片只会弹详情面板）'], placed: 0 }
        : await timed('deployFromDeck(final)', () => deployFromDeck(deckForDeploy, {
        facing: opts.facing || 'right',
        slotsLeft: Math.min(benchLeft, remaining),
        chips: undefined,   // 折叠后重新扫甲板（旧的 sc.chips 可能是商店展开时扫的，按下永远拎不起来）
        tiles: greenTiles || undefined,
        round: last && last.round,
        holdStartMs: opts.deployHoldMs,
        smart: opts.smart === true,
        freeScan: false,
        shopOpen: false,
        roster,
        board,
        trace: opts.trace,
        occupiedPx: opts.occupiedPx,
        // 2026-11-14：换人改走「撤回再部署」，不再把牌拖到已占格（replace/replacePx/headName 已停用）。
        boss,
        boardSlots: Array.isArray(opts.boardSlots) ? opts.boardSlots : [],
        recalledThisRound: recallSwapCount > 0,
      }))
      for (const sl of d.steps) { steps.push(sl); note(opts, sl) }
      if (d.benchUnknown) benchTrusted = false
      // 拖不上去（大多是被上几回合的人占着）的格记到磁盘，下一代进程不用重新踩一遍。
      // 2026-11-13 09:5x：死格是「这张牌没拎起来」的临时判断，不跨回合、也不跨进程持久化
      // （持久化后攒到 11 个就把整张图剔空，连续四回合 0 上场）。占格由 slot-ledger 负责。
      // try { saveDeadTiles() } catch { }
      // 本局已经站人的格记下来，下一轮/下一个别再往里拖（tile 是像素坐标，直接按 px 记）。
      if (opts.occupiedPx && Array.isArray(d.placedCells)) for (const c of d.placedCells) opts.occupiedPx.add(c[0] + ',' + c[1])
      if (Array.isArray(d.placedNames) && Array.isArray(d.placedCells)) {
        const nSlot = Math.min(d.placedNames.length, d.placedCells.length)
        for (let s = 0; s < nSlot; s++) {
          const nm = d.placedNames[s]
          if (!nm) continue
          deployedSlots.push({ name: nm, px: [d.placedCells[s][0], d.placedCells[s][1]] })
        }
      }
      // 2026-11-15 04:3x（用户 m08866 验收「凑出 3 个盟约并叠层」）：
      // 真机 trace 19-10-23 从第 6 回合起「盟约账（场上 1 + 整备区 6）」—— 场上账本里只剩 1 个人，
      // 而画面明明站着 8~9 个。根因：deployedSlots 是「本回合」的临时数组，只作为 placedSlots 往外交，
      // 从来没并进 opts.boardSlots（跨回合账本只从 slot-ledger 恢复，而新开局那份是空的）。
      // 于是盟约账恒为 0~1 人 → 看不出有哪些盟约已激活、也谈不上保护和叠层。
      // 上阵成功就记进跨回合账本（按 px 去重），账实一致后盟约账才有意义。
      {
        const bsArr = Array.isArray(opts.boardSlots) ? opts.boardSlots : null
        if (bsArr && Array.isArray(d.placedNames) && Array.isArray(d.placedCells)) {
          const n2 = Math.min(d.placedNames.length, d.placedCells.length)
          let added2 = 0
          for (let s2 = 0; s2 < n2; s2++) {
            const nm2 = d.placedNames[s2]
            if (!nm2) continue
            const px2 = [d.placedCells[s2][0], d.placedCells[s2][1]]
            const dup2 = bsArr.some((b) => b && Array.isArray(b.px) && Math.abs(Number(b.px[0]) - px2[0]) <= 25 && Math.abs(Number(b.px[1]) - px2[1]) <= 25)
            if (dup2) continue
            bsArr.push({ name: String(nm2), px: px2 })
            added2 += 1
          }
          if (added2) note(opts, '  场上账本 +' + added2 + '（现在 ' + bsArr.length + ' 个有名有格的）')
        }
      }
      // 换人：被换下来的那个格不再是「我们的人」，记下来让外层把账抹掉。
      if (d.replacing && Array.isArray(swapPx)) droppedPx.push(swapPx.slice())
      // 账本虚高（整备区其实空了，账上还挂着 N 张）→ 清掉，别让下几个回合继续空转。
      if (d.deckStale && deck.length && !(Number(benchSeen) > 0)) {
        await step(opts, steps, '  账本 ' + deck.length + ' 张与甲板不符（扫不到牌）→ 清空账本，按空整备区走')
        deck.length = 0
      }
      const got = d.placed || 0
      lastPlaced = got
      deployed += got
      // 换人不吃名额（换的是场上已占位置），配额不该减。
      if (got && !d.replacing) remaining = Math.max(0, Number(remaining) - got)
      // 2026-11-12 20:0x 实测（trace-cont-11-59-40 第 9/10 回合）：名额 0 时每轮都走换人，
      // 而换人不减 remaining → 同一批牌位被反复替换 6 轮（一轮 13s，白烧 80s，甲板张数还不减）。
      // 一回合只换一轮就收手。
      if (got && d.replacing) {
        await step(opts, steps, '  换人完成（本回合只换这一轮，' + got + ' 个）→ 收工')
        break
      }
      // 试放成功 = 有额度但不知道有多少：把 remaining 放开，下一轮继续按 1 个 1 个试，
      // 直到某一轮试不上去（triedFallback 已置位）才收手。loop guard 6 兜住总量。
      if (got && triedFallback) { remaining = Math.max(1, benchLeft - got); triedFallback = false }
      // 2026-11-14 01:3x 真机（本局 R5~R9：布阵 87~105s，其中一大截是白烧）：名额已经读成 0，
      // 循环还会拿下一张牌连试 3 格（每格约 5.8s ≈ 17s）才放弃，白白吃掉整回合预算。
      // 名额 0 时唯一有效的动作是「撤回一个腾名额」（撤回手势真机已多次成功），所以这里直接回到
      // guard 循环顶部，让下面「名额 0 → 撤回最弱」那段接手，而不是继续盲试牌。
      if (got && remaining != null && Number(remaining) <= 0) {
        if (deployed < 3 && Date.now() - DEPLOY_ROUND_T0 < 70000) {
          await step(opts, steps, '  名额用尽（已上 ' + deployed + ' 个）→ 不盲试下一张，回去撤一个腾名额')
          continue
        }
        await step(opts, steps, '  名额用尽（已上 ' + deployed + ' 个）→ 本回合到此为止')
        break
      }
      // 一回合布阵总时长封顶 45s（见 DEPLOY_ROUND_T0）
      // 2026-11-13 15:5x（提速 + 上人率）：封顶不再固定 45s，改成「休息期总预算 70s，布阵最多用到 66s」。
    // 固定 45s 时常见「还剩 4 个名额没用完就收手」，而多上一个干员比少刷一次店值钱。
    // 2026-11-13 16:0x：布阵起步晚（买卡/升级吃掉 45s）时，原来只剩 20s 就收手 → 名额浪费、整备区越堆越多。
// 改成「至少给布阵 35s，且总预算不超 66s」。
    // 2026-11-13 21:5x：加两条硬闸门 —— >90s 记 WARN（目标是布阵 <=60s、整回合 <=70s），
    // >120s 直接强制收手，别让一个回合烂在那里把整局拖停。
    const deployUsed = Date.now() - DEPLOY_ROUND_T0
    if (deployUsed > 130000) { try { perf('WARN 布阵已 ' + Math.round(deployUsed / 1000) + 's（目标 <=60s，整回合 <=70s）') } catch { /* 没 perf 就算了 */ } }
    // 2026-11-15 04:0x（用户 m08866 验收标准「凑出 3 个盟约并叠层」）：
    // 真机 trace 19-10-23 每回合都在「剩 3 个名额 / 布阵已用 124s」收手 —— 场上只有 4~5 人，
    // 三个核心盟约各 1/3 永远凑不齐。凑盟约靠的是「场上人数 × 盟约分布」，先把剩下的名额用完再说：
    // 布阵至少给 140s、整回合总预算 215s，硬上限抬到 250s（休整期没有倒计时，多上一个人 > 省 30s）。
    if (deployUsed > 250000) {
      await step(opts, steps, '  本回合布阵已用 ' + Math.round(deployUsed / 1000) + 's（>250s 硬上限）→ 强制收手')
      break
    }
    // 2026-11-14 00:2x：布阵实测每上一个干员 ~5.8s（棋盘实测后基本一次成功）。
    // 原来「至少 35s、总预算 66s」把还剩 6 个名额的回合直接掐断 → 改为「至少 60s、总预算 115s」，先把人上满再谈提速。
    if (deployUsed > Math.max(140000, 215000 - (DEPLOY_ROUND_T0 - REST_T0))) {
        await step(opts, steps, '  本回合布阵已用 ' + Math.round(deployUsed / 1000) + 's → 收手（剩 ' + (remaining == null ? '?' : remaining) + ' 个名额留到下回合）')
        break
      }
      slotsNow = remaining
      if (!got) {
        if (remaining != null && Number(remaining) <= 0 && last && last.round) QUOTA_STUCK_ROUND = Number(last.round)
        break
      }
      // 2026-11-12 19:1x 实测（trace-11-03-53 第 4 回合）：原来这里整队清空，可这一轮只上了 1 张，
      // 甲板还剩 1 张（风絮）就丢了名字账本 → 之后每回合「整备区 1 张但 deck 空」→ 永远不布阵。
      // 只清掉真上场的那些（队列按甲板左→右取，所以从前面 remove）。
      if (Array.isArray(d.placedNames) && d.placedNames.length) {
        for (const nm of d.placedNames) {
          const k = deck.findIndex((x) => x && x.name === nm)
          if (k >= 0) deck.splice(k, 1)
        }
      } else if (got > 0) deck.splice(0, Math.min(got, deck.length))
      if (Array.isArray(d.swappedOut) && d.swappedOut.length) {
        for (const so of d.swappedOut) {
          if (so && so.name) {
            deck.push({ index: deckSeq++, name: so.name })
            await step(opts, steps, '  换下的 ' + so.name + ' 记回整备区账本（现在 ' + deck.length + ' 张）')
          }
        }
      }
    }
    phaseLog('布阵', DEPLOY_ROUND_T0, '上场 ' + deployed + ' 剩名额 ' + (remaining == null ? '?' : remaining))
    // 2026-11-12：布阵结果固定一行，方便事后复盘「这回合到底上没上人」。
    await step(opts, steps, '  布阵：上场 ' + deployed + ' 个，整备区剩 ' + (benchSeen == null ? '?' : benchSeen) +
      (benchTrusted ? '' : '（数字不可信）') + ' 张，剩余名额 ' + (remaining == null ? '?' : remaining))
    if (!deployed && benchSeen != null && benchSeen > 0 && benchTrusted && !quotaCooling) {
      await step(opts, steps, '  布阵失败告警：整备区有 ' + benchSeen + ' 张但一个都没上去')
      try { perf('布阵失败告警：整备区 ' + benchSeen + ' 张、剩余名额 ' + (remaining == null ? '?' : remaining) + '，上场 0') } catch { /* 没有 perf 就只走 steps */ }
    }
    // 2026-11-13 12:xx 用户 m05472「每一个回合都可以调整场上的站位」：布完阵再看一眼站位对不对，
    // 站错区的（重装站到远程格之类）拖过去互换。一次最多 2 对，超时就不做（休息期 ≤70s 优先）。
    if (opts.swap !== false && Date.now() - REST_T0 < 95000) {
      try {
        if (boss) {
          // 2026-11-14 18:2x：BOSS 回合名额早就 0，唯一能调的只有场上互换（不花名额）。
          const bw = await bossSwapOnce({ slots: Array.isArray(opts.boardSlots) ? opts.boardSlots : [], steps, opts })
          if (bw && (bw.moved || bw.msg)) await step(opts, steps, '  BOSS 站位：' + bw.msg)
        } else {
          const sw = await swapBoardOnce({ slots: Array.isArray(opts.boardSlots) ? opts.boardSlots : [], steps, opts })
          if (sw.moved) await step(opts, steps, '  站位互换：' + sw.msg)
        }
      } catch (e) {
        await step(opts, steps, '  站位互换没做成（' + e.message + '）→ 跳过')
      }
    }
    try {
      if (deployed) {
        saveRoster(opts.roster || roster)
        saveBoard(opts.board || board)
        await step(opts, steps, '  名册/棋盘已落盘（' + Object.keys((opts.roster || roster).units || {}).length + ' 人）')
      }
    } catch (e) {
      await step(opts, steps, '  名册落盘失败：' + e.message)
    }
  }
  // 休息期总耗时（用户 m04520 要求 ≤70s）：每回合打一行，方便直接对账。
  try { perf('REST round ' + (last && last.round) + ' 用时 ' + ((Date.now() - REST_T0) / 1000).toFixed(1) + 's（Lv' + level + '，上场 ' + deployed + '）') } catch { /* 没 perf 就算了 */ }
  try {
    const restMs = now() - REST_T0
    perf('PHASE 休息期总计 ' + restMs + 'ms（第 ' + (last && last.round) + ' 回合，Lv' + level + '）')
    if (restMs > 70000) perf('WARN 休息期 ' + Math.round(restMs / 1000) + 's 超过 70s 目标')
  } catch { /* 没 perf 就算了 */ }
  return {
    ok: true, steps, last, centerLevel: level, deployed, deckLeft: deck, deckSeq, bought,
    covenants: activeCov, wantNames: wantList.map((w) => w && w.name).filter(Boolean),
    // 2026-11-12 19:5x：装备件数以前没往外传 → 下一回合 equipCount 又归 0，
    // 闸门（i===0 && equipCount>0）永远不成立，装备一次都没装过。现在把它交出去。
    equipCount,
    // 场上账本：{name, px} 逐个交出去；换人换掉的那几格单独给，外层要抹账。
    placedSlots: deployedSlots,
    droppedPx,
  }
}

/**
 * 打一整局：休整期买东西 → 打完这回合 → 下一个休整期 …… 直到结算或到上限。
 * 每回合记 {round, money, hp, bought, result}，最后交给 wz_review。
 */
export async function autoRun(opts = {}) {
  // 2026-11-13：默认跑满 14 个休整期（第 14 回合 = BOSS 关）。原来默认 12，自动跑永远到不了 boss 关。
  const maxRounds = Math.max(1, Number(opts.maxRounds) || BOSS_ROUND)
  const totalRounds = Number(opts.totalRounds) || BOSS_ROUND
  const battleMs = Math.max(30, Number(opts.maxBattleSeconds) || 150) * 1000
  const log = []
  const rounds = []
  const owned = {}
  let settleResult = null   // 结算页读数（cleared / passedRounds），打通与否看它
  // 新起一个进程时根本不知道当前中心几级，而等级决定商店格数（3+等级），一处错全盘错。
  // 用 OCR 算出的 firstSlotLeft 反推格数最稳：firstSlotLeft = 1407 - (n-1)*240。
  let level = Math.max(1, Number(opts.centerLevel) || 1)
  if (!opts.centerLevel) {
    const boot = await senseRun()
    if (boot.ok && boot.screen === 'rest' && boot.firstSlotLeft != null) {
      const n = Math.round((1407 - Number(boot.firstSlotLeft)) / 240) + 1
      if (n >= 3 && n <= 9) level = Math.max(1, Math.min(6, n - 3))
      log.push('开机自检：商店 ' + n + ' 格 → 推定调度中心 Lv' + level)
    }
  }
  // 2026-11-14 20:5x（用户 m07730「为什么每次都不凑盟约」）根因：目标盟约一直取自休整期顶栏，
  // 而顶栏只列「已经有人的」盟约 —— 目标清单是从已拥有的反推出来的，结构上就凑不进新盟约。
  // 本局真正可用的 4 个核心盟约在开局 1/3 页（run.js 选组）就定死了，那里已落盘 data/run-covenants.json，
  // 这里读回来并进 activeCov，买卡/换人才会真的往这 4 家里凑。
  try {
    const covPath = fileURLToPath(new URL('../data/run-covenants.json', import.meta.url))
    const rc = JSON.parse(readFileSync(covPath, 'utf8'))
    const age = Date.now() - Date.parse(rc && rc.at)
    const cores = ((rc && rc.cores) || []).map((x) => String(x || '').trim()).filter(Boolean)
    if (Number.isFinite(age) && age >= 0 && age < 8 * 60 * 60 * 1000 && cores.length) {
      opts.coreCovenants = cores
      opts.activeCovenants = [...new Set([...(opts.activeCovenants || []), ...cores])]
      log.push('本局核心盟约（开局落盘）：' + cores.join(' ') + ' → 并入买卡目标')
      try {
        // 2026-11-14 23:1x（用户 m08805「照着别人的攻略流程走，不要自己凑盟约了」）：
        // 目标盟约的顺序、以及盟约权重，全部照攻略频次表（data/guide-covenant-rank.json），
        // 不再由我自己定优先级。
        const g = loadGuideRank()
        opts.guideWeight = guideWeightMap(g)
        opts.guideCovenants = guideTargets(cores, g)
        log.push('攻略盟约优先序（' + (g.source || '') + '）：' + opts.guideCovenants.slice(0, 8).join(' > '))
      } catch (e) { log.push('攻略盟约优先序读取失败：' + e.message) }
    }
  } catch { /* 没落盘就按顶栏走 */ }

  // 甲板队列跨回合保留：上个回合买了的，这个回合还在队列里（默认战场自动部署，不拖）
  let deck = []
  let deckSeq = 0
  // 这个回合之前已经买过、已经上场的干员数。整备区（甲板+上场）上限 10，超过就是白按。
  let boardCount = Number(opts.boardCount) || 0
  // 开局定一次的购物清单：按「能叠本局盟约 + 阶数」排，职业配额保证有坦/奶/输出。
  let wantList = []
  // 本局买过的装备件数（跨回合保留）：autoRest 的装备佩戴闸门看它，0 件时连扫都不扫。
  let equipCount = Number(opts.equipCount) || 0
  // 本局禁用干员（用户 m02645）：只扫一次，按盟约记数量，喂给买卡/换人的盟约权重。
  let bans = []
  let bansScanned = false
  if (opts.wantList === 'auto' || opts.wantList === true) {
    wantList = buildWantList({
      pool: operatorPool(),
      activeCovenants: opts.activeCovenants || [],
      quota: { 重装: 2, 医疗: 1, 狙击: 2, 术师: 2, 辅助: 1 },
      limit: 8,
    })
    log.push('目标阵容清单：' + wantList.map((w) => w.name + '(' + (w.cls || '?') + ')').join('、'))
    for (const w of wantList) log.push('  ' + w.name + ' — ' + w.why)
  } else if (Array.isArray(opts.wantList)) {
    wantList = opts.wantList
  }
  let lastHp = null
  let stop = ''

  // 接手（play-from-rest）时 deck 是空的：不先数一遍，买卡闸门会以为甲板空、一回合买 5 张，
  // 结果屏上弹「干员已满，无法继续调度干员」，多出来的还会在离开休整期时被清空
  // （2026-11-10 16:29 第 10 回合实测）。先认一遍甲板再进循环。
  // 本局已经站了人的格（像素坐标）。跨回合累积：回合里放上去的人不会自己下场，
  // 下一回合再往同一格拖只会白花 3.8s（trace-11-01-21 第 3 回合实测两次）。
  const occupiedPx = new Set()
  // 2026-11-12 22:xx（用户 m02613/m02617）：场上干员账本 {name, px}，盟约换人靠它挑「先换下谁」。
  // 只用我们自己拖上去的人；接手局里原有的干员没有名字，先不纳入。
  const boardSlots = []
  // 每次起局把死格清空（死格只在一次进程内有效：换局/重开地图后场上的人不一样了）
  clearDeadTiles()
  IDENTIFY_TRIES = 0
    GREEN_PROBED = false
  // 新进程接手旧局：把上一个进程记下的占格读回来，别再一张牌一张牌地重试。
  try {
    // 2026-11-13 09:5x：不再从 occupied-tiles.json 读死格（见 saveDeadTiles 注释）。
  const nLoaded = 0
    if (nLoaded) log.push('接手占格账：从 data/occupied-tiles.json 读回 ' + nLoaded + ' 个已占格，布阵时直接跳过')
  } catch { /* 读不回就从头认 */ }
  // 2026-11-13 00:1x（夜里续打实测）：上一代进程退出后，场上站着的人没有账本 →
  // 盟约换人挑不出「谁下」（只能退成「按最左牌换」）、盟约账也算漏他们。
  // 每回合把 {name,px} 落盘，新一代进程读回来（6 小时内才算，别把上一局的账带进来）。
  // 2026-11-13 12:2x 实测（trace-night-13T04-14-32 第 1 回合）：25 分钟内的 slot-ledger 照样会跨局 ——
  // 上一局刚打完（11:56）、20 分钟后新开一局，回合 1 就把上一局场上 9 个人读回来 →
  // 「候选格剔掉已占的 9 个」、医疗被挤到近战格。所以账本先不挂，等确认「这一局不是回合 1」再挂。
  let pendingSlots = []
  let pendingDeck = []
  let pendingDeckRound = null
  if (opts.resumeBoard !== false && !boardSlots.length) {
    try {
      const ledgerPath = fileURLToPath(new URL('../data/slot-ledger.json', import.meta.url))
      const raw = JSON.parse(readFileSync(ledgerPath, 'utf8'))
      const ageMs = Date.now() - Date.parse(raw && raw.at)
      // 2026-11-13 06:3x：账本曾累积到 22 条（换人改名 + 跨局残留）→ 盟约账、换人候选全被带歪。
      // 场上最多 8 个位置，恢复时只取最近 8 条。
      const slots = ((raw && raw.slots) || []).filter((x) => x && x.name && Array.isArray(x.px) && x.px.length === 2).slice(-8)
      // 2026-11-13 10:5x：原来 6 小时都算「接手局」，结果新开一局（回合 1、名额 8）时把上一局的
      // 场上 8 人读回来 → 同名规则把新买的牌全剔空（trace-night-13T02-43-04）。改成只认 25 分钟内，
      // 够覆盖「进程崩了/换代」的续打场景，不会把上一局的账带进来。
      if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < 25 * 60 * 1000 && slots.length) {
        pendingSlots = slots
        log.push('见到 slot-ledger 里 ' + slots.length + ' 个（' + slots.map((x) => x.name).join('、') + '）→ 确认是续打再挂上')
      }
    } catch { /* 没有账本就从空的开始 */ }
  }
  // 2026-11-13 08:1x：甲板名字账本落盘/读回。上一代进程只知道「甲板有 N 张」、名字全空 →
  // 每代都要花 ~20s 重新认人（连点 10 张牌 + 整屏 OCR），认错还会把近战/远程排反。
  if (!deck.length && opts.resumeDeck !== false) {
    try {
      const raw = JSON.parse(readFileSync(fileURLToPath(new URL('../data/deck-ledger.json', import.meta.url)), 'utf8'))
      const ageMs = Date.now() - Date.parse(raw && raw.at)
      const cards = ((raw && raw.deck) || []).filter((x) => x && x.name).slice(-10)
      // 2026-11-13 14:2x 实测：新开一局（第 1 回合）也把上一局的 6 张甲板读回来 →
      // 「整备区 6 张 / 场上满员放不上去」全靠假账，三回合 0 上场。改成先挂起，
      // 等读到回合号、确认是续打（≥2 回合）再挂上（和 slot-ledger 一个口径）。
      if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < 25 * 60 * 1000 && cards.length) {
        pendingDeck = cards.map((c) => String(c.name))
        pendingDeckRound = raw && raw.round != null ? Number(raw.round) : null
        log.push('见到 deck-ledger 里 ' + cards.length + ' 张（' + pendingDeck.join('、') + '）→ 确认是续打再挂上')
      }
    } catch { /* 没账本就照旧认人 */ }
  }
  if (!deck.length) {
    // 只数牌、不认人：认人要逐个轻按甲板（会弹出干员详情/购买详情），
    // 2026-11-10 16:35 那一轮就是这么把状态机推进 wz_buydetail、整局直接停掉的。
    // 2026-11-14 19:5x（真机实测，trace-night-2026-11-14T11-48-11）：新开一局开局**商店是展开的**，
    // 直接 scanDeckChips 会把 5 张商品卡当成整备区（rail.ok=false、lowConfidence=true、chips 5~6 个），
    // 种下 6 条空名假账 → 整备区 6/10 → BENCH_STOP_BUY=6 立刻命中 → 第 1 回合只买 2 张就收手，
    // 还「买 拜松 → 卖 拜松」空转一圈（整备区真实张数当时是 0~2）。
    // 现在：商店展开 / 低置信 任一成立都不种账（peek 里没有回合号，判不了第几回合），交给后面的认人步骤去认。
    const sc = await scanDeckChips()
    const shopOn = (() => { try { return SHOP_OPEN_NOW === true || shopIsOpen(peek()) } catch { return true } })()
    const reliable = !!(sc && sc.ok && sc.chips && !sc.lowConfidence && !shopOn)
    const n = reliable ? sc.chips.length : 0
    if (n) {
      deck = Array.from({ length: n }, () => ({ index: deckSeq++, name: '' }))
      log.push('接手：甲板已有 ' + n + ' 个（只数了牌，没认名字）')
    }
  }

  // 2026-11-15 00:3x（trace-night-2026-11-14T15-14-21 只跑 8 回合就退出、stop 为空）根因：
  // 「点完准备就绪 → 下一轮读到 wz_battle → 等战斗结束 → continue」这条分支不产出回合，
  // 却照样消耗一次 i。每次「准备就绪 + 等战斗」要吃掉两个 i，14 个 i 实际只打 7~8 回合就退出，
  // 永远到不了第 14 回合 BOSS 关（以前多局停在 9/11/12 回合也是这个原因）。
  // 现在改成「按真正打完的回合数收口」，i 只做计数，另加护栏防死循环。
  for (let i = 0; rounds.length < maxRounds; i++) {
    if (i > maxRounds * 3) {
      stop = '迭代 ' + i + ' 次还只打完 ' + rounds.length + ' 回合，停手（界面可能卡住了）'
      log.push(stop)
      break
    }    const cur = peek()
    if (cur.state === 'wz_settle') { stop = '结算了'; break }
    if (cur.state !== 'wz_rest' && cur.state !== 'wz_prep') {
      // 战斗态：休整期点完「准备就绪」后立刻认屏会读到 wz_battle（2026-11-10 16:18 第二局就
      // 这么在第 9 回合被整局掐断）。战斗本身要 1.5–2.5 分钟，30 秒的超时等不到，单独长等。
      if (/^wz_battle|^wz_warbanner/.test(cur.state || '')) {
        const b = await waitFor(['wz_rest', 'wz_prep', 'wz_settle', 'wz_tactic', 'wz_strategy'], { timeoutMs: 180_000, gapMs: 1500 })
        if (b.state === 'wz_settle') { stop = '结算了'; break }
        // 战斗后先弹「战术决策 3 选 1」再回休整期（19:06 第 8 回合就停在这）。选掉它继续。
        if (b.state === 'wz_tactic') {
          const tk = await pickTactic({ preferList: tacticPreference({ covenants: opts.activeCovenants }).order })
          log.push('战术决策（战斗后）：' + (tk.ok ? '选了第 ' + tk.picked + ' 张' : '没选成（' + tk.reason + '）'))
          const b2 = await waitFor(['wz_rest', 'wz_prep', 'wz_settle'], { timeoutMs: 40_000, gapMs: 1200 })
          if (b2.state === 'wz_strategy') {
            const sk2 = await pickStrategyMidRun(opts, '战斗后')
            log.push('中途选策略（战斗后，2/3）：' + (sk2 ? '点了第一张 + 确认' : '没点成'))
          }
          if (b2.state === 'wz_settle') { stop = '结算了'; break }
          if (b2.state !== 'wz_rest' && b2.state !== 'wz_prep') {
            stop = '战术决策后没回到休整期（' + b2.state + '），停手'
            log.push(stop)
            break
          }
          continue
        }
        if (b.state !== 'wz_rest' && b.state !== 'wz_prep') {
          stop = '战斗结束后没回到休整期（' + b.state + '），停手'
          log.push(stop)
          break
        }
        continue
      }
      // 其它过场（教学/切图/模态）：等一等再认
      let again = await waitFor(['wz_rest', 'wz_prep', 'wz_settle', 'wz_tactic', 'wz_strategy'], { timeoutMs: 30_000 })
      // 「战术决策 3 选 1」偶尔会在休整期之后再弹一次（2026-11-10 11:31 第 8 回合后撞到，
      // 旧代码直接判「不是休整期」整局停掉）。这里补一手：选掉它，再等回休整期。
      if (again.state === 'wz_tactic') {
        const tk = await pickTactic({ preferList: tacticPreference({ covenants: opts.activeCovenants }).order })
        log.push('战术决策（回合间）：' + (tk.ok ? '选了第 ' + tk.picked + ' 张' : '没选成（' + tk.reason + '）'))
        if (tk.ok) again = await waitFor(['wz_rest', 'wz_prep', 'wz_settle'], { timeoutMs: 25_000, gapMs: 1000 })
      }
      // 同上：中途「2/3 选择策略」也会插在这里（2026-11-15 10:0x）。
      if (again.state === 'wz_strategy') {
        const sk3 = await pickStrategyMidRun(opts, '回合间')
        log.push('中途选策略（回合间，2/3）：' + (sk3 ? '点了第一张 + 确认' : '没点成'))
        if (sk3) again = await waitFor(['wz_rest', 'wz_prep', 'wz_settle'], { timeoutMs: 30_000, gapMs: 1000 })
      }
      if (again.state === 'wz_settle') { stop = '结算了'; break }
      if (again.state !== 'wz_rest' && again.state !== 'wz_prep') {
        stop = '当前不是休整期（' + again.state + '），停手'
        log.push(stop)
        break
      }
    }
    const before = await senseRun()
    const roundNo = before.ok ? Number(before.round) || i + 1 : i + 1
    const money = before.ok ? Number(before.money) : null
    // 2026-11-13 12:3x：slot-ledger 只在确认是续打（回合 ≥2）时才挂上 ——
    // 新开一局回合 1 时它必然是上一局的账（trace-night-13T04-14-32 第 1 回合就被带歪）。
    if (i === 0 && pendingSlots && pendingSlots.length) {
      if (roundNo >= 2) {
        for (const sl of pendingSlots) {
          const px = [Number(sl.px[0]), Number(sl.px[1])]
          boardSlots.push({ name: String(sl.name), px })
          occupiedPx.add(px[0] + ',' + px[1])
        }
        log.push('接手局：从 slot-ledger 恢复场上 ' + pendingSlots.length + ' 个（' + pendingSlots.map((x) => x.name).join('、') + '）')
      } else {
        log.push('回合 1（新开一局）→ 不认上一局的 slot-ledger（' + pendingSlots.length + ' 个）')
      }
      pendingSlots = []
    }
    // 甲板账本同理：只有确认是续打（回合 ≥2，且不比落盘时更早）才挂上，否则新开一局会拿着上一局的牌。
    if (i === 0 && pendingDeck && pendingDeck.length) {
      const okRound = roundNo >= 2 && (pendingDeckRound == null || roundNo >= pendingDeckRound)
      if (okRound) {
        for (const nm of pendingDeck) deck.push({ index: deckSeq++, name: nm })
        IDENTIFY_TRIES = 99
        log.push('接手甲板：从 deck-ledger 挂上 ' + pendingDeck.length + ' 张（' + pendingDeck.join('、') + '）')
      } else {
        log.push('回合 ' + roundNo + '（新开一局）→ 不认上一局的 deck-ledger（' + pendingDeck.length + ' 张）')
      }
      pendingDeck = []
    }

    // 开局扫一遍「本局禁用干员」（用户 m02645：每次开局的禁用情况要扫一遍记起来）。
    // 名单只在本局信息面板里，扫一次约 15~25 秒，扫失败/关不回面板都不拦着打。
    if (i === 0 && !bansScanned && opts.scanBans !== false) {
      bansScanned = true
      try {
        const bn = await scanBans()
        if (bn.ok) {
          bans = Array.isArray(bn.groups) ? bn.groups : []
          const txt = bans.map((g) => (g.covenant || '未知') + '×' + g.count).join('、')
          log.push('本局禁用干员：' + (bn.total || 0) + ' 张' + (txt ? '（' + txt + '）' : ''))
          if (bn.json) log.push('  禁用清单已落盘 ' + bn.json)
        } else {
          log.push('扫禁用干员没成：' + bn.error + '（继续打）')
        }
      } catch (e) {
        log.push('扫禁用干员出错：' + e.message + '（继续打）')
      }
    }

    // setTrace 以前一直没人调（全仓库只有定义），所以 steps.jsonl 里的 total 恒为 0。接上。
    if (opts.trace) setTrace(opts.trace)
    const rest = await autoRest({
      // 2026-11-13：回合号要传下去 —— BOSS 关判定（roundNo === totalRounds）靠它，
      // 以前只传 totalRounds、不传 roundNo，autoRest 里拿不到当前是第几回合。
      roundNo,
      totalRounds,
      occupiedPx,   // 本局已站人的格（像素），跨回合累积
      owned, centerLevel: level, activeCovenants: opts.activeCovenants, pool: opts.pool,
      equipCount,   // 本局已买的装备件数（跨回合保留，否则装装备的闸门永远打不开）
      trace: opts.trace,   // 用户 m00832：休整期每一步都要截图（之前只有开战前那一张，就是这里漏传）
      deck, deckSeq, facing: opts.facing, boardCount, wantList,
      bannedCovenants: bans,   // 本局禁用干员（按盟约记数量），买卡时给对应盟约降权
      wantAuto: opts.wantList === 'auto' || opts.wantList === true,
      // 2026-11-12 m01970 第 3 条之后默认布阵；调用方显式 deploy:false 才关。
      deploy: opts.deploy !== false,
      // 场上账本（盟约换人 / 卡组统计都要用）
      boardSlots,
    })
    if (rest.centerLevel) level = rest.centerLevel
    if (Number.isFinite(Number(rest.equipCount))) equipCount = Number(rest.equipCount)
    if (rest.deployed) boardCount += Number(rest.deployed) || 0
    if (rest.deckLeft) deck = rest.deckLeft
    if (rest.deckSeq) deckSeq = rest.deckSeq
    // 场上账本更新：换下来的先抹掉，再记新上场的。
    if (Array.isArray(rest.droppedPx)) {
      for (const px of rest.droppedPx) {
        if (!Array.isArray(px)) continue
        const k = boardSlots.findIndex((b) => b && Array.isArray(b.px) && b.px[0] === px[0] && b.px[1] === px[1])
        if (k >= 0) boardSlots.splice(k, 1)
      }
    }
    if (Array.isArray(rest.placedSlots)) {
      for (const sl of rest.placedSlots) {
        if (!sl || !sl.name || !Array.isArray(sl.px)) continue
        const k = boardSlots.findIndex((b) => b && b.name === sl.name && Array.isArray(b.px) && b.px[0] === sl.px[0] && b.px[1] === sl.px[1])
        // 2026-11-13 03:2x 实测（trace-night-2026-11-12T19-11-46）：账本里攒出 730,340 与 750,340 这种
        // 相距 20px 的「两个人」，换人候选就只剩这两格、还都被拒。同一格（60px 内）只留一个。
        const near = boardSlots.findIndex((b) => b && Array.isArray(b.px) && Math.abs(b.px[0] - sl.px[0]) <= 60 && Math.abs(b.px[1] - sl.px[1]) <= 60)
        if (near >= 0) boardSlots[near] = { name: sl.name, px: sl.px.slice() }
        else if (k < 0) boardSlots.push({ name: sl.name, px: sl.px.slice() })
      }
    }
    // 场上账本落盘（新一代进程接手时读回，见上面 slot-ledger 那段）
    try {
      writeFileSync(fileURLToPath(new URL('../data/slot-ledger.json', import.meta.url)),
        JSON.stringify({ at: new Date().toISOString(), slots: boardSlots.slice(-8) }, null, 1))
    } catch { /* 落盘失败不影响打牌 */ }
    // 甲板名字账本（同上一代进程接手用，见 autoRun 开头 deck-ledger 那段）
    try {
      writeFileSync(fileURLToPath(new URL('../data/deck-ledger.json', import.meta.url)),
        JSON.stringify({ at: new Date().toISOString(), round: Number((last && last.round) || (cur && cur.round)) || null, deck: deck.filter((x) => x && x.name).map((x) => ({ name: String(x.name) })) }, null, 1))
    } catch { /* 落盘失败不影响打牌 */ }
    if (!rest.ok) log.push('休整期处理失败：' + rest.error)
    log.push(...rest.steps)

    // rest.bought 只记录干员（装备不进 deck）；旧写法从「→ buy：理由」里拿到的是理由文案不是卡名（
    // 2026-11-11 12:24 实测打出 ['装备不占整备区，先把 1 块变成战力：维式重锤', 同上]'）。改成从结果行取名。
    const bought = Array.isArray(rest.bought) && rest.bought.length ? rest.bought
    : rest.steps
        .map((s) => String(s))
        .map((s) => {
          const m = s.match(/^\s*买到 (\S+?)（/)
          if (m) return m[1]
          const e = s.match(/^\s*买下装备 (\S+?)（/)
          return e ? e[1] + '（装备）' : null
        })
        .filter(Boolean)
    if (opts.trace) {
      try {
        const n = String(++TRACE.n).padStart(3, '0')
        writeFileSync(join(opts.trace, 'step-' + n + '.png'), screenshot())
        appendFileSync(
          join(opts.trace, 'steps.jsonl'),
          JSON.stringify({ n: Number(n), ms: 0, at: new Date().toISOString(), action: '开战前（第' + roundNo + '回合，布置完，按准备就绪前）' }) + '\n'
        )
      } catch (e) {}
    }
    let play = await playRound({ battleMaxMs: battleMs, covenants: opts.activeCovenants })
    // 「准备就绪」点了没进战斗：2026-11-11 12:12 实测是游戏弹了「等待重新连接中」，
    // 重连上之后再点就好了。这里只做重试，不改判据。
    for (let k = 0; k < 2 && !play.ok && /\u51c6\u5907\u5c31\u7eea/.test(String(play.reason || '')); k++) {
      log.push('  准备就绪没生效（' + play.reason + '），再点一次（' + (k + 1) + '/2）')
      await sleep(2500)
      play = await playRound({ battleMaxMs: battleMs, covenants: opts.activeCovenants })
    }
    log.push('第' + roundNo + '回合打完：' + (play.ok ? play.state : '失败 ' + play.reason))
    let after = await senseRun()
    // 打完这一回合先弹「作战结束」过场，此时读到的资金是战斗里累计的（顶到 99 MAX），
    // 不是休整期的可用资金。等真正进到休整期再记数。
    for (let k = 0; k < 4 && after.ok && after.screen === 'warbanner'; k++) {
      await sleep(2200)
      after = await senseRun(level)
    }
    // OCR 读不到血量时 ocr.py 返回 null，Number(null) === 0 会把它记成「血掉光了」。
    // 2026-11-10 实测：R5 记成 hp=0、lifeLost=null，下一帧截图明明是 26。
    // 2026-11-13 23:5x 实测：OCR 把血量读成 79 / 72（本局上限 26，地图上没有这种数）。
    // 脏数会污染 lastHp → lifeLost 全乱。超出 0~26 一律当读错，重读一次，仍错就记 null 不写账。
    const HP_MAX = 26
    const saneHp = (v) => (v == null ? null : (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= HP_MAX ? Number(v) : null))
    let hpNow = saneHp(after.ok ? after.hp : null)
    for (let k = 0; k < 2 && hpNow == null && after.ok; k++) {
      await sleep(1500)
      after = await senseRun(level)
      hpNow = saneHp(after.ok ? after.hp : null)
    }
    const lifeLost = lastHp != null && Number.isFinite(hpNow) ? Math.max(0, lastHp - hpNow) : null
    if (Number.isFinite(hpNow)) lastHp = hpNow
    rounds.push({
      round: roundNo,
      moneyLeft: after.ok && after.screen === 'rest' ? Number(after.money) : money,
      hp: hpNow,
      lifeLost,
      bought,
      notes: play.ok ? undefined : play.reason
    })
    if (!play.ok) { stop = play.reason || '这一回合没打完'; break }
    if (play.state === 'wz_settle') {
      // 2026-11-13：结算页要读出「通过回合 / 模拟完成（打通）」，并落 runs.jsonl ——
      // 以前只写一句「结算了」，赢没赢、打到第几回合没有任何证据。
      try {
        // 2026-11-13 23:5x：第 2 局结算页一次没读出来（stop 只留「结算了」三个字），赢没赢没有证据。
        // 结算页有入场动画，读一次就放弃太糟：间隔 2.5s 重读一次，两次都不行才认输。
        for (let t = 0; t < 2; t++) {
          settleResult = await readSettle({ roundFallback: Math.max(0, Number(roundNo) - 1) })
          if (settleResult && settleResult.ok) break
          if (t === 0) {
            log.push('结算页没读出来（' + ((settleResult && (settleResult.error || settleResult.reason)) || '没字') + '）→ 2.5s 后重读')
            await sleep(2500)
          }
        }
        if (settleResult && settleResult.ok) {
          appendRunRecord({
            at: new Date().toISOString(),
            rounds: rounds.length,
            roundNo,
            hp: lastHp,
            cleared: settleResult.cleared === true,
            passedRounds: settleResult.passedRounds,
            cert: settleResult.cert,
            duration: settleResult.duration,
            text: settleResult.text,
            png: settleResult.png,
          })
        }
      } catch (e) { log.push('结算页读数失败：' + e.message) }
      const tail = settleResult && settleResult.ok
        ? '（' + (settleResult.cleared ? '模拟完成/打通' : '未打通') +
          (settleResult.passedRounds != null ? '，通过 ' + settleResult.passedRounds + ' 回合' : '') + '）'
        : ''
      stop = '结算了' + tail
      break
    }
    if (opts.onRound) opts.onRound(rounds[rounds.length - 1])
  }
  return { ok: rounds.length > 0, rounds, log, stop, owned, settle: settleResult }
}

export default { senseRun, toCandidates, tierOf, autoRest, autoRun }