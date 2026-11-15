/**
 * 决策层实测（用户 m02381：「去跑实测吧，这次加入决策层」）。
 *
 * 一局单人「独立模拟」，每回合：
 *   读画面（含顶栏盟约）→ autoRest（盟约 → 清单 → PACE 升级 / 买 / 卖 / 换人 / 布阵）
 *   → 准备就绪打完这回合 → 下一回合
 *
 * 和旧的 _practice.mjs 的区别：wantAuto 打开（清单真的按盟约打分）、传 roster、
 * 把决策相关日志整段落到 data/decision-log.jsonl，方便回头核对每个决策有没有发生。
 *
 * 跑法：node scripts/_decision-run.mjs [回合数]
 */
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { enterRun, leaveSettle, peek, pickTactic, playRound, sleep, tacticPreference } from '../lib/run.js'
import { autoRest, senseRun } from '../lib/drive.js'
import { loadRoster } from '../lib/roster.js'

const ROUNDS = Math.max(1, Number(process.argv[2]) || 6)
const ROOT = process.cwd()
const LOG = join(ROOT, 'data', 'decision-log.jsonl')
const TRACE = join(ROOT, 'traces', 'decision-' + new Date().toISOString().replace(/[:.]/g, '-'))

const stamp = () => new Date().toISOString()
const say = (m) => console.log('[' + new Date().toISOString().slice(11, 19) + '] ' + m)

function pickDecisionLines(steps) {
  const re = /清单|盟约|升级|升级费|买|卖|刷新|冻结|整备区|换人|上场|名额|部署|收工/
  return (steps || []).filter((l) => l && re.test(l))
}

// 上一回合读到的盟约，用来决定战术决策点哪张（维多利亚/助力 → 右1）
let lastCov = []

async function waitRest(maxMs = 150_000) {
  const t0 = Date.now()
  let st = null
  while (Date.now() - t0 < maxMs) {
    st = await senseRun(null, { expect: 'rest' })
    if (st && st.ok && st.screen === 'rest') return st
    if (st && st.ok && st.screen === 'settle') return st
    // 战术决策页不会自己走开：接手对局时就停在这一屏（2026-11-12 08:11 实测卡住）。
    // 这里按 run.js 的规矩点一张 + 底部确认，选完继续等休整期。
    const tk = (st && st.ok && st.screen === 'tactic') || peek().state === 'wz_tactic'
    if (tk) {
      const pref = tacticPreference({ covenants: lastCov })
      say('  战术决策：' + pref.reason)
      const r = await pickTactic({ preferList: pref.order })
      say('  战术决策 → ' + JSON.stringify({ ok: r.ok, picked: r.picked || null, state: r.state, reason: r.reason || null }))
      await sleep(2500)
      continue
    }
    await sleep(3000)
  }
  return st
}

/**
 * peek 有时会返回 unknown（过场/弹窗/主题页）。先重试几秒，再退到 senseRun 的 vision 判定，
 * 仍然认不出就别动手 —— 这个项目里「盲点」吃过太多亏。
 */
async function stablePeek(maxMs = 20000) {
  const t0 = Date.now()
  let p
  try { p = peek() } catch (e) { say('  peek 抛错：' + (e && e.message)) }
  say('  peek#1 ' + JSON.stringify(p && p.state) + ' dist=' + (p && p.dist) + ' ranking=' + (p && p.ranking ? JSON.stringify(p.ranking.slice(0, 3)) : 'none'))
  while ((!p || p.state === 'unknown') && Date.now() - t0 < maxMs) {
    await sleep(2000)
    p = peek()
  }
  if (p && p.state !== 'unknown') return p
  const st = await senseRun(null)
  if (st && st.ok) {
    if (st.vision) return { state: st.vision, via: 'vision' }
    if (st.screen === 'rest') return { state: 'wz_rest', via: 'ocr' }
  }
  return p || { state: 'unknown' }
}

/** 弹出「签到 / 公告」这类遮罩时只点右上角的 X（实测过的三处），绝不点页面中间。 */
async function dismissPopups() {
  const { tapAt } = await import('../lib/run.js')
  for (const pt of [[1828, 92], [1887, 152], [1802, 108]]) {
    await tapAt(pt, 900, '关弹窗')
  }
  await sleep(1500)
}

