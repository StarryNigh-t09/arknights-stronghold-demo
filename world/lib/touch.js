/**
 * minitouch 通道：靠得住的手势注入。
 *
 * 为什么不用 adb input：
 *   2026-11-10 实测，`input swipe` 只能把干员「抓起来」进入持物态，
 *   松手永远不落位（试过 6 个起手点、3 种时长、mouse motionevent、draganddrop、sendevent 写
 *   /dev/input/event4，全部同一个结果）。MAA 不用 adb input 也是这个原因 —— 它推 minitouch
 *   进设备，走 libevdev 的 Type B 多指协议。
 *
 * 坐标换算（MuMu 实测，2026-11-10）：
 *   设备原始触摸屏是竖的 1080x1920，游戏窗口是横的 1920x1080，
 *   所以 raw_x = 1079 - y, raw_y = x。写反了就会点到别处（表现为「点了没反应」）。
 *
 * 用法（文件模式，不走管道 —— 宿主沙箱会拦 Node 的 spawn 管道）：
 *   adb push 命令文件 /sdcard/_mt.txt
 *   adb shell /data/local/tmp/minitouch -f /sdcard/_mt.txt
 * minitouch 按顺序执行 d/m/u/c/w 命令，执行完退出。
 */
import { spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const BIN_DIR = join(ROOT, 'assets', 'bin')
const DEVICE_BIN = '/data/local/tmp/minitouch'
const DEVICE_CMDFILE = '/sdcard/_coopanion_mt.txt'

export const RAW_MAX_X = 1079
export const RAW_MAX_Y = 1919

/** 游戏坐标（1920x1080）→ minitouch 原始坐标（竖屏触摸屏） */
export function toRaw(x, y) {
  const rx = Math.round(RAW_MAX_X - Number(y))
  const ry = Math.round(Number(x))
  return [
    Math.max(0, Math.min(RAW_MAX_X, rx)),
    Math.max(0, Math.min(RAW_MAX_Y, ry)),
  ]
}

/**
 * 甲板取货「按下 → 开始滑动」之间的额外停顿（ms）。
 * 2026-11-11 用户 m06404：部署失败 79 条铺满 15 格，不是某两格不能放，是起手没被游戏认成「拎起来」。
 * 注意 minitouch 语法：连着写两行 w 时**后一行会覆盖前一行**（w 只是给下一次 c 提交的等待值），
 * 所以停顿必须和起手时长合并成一个 w，不能单独 push 一行。
 */
export const PICK_DWELL_MS = (() => {
  const v = Number(process.env.COOP_PICK_DWELL_MS)
  if (Number.isFinite(v) && v >= 0) return v
  return 150
})()

/**
 * 拖到目标格之后、松手之前的停留（ms）。
 * 2026-11-11 用户 m06537：「你干员没有拖到位，你要拖动到位置之后要停一会儿确认一下位置，
 * 不是前面按压时长的原因」。游戏要等指针在目标格上停稳才认落点，手指一到就松会弹回甲板。
 * 同样是 w 值，写进「最后一段滑动之后、u 0 之前」的那一行。
 */
export const ARRIVE_DWELL_MS = (() => {
  const v = Number(process.env.COOP_ARRIVE_DWELL_MS)
  if (Number.isFinite(v) && v >= 0) return v
  return 450
})()

export function createTouch(opts = {}) {
  const adb = opts.adb || 'adb'
  const serial = opts.serial || null
  const abi = opts.abi || 'x86_64'
  const log = opts.log || (() => {})
  let ready = false

  const adbArgs = (args) => (serial ? ['-s', serial, ...args] : args)
  const outFile = join(ROOT, '.tmp', 'adb-out.txt')

  /**
   * 跑一条 adb。
   * ⚠️ 不能用 stdio: 'pipe' 收输出：DSH 沙箱下 Node 开管道会 EPERM，
   * 表现是「命令没跑、错误还是空的」。所以输出一律走文件 fd（和 ocr.js 同一个坑）。
   */
  const run = (args, { capture = false } = {}) => {
    if (!capture) {
      const r = spawnSync(adb, adbArgs(args), { timeout: 60_000, windowsHide: true, stdio: 'ignore' })
      return { ok: r.status === 0, text: '' }
    }
    mkdirSync(join(ROOT, '.tmp'), { recursive: true })
    const fd = openSync(outFile, 'w')
    try {
      const r = spawnSync(adb, adbArgs(args), { timeout: 60_000, windowsHide: true, stdio: ['ignore', fd, fd] })
      let text = ''
      try { text = readFileSync(outFile, 'utf8') } catch {}
      return { ok: r.status === 0, text }
    } finally {
      closeSync(fd)
    }
  }

  function ensure() {
    if (ready) return true
    const found = run(['shell', `[ -x ${DEVICE_BIN} ] && echo yes`], { capture: true })
    if (/yes/.test(found.text)) { ready = true; return true }
    const local = join(BIN_DIR, 'minitouch-' + abi)
    if (!existsSync(local)) {
      log('minitouch 二进制缺失：' + local)
      return false
    }
    run(['push', local, DEVICE_BIN], { capture: true })
    run(['shell', `chmod 700 ${DEVICE_BIN}`], { capture: true })
    ready = true
    return true
  }

  /** 把一组命令写文件 → 推到设备 → 执行。返回 {ok, log} */
  function exec(lines) {
    if (!ensure()) return { ok: false, error: 'minitouch 不可用' }
    // 命令文件必须落在插件目录里：宿主临时目录对 sandbox 是灰的，adb push 会拿到空错误
    const dir = join(ROOT, '.tmp')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, 'mt-cmds.txt')
    writeFileSync(file, lines.join('\n') + '\n', 'utf8')
    const pushed = run(['push', file, DEVICE_CMDFILE], { capture: true })
    if (!pushed.ok) return { ok: false, error: 'push 失败：' + pushed.text.slice(0, 200) }
    const out = run(['shell', `${DEVICE_BIN} -f ${DEVICE_CMDFILE}`], { capture: true })
    return { ok: out.ok, log: out.text }
  }

  /** 单击（游戏坐标） */
  function tap(x, y, { holdMs = 120 } = {}) {
    const [rx, ry] = toRaw(x, y)
    return exec([`d 0 ${rx} ${ry} 50`, 'c', `w ${holdMs}`, 'u 0', 'c', 'w 120'])
  }

  /**
   * 拖动（游戏坐标）。
   * 2026-11-10 实测出来的关键参数：**要慢**（20 段、每段 70ms）、**落点先停 300ms**、
   * 松手前再微小抖一下。快滑（12 段 40ms 以内）会出现「抓起来但松手不落位」。
   */
  function swipe(x1, y1, x2, y2, { steps = 20, stepMs = 70, holdMs = 300, jiggle = true, holdStartMs = 150 } = {}) {
    const [rx1, ry1] = toRaw(x1, y1)
    const [rx2, ry2] = toRaw(x2, y2)
    const lines = [`d 0 ${rx1} ${ry1} 50`, 'c', `w ${holdStartMs}`]
    for (let i = 1; i <= steps; i++) {
      const rx = Math.round(rx1 + (rx2 - rx1) * i / steps)
      const ry = Math.round(ry1 + (ry2 - ry1) * i / steps)
      lines.push(`m 0 ${rx} ${ry} 50`, 'c', `w ${stepMs}`)
    }
    lines.push(`w ${holdMs}`)
    if (jiggle) {
      lines.push(`m 0 ${Math.min(RAW_MAX_X, rx2 + 3)} ${ry2} 50`, 'c', 'w 120')
    }
    lines.push('u 0', 'c', 'w 300')
    return exec(lines)
  }

  return { ensure, exec, tap, swipe, adbArgs, run }
}
