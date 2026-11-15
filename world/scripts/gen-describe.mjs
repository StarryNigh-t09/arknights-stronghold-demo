/**
 * gen-describe.mjs — 从 tools() 生成 describe.json。
 *
 * 为什么生成而不是手写：手写的 description 和代码里的迟早会分叉，而 describe.json 是
 * 主人在市场页/面板上唯一看得到的东西。跑一次 `node scripts/gen-describe.mjs` 再提交。
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import definition from '../src/definition.js'

const SUMMARIES = {
  wz_look: '看一眼游戏画面，图直接给你',
  wz_state: '连接状态：adb、分辨率、前台是不是明日方舟',
  wz_goto: '自动导航到某个界面',
  wz_tap: '在画面上点一下',
  wz_swipe: '滑动',
  wz_key: '按返回/主页/多任务',
  wz_mode: '切全托管或同玩',
  wz_advise: '休整期该干什么（规则打分，仅供参考）',
  wz_know: '查干员、盟约、策略、机制',
  wz_review: '一局打完复盘',
  wz_progress: '进步曲线',
  wz_doctor: '自检外部依赖'
}

const world = definition.create({
  cfg: definition.defaults(),
  console: { info() {}, warn() {} },
  persist: async () => {},
  dataDir: process.cwd()
})

const tools = world.tools().map((t) => ({
  name: t.name,
  description: t.description,
  parameters: t.parameters,
  tags: t.tags,
  ...(SUMMARIES[t.name] ? { summary: SUMMARIES[t.name] } : {})
}))

const out = { tools, events: [] }
const target = fileURLToPath(new URL('../describe.json', import.meta.url))
writeFileSync(target, JSON.stringify(out, null, 2) + '\n')
console.log('wrote ' + tools.length + ' tools → ' + target)
