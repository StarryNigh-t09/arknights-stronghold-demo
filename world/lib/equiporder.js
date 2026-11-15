/**
 * 装备按属性分（用户 m00999 / m03431 口述的硬规则）：
 *   「加攻击给输出，加阻挡/生命给重装；同类取阶数最高的那件」。
 *
 * 这个模块只做纯计算，不碰 adb、不读文件 —— 所有判断都来自 data/equipment.json 的
 * effectDescription 与 tier，好单测，也好在日志里给出理由。
 *
 * 判定顺序（顺序是有意的）：
 *   1. 「装备时销毁」类（盟约之币、随身身份牌、紧急调度券）是消耗品，装上去就没了，
 *      而且要人挑时机 —— 一律不主动搬，留给人工。
 *   2. 先认攻击：源石溶剂写着「每秒流失 60 点生命值，攻击力 +40%」，攻击才是它的目的。
 *   3. 再认防御/生命：坚守盾牌、雪祀之衣、活血饮料都归这里（承伤用）。
 *   4. 都认不出来的（纯经济/纯机制）不动。
 */

export const EQUIP_KIND = { attack: 'attack', defense: 'defense', utility: 'utility', unknown: 'unknown' }

export function classifyEquip(effect = '') {
  const t = String(effect || '')
  if (!t) return EQUIP_KIND.unknown
  if (/装备时销毁/.test(t)) return EQUIP_KIND.utility
  // 用「攻击力」而不是「攻击」：雪祀之衣写着「更不容易受到攻击」，按「攻击」判会被误认成攻击件
  if (/攻击力|攻速|伤害|技力/.test(t)) return EQUIP_KIND.attack
  if (/防御|生命上限|法抗|阻挡|回复.*生命|生命.*回复/.test(t)) return EQUIP_KIND.defense
  return EQUIP_KIND.unknown
}

/**
 * 职业分组：0=医疗 1=远程输出 2=近战承伤（和 lib/deployorder.js 的 roleOfGroup 一致）。
 * 不给兜底组：攻击件只给远程输出、防御件只给近战承伤。没这类人就把装备挂住等下一回合，
 * 别把「攻击力+15%」给一个扛线的重装（用户 m00999 原话就是按属性分，不分就没意义）。
 */
export function targetGroupOfKind(kind) {
  if (kind === EQUIP_KIND.attack) return [1]
  if (kind === EQUIP_KIND.defense) return [2]
  return []
}

export function kindLabel(kind) {
  if (kind === EQUIP_KIND.attack) return '攻击'
  if (kind === EQUIP_KIND.defense) return '防御/生命'
  if (kind === EQUIP_KIND.utility) return '消耗品'
  return '未识别'
}

/** 每人最多挂几件（游戏里干员头顶最多两条装备白条）。 */
export const MAX_EQUIP_PER_UNIT = 2

function tierOf(it) {
  const n = Number(it && it.tier)
  return Number.isFinite(n) && n > 0 ? n : 1
}

/**
 * 排一遍：哪件装备该给谁。
 *
 * items: [{ name, tier, effect, chip, placed }]
 * units: [{ name, roleGroup, chip }]
 * 返回 { plan: [{ item, unit, kind, reason }], held: [{ item, reason }] }
 *   - plan 里是有明确去处、且当前没挂在目标身上的
 *   - held 里是决定不动的（消耗品 / 已就位 / 没有匹配职业）
 */
export function planEquipAssignments(items = [], units = []) {
  const list = (items || []).filter((x) => x && x.name)
  const us = (units || []).filter((x) => x && x.chip)
  const plan = []
  const held = []
  if (!list.length) return { plan, held }
  if (!us.length) return { plan, held: list.map((item) => ({ item, reason: '场上没有干员' })) }

  // 每人已挂几件（目标身上原有的不算，这里只看本轮分出去的）
  const load = new Map(us.map((u) => [u, 0]))
  // 排序：攻击先分（输出是主要伤害来源），同类别按阶数降序；同阶保持甲板顺序（稳定）
  const rank = (it) => (classifyEquip(it.effect) === EQUIP_KIND.attack ? 0 : 1)
  const ordered = list.slice().sort((a, b) => {
    const ra = rank(a), rb = rank(b)
    if (ra !== rb) return ra - rb
    return tierOf(b) - tierOf(a)
  })

  for (const item of ordered) {
    const kind = classifyEquip(item.effect)
    if (kind === EQUIP_KIND.utility) { held.push({ item, kind, reason: '消耗品（装上就销毁），不主动搬' }); continue }
    if (kind === EQUIP_KIND.unknown) { held.push({ item, kind, reason: '看不出属性，不动' }); continue }
    const groups = targetGroupOfKind(kind)
    // 目标：对应职业组、且还没挂满；同组里先给挂得少的（把属性摊开）
    const cands = us
      .filter((u) => groups.includes(Number(u.roleGroup)))
      .filter((u) => load.get(u) < MAX_EQUIP_PER_UNIT)
    if (!cands.length) {
      held.push({ item, kind, reason: '没有可用的' + kindLabel(kind) + '位（' + (kind === EQUIP_KIND.attack ? '远程输出' : '近战承伤') + '）' })
      continue
    }
    const grank = (u) => groups.indexOf(Number(u.roleGroup))
    cands.sort((a, b) => load.get(a) - load.get(b) || grank(a) - grank(b))
    const unit = cands[0]
    load.set(unit, load.get(unit) + 1)
    // 已经挂在目标身上就别再拖（拖一次白花 5s，还会把装备挪到别人身上）
    if (item.placed && item.chip && unit.chip && item.chip === unit.chip) {
      held.push({ item, kind, unit, reason: '已经挂在 ' + unit.name + ' 身上' })
      continue
    }
    plan.push({
      item, unit, kind,
      reason: kindLabel(kind) + '（' + tierOf(item) + ' 阶）→ ' + unit.name + '（' + groupLabel(unit.roleGroup) + '）'
    })
  }
  return { plan, held }
}

export function groupLabel(g) {
  const n = Number(g)
  if (n === 1) return '远程输出'
  if (n === 2) return '近战承伤'
  if (n === 0) return '医疗'
  return '未知职业'
}

/** 日志用一行摘要。 */
export function describeEquipPlan(res) {
  const p = (res && res.plan) || []
  const h = (res && res.held) || []
  if (!p.length && !h.length) return '没有装备'
  const a = p.map((x) => x.reason).join(' / ')
  const b = h.map((x) => x.item.name + '（' + x.reason + '）').join(' / ')
  return [a, b && ('不动：' + b)].filter(Boolean).join('；')
}
