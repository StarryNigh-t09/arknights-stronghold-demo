/**
 * tools.js — 交给 Coo 的工具表。
 *
 * 分工：这里只负责「参数说清楚、结果说人话」，动作都在 lib/ 里：
 *   adb.js      ADB 控制（截图、点、滑、按键、前台包名）
 *   nav.js      界面状态机（看一眼、走过去）
 *   vision.js   界面识别（转给 sidecar/vision.py，Python 干图像活）
 *   decide.js   休整期/三选一的决策规则
 *   knowledge.js PRTS 数据查询
 *   mode.js     全托管 / 同玩 的闸门
 *
 * 所有会动别人画面的工具都过 assertCanAct：同玩模式下默认不动，除非这一次调用里
 * 明确 force。这条是主人定的规矩，别为了「顺手」绕过去。
 */
import { screenshot, tap, swipe, key, screenSize, foregroundApp, adbPath, currentDevice, GAME_PKG, DEFAULT_DEVICE } from '../lib/adb.js'
import { look, goto, TRANSITIONS } from '../lib/nav.js'
import { STATE_LABEL } from '../lib/vision.js'
import { assertCanAct, getMode, setMode, modeLabel } from '../lib/mode.js'
import {
  adviseRest, adviseDraft, adviseOpening, operatorPool, reviewRun, levelupTableFromEconomy,
  COVENANTS, COVENANT_MEMBERS
} from '../lib/decide.js'
import {
  opInfo, covenantInfo, search, meta, versionInfo, recordRun, progress, COVENANT_OF,
  economy, covenantStrength, covenantPick, runflow, operatorTech, guides, liveNotes,
  covenantMap, operatorCovenants, covenantMembers, equipmentBook
} from '../lib/knowledge.js'
import { doctor } from '../lib/doctor.js'
import { enterRun, playRound, leaveSettle, placeUnit, placeItem, pickTactic, peek, POINTS, DEPLOY_SLOTS } from '../lib/run.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * wz_know 的整段视图。数据来自 2026-11-09 整理的五份 JSON：
 * economy / runflow / guides / live / covenants（pickAdvice）。
 * 全是社区攻略与直播观察，不是游戏内数值 —— 输出里要保留来源语气。
 */
function sectionText(section) {
  const lines = []
  if (section === 'economy') {
    const e = economy()
    lines.push('经济表（data/economy.json，更新于 ' + (e.updatedAt || '未知') + '）')
    for (const r of e.levelup || []) lines.push('· R' + r.round + ' 升到 ' + r.level + ' 本' + (r.money ? '（花 ' + r.money + ' 点）' : '') + '：' + (r.note || ''))
    for (const s of e.spending || []) lines.push('· 花钱｜' + s.topic + '：' + s.rule)
    for (const p of e.phases || []) lines.push('· 阶段｜' + p.stage + '：' + p.action)
    for (const o of e.openings || []) lines.push('· 开局｜' + o.stage + '：' + o.action)
    for (const m of e.mistakes || []) lines.push('· 别犯｜' + m.mistake + ' → ' + m.fix)
    return lines.join('\n')
  }
  if (section === 'runflow') {
    const r = runflow()
    lines.push('对局流程（data/runflow.json，更新于 ' + (r.updatedAt || '未知') + '）')
    for (const s of r.steps || []) lines.push('· ' + s.phase + '｜' + s.action + (s.detail ? '：' + s.detail : ''))
    lines.push('买卡优先级：')
    for (const b of r.buyPriority || []) lines.push('· ' + b.rule + (b.why ? '（' + b.why + '）' : ''))
    return lines.join('\n')
  }
  if (section === 'guides') {
    const g = guides()
    lines.push('视频攻略要点（data/guides.json，版本 ' + (g.version || '未知') + '）')
    for (const s of g.principles || []) lines.push('· 原则：' + s)
    for (const s of g.openings || []) lines.push('· 开局：' + s)
    for (const s of g.comp || []) lines.push('· 阵容：' + s)
    for (const s of g.counters || []) lines.push('· 对策：' + s)
    for (const s of g.mistakes || []) lines.push('· 别犯：' + s)
    return lines.join('\n')
  }
  if (section === 'live') {
    const list = liveNotes()
    lines.push('直播观察（data/live.json，' + list.length + ' 条）')
    for (const n of list) lines.push('· ' + (n.time ? n.time + ' ' : '') + (n.speaker || '') + '：' + n.claim)
    return lines.join('\n')
  }
  if (section === 'pick') {
    lines.push('本版选卡建议（data/covenants.json 的 pickAdvice，社区共识，不是游戏内数值）')
    for (const p of covenantPick()) {
      lines.push('· #' + p.rank + ' ' + p.advice)
      if (p.why) lines.push('   为什么：' + p.why)
      if (p.how) lines.push('   怎么做：' + p.how)
    }
    return lines.join('\n')
  }
  if (section === 'covmap') {
    const m = covenantMap()
    lines.push('干员↔盟约（data/covenants-map.json，' + m.total + ' 人 / ' + (m.covenants || []).length + ' 条盟约，来源 ASP Assistant Apache-2.0）')
    const season = (m.covenants || []).filter((c) => c.bondType === 'SEASON')
    const regular = (m.covenants || []).filter((c) => c.bondType !== 'SEASON')
    lines.push('大盟约（凑 ' + 3 + ' 名不同干员激活）：' + season.map((c) => c.name + '(' + ((m.members[c.name] || {}).operators || []).length + ')').join(' / '))
    lines.push('小盟约（职业类）：' + regular.map((c) => c.name + '(' + ((m.members[c.name] || {}).operators || []).length + ')').join(' / '))
    return lines.join('\n')
  }
  if (section === 'equipment') {
    const b = equipmentBook()
    lines.push('装备表（data/equipment.json，' + b.total + ' 件 + ' + (b.jobChange || 0) + ' 件转职，来源 ASP Assistant Apache-2.0）')
    for (const e of (b.items || []).slice(0, 12)) {
      const n = (e.normal || {})[0]
      lines.push('· ' + e.name + '（' + e.tier + ' 阶）' + (n && n.text ? '：' + n.text : ''))
    }
    if ((b.items || []).length > 12) lines.push('…… 还有 ' + ((b.items || []).length - 12) + ' 件')
    return lines.join('\n')
  }
  return '未知段落：' + section
}

