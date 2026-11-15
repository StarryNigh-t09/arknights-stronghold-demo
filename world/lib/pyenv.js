/**
 * pyenv.js — 补齐 Python 侧车需要的环境变量（import 一次即生效）。
 *
 * 为什么要这个：DSH 的 run_code 里 process.env 几乎是空的，而本机 Python 的用户
 * site-packages 在 %APPDATA%\\Python\\Python314\\site-packages 底下（PIL / numpy /
 * maafw 都装在那里）。env 里没有 APPDATA，python 就 ModuleNotFoundError:
 * No module named 'PIL' —— 2026-11-11 15:3x 截小图时踩到。
 *
 * 另外 mkdtemp 需要一个可写的 TEMP：沙箱里默认 %TEMP% 常常不可写。
 * 这里只补「缺了会炸」的那几个键，已有值一律不动。
 */
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

function homeDir() {
  if (process.env.USERPROFILE) return process.env.USERPROFILE
  if (process.env.HOME) return process.env.HOME
  try {
    const h = homedir()
    if (h && h !== '/' && h !== '\\') return h
  } catch {}
  return process.env.USERPROFILE || process.env.HOME || '.'
}

export function ensurePythonEnv() {
  const home = homeDir()
  if (!process.env.USERPROFILE) process.env.USERPROFILE = home
  if (!process.env.APPDATA) process.env.APPDATA = join(home, 'AppData', 'Roaming')
  if (!process.env.LOCALAPPDATA) process.env.LOCALAPPDATA = join(home, 'AppData', 'Local')
  if (!process.env.HOME) process.env.HOME = home
  const tmp = join(home, 'AppData', 'Local', 'Temp')
  for (const k of ['TEMP', 'TMP', 'TMPDIR']) {
    const v = process.env[k]
    if (!v || !existsSync(v)) process.env[k] = existsSync(tmp) ? tmp : process.cwd()
  }
  if (!process.env.PYTHONIOENCODING) process.env.PYTHONIOENCODING = 'utf-8'
  if (!process.env.PYTHONUTF8) process.env.PYTHONUTF8 = '1'
  return process.env
}

ensurePythonEnv()

/**
 * Python 解释器路径：环境变量优先，其次本机常见安装位置，最后才交给 PATH 里的 python。
 * 为什么加：2026-11-13 23:3x 夜间跑测时，spawnSync('python') 直接 ENOENT（子进程 env 里没有 PATH），
 * 整备区 deck.py 扫不出来 → 布阵以为甲板是空的 → 整回合 0 上场、回合直接判「没进到战斗界面」。
 * 硬编码位置只是兜底；设 COOP_OCR_PYTHON 永远最优先。
 */
export function pythonBin() {
  const cand = [
    process.env.COOP_OCR_PYTHON,
    process.env.COOPANION_PYTHON,
    'C:\\Python314\\python.exe',
    'C:\\Python313\\python.exe',
    'C:\\Python312\\python.exe',
    join(homeDir(), 'AppData', 'Local', 'Programs', 'Python', 'Python314', 'python.exe'),
  ]
  for (const c of cand) { if (c && existsSync(c)) return c }
  return 'python'
}
