/**
 * restplan.js — 休整期「买卡」这一步的纯决策：给一个局面，回一个动作。
 *
 * 为什么单独一个文件：这段规则用户改过三次（m10291 → m00211 → m00267），
 * 每次都是「顺序」和「什么情况冻」的差别，而点击代码没变过。把顺序抽成纯函数，
 * 改规则只改这里，单测直接钉住；drive.js 只负责把动作落成点击。
 *
 * 规则原文（用户口述，按优先级）：
 *   m00211：「刷新1块钱一次，所以首先判定需不需要升级商店，然后买卡，没有要的就刷新，
 *            钱不够买卡时，如果当前商店有自己要的卡就冻结，没有要的卡继续刷新，
 *            直到出现需要的卡后冻结或者没钱了不冻结，等下一个回合自动刷新」
 *   m00267：「冻结前先把钱花掉」（钱回合末清零，能买就买）；「刷新没有上限」；
 *            「卡住就随便买，先把整局跑完」。
 *   m00211 / m00214：整备区 10 张干员、装备 5 个，装备不占「剩余可放置角色」。
 *   m02897（2026-11-11 18:23）：第 1 回合买两张同名/买两个；第 2 回合命中「对子/凑三/盟约」
 *     就冻结再升级；以后「刚好够升级」留到下回合买卡；6 回合前 4 阶必买、10 回合起 5/6 阶必买。
 *
 * 输出动作（drive.js 照着做，做完再问一次，直到 stop）：
 *   { action:'upgrade', cost, reason }
 *   { action:'buy', kind:'unit'|'equip', card, reason }
 *   { action:'refresh', free, reason }
 *   { action:'freeze', card, reason }   ← 执行完本回合结束
 *   { action:'stop', reason }           ← 本回合结束
 */

/** 整备区（闲置干员）上限。用户 m00211：「整备区上限 10 张，与部署位无关」。 */
export const BENCH_CAP = 10
// 2026-11-12 07:2x 用户 m02102「为什么不升级商店，打到第九回合还是1级商店」：
// drive.js 原来在整备区≥6 张时整段跳过商店阶段，升级判定跟着一起没了。
// 这条线就是「不买卡」的起点，跟「整备区满 10 张不能买」是两回事。
// 2026-11-14 22:1x（用户 m08251）：6 → 8。6 张就停买后，整备区永远是 6 张 1~2 阶杂牌，
// 三合一凑不出来、换人也换不动，直接卡到死。10 张才真的放不下，8 是留两格余量的停手线。
// 2026-11-15 07:0x（用户 m10875「商店几级就能刷到几阶的卡，三合一出现比商店高一阶的卡」）：
// 以前 8 张就停买，真机日志「剩 12 块花不掉」→ 整备区没牌、三合一凑不出、后期没高阶可上。
// 改成买满整备区（BENCH_CAP=10）：钱要变成牌，牌三合一才出高一阶的卡。
export const BENCH_STOP_BUY = 10

/**
 * 商店阶段的入口判定（纯函数，方便单测）：
 *   整备区 ≥ BENCH_STOP_BUY 张 → 只关买卡；
 *   只要「还没到本回合该到的等级 + 钱够升级费」，仍要展开商店去升级。
 * @param {object} ctx
 * @param {number} ctx.money        当前资金（OCR 这一帧读到的）
 * @param {number} ctx.level        自己记的商店等级
 * @param {number} ctx.targetLevel  本回合该到的等级（targetLevelFor）
 * @param {number|null} ctx.upgradeCost 升级费（这一帧读不到时用上一次的兜底）
 * @param {number|null} ctx.bench   整备区张数
 * @param {boolean} ctx.forceBuy    调试用：强制照买
 * @returns {{benchBlock:boolean, mayUpgrade:boolean, enterShop:boolean}}
 */
export function shopEntryPlan(ctx = {}) {
  const money = num(ctx.money)
  const level = num(ctx.level, 1)
  const wantLevel = num(ctx.targetLevel, level)
  const benchNum = ctx.bench == null ? null : num(ctx.bench)
  const benchBlock = ctx.forceBuy !== true && benchNum != null && benchNum >= BENCH_STOP_BUY
  const cost = ctx.upgradeCost == null ? null : num(ctx.upgradeCost, NaN)
  // 升级费读不到（null/NaN）时按「钱>0 就可能升」算，让决策器自己再判一次，别在入口就判死。
  const affordable = cost != null && Number.isFinite(cost) ? money >= cost : money > 0
  const mayUpgrade = level < wantLevel && affordable
  return { benchBlock, mayUpgrade, enterShop: !benchBlock || mayUpgrade }
}

/**
 * 整备区满时的卖人对象（纯函数，2026-11-12 用户 m02251「满员了先卖卡」）。
 * 优先级：能凑三连的（have≥2）不卖 → 想要的/目标盟约的卡不卖 → 最低阶 → 最便宜 → 名字兜底。
 * @param {Array<object>} units 整备区/商店里能卖的卡（要有 name、tier、cost、have）
 * @param {object} ctx
 * @param {number=} ctx.want 0=清单命中
 * @param {string[]=} ctx.covenants 目标盟约
 * @returns {object|null} 没得卖返回 null
 */
export function pickSellCard(units, ctx = {}) {
  const list = (units || []).filter((c) => c && c.name)
  if (!list.length) return null
  const covenants = Array.isArray(ctx.covenants) ? ctx.covenants : []
  const keep = list.filter((c) => num(c.have) >= 2 || num(c.want, 9) === 0 || (c.covenant && covenants.includes(c.covenant)))
  const keepNames = new Set(keep.map((c) => c.name))
  const trash = list.filter((c) => !keepNames.has(c.name))
  const pool = trash.length ? trash : keep   // 全是宝贝也得卖一张，否则卡死
  return pool.slice().sort((a, b) =>
    num(a.tier, 9) - num(b.tier, 9) ||
    num(a.cost, 99) - num(b.cost, 99) ||
    String(a.name).localeCompare(String(b.name))
  )[0]
}


