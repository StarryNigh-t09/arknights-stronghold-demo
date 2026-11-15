/**
 * world.js — World 实例。
 *
 * 只做三件事：把配置读出来、把工具表交出去、把「现在是什么局面」写进环境提示词。
 * 真正的动作在 tools.js，界面识别在 lib/nav.js，决策在 lib/decide.js。
 *
 * 为什么 start() 里不自动开局、不自动截图：World 不该在主人没开口的时候动别人的
 * 游戏。要她动手，得她自己调工具（或主人说「你来打」）。
 */
import { buildTools } from './tools.js'
import { normalizeConfig } from './config.js'
import { setMode, getMode, modeLabel } from '../lib/mode.js'
import { setRunsDir } from '../lib/knowledge.js'
import { foregroundApp, GAME_PKG, screenSize, adbPath, setDevice, setAdbPath } from '../lib/adb.js'
import { STATE_LABEL } from '../lib/vision.js'
import { fileURLToPath } from 'node:url'

/** 环境提示词模板；缺了就不进系统前缀，所以路径写死在这里，别让打包把它挪走。 */
const ENV_PROMPT_FILE = fileURLToPath(new URL('./ENV_PROMPT.md', import.meta.url))

export class WzWorld {
  /** @param {any} ctx WorldContext */
  constructor(ctx) {
    this.ctx = ctx
    this.host = null
    // 复盘记录写进 World 自己的 data 目录（装进扩展后包目录在 node_modules 下，不能写）
    setRunsDir(ctx.dataDir)
    /** 最近一次看画面得到的界面状态，只用来写环境提示词，不做决策依据。 */
    this.lastState = null
    this.lastLookAt = 0
  }

  get id() {
    return 'arknights-wz'
  }

  config() {
    const cfg = normalizeConfig(this.ctx.cfg || {})
    // 配置可能在设置页被改过，每次读都同步给控制层（都是幂等的，开销可以忽略）
    setDevice(cfg.device)
    setAdbPath(cfg.adbPath)
    return cfg
  }

  async start(host) {
    this.host = host
    const cfg = this.config()
    setMode(cfg.mode)
    this.ctx.console?.info?.('[arknights-wz] 起来了：' + modeLabel(cfg.mode) + '，设备 ' + cfg.device)
  }

  async stop() {
    this.host = null
  }

  tools() {
    return buildTools(this)
  }

  /**
   * 面板声明。这里只挂一份提示词模板（role=envPrompt），没有自定义面板 ——
   * 说话、气泡、声音都归 desktop-pet 那个 World，这里再做一个面板只是多一个没人看的窗。
   * 注意：promptDocs 只有从 webUi() 返回才会进系统前缀，写在这儿是有意的。
   */
  webUi(language = 'zh') {
    return {
      label: language === 'en' ? 'Arknights · Stronghold Protocol' : '明日方舟·卫戍协议',
      panels: [],
      promptDocs: [{
        key: 'worlds.arknights-wz.envPrompt',
        title: language === 'en' ? 'Arknights protocol play' : '明日方舟·卫戍协议',
        description: language === 'en'
          ? 'How to look at the emulator, move through the game and play Stronghold Protocol.'
          : '怎么用 ADB 看模拟器、在游戏里走路、怎么打卫戍协议。',
        path: ENV_PROMPT_FILE,
        role: 'envPrompt',
        vars: [
          { name: 'wz.mode', description: '当前模式（全托管 / 同玩）' },
          { name: 'wz.device', description: 'ADB 设备' },
          { name: 'wz.screen', description: '游戏分辨率' },
          { name: 'wz.gameRunning', description: '游戏是否在前台' },
          { name: 'wz.lastScreen', description: '上一次认出来的界面' },
          { name: 'wz.canAct', description: '现在能不能自己动手' },
          { name: 'wz.rules', description: '本模式的硬规则', multiline: true }
        ]
      }]
    }
  }

  /**
   * 环境提示词变量。envPromptVars 返回 null 就等于「这条世界不参与系统前缀」，
   * 所以只要世界开着，这里就该给出一份能看懂的现状。
   */
  envPromptVars() {
    const cfg = this.config()
    let screen = '未知'
    let foreground = '未知'
    try {
      const s = screenSize()
      screen = s.w + '×' + s.h
      const app = foregroundApp()
      foreground = app ? app.pkg : '无'
    } catch {
      screen = 'ADB 连不上'
    }
    const state = this.lastState ? (STATE_LABEL[this.lastState] || this.lastState) : '还没看过'
    return {
      'wz.mode': modeLabel(getMode()),
      'wz.device': cfg.device,
      'wz.screen': screen,
      'wz.foreground': foreground,
      'wz.gameRunning': foreground === GAME_PKG ? '是' : '否',
      'wz.lastScreen': state,
      'wz.canAct': getMode() === 'auto' ? '可以自己动手' : '只给建议，不动手',
      'wz.rules': [
        '资金在休整期结束时清零、没有利息 —— 有钱就花掉，攒钱是纯亏。',
        '调度中心等级 ≥ 干员等阶才可能刷出该等阶的卡（硬门槛）。',
        '同名 3 个【初始】自动合成 1 个【精锐】，合成后系统免费刷 3 名高一阶的干员，买了就结束这轮。',
        '部署不花费用，按整备区顺序自动上场，上限 8 人。',
        '手牌 10 个常规槽 + 5 个临时槽，临时槽的牌下一阶段清空。',
        '每名干员最多 2 件装备，同名 2 件合成进阶。',
        '标准难度 9 回合、险境以上 14 回合，末回合是领袖战。',
        '战斗全自动，玩家只做决策：开局策略 → 买干员/道具 → 布阵 → 盟约 → 3 选 1。'
      ].join('')
    }
  }
}