/** 空参数对象的工具都写这个，省得每个都抄一遍。 */
const NO_ARGS = { type: 'object', additionalProperties: false, properties: {} }

/** 看一眼并把画面当成附件交出去；coo 自己看像素时用。 */
function seeOutcome(png, state, dist, note) {
  const label = STATE_LABEL[state] || state
  return {
    text: [
      '界面：' + label + '（' + state + '，距离 ' + Number(dist).toFixed(3) + '）',
      note || '',
      '图在附件里，' + png.length + ' 字节。'
    ].filter(Boolean).join('\n'),
    blobs: [{
      bytes: png,
      mime: 'image/png',
      name: 'wz-' + Date.now() + '.png',
      fallbackText: '明日方舟截图（' + label + '）'
    }]
  }
}

/**
 * @param {import('./world.js').WzWorld} world
 * @returns {any[]} ToolDef[]
 */
export function buildTools(world) {
  const cfg = world.config()
  const gap = cfg.actionGapMs

  const wzLook = {
    name: 'wz_look',
    description: '看一眼现在游戏画面（截图 + 认界面），图会作为附件给你，你自己看。不知道现在停在哪、该点哪儿时先看这个。',
    parameters: NO_ARGS,
    tags: ['read', 'snapshot'],
    handler: async () => {
      const png = screenshot()
      let vis = { state: 'unknown', dist: 1 }
      try {
        const { classifyBuffer } = await import('../lib/vision.js')
        vis = classifyBuffer(png)
      } catch (e) {
        return seeOutcome(png, 'unknown', 1, '（界面识别没跑起来：' + e.message + '，图你能看就先自己判断）')
      }
      world.lastState = vis.state
      world.lastLookAt = Date.now()
      return seeOutcome(png, vis.state, vis.dist)
    }
  }

  const wzState = {
    name: 'wz_state',
    description: '查连接状态：adb 在不在、模拟器连没连上、分辨率多少、明日方舟是不是在前台。不截图，比 wz_look 快。',
    parameters: NO_ARGS,
    tags: ['read'],
    handler: async () => {
      const app = foregroundApp()
      const size = screenSize()
      return [
        'adb: ' + adbPath(),
        'device: ' + currentDevice() + (currentDevice() === DEFAULT_DEVICE ? '（MuMu 默认端口）' : ''),
        '分辨率: ' + size.w + '×' + size.h,
        '前台: ' + (app ? app.pkg + '/' + app.activity : '未知'),
        '游戏在前台: ' + (app && app.pkg === GAME_PKG ? '是' : '否'),
        '模式: ' + modeLabel(getMode())
      ].join('\n')
    }
  }

  const wzGoto = {
    name: 'wz_goto',
    description: '把游戏自动导航到指定界面（截图认界面 → 点 → 等画面稳）。默认走到「卫戍协议大厅」。它只走路，不会替你开对局。走不动会告诉你卡在哪。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        target: {
          type: 'string',
          enum: Object.keys(TRANSITIONS),
          description: '目标：title 标题页 / login 登录页 / hall 大厅 / wz_hall 卫戍协议大厅 / wz_admin 物资调配处 / wz_squad 自选编队 / wz_db 协议数据库 / wz_joint 选择同盟方式'
        },
        maxSeconds: { type: 'integer', description: '最长等多久，默认 210 秒（冷启动要 45 秒以上）' },
        force: { type: 'boolean', description: '同玩模式下只在这一次动手（默认 false）' }
      }
    },
    tags: ['act', 'flow'],
    handler: async (args) => {
      try {
        assertCanAct(args.force === true)
      } catch (e) {
        return { text: '没动：' + e.message, failed: true }
      }
      const target = String(args.target || 'wz_hall')
      // 红线：联机大厅（选择同盟方式 / 搜寻队友 / 同盟模拟）一律不去。
      // 主人 2026-11-09 深夜交代「千万不要匹配」，这里做成代码级硬拦，
      // 不提供任何 force 通道 —— 误点一次就可能被系统判违规。
      if (target === 'wz_joint') {
        return { text: '不去：wz_joint 是联机入口（创建同盟 / 加入同盟 / 搜寻队友），属于禁入区。个人模拟请用 wz_enter_run。', failed: true }
      }
      if (!TRANSITIONS[target]) return { text: '没有这个界面：' + target, failed: true }
      const r = await goto(target, {
        deadlineMs: Math.max(30, Number(args.maxSeconds) || 210) * 1000,
        unknownGraceMs: 120_000
      })
      const head = r.ok ? '到了：' + (STATE_LABEL[target] || target) : '没走到：' + r.reason
      return head + '\n' + r.steps.slice(-25).join('\n')
    }
  }

  const wzTap = {
    name: 'wz_tap',
    description: '点屏幕上的一个点（1920×1080 横屏坐标，原点左上）。知道该点哪儿时用；不知道就先 wz_look 看图。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        x: { type: 'integer', description: '横坐标，0–1920' },
        y: { type: 'integer', description: '纵坐标，0–1080' },
        note: { type: 'string', description: '这一下点的是什么（写给自己和主人看）' },
        force: { type: 'boolean', description: '同玩模式下只在这一次动手' }
      },
      required: ['x', 'y']
    },
    tags: ['act'],
    handler: async (args) => {
      try {
        assertCanAct(args.force === true)
      } catch (e) {
        return { text: '没动：' + e.message, failed: true }
      }
      const x = Math.round(Number(args.x))
      const y = Math.round(Number(args.y))
      if (!(x >= 0 && x <= 1920 && y >= 0 && y <= 1080)) return { text: '坐标越界：' + x + ',' + y, failed: true }
      tap(x, y)
      await sleep(gap)
      return '点了 (' + x + ', ' + y + ')' + (args.note ? ' —— ' + args.note : '')
    }
  }