/**
 * 升级有没有真的生效（纯函数，2026-11-12 重写）。
 * 旧判据「升级费变了就算成功」会把「费用变小」也认账（_perf.log 22:51:48 留下了
 * 「升到 Lv3（升级费 2→1）」——内部账本 Lv3、UI 还是 Lv1，之后整排卡片坐标全偏）。
 * 现在只认结构性信号：等级读数变高、商店格数变多、升级面板左移、升级费变高；
 * 费用变小单独标出来（costDropped），由调用方决定要不要重读一次。
 * @param {{level?:number,cost?:number,x?:number,cards?:number}} before
 * @param {{level?:number,cost?:number,x?:number,cards?:number}} after
 */
export function judgeUpgrade(before = {}, after = {}) {
  const bLevel = before.level == null ? null : num(before.level, NaN)
  const aLevel = after.level == null ? null : num(after.level, NaN)
  const bCost = before.cost == null ? null : num(before.cost, NaN)
  const aCost = after.cost == null ? null : num(after.cost, NaN)
  const bX = before.x == null ? null : num(before.x, NaN)
  const aX = after.x == null ? null : num(after.x, NaN)
  const bCards = num(before.cards, 0)
  const aCards = num(after.cards, 0)
  const bMoney = before.money == null ? null : num(before.money, NaN)
  const aMoney = after.money == null ? null : num(after.money, NaN)
  const signals = []
  // 2026-11-12 实测（_upgrade-test.mjs）：升级是「连点两次」，成功后钱正好少一个升级费
  // （Lv1 钱 5、升级费 2 → 钱 3、LEVEL Ⅱ、升级费 8）。扣钱是最硬的一条信号 ——
  // 动画过程中 OCR 读 LEVEL 会跳（第 3 回合就是被「LEVEL Lv1→2」误判成成功，账本虚高一级，
  // 之后按 Lv2 算面板坐标、每次升级都点在空地上）。
  if (bMoney != null && aMoney != null && Number.isFinite(bMoney) && Number.isFinite(aMoney)
      && bCost != null && Number.isFinite(bCost) && bCost > 0 && bMoney - aMoney === bCost) {
    signals.push('扣钱 ' + bMoney + '→' + aMoney + '（＝升级费 ' + bCost + '）')
  }
  if (bLevel != null && aLevel != null && Number.isFinite(aLevel) && aLevel > bLevel) signals.push('LEVEL Lv' + bLevel + '→' + aLevel)
  if (aCards > bCards) signals.push('商店格数 ' + bCards + '→' + aCards)
  // 2026-11-12 12:13 真机实测：第一次点击只把卡片选成「确认升级」，面板根本没动，
  // 但 OCR 的升级点在 337/335 之间抖了 2px —— 旧写法「x 变了就算升级」据此报了一次假成功。
  // 真左移是 240px 级（一格 = SHOP_PITCH），所以这里要幅度下限，抖动不算。
  if (bX != null && aX != null && Number.isFinite(aX) && Math.abs(aX - bX) >= 60) signals.push('面板左移 x ' + bX + '→' + aX)
  if (bCost != null && aCost != null && Number.isFinite(aCost) && aCost > bCost) signals.push('升级费 ' + bCost + '→' + aCost)
  const costDropped = bCost != null && aCost != null && Number.isFinite(aCost) && aCost < bCost
  return { ok: signals.length > 0, signals, costDropped, level: Number.isFinite(aLevel) ? aLevel : bLevel }
}


/**
 * 对账：自己记的等级 vs OCR 读的 LEVEL vs 本局点过几次升级。
 * 用户 m02251：「2 是对的，同时辅以自己记忆点了几次升级」——
 * 也就是自己数的等级为主、点击次数当第二证据、OCR 只在和两者之一对得上时才采信。
 * @param {{tracked?:number, ocr?:number, clicks?:number, base?:number}} ctx
 */
export function reconcileLevel(ctx = {}) {
  const base = num(ctx.base, 1) || 1
  const clicks = num(ctx.clicks, 0)
  const expected = base + clicks
  const tracked = ctx.tracked == null ? null : num(ctx.tracked, NaN)
  const ocr = ctx.ocr == null ? null : num(ctx.ocr, NaN)
  let level = Number.isFinite(tracked) ? tracked : expected
  let agreed = 'tracked'
  const notes = []
  if (Number.isFinite(ocr)) {
    if (ocr === level) agreed = 'both'
    else if (ocr === expected) { level = ocr; agreed = 'ocr+clicks' }
    else notes.push('OCR 读 Lv' + ocr + '，自己记 Lv' + tracked + '/点过 ' + clicks + ' 次（预期 Lv' + expected + '）→ 按自己记的走')
  }
  if (Number.isFinite(tracked) && tracked !== expected) notes.push('自己记 Lv' + tracked + ' 与点击次数推出的 Lv' + expected + ' 不一致（可疑）')
  return { level, expected, agreed, notes }
}

/** 装备上限。用户 m00214：「装备上限 5 个」。 */
export const EQUIP_CAP = 5
/** 安全阀，不是策略上限（用户 m00267 明确「刷新没有上限」）——只防传感器抽风导致的死循环。 */
export const REFRESH_SAFETY = 40
/* 2026-11-11 15:40 删掉 PAID_REFRESH_FIRST（原来付费刷新只许 2 次）：
 * 用户 m02108 指出「刷新方案没有完全执行，带着钱去下一回合了，应该先刷新」。
 * 现在没有次数上限，只受 REFRESH_SAFETY 与手头资金约束。 */
/** 先刷几次找想要的卡，之后店里只要有人买得起就先买人（别把一回合全烧在刷新上，
 * 一次刷新 6s：1.5s 点击 + 1.3s 等 + 5s 整屏 OCR）。钱多时这条让本回合必然收敛。 */