async function ensureInRun() {
  let p = await stablePeek()
  say('START state=' + p.state + (p.via ? '（' + p.via + '）' : '') + (p.ranking ? ' 次优=' + JSON.stringify(p.ranking.slice(0, 3)) : ''))
  if (p.state === 'wz_settle') {
    say('在结算页 → 返回主页')
    await leaveSettle()
    await sleep(3000)
    p = await stablePeek()
    say('  结算后 state=' + p.state)
  }
  const inRun = ['wz_rest', 'wz_prep', 'wz_battle', 'wz_tactic', 'wz_buydetail', 'rest', 'battle', 'prep'].includes(p.state)
  if (inRun) {
    say('已经在局内，直接接手（' + p.state + '）')
    return true
  }
  // enterRun 自己会先切「个人模拟」再点「独立模拟」，绝不点联合
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (p.state !== 'wz_hall' && p.state !== 'wz_hall_joint') {
      say('认不出大厅（' + p.state + '）→ 关一次弹窗再试（第 ' + attempt + ' 次）')
      await dismissPopups()
      p = await stablePeek()
      continue
    }
    const e = await enterRun({ mode: 'independent' })
    say('ENTER ' + JSON.stringify({ ok: e.ok, state: e.state, reason: e.reason || null }))
    if (e.ok) return true
    await dismissPopups()
    p = await stablePeek()
  }
  say('ABORT：开不了局（state=' + p.state + '），不盲点')
  return false
}

const t0 = Date.now()
mkdirSync(TRACE, { recursive: true })
mkdirSync(join(ROOT, 'data'), { recursive: true })
say('trace=' + TRACE)

if (!(await ensureInRun())) process.exit(2)

let level = 1
let deck = []
let deckSeq = 0
const roster = loadRoster()

for (let r = 1; r <= ROUNDS; r++) {
  const st = await waitRest(120_000)
  if (!st || !st.ok) { say('ABORT：读不到画面（' + ((st && st.error) || 'unknown') + '）'); break }
  if (st.screen === 'settle') { say('本局结束（结算页），停'); break }
  if (st.screen !== 'rest') { say('ABORT：不在休整期（' + st.screen + '）'); break }

  const round = Number(st.round) || r
  say('回合 ' + round + '｜钱 ' + st.money + '｜名额 ' + st.slotsLeft + '｜商店 ' + (st.shopExpanded ? '展开' : '折叠'))
  const tRest = Date.now()
  const restOpts = {
    deploy: true,
    wantAuto: true,
    roster,
    centerLevel: level,
    maxSteps: 6,
    round,
    money: st.money,
    deck,
    deckSeq,
    trace: TRACE,
  }
  let res = await autoRest(restOpts)
  // 2026-11-12 08:25 实测：playRound 返回后画面还在过场（autoRest 读成 screen=unknown），
  // 旧代码直接 break，整晚只跑了 1 个回合就退出。现在等 6s 重读，仍是休整期就再跑一次。
  for (let attempt = 2; !res.ok && /不在休整期|unknown|读不到/.test(String(res.error)) && attempt <= 3; attempt++) {
    say('  收工后画面没回休整期（' + res.error + '）→ 等 6s 再试（第 ' + attempt + ' 次）')
    await sleep(6000)
    const st2 = await senseRun(null)
    if (!st2 || !st2.ok || st2.screen !== 'rest') continue
    restOpts.round = Number(st2.round) || restOpts.round
    restOpts.money = st2.money
    res = await autoRest(restOpts)
  }
  if (!res.ok) { say('autoRest 失败：' + res.error); break }
  deck = Array.isArray(res.deckLeft) ? res.deckLeft : deck
  deckSeq = Number(res.deckSeq) || deckSeq
  level = Number(res.centerLevel) || level
  lastCov = Array.isArray(res.covenants) ? res.covenants : lastCov

  const rec = {
    at: stamp(),
    round,
    money: st.money,
    slotsLeft: st.slotsLeft,
    centerLevel: level,
    covenants: res.covenants || [],
    wantNames: res.wantNames || [],
    bought: (res.bought || []).map((b) => (b && b.name) || String(b)),
    placed: res.deployed || 0,
    deckLeft: (res.deckLeft || []).length,
    restMs: Date.now() - tRest,
    decisions: pickDecisionLines(res.steps),
  }
  appendFileSync(LOG, JSON.stringify(rec) + '\n')
  say('  → 盟约 ' + (rec.covenants.join('/') || '（没读到）') +
    '｜清单 ' + rec.wantNames.length + '｜买 ' + rec.bought.length +
    '｜上场 ' + rec.placed + '｜Lv' + level + '｜休整 ' + Math.round(rec.restMs / 1000) + 's')

  const pr = await playRound({ readyWaitMs: 4000, battleMaxMs: 240_000, covenants: rec.covenants })
  say('  play=' + JSON.stringify({ ok: pr.ok, state: pr.state, reason: pr.reason || null }))
  if (!pr.ok) { say('准备就绪没走通，停'); break }
  if (pr.state === 'wz_settle') { say('本局结束（结算页），停'); break }
}

say('DONE ' + Math.round((Date.now() - t0) / 1000) + 's，日志 ' + LOG)
process.exit(0)