/** 鼠标源拖拽：放置干员 / 换位 / 改朝向 / 上装备。触摸源在这游戏里完全无效，见 lib/adb.js 注释。 */
  const wzPlace = {
    name: 'wz_place',
    description: '把甲板（整备区）上的干员拖到地图格上，或把装备/道具拖到场上的干员身上。干员走 MAA 的两步滑动：先拖动上场（~300-600ms 连续滑动，太快游戏不认），停 250ms，再朝方向滑 600px 定朝向；装备只滑一次（kind=item）。起手坐标必须落在脚下格子的中心 —— 按精灵模型会被当成单击，装备的起手点是它脚下那块木台面（折叠商店后 y≈860）。商店展开时拖动无效，先点右下 (1785,1012) 折叠。' ,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        fromX: { type: 'integer', description: '起手点横坐标（脚下格子中心，不是模型）' },
        fromY: { type: 'integer', description: '起手点纵坐标' },
        toX: { type: 'integer', description: '目标横坐标：干员上场填格子中心；上装备填那个干员脚下的格子中心' },
        toY: { type: 'integer', description: '目标纵坐标' },
        kind: { type: 'string', enum: ['unit', 'item'], description: 'unit=放干员上场（默认，带朝向）；item=把装备/道具装到干员身上（只滑一次，不定朝向）' },
        facing: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: 'kind=unit 时上场后的朝向，默认 right。近战堵路就朝敌人来向' },
        note: { type: 'string', description: '这一步在干什么' },
        force: { type: 'boolean', description: '同玩模式下只在这一次动手' }
      },
      required: ['fromX', 'fromY', 'toX', 'toY']
    },
    tags: ['act'],
    handler: async (args) => {
      try {
        assertCanAct(args.force === true)
      } catch (e) {
        return { text: '没动：' + e.message, failed: true }
      }
      const from = [Math.round(Number(args.fromX)), Math.round(Number(args.fromY))]
      const to = args.toX == null || args.toY == null
        ? DEPLOY_SLOTS[0]
        : [Math.round(Number(args.toX)), Math.round(Number(args.toY))]
      for (const p of [from, to]) {
        if (!(p[0] >= 0 && p[0] <= 1920 && p[1] >= 0 && p[1] <= 1080)) return { text: '坐标越界：' + p.join(','), failed: true }
      }
      const isItem = args.kind === 'item'
      const r = isItem ? await placeItem({ from, to }) : await placeUnit({ from, to, facing: args.facing || 'right' })
      const lines = r.log.slice()
      lines.push(isItem
        ? '核对：那个道具应从甲板消失；装了装备的话目标干员头顶的条会多一条（玩偶这类消耗品装上就销毁、不占条）'
        : '核对：剩余可放置角色应该减 1，绿色拾取态和左上「点击取消」应该消失；没变就是这一下没被认，先 wz_look 看是不是起手点没落在脚下格子上')
      if (args.note) lines.push('—— ' + args.note)
      return lines.join('\n')
    }
  }

  const wzSwipe = {
    name: 'wz_swipe',
    description: '从一点滑到另一点（列表翻页、拖动地图）。默认 300 毫秒。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        x1: { type: 'integer', description: '起点横坐标' },
        y1: { type: 'integer', description: '起点纵坐标' },
        x2: { type: 'integer', description: '终点横坐标' },
        y2: { type: 'integer', description: '终点纵坐标' },
        ms: { type: 'integer', description: '滑动时长，默认 300' },
        force: { type: 'boolean', description: '同玩模式下只在这一次动手' }
      },
      required: ['x1', 'y1', 'x2', 'y2']
    },
    tags: ['act'],
    handler: async (args) => {
      try {
        assertCanAct(args.force === true)
      } catch (e) {
        return { text: '没动：' + e.message, failed: true }
      }
      swipe(Number(args.x1), Number(args.y1), Number(args.x2), Number(args.y2), Number(args.ms) || 300)
      await sleep(gap)
      return '滑了 (' + args.x1 + ',' + args.y1 + ') → (' + args.x2 + ',' + args.y2 + ')'
    }
  }

  const wzKey = {
    name: 'wz_key',
    description: '按一个安卓键：back 返回 / home 回桌面 / recents 多任务。弹窗关不掉时先试 back。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        which: { type: 'string', enum: ['back', 'home', 'recents'], description: '按哪个键' },
        force: { type: 'boolean', description: '同玩模式下只在这一次动手' }
      },
      required: ['which']
    },
    tags: ['act'],
    handler: async (args) => {
      try {
        assertCanAct(args.force === true)
      } catch (e) {
        return { text: '没动：' + e.message, failed: true }
      }
      const code = { back: 4, home: 3, recents: 187 }[String(args.which)]
      if (!code) return { text: '没有这个键：' + args.which, failed: true }
      key(code)
      await sleep(gap)
      return '按了 ' + args.which
    }
  }

  const wzMode = {
    name: 'wz_mode',
    description: '切模式：auto = 全托管（她自己点），advise = 同玩（只给建议不动手）。看当前模式不带参数。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        set: { type: 'string', enum: ['auto', 'advise'], description: '切成哪个；不写就是看当前' }
      }
    },
    tags: ['write'],
    handler: async (args) => {
      if (!args.set) return '现在是：' + modeLabel(getMode())
      const r = setMode(String(args.set))
      await world.ctx?.persist?.({ mode: String(args.set) })
      return '模式 ' + modeLabel(r.before) + ' → ' + modeLabel(r.after)
    }
  }

  const wzAdvise = {
    name: 'wz_advise',
    description: [
      '卫戍协议该怎么走一步。规则是硬的：资金回合结束清零、没有利息，所以有钱就得花掉；',
      '升调度中心只在它挡住能刷出的等阶时才值；末期不再投资。',
      '给 money / centerLevel / round / shop 就能拿到「动作 + 理由」，但它只是参考——最后怎么打你自己定。'
    ].join(''),
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        mode: { type: 'string', enum: ['rest', 'draft', 'opening', 'pool'], description: 'rest 休整期 / draft 三选一六选一 / opening 开局策略 / pool 本局能刷出谁' },
        cores: { type: 'array', items: { type: 'string' }, description: '本局随机到的核心盟约名' },
        addons: { type: 'array', items: { type: 'string' }, description: '本局随机到的附加盟约名' },
        plan: { type: 'string', enum: ['balanced', 'covenant', 'economy', 'elite'], description: 'opening：想走什么路子' },
        unlocked: { type: 'array', items: { type: 'string' }, description: 'opening：已解锁的初始策略' },
        money: { type: 'integer', description: '当前资金' },
        centerLevel: { type: 'integer', description: '调度中心等级 1–6' },
        round: { type: 'integer', description: '第几回合，1 起' },
        totalRounds: { type: 'integer', description: '本局总回合（标准 9，险境以上 14）' },
        deployed: { type: 'integer', description: '已上场人数（上限 8）' },
        shop: { type: 'array', description: '本轮商店 [{name,tier,cost?}]' },
        owned: { type: 'object', description: '已有干员 {名字: 数量}' },
        activeCovenants: { type: 'array', items: { type: 'string' }, description: '已经叠起来的盟约' },
        options: { type: 'array', description: 'draft：候选 [{name,tier?,effect?}]' },
        config: { type: 'object', description: '覆盖 {costByTier, levelupCost}' }
      }
    },
    tags: ['read'],
    handler: async (args) => {
      const mode = String(args.mode || 'rest')
      const covenantMembers = COVENANT_MEMBERS
      if (mode === 'pool') {
        const p = operatorPool(args.cores || [], { addons: args.addons })
        const lines = [p.reason, '可能出现 ' + p.available.length + ' 名，出不了 ' + p.excluded.length + ' 名']
        lines.push('池内：' + (p.available.join('、') || '（空）'))
        if (p.excluded.length <= 30) lines.push('池外：' + p.excluded.join('、'))
        return lines.join('\n')
      }
      if (mode === 'opening') {
        const r = adviseOpening(args.options || [], { plan: args.plan, unlocked: args.unlocked })
        const lines = ['建议选：' + (r.pick ?? '没有可用策略') + '（' + r.reason + '）']
        for (const x of r.ranking) {
          lines.push('  ' + (x.locked ? '[锁] ' : '') + x.name + ' score=' + (x.score === -Infinity ? '-∞' : x.score) + ' ' + x.reasons.join('；'))
        }
        return lines.join('\n')
      }
      if (mode === 'draft') {
        const r = adviseDraft(args.options || [], {
          activeCovenants: args.activeCovenants,
          covenantMembers,
          covenantStrength: covenantStrength(),
          round: args.round
        })
        const lines = ['建议拿：' + (r.pick ?? '无法判断')]
        for (const x of r.ranking) lines.push('  ' + x.name + ' score=' + x.score + ' ' + x.reasons.join('；'))
        return lines.join('\n')
      }
      const warnings = []
      if (Array.isArray(args.shop) && Number(args.centerLevel) > 0) {
        const over = args.shop.filter((c) => Number(c && c.tier) > Number(args.centerLevel))
        if (over.length) {
          warnings.push('⚠ 输入自检：' + over.map((c) => c.name + '(tier' + c.tier + ')').join('、')
            + ' 的等阶高于调度中心 Lv' + args.centerLevel + '，按规则不该出现 —— 要么读错，要么 centerLevel 填错。')
        }
      }
      let pool
      if (Array.isArray(args.cores) && args.cores.length) {
        const p = operatorPool(args.cores, { addons: args.addons })
        pool = p.available
        warnings.push('本局池子：核心盟约 ' + args.cores.join('、') + ' → 可能 ' + p.available.length + ' 名，出不了 ' + p.excluded.length + ' 名')
      }
      const r = adviseRest({
        money: args.money,
        centerLevel: args.centerLevel,
        round: args.round,
        totalRounds: args.totalRounds,
        shop: args.shop,
        pool,
        owned: args.owned,
        activeCovenants: args.activeCovenants,
        covenantMembers,
        covenantStrength: covenantStrength(),
        buyRules: runflow().buyPriority,
        // 经济表里的 levelup 只记了「几回合升到几本」，费用要按同一份表算全，
        // 只给 levelupCostTable() 那半张（{1:5}）会让 Lv2 以上全查不到价，白白劝人刷新。
        levelupCost: levelupTableFromEconomy(economy().levelup),
        deployed: args.deployed,
        config: args.config
      })
      const lines = ['动作：' + r.action + (r.target ? ' → ' + r.target : '') + (r.spend ? '（花 ' + r.spend + '）' : ''), '理由：' + r.reason]
      if (r.alternatives && r.alternatives.length) lines.push('备选：' + r.alternatives.join(' / '))
      for (const w of warnings) lines.push(w)
      return lines.join('\n')
    }
  }

  const wzKnow = {
    name: 'wz_know',
    description: [
      '查卫戍协议的知识：干员、盟约、装备、法术道具、策略、领袖、机制、规则。',
      '数据来自 PRTS，赛季=规程。强度随版本变，表是按抓取时点做的；PRTS 没写的数值这里也没有。'
    ].join(''),
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', description: '要查什么；精确查时写名字' },
        op: { type: 'string', description: '按干员名精确查' },
        covenant: { type: 'string', description: '按盟约名精确查' },
        version: { type: 'boolean', description: '只看版本信息' },
        meta: { type: 'boolean', description: '本季社区共识快照' },
        section: {
          type: 'string',
          enum: ['economy', 'runflow', 'guides', 'live', 'pick', 'covmap', 'equipment'],
          description: '整段看社区攻略：economy 经济节奏 / runflow 对局流程 / guides 视频要点 / live 直播观察 / pick 本版选卡建议 / covmap 干员↔盟约归属 / equipment 装备表'
        }
      }
    },
    tags: ['read'],
    handler: async (args) => {
      const lines = []
      if (args.meta) {
        const m = meta()
        if (!m) return '没有本季共识快照。'
        lines.push('『' + m.season + '』社区共识 · 抓于 ' + m.capturedAt + '　⚠ ' + m.expiresHint)
        for (const n of m.notes || []) lines.push('· ' + n.topic + '：' + n.text)
        lines.push('')
        lines.push(m.caveat)
        return lines.join('\n')
      }
      if (args.version) {
        const v = versionInfo()
        lines.push('赛季：' + v.season + '（' + v.seasonStart + ' 起）')
        lines.push('数据抓取：' + v.generatedAt)
        lines.push('攻略视频：现行 ' + v.videos.current + ' 条 / 作废 ' + v.videos.old + ' 条，最新 ' + v.videos.newestCurrent)
        lines.push(v.note)
        return lines.join('\n')
      }
      if (args.section) {
        return sectionText(String(args.section))
      }
      if (args.op) {
        const o = opInfo(String(args.op))
        if (!o) return '没查到干员「' + args.op + '」。可能不在可选池里，或名字写错了。'
        lines.push(o.name + '（' + o.tier + ' 阶' + (o.covenants && o.covenants.length ? '，盟约 ' + o.covenants.join('/') : '') + '）')
        if (o.trait_type) lines.push('特质类型：' + o.trait_type)
        if (o.trait_initial) lines.push('初始：' + o.trait_initial)
        if (o.trait_elite) lines.push('精锐：' + o.trait_elite)
        if (o.tierMeta) lines.push('养成：' + o.tierMeta.initial + ' → ' + o.tierMeta.elite)
        const belong = COVENANT_OF[o.name] || []
        if (belong.length) lines.push('参与盟约：' + belong.join('、'))
        const tech = operatorTech(o.name)
        if (tech) lines.push('技能建议：' + tech.skill + (tech.tier ? '（' + tech.tier + '）' : ''))
        const unit = (runflow().units || []).find((u) => u.name === o.name)
        if (unit && unit.why) lines.push('定位：' + unit.why)
        return lines.join('\n')
      }
      if (args.covenant) {
        const c = covenantInfo(String(args.covenant))
        if (!c) return '没查到盟约「' + args.covenant + '」。'
        lines.push(c.name + '（' + (c.kind === 'core' ? '核心' : '附加') + '，激活 ' + c.need + ' 名，加强 ' + c.enhance + ' 名）')
        lines.push('效果：' + c.effect)
        if (!c.operators.length) lines.push('成员：无绑定干员 —— 靠场内精锐数量激活。')
        else lines.push('成员（' + c.operators.length + '）：' + c.operators.map((x) => x.name + '(' + x.tier + ')').join('、'))
        // 社区评级只当参考，标明来源和日期，别让它冒充游戏内数值
        const st = covenantStrength()[c.name]
        if (st) lines.push('社区评级：' + (st.tier || '?') + '（' + (st.kind === 'core' ? '核心' : '附加') + '）' + (st.rating ? ' — ' + st.rating : ''))
        return lines.join('\n')
      }
      const hits = search(String(args.query || ''), { limit: 6 })
      if (!hits.length) return '没搜到「' + (args.query || '') + '」。换个词，或用 op / covenant 精确查。'
      return hits.map((h) => '[' + h.kind + '] ' + h.name + ' — ' + h.snippet).join('\n')
    }
  }

  const wzEnterRun = {
    name: 'wz_enter_run',
    description: '从卫戍协议大厅开一局：个人模拟 → 独立模拟/极速模拟 → 开始模拟 → 过教学 → 停在第一个休整期。会消耗一局战绩。开不起来会告诉你卡在哪一步。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        mode: {
          type: 'string',
          enum: ['independent', 'quick'],
          description: 'independent 独立模拟（有规程等级、走完整局）/ quick 极速模拟（回合少，练手用）'
        },
        force: { type: 'boolean', description: '同玩模式下只在这一次动手（默认 false）' }
      }
    },
    tags: ['act', 'flow'],
    handler: async (args) => {
      try {
        assertCanAct(args.force === true)
      } catch (e) {
        return { text: '没动：' + e.message, failed: true }
      }
      const mode = args.mode === 'quick' ? 'quick' : 'independent'
      const cur = await look()
      if (cur.state !== 'wz_hall') {
        const nav = await goto('wz_hall', { deadlineMs: 240_000, unknownGraceMs: 120_000 })
        if (!nav.ok) {
          return { text: '没走到卫戍协议大厅：' + (nav.reason || '超时') + '\n' + nav.steps.slice(-10).join('\n'), failed: true }
        }
      }
      const r = await enterRun({ mode })
      const label = mode === 'quick' ? '极速模拟' : '独立模拟'
      world.lastState = r.state
      world.lastLookAt = Date.now()
      if (!r.ok) {
        return {
          text: '没进到休整期（最后看到：' + r.state + '，距离 ' + Number(r.dist).toFixed(3) + '）。可能卡在教学对话或加载里。\n' + r.log.join('\n'),
          failed: true
        }
      }
      return ['开局完成：' + label + '，现在是第 1 回合休整期。', ...r.log].join('\n')
    }
  }

  const wzPlayRound = {
    name: 'wz_play_round',
    description: '打完当前这一回合：点准备就绪 → 确认（资金清空提示）→ 开始作战 → 等战斗结束 → 停在下一个休整期或结算页。战斗全自动，不用管站位。不在休整期时不要调。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        maxBattleSeconds: { type: 'integer', description: '本回合最多等多久，默认 150 秒' },
        force: { type: 'boolean', description: '同玩模式下只在这一次动手（默认 false）' }
      }
    },
    tags: ['act', 'flow'],
    handler: async (args) => {
      try {
        assertCanAct(args.force === true)
      } catch (e) {
        return { text: '没动：' + e.message, failed: true }
      }
      const cur = await look()
      if (cur.state === 'wz_settle') {
        return '已经是结算页了，这一局结束了。要看成绩用 wz_review，回大厅用 wz_leave_settle。'
      }
      if (cur.state !== 'wz_rest' && cur.state !== 'wz_prep') {
        return { text: '现在不是休整期（看到的是 ' + cur.state + '），先 wz_look 看一眼再决定。', failed: true }
      }
      let r
      if (cur.state === 'wz_prep') {
        const { tap } = await import('../lib/adb.js')
        tap(POINTS.startBattle[0], POINTS.startBattle[1])
        await sleep(2500)
        const { waitFor } = await import('../lib/run.js')
        const st = await waitFor(['wz_battle'], { timeoutMs: 20_000 })
        const end = await waitFor(['wz_rest', 'wz_settle', 'wz_prep'], { timeoutMs: Math.max(30, Number(args.maxBattleSeconds) || 150) * 1000, gapMs: 2000 })
        r = { ok: true, state: end.state, log: ['点了开始作战（本来就在准备页）'], enteredBattle: st.state === 'wz_battle' }
      } else {
        r = await playRound({ battleMaxMs: Math.max(30, Number(args.maxBattleSeconds) || 150) * 1000 })
      }
      world.lastState = r.state
      world.lastLookAt = Date.now()
      const where = STATE_LABEL[r.state] || r.state
      if (!r.ok) {
        return { text: '这一回合没打完，停在：' + where + '\n原因：' + (r.reason || '未知') + '\n' + r.log.join('\n'), failed: true }
      }
      const next = r.state === 'wz_settle'
        ? '这局结束了 —— 先 wz_review 复盘，再 wz_leave_settle 回大厅。'
        : r.state === 'wz_rest'
          ? '进入下一个休整期：想买什么用 wz_advise 出主意，买完再 wz_play_round。'
          : '现在停在 ' + where + '，看一眼再决定。'
      return ['这一回合打完了，现在停在：' + where, ...r.log, next].join('\n')
    }
  }

  const wzLeaveSettle = {
    name: 'wz_leave_settle',
    description: '结算页点「返回主页」回卫戍协议大厅。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        force: { type: 'boolean', description: '同玩模式下只在这一次动手（默认 false）' }
      }
    },
    tags: ['act', 'flow'],
    handler: async (args) => {
      try {
        assertCanAct(args.force === true)
      } catch (e) {
        return { text: '没动：' + e.message, failed: true }
      }
      const r = await leaveSettle()
      world.lastState = r.state
      return (r.ok ? '回大厅了。' : '没回到大厅，停在：' + r.state + '。') + '\n' + r.log.join('\n')
    }
  }

  const wzAutoRun = {
    name: 'wz_auto_run',
    description: '全托管打完一整局：每回合自动看商店、花钱买、打完这一回合，直到结算或到你给的上限。只在「自己打」模式（wz_mode auto）下用。会消耗真实战绩，长跑前先跟主人说一声。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        maxRounds: { type: 'integer', description: '最多打几回合，默认 12' },
        maxBattleSeconds: { type: 'integer', description: '单回合战斗最多等多久，默认 150 秒' },
        force: { type: 'boolean', description: '同玩模式下只在这一次动手（默认 false）' }
      }
    },
    tags: ['act', 'flow'],
    handler: async (args) => {
      try {
        assertCanAct(args.force === true)
      } catch (e) {
        return { text: '没动：' + e.message, failed: true }
      }
      const cur = await look()
      if (cur.state !== 'wz_rest' && cur.state !== 'wz_prep') {
        return { text: '现在不在对局里（' + (STATE_LABEL[cur.state] || cur.state) + '）。要开一局先用 wz_enter_run。', failed: true }
      }
      const { autoRun } = await import('../lib/drive.js')
      const r = await autoRun({
        maxRounds: Math.max(1, Number(args.maxRounds) || 12),
        maxBattleSeconds: Math.max(30, Number(args.maxBattleSeconds) || 150)
      })
      world.lastState = peek().state
      const body = r.log.slice(-40).join('\n')
      if (!r.ok) return { text: '一回合都没打完：' + (r.stop || '未知') + '\n' + body, failed: true }
      // 打完就顺手复盘存盘：进步曲线要有人记，不能靠 coo 每次记得调 wz_review
      let saved = ''
      try {
        const rv = reviewRun(r.rounds)
        recordRun({ rounds: r.rounds, note: 'auto_run' }, {
          rounds: rv.rounds,
          winRate: rv.winRate,
          wastedMoneyRounds: rv.wastedMoneyRounds,
          lifeLostRounds: rv.lifeLostRounds
        })
        saved = '复盘：' + rv.findings.slice(0, 3).join('；')
      } catch (e) {
        saved = '复盘没写成：' + e.message
      }
      const tail = r.stop === '结算了' ? '这局结束了。要回大厅用 wz_leave_settle。' : '停下了：' + (r.stop || '到你给的上限')
      return ['打了 ' + r.rounds.length + ' 个回合。', tail, saved, body].join('\n')
    }
  }

  const wzReview = {
    name: 'wz_review',
    description: '一局打完复盘：给每回合的记录（剩多少资金、第几回合掉血、过没过），输出结论和改进点。save=true 时记进 data/runs.jsonl。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        rounds: {
          type: 'array',
          description: '[{round, moneyLeft?, lifeLost?, won?, notes?}]',
          items: {
            type: 'object',
            properties: {
              round: { type: 'integer' },
              moneyLeft: { type: 'integer' },
              lifeLost: { type: 'integer' },
              won: { type: 'boolean' },
              notes: { type: 'string' }
            }
          }
        },
        save: { type: 'boolean', description: '是否落盘' },
        difficulty: { type: 'string', description: '入门/标准/险境/绝境/终极' },
        note: { type: 'string', description: '一句话备注' }
      },
      required: ['rounds']
    },
    tags: ['read'],
    handler: async (args) => {
      const r = reviewRun(args.rounds || [])
      const lines = ['回合数 ' + r.rounds + '，通过率 ' + (r.winRate == null ? '-' : Math.round(r.winRate * 100) + '%')]
      for (const f of r.findings) lines.push('· ' + f)
      if (args.save) {
        const rec = recordRun({ rounds: args.rounds || [], difficulty: args.difficulty, note: args.note }, {
          rounds: r.rounds,
          winRate: r.winRate,
          wastedMoneyRounds: r.wastedMoneyRounds,
          lifeLostRounds: r.lifeLostRounds
        })
        lines.push('已记入 ' + rec.at + '（data/runs.jsonl）')
      }
      return lines.join('\n')
    }
  }

  const wzProgress = {
    name: 'wz_progress',
    description: '看进步曲线：打了几局、平均通过率、平均撑到第几回合、平均几回合没把钱花完。',
    parameters: NO_ARGS,
    tags: ['read'],
    handler: async () => {
      const p = progress()
      if (!p.runs) return p.note
      return [
        '已记录 ' + p.runs + ' 局，最近一局 ' + p.lastRunAt,
        '平均通过率 ' + p.avgWinRate + '%（前一半 ' + p.firstHalfWinRate + '% → 后一半 ' + p.latestHalfWinRate + '%）',
        '平均撑到第 ' + p.avgDepth + ' 回合',
        '平均每局有 ' + p.avgWastedMoneyRounds + ' 个回合没把钱花完'
      ].join('\n')
    }
  }

  const wzDoctor = {
    name: 'wz_doctor',
    description: '自检：adb 在不在、模拟器连没连上、分辨率对不对、游戏装没装、Python+Pillow 在不在、界面模板全不全。装到新机器上先跑这个。',
    parameters: NO_ARGS,
    tags: ['read'],
    handler: async () => {
      const r = doctor()
      const lines = r.checks.map((c) => (c.ok ? '✔ ' : '✘ ') + c.name + ' —— ' + c.detail + (c.ok ? '' : '\n    ↳ ' + c.hint))
      return (r.ok ? '全部通过，可以开工。' : '有 ' + r.checks.filter((c) => !c.ok).length + ' 项没过，按 ↳ 的提示修。') + '\n' + lines.join('\n')
    }
  }

  return [wzLook, wzState, wzGoto, wzTap, wzPlace, wzSwipe, wzKey, wzMode, wzAdvise, wzKnow, wzEnterRun, wzPlayRound, wzLeaveSettle, wzAutoRun, wzReview, wzProgress, wzDoctor]
}