export const REFRESH_BEFORE_BUY = 3
/** 装备先买几件（用户 m01034：优先表没写之前不要买太多）。 */
export const EQUIP_CAP_FIRST = 3

/**
 * 用户 m02897（2026-11-11 18:23）口述的前期节奏：
 *   第 1 回合：「有两张相同的干员就买两张相同的，没有就买两个干员」。
 *   第 2 回合：「有能凑 3 和 1 的、或两张一样、或目标盟约所需要的 → 冻结，然后升级」。
 *   以后的回合：「钱刚好够升级就等下一个回合再升级，当前回合执行买卡」——
 *     这里把「刚好」定义成「升级完只剩 0~1 块」，剩得多就照常升。
 *   阶数：「6 回合之前刷新出 4 阶必买；10 回合及以后出 5/6 阶必买」。
 * 文档：world/docs/strategy-user-2026-11-11.md（口述原文，冲突时以它为准）。
 */
/**
 * 升级节奏表（用户 m05971 2026-11-11 22:35：「按照节奏升级，节奏到了优先升级，然后买卡」）。
 *
 * 口径来源：world/docs/levelup-curve.md:57-59（B 站视频逐帧 + 六局读数），
 * 以及用户 m04440 原话「三回合升二 / 四或五回合升三 / 七回合升四 / 不升六，停五本用五本碰六本」。
 *   2 本：第 3 回合（稳本；速本派第 2 回合，要换口径改这里一张表就行）
 *   3 本：第 4 回合
 *   4 本：第 7 回合
 *   5 本：第 10 回合
 * 六本永不升（六本池太脏，主流打法停五本碰六本）。
 */
export const PACE = [
  { from: 1, level: 1, note: '第 1 回合只买卡，不升' },
  { from: 3, level: 2, note: '第 3 回合升 2 本（稳本口径）' },
  { from: 4, level: 3, note: '第 4–6 回合升 3 本' },
  { from: 7, level: 4, note: '第 7–9 回合升 4 本，升完停本刷对子' },
  { from: 10, level: 5, note: '第 10 回合起升 5 本，永不升六' }
]

/** 本回合「节奏要求的最低商店等级」。读不到回合号按第 1 回合算。 */
export function targetLevelFor(round) {
  const r = num(round, 1) || 1
  let lv = 1
  for (const seg of PACE) if (r >= seg.from) lv = seg.level
  return Math.min(lv, 5)
}

export const OPENING_ROUND = 1
export const SECOND_ROUND = 2
export const UPGRADE_SOFT_RESERVE = 2   // money - upgradeCost <= 1 就算「刚好够」
export const TIER4_ROUNDS_BEFORE = 6    // 6 回合之前 4 阶必买
export const HIGH_TIER_FROM_ROUND = 10  // 10 回合起 5/6 阶必买

/** 阶数必买（用户 m02897）。读不到阶就当不命中。 */
export function forcedByTier(card, round) {
  const t = num(card && card.tier)
  const r = num(round)
  if (!t || !r) return false
  if (r < TIER4_ROUNDS_BEFORE && t >= 4) return true
  if (r >= HIGH_TIER_FROM_ROUND && t >= 5) return true
  return false
}

const num = (v, d = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

/** 想要的干员：want=0 清单命中、want=1 对子（已有同名）。排序：对子优先 → 清单优先 → 便宜优先。 */
export function pickWanted(list) {
  return list.slice().sort((a, b) =>
    num(b.have) - num(a.have) ||
    num(a.want, 9) - num(b.want, 9) ||
    num(a.cost, 99) - num(b.cost, 99) ||
    String(a.name).localeCompare(String(b.name))
  )[0]
}

/**
 * @param {object} ctx
 * @param {number} ctx.money          当前资金
 * @param {number} ctx.level          商店等级
 * @param {number|null} ctx.upgradeCost 升级费（OCR 读到的）
 * @param {number} ctx.targetLevel    本回合该到的等级（drive.js 的节奏表）
 * @param {number} ctx.bench          整备区现有干员数（折叠态实测）
 * @param {number} ctx.equipCount     已装备数
 * @param {Array}  ctx.units          商店干员卡 [{name,cost,tier,slot,x,y,want,have}]
 * @param {Array}  ctx.equips         商店装备卡 [{name,cost,slot,x,y}]
 * @param {number} ctx.round         当前回合号（第1/第2回合走 m02897 的开局规则）
 * @param {Array}  ctx.bought        本回合已经买到的干员名（第1回合凑两张同名用）
 * @param {Array}  ctx.covenants     本局目标盟约名（第2回合「目标盟约所需要的」判据）
 * @param {number} ctx.refreshUsed    本回合已刷新次数
 * @param {number} ctx.freeRefresh    还有几次免费刷新（0/1；来源是 UI 上的 FREE 徽章）
 * @returns {{action:string, reason:string}}
 */
export function planRestStep(ctx = {}) {
  const money = num(ctx.money)
  const level = num(ctx.level, 1)
  const bench = num(ctx.bench)
  const equipCount = num(ctx.equipCount)
  const refreshUsed = num(ctx.refreshUsed)
  const freeRefresh = num(ctx.freeRefresh)
  const upgradeCost = ctx.upgradeCost == null ? null : num(ctx.upgradeCost, NaN)
  const wantLevel = num(ctx.targetLevel, level)
  const units = (ctx.units || []).filter((c) => c && c.name)
  const equips = (ctx.equips || []).filter((c) => c && c.name)
  const benchFull = bench >= BENCH_CAP
  // 2026-11-13 05:1x 真机（.tmp/diag2.mjs）：名额 0 时游戏根本不让拎牌（拖到空格毫无反应、也不出待确认态），
  // 买来的卡只能堆在整备区。名额 0 就别买了；升级/刷新照常判。
  const slotsZero = ctx.slotsLeft != null && Number.isFinite(Number(ctx.slotsLeft)) && Number(ctx.slotsLeft) === 0
  // 2026-11-12 07:2x 用户 m02102「为什么不升级商店，打到第九回合还是1级商店」：
  // drive.js 原来在整备区≥6 张时整段跳过商店阶段（return），于是连升级都不判了
  // （_perf.log 23:03 起每回合同一行「整备区 N 张（场上满员放不上去）→ 本回合先不买」）。
  // 现在改成「只关买卡」：drive.js 传 ctx.benchBlock=true，买/冻/刷一律不做，升级照节奏走。
  // 2026-11-13 01:2x 实测（_perf.log 17:14~17:15）：ctx.benchBlock 只在进商店前算一次，
  // 买的过程中整备区从 5 涨到 10，中途没人再判 —— 一回合连买 5 张，最后整备区 10/10。
  // BENCH_STOP_BUY(6) 这条线要每一步都算，不能只在入口算。
  // 2026-11-13 14:47 真机：名额 0 + 整备区 0 张 = 死锁 —— 场上满员却全是低阶，没钱也买不了
  // （slotsZero 一律关买卡），于是每回合只剩升级，钱堆到 11 块花不掉，用户 m06286/m06373 就是在骂这个。
  // 名额 0 但整备区空着的时候必须允许买卡：买进来的牌是换人的素材，买完立刻能替换场上的弱干员。
  const needBenchMaterial = slotsZero && bench < 2
  // 2026-11-14 01:4x（本局 R7~R10 真机：名额 0、整备区 2 张、钱堆到 11 块花不掉，第 6~10 回合血 25→21→11→3→0 直接死）：
  // 名额 0 不等于「买了没用」—— 现在每回合都会「撤回一个腾名额再上人」，买来的牌正是换人素材。
  // 所以 slotsZero 不再整段关掉买卡，只按整备区张数（BENCH_STOP_BUY=6）收手；真满了才停。
  const benchBlocked = benchFull || ctx.benchBlock === true || bench >= BENCH_STOP_BUY
  const equipFull = equipCount >= EQUIP_CAP
  const underSafety = refreshUsed < REFRESH_SAFETY
  // ctx.canRefresh 是「按钮还能不能点」（OCR/像素判出来的灰态），跟上面的安全阀是两回事。
  const canRefresh = ctx.canRefresh !== false && underSafety


  const round = num(ctx.round)
  const bought = Array.isArray(ctx.bought) ? ctx.bought.map((x) => String(x)) : []
  const affordable = units
    .filter((c) => num(c.cost, 99) <= money)
    .sort((a, b) => num(a.cost, 99) - num(b.cost, 99) || String(a.name).localeCompare(String(b.name)))
  const copies = (name) => units.filter((c) => c.name === name).length

  // 0) 先判 PACE 升级（m00211 / 2026-11-12 用户 m02251「首先判定 pace 升级然后再决定买卡」）。钱够升级费就升，比买一张卡更值。
  //    2026-11-11 21:55 用户 m04079：「按照别人教的节奏升级，我那句『钱刚好够之后下一回合升级』忘了吧」
  //    → 删掉旧的「升完只剩 0~1 块就先不升」闸门，够钱就升，节奏只看 targetShopLevel。
  // 2026-11-11 20:07 实测（trace-12-00-51 第 2 回合）：一回合里连升两次 Lv1→Lv2→Lv3，
  // 钱全进了升级，一张卡没买，场上还是 2 个人，第 2 回合掉 6 血。
  // 用户 m02897 只说过「第 2 回合命中就冻结再升级」，没说过一回合升两级；节奏表也是「3 回合升 2」。
  // 这里加一道闸：一回合最多升一次（ctx.upgraded 由 drive.js 在升级成功后置真）。
  // 节奏点到但钱不够升级：不硬等（钱回合末清零，等没有收益，只会少买一张卡），
  // 但把差额写进后面的 reason，日志里能一眼看出是「差钱」而不是「忘了升」。
  // 2026-11-13 13:4x 用户 m06148：「如果同时碰见三合一和升级，先升级然后买三合一免费商店能刷到更高阶的干员」。
  //   → 有得升的时候三合一不抢拍，先升级（升级后那一次免费刷新能刷出更高阶的卡，三合一出的阶数也更高）。
  // 2026-11-13 13:5x 用户 m06164：「有三合一就合成」——三张同名卡自动合成，商店随即特殊刷新出
  // 三张免费高阶卡，干员升为精锐（二级）。所以**不再限 Lv<5**，任何等级凑到就合。
  // 也不要为了等 Lv5 拖到后期：高阶商店反而更难刷出低阶卡来凑三合一（用户原话「得不偿失」）。
  // 2026-11-14 08:1x 用户 m02396：「三合一的优先级很高，尤其是盟约内的三合一，又有经济又有战力」。
  //   → ①三合一不再被 benchBlocked（整备区到 BENCH_STOP_BUY=6）关掉：买来的第三张立刻合成，
  //      整备区不会真涨到 7 张（合成后还会腾位），所以闸门管不到它。硬上限 BENCH_CAP=10 仍生效。
  //     ②候选按「命中目标盟约数 → 手上已有张数 → 便宜」排序，盟约内的先合。
  const covSet = new Set((Array.isArray(ctx.covenants) ? ctx.covenants : []).map((x) => String(x)))
  const covHits = (card) => {
    let list = Array.isArray(card.covenants) ? card.covenants : null
    if (!list && typeof ctx.covenantOf === 'function') {
      try { list = ctx.covenantOf(card.name) || [] } catch { list = [] }
    }
    if (!Array.isArray(list)) return 0
    return list.filter((x) => covSet.has(String(x))).length
  }
  const tripleCands = units.filter((c) => num(c.have) >= 2 && num(c.cost, 99) <= money)
  const tripleNow = tripleCands.length
    ? tripleCands.slice().sort((a, b) =>
        covHits(b) - covHits(a) ||
        num(b.have) - num(a.have) ||
        num(a.cost, 99) - num(b.cost, 99))[0]
    : null
  const paceDue = level < wantLevel
  const paceShort = paceDue && upgradeCost != null && Number.isFinite(upgradeCost) && money < upgradeCost
    ? upgradeCost - money
    : 0
  // 2026-11-13 12:0x 用户 m05472：「一回合可以只升级，但是不要连续几回合只升级，一般要呆两三个回合，
  // 4级5级可以呆久一点」+ m05478「不升级就补战力」。
  // → 升到某级后至少在这个等级待 MIN_DWELL 个回合才允许再升；不升的回合钱全用来买干员。
  const MIN_DWELL = { 1: 1, 2: 2, 3: 2, 4: 3, 5: 99, 6: 99 }
  const dwellNeed = MIN_DWELL[level] == null ? 2 : MIN_DWELL[level]
  const roundsSinceUpgrade = num(ctx.roundsSinceUpgrade, 99)
  const dwellOk = roundsSinceUpgrade >= dwellNeed
  const paceHint = paceShort > 0
    ? '（节奏点到 Lv' + wantLevel + '，还差 ' + paceShort + ' 块升级）'
    : paceDue && !dwellOk
      ? '（节奏点到 Lv' + wantLevel + '，但 Lv' + level + ' 才待 ' + roundsSinceUpgrade + '/' + dwellNeed + ' 回合 → 先补战力）'
      : ''

  // 2026-11-13 用户 m0??（BOSS 关规则，handoff §3）：「第 14 回合不升级，只刷新+买干员补强」。
  // 所以 BOSS 回合把升级分支整个关掉，剩下的钱只走刷新 / 买卡。普通回合完全不变。
  if (!ctx.boss && !ctx.upgraded && dwellOk && upgradeCost != null && Number.isFinite(upgradeCost) && level < wantLevel && money >= upgradeCost) {
    const after = money - upgradeCost
    // 2026-11-13 07:5x 用户 m04641：「你升级的速度快于节奏了导致没卡战力不足」。
    // 升完只剩 0~2 块、店里又有买得起的卡 → 这回合先买卡，升级留给下一回合（钱回合末清零，
    // 但场上少一个人比晚一本亏得多）。升完还剩 ≥3 块时照旧按节奏升。
    // 2026-11-13 07:5x 补：买卡被闸门关掉时（benchBlocked / 名额 0），升级是唯一能花钱的地方，
    // 这时候还「留着钱买卡」就变成整回合什么都不干（shop-gate 回归用这个口径）。
    const cheapCard = units.some((c) => num(c.cost, 99) <= after)
    // 有三合一可凑时升级优先（m06148）：升完的免费刷新能出更高阶，三合一也跟着升级。
    // 2026-11-14 12:1x 用户 m02396「尤其是盟约内的三合一」：盟约内的三合一优先级最高，升级也给它让路；
    // 盟约外的三合一仍然让位给升级（m06148：升级后的免费刷新能出更高阶，三合一跟着升级）。
    const tripleInCov = !!(tripleNow && covHits(tripleNow) > 0)
    // 2026-11-15 04:1x（用户 m08866 验收「凑出 3 个盟约并叠层」，真机 trace 19-52-08 第 2~3 回合）：
    // 场上只站了 3 个、剩余名额 4，钱却先拿去升级 →「有名额没牌」：整备区剩 0 张、布阵 0 个上场。
    // 空名额 ≥2 且升完还买得起任意一张卡时，先买卡把人补上；升级等名额用完了再说（容量晚一回合不会丢）。
    const slotsFree2 = Number.isFinite(Number(ctx.slotsLeft)) ? Number(ctx.slotsLeft) : -1
    const minCardCost = units.reduce((m, c) => Math.min(m, num(c.cost, 99)), 99)
    const preferBuyForSlots = slotsFree2 >= 2 && after >= minCardCost && !benchBlocked
    if (!preferBuyForSlots && (benchBlocked || (tripleNow && !tripleInCov) || !(cheapCard && after < 3))) {
      return {
        action: 'upgrade',
        cost: upgradeCost,
        reason: '节奏 Lv' + level + ' → Lv' + wantLevel + '：钱 ' + money + ' ≥ 升级费 ' + upgradeCost + '（升完还剩 ' + after + ' 块）'
      }
    }
  }


  // 0a-0) 整备区满 10 张时先卖一张（2026-11-12 用户 m02251「满员了先卖卡」）。
  //       原来这里直接 stop：钱花不掉、格子腾不出来、下回合还是满。卖卡 = 回收 1 块 + 腾一格，
  //       卖谁由 pickSellCard 决定（避开三连/想要的卡，先卖最低阶最便宜的）。
  //       场上满员（配额 0）不在这里处理 —— 那要卖的是场上的人，得用户先给点法。
  // 装备有自己的 5 格，不受整备区限制 → 有买得起的装备时先走装备，不要为它卖人。
  const equipBuyable = !equipFull && equips.some((c) => num(c.cost, 99) <= money)
  // 2026-11-14 12:1x 用户 m03796「台下不用的干员就卖掉」：
  // 以前只有整备区满 10 张才卖，BENCH_STOP_BUY=6 一到就只会 stop（钱堆着花不掉、杂牌也清不掉）。
  // 现在整备区到 6 张且里面有「计划外/最低阶」的牌（sellReady>0，由 covenantplan.pickSellChips 算）→ 先卖一张再继续买。
  const sellReady = num(ctx.sellReady, 0)
  const benchJunk = bench >= BENCH_STOP_BUY && sellReady > 0
  if ((benchFull || benchJunk) && !ctx.soldThisTurn && !equipBuyable) {
    return {
      action: 'sell',
      reason: (benchFull
        ? '整备区满 ' + bench + ' 张'
        : '整备区 ' + bench + ' 张（到 BENCH_STOP_BUY=' + BENCH_STOP_BUY + '），其中有 ' + sellReady + ' 张计划外的杂牌') +
        ' → 先卖一张计划外/最低阶的（回收 1 块 + 腾一格），同回合只卖一张'
    }
  }
  // 0a) 第 1 回合（用户 m02897）：「有两张相同就买两张相同的，没有就买两个干员」。
  //     实现：①本回合已经买过、店里还有同一张 → 再买一张（凑成两张同名）；
  //           ②否则店里有 2 张以上的同名且都买得起 → 买它；
  //           ③再否则买最便宜的；满 2 张就交给后面的常规流程。
  if (round === OPENING_ROUND && !benchBlocked && bought.length < 2) {
    // 2026-11-14 20:5x（用户 m07730「每次都不凑盟约」）：第 1 回合旧版只买「便宜的/对子」，
    // 完全绕过盟约计划 —— 而第 1 回合买谁基本决定了整局往哪个盟约走。
    // 现在先花这一张在盟约计划上（covenantplan 选中、且买得起），没有计划可买才退回便宜货。
    const pvCard = ctx.prefer && ctx.prefer.card ? units.find((c) => c.name === ctx.prefer.card.name) : null
    if (pvCard && num(pvCard.cost, 99) <= money) {
      return {
        action: 'buy', kind: 'unit', card: pvCard,
        reason: '第 1 回合：先按盟约拿 ' + pvCard.name + '（' + (ctx.prefer.reason || '盟约缺口') + '）'
      }
    }
    const repeat = affordable.find((c) => bought.includes(c.name))
    if (repeat) {
      return {
        action: 'buy', kind: 'unit', card: repeat,
        reason: '第 1 回合：再买一张 ' + repeat.name + '（凑两张一样的），已有 ' + bought.length + ' 张'
      }
    }
    const pair = Array.from(new Set(affordable.map((c) => c.name)))
      .filter((n) => copies(n) >= 2)
      .map((n) => affordable.find((c) => c.name === n))
      .sort((a, b) => num(a.cost, 99) - num(b.cost, 99))[0]
    if (pair) {
      return { action: 'buy', kind: 'unit', card: pair, reason: '第 1 回合：店里有两张一样的 ' + pair.name + ' → 先买一张' }
    }
    if (affordable.length) {
      const c = affordable[0]
      return { action: 'buy', kind: 'unit', card: c, reason: '第 1 回合：没有对子 → 买便宜的 ' + c.name + ' ' + num(c.cost) + ' 块（本回合第 ' + (bought.length + 1) + ' 张）' }
    }
    return { action: 'stop', reason: '第 1 回合：店里的干员一张都买不起（手上 ' + money + ' 块），不冻结' }
  }

  // 0a-1) 前期（还没到 Lv5）先凑三合一（用户 m04520：到 Lv5 之前算前期，三合一略优先于盟约；
  //        Lv5 之后反过来，盟约优先）。「have」是店里这张牌我们手上已有几张（含场上 + 整备区）。
  const canUpgradeNow = !ctx.upgraded && dwellOk && upgradeCost != null && Number.isFinite(upgradeCost) && level < wantLevel && money >= upgradeCost
  const tripleCovHits = tripleNow ? covHits(tripleNow) : 0
  if (tripleNow && (!canUpgradeNow || tripleCovHits > 0)) {
    // 凑到第三张 → 游戏自动合成精锐 + 商店特殊刷新三张免费高阶卡，后续买卡从这批里挑。
    const triple = tripleNow
    if (triple) {
      let covList = Array.isArray(triple.covenants) ? triple.covenants : null
      if (!covList && typeof ctx.covenantOf === 'function') {
        try { covList = ctx.covenantOf(triple.name) || [] } catch { covList = [] }
      }
      const covs = (Array.isArray(covList) ? covList : []).filter((x) => covSet.has(String(x)))
      return {
        action: 'buy', kind: 'unit', card: triple,
        reason: '凑三合一' + (covs.length ? '（盟约内：' + covs.join('/') + '）' : '') +
          '：' + triple.name + '（手上已有 ' + num(triple.have) + ' 张 → 合精锐 + 特殊刷新）' + paceHint
      }
    }
  }
  // 0a-2) 凑盟约优先（用户 m02613「没凑盟约，这模式战力关键就是凑盟约叠层」，
  //       m02617「你识别场上干员，自己根据盟约加」）。候选由 covenantplan.pickBuyTarget 算好传进来，
  //       这里只做「买得起就买」的判定；买不起留给后面的冻结规则。
  //       排在阶数必买前面：4 阶卡再好也不如把某个盟约从 2/3 凑到 3/3。
  if (!benchBlocked && ctx.prefer && ctx.prefer.card && ctx.prefer.card.name) {
    const pc = units.find((c) => c.name === ctx.prefer.card.name)
    if (pc && num(pc.cost, 99) <= money) {
      return {
        action: 'buy', kind: 'unit', card: pc,
        reason: '凑盟约：' + pc.name + '（' + (ctx.prefer.reason || '盟约缺口') + '）' + paceHint
      }
    }
  }

  // 0a-3) 凑对子（2026-11-14 10:1x 用户 m02396「三合一的优先级很高」的真根因补丁）：
  //       covenantplan 旧规则只允许「已有 2 张买第 3 张」，但「已有 1 张不许买第 2 张」，
  //       所以整局永远凑不到 2 张 → 40+ 回合 0 次三合一。现在允许买第 2 张，
  //       但整备区到 BENCH_STOP_BUY=6 后 benchBlocked 会把这条路也关掉（R1 就撞 6 张），
  //       所以对子单独开一条通道：整备区还有空位（< BENCH_CAP-1）就买，无论 benchBlocked。
  //       排在凑盟约后面：能凑活盟约的牌先拿（激活盟约的收益比对子确定）。
  const pairCands = units.filter((c) => num(c.have) === 1 && num(c.cost, 99) <= money)
  if (!canUpgradeNow && pairCands.length && bench < BENCH_CAP - 1) {
    const pair = pairCands.slice().sort((a, b) =>
      covHits(b) - covHits(a) || num(a.cost, 99) - num(b.cost, 99))[0]
    const covs = (() => {
      let l = Array.isArray(pair.covenants) ? pair.covenants : null
      if (!l && typeof ctx.covenantOf === 'function') { try { l = ctx.covenantOf(pair.name) || [] } catch { l = [] } }
      return (Array.isArray(l) ? l : []).filter((x) => covSet.has(String(x)))
    })()
    return {
      action: 'buy', kind: 'unit', card: pair,
      reason: '凑对子（买第 2 张，差一张三合一）' + (covs.length ? '（盟约内：' + covs.join('/') + '）' : '') +
        '：' + pair.name + ' ' + num(pair.cost) + ' 块' + paceHint
    }
  }

  // 0b) 阶数必买（用户 m02897）：6 回合前 4 阶、10 回合起 5/6 阶，刷新出来就买，排在升级前面。
  if (!benchBlocked) {
    const tierPick = affordable.filter((c) => forcedByTier(c, round))
      .sort((a, b) => num(b.tier) - num(a.tier) || num(a.cost, 99) - num(b.cost, 99))[0]
    if (tierPick) {
      return {
        action: 'buy', kind: 'unit', card: tierPick,
        reason: (round < TIER4_ROUNDS_BEFORE ? '6 回合前 4 阶必买' : '10 回合起 5/6 阶必买') +
          '：' + tierPick.name + '（' + num(tierPick.tier) + ' 阶，' + num(tierPick.cost) + ' 块）'
      }
    }
  }

  // 0c) 第 2 回合（用户 m02897）：命中「两张一样 / 能凑三连 / 目标盟约」→ 冻结，然后升级。
  //     冻结不再等于「本回合结束」：这里带 then:'upgrade'，drive.js 执行完冻结还会去点升级。
  if (round === SECOND_ROUND && !benchBlocked) {
    const pairNames = new Set(units.filter((c) => copies(c.name) >= 2 && num(c.cost, 99) <= money).map((c) => c.name))
    const triple = units.filter((c) => num(c.have) >= 2 && num(c.cost, 99) <= money)
    const covenant = units.filter((c) => c.covenant && ctx.covenants && ctx.covenants.includes(c.covenant) && num(c.cost, 99) <= money)
    const hit = triple[0] || covenant[0] || units.filter((c) => pairNames.has(c.name)).sort((a, b) => num(a.cost) - num(b.cost))[0]
    if (hit) {
      const why = hit === triple[0] ? '能凑三连（已有 ' + num(hit.have) + ' 张）'
        : (hit === covenant[0] ? '目标盟约 ' + hit.covenant : '两张一样的 ' + hit.name)
      return { action: 'freeze', card: hit, then: 'upgrade', reason: '第 2 回合：' + why + ' → 冻结，然后升级' }
    }
  }

  // 2) 买得起「想要的」干员 → 买。整备区满就不买（游戏会红字清卡）。
  const wanted = units.filter((c) => c.want != null && num(c.cost, 99) <= money)
  if (!benchBlocked && wanted.length) {
    const card = pickWanted(wanted)
    return {
      action: 'buy',
      kind: 'unit',
      card,
      reason: (num(card.want) === 0 ? '清单上有' : '对子（已有 ' + num(card.have) + ' 张）') +
        '：' + card.name + ' ' + num(card.cost) + ' 块' + paceHint
    }
  }

  // 3) 店里有想要的卡但买不起 → 冻结（m00211 原文）。这一步必须排在刷新前面：
  //    她已经用刷/冻把想要的卡留下了，这时再刷一下等于把留的卡刷掉。
  const wanting = units.filter((c) => c.want != null)
  if (wanting.length && !benchBlocked) {
    const card = pickWanted(wanting)
    if (money <= 0) {
      return { action: 'stop', reason: '店里有想要的 ' + card.name + '（' + num(card.cost) + ' 块）但钱已花光 → 不冻结（m00211），等下回合自动刷新' }
    }
    return {
      action: 'freeze',
      card,
      reason: '店里有想要的 ' + card.name + '（' + num(card.cost) + ' 块 > 手上 ' + money + '）→ 冻结留给下回合'
    }
  }

  // 4) 没有想要的卡 → 刷新（m00211「没有要的就刷新」，m00267「刷新没有上限」，
  //    m02108 再次强调「应该先刷新」——钱不能带回下一回合）。
  //    唯一例外：只剩最后 1 块、店里有 1 块就能买的干员 → 买人（人立刻能上场，比再刷一次值）。
  const affordableUnits = units
    .filter((c) => num(c.cost, 99) <= money)
    .sort((a, b) => num(a.cost, 99) - num(b.cost, 99) || String(a.name).localeCompare(String(b.name)))
  // 2026-11-11 21:48 用户 m04007：「1本随便刷的目的是凑对子然后三合一，而不是找某个干员」。
  // 所以只要店里有「手里已经有 1~2 张」的干员且买得起，就先买它（have=2 买下就是三合一），
  // 这个优先级高于刷新。低本阶段（level<=2）尤其如此。
  const pairBuys = affordableUnits.filter((c) => num(c.have) >= 1)
  if (!benchBlocked && pairBuys.length && money >= 1) {
    pairBuys.sort((a, b) => num(b.have) - num(a.have) || num(a.cost, 99) - num(b.cost, 99))
    const c = pairBuys[0]
    return {
      action: 'buy',
      kind: 'unit',
      card: c,
      reason: '凑对子：手里已有 ' + num(c.have) + ' 张 ' + c.name + ' → 买第 ' + (num(c.have) + 1) + ' 张（三合一路线，m04007）'
    }
  }
  // 2026-11-14 20:1x 实测（trace-night-2026-11-14T11-55-01 第 2~5 回合）：钱全花在「升级费 + 两次刷新」上
  // （每回合 3~5 块），剩下 2 块买不起店里的 3 块卡 → 每回合只上 0~1 个人、空着 4~5 个名额，
  // 场上一直是 3 人，血量 26→24→21→19。用户 m06708「一回合最多刷2次，其他买卡」+「空名额多时别烧在刷新上」。
  // 规则：还有 ≥2 个空名额、店里又有买得起的人 → 直接买（挑最便宜），不刷新；清单/对子/阶数必买仍然在前面优先。
  const slotsFree = Number.isFinite(Number(ctx.slotsLeft)) ? Number(ctx.slotsLeft) : null
  if (!benchBlocked && freeRefresh <= 0 && slotsFree != null && slotsFree >= 2 && affordableUnits.length &&
      bought.length < slotsFree) {
    // 2026-11-15 00:4x（用户 m08866「3 个盟约并叠层」+ trace-night-2026-11-14T16-21-53 第 4 回合实测）：
    // 这条「空名额多就买最便宜」会把 风丸/卡涅利安 这类非盟约牌买进来，核心盟约一直停在 1/3。
    // 先看 ctx.prefer（covenantplan 已经算好的盟约最优解）买不买得起，买不起再退回最便宜。
    const preferCard = (ctx.prefer && ctx.prefer.card && affordableUnits.find((u) => u.name === ctx.prefer.card.name)) || null
    const c = preferCard || affordableUnits[0]
    return {
      action: 'buy',
      kind: 'unit',
      card: c,
      reason: '空名额 ' + slotsFree + ' 个 → 不刷新，先把钱换成干员：' + c.name + ' ' + num(c.cost) + ' 块' +
        (preferCard ? '（优先凑盟约：' + (ctx.prefer.reason || '盟约缺口') + '）' : '')
    }
  }
  if (!benchBlocked && canRefresh && (money >= 1 || freeRefresh > 0)) {
    if (freeRefresh > 0) {
      return { action: 'refresh', free: true, reason: '没有想要的卡 → 免费刷新（还剩 ' + freeRefresh + ' 次）' }
    }
    if (money === 1 && affordableUnits.length) {
      const c = affordableUnits[0]
      return {
        action: 'buy',
        kind: 'unit',
        card: c,
        reason: '最后 1 块：买人比再刷一次值 → ' + c.name + ' ' + num(c.cost) + ' 块'
      }
    }
    // 刷了几次还没出现想要的卡：店里有买得起的人就先买（2026-11-11 15:4x 加，来由见常量注释）。
    // 只买便宜的（≤2 块），贵的留给「想要的」。
    // 低本（1~2 本）刷一次没出对子就先买人凑；高本才允许多刷几次找关键卡。
    // 2026-11-14 18:5x 用户 m06708：「前期按照节奏走，一回合最多刷2次，其他买卡」。
    // 旧规则低本只给 1 次刷新，而且刷完只买 ≤2 块的卡，买不到就 stop（钱堆着/整备区空着）。
    // 现在统一给 2 次刷新额度，额度用完就把钱换成最便宜的干员（贵的留着给「想要的」）。
    const refreshBudget = 2
    if (refreshUsed >= refreshBudget && money >= 1) {
      const cheap = affordableUnits[0]
      if (cheap) {
        return {
          action: 'buy',
          kind: 'unit',
          card: cheap,
          reason: '刷了 ' + refreshUsed + ' 次没出想要的 → 先买个便宜的凑人数/对子：' + cheap.name + ' ' + num(cheap.cost) + ' 块'
        }
      }
    }
    return { action: 'refresh', free: false, reason: '没有想要的卡 → 刷新（1 块，本回合第 ' + (refreshUsed + 1) + ' 次，手上 ' + money + ' 块）' }
  }

  // 5) 刷不动了（刷新按钮灰 / 到安全阀 / 钱不够刷一次）：兜底买人（m00267「卡住就随便买，把整局跑完」）。
  if (money >= 1 && !benchBlocked && affordableUnits.length) {
    const c = affordableUnits[0]
    return { action: 'buy', kind: 'unit', card: c, reason: '刷不动了，先买一张能上场的：' + c.name + ' ' + num(c.cost) + ' 块' }
  }

  // 6) 还剩钱 → 买装备（不占整备区名额，m00211/m00214）。
  //    用户 m01034：装备后期会写优先表，**现在不要买太多** —— 整局先买到 3 件就停，且至少留 1 块。
  if (!equipFull && equipCount < EQUIP_CAP_FIRST && money >= 2) {
    const eq = equips.filter((c) => num(c.cost, 99) <= money).sort((a, b) => num(a.cost) - num(b.cost))[0]
    if (eq) {
      return {
        action: 'buy',
        kind: 'equip',
        card: eq,
        reason: '装备不占整备区，把 ' + num(eq.cost) + ' 块变成战力：' + eq.name
      }
    }
  }

  if (benchBlocked) {
    const why = benchFull ? '整备区满 ' + BENCH_CAP + ' 张'
      : bench >= BENCH_STOP_BUY ? '整备区 ' + bench + ' 张（到 BENCH_STOP_BUY=' + BENCH_STOP_BUY + ' 就不再买了，留着当换人素材）'
      : '买卡闸门关着（ctx.benchBlock）'
    return { action: 'stop', reason: why + '，剩 ' + money + ' 块花不掉' }
  }
  if (money > 0) {
    return { action: 'stop', reason: '还剩 ' + money + ' 块花不掉（店里没有买得起的，刷新也不可用）→ 不冻结，等下回合' }
  }
  return { action: 'stop', reason: '钱花光了，不冻结，等下回合自动刷新' }
}