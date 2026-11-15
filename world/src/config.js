/**
 * config.js — 配置与默认值。
 *
 * 三个东西必须能改：adb 路径（换了模拟器/换了盘）、设备序列号（MuMu 多开端口会变）、
 * 决策模式（全托管/同玩）。其他都是调参，放默认值就够了。
 */
import { DEFAULT_DEVICE } from '../lib/adb.js'

export const DEFAULT_CONFIG = {
  /** 全托管 = auto（自己点）；同玩 = advise（只给建议）。 */
  mode: 'advise',
  /** MuMu 的 adb 设备。多开时每个实例一个端口：16416 / 16384 / ... */
  device: DEFAULT_DEVICE,
  /** 留空就用 MuMu 安装目录下那个 adb（lib/adb.js 里有一串候选路径）。 */
  adbPath: '',
  /** 跑 vision.py 的 Python。留空用 PATH 里的 python。 */
  pythonPath: '',
  /** 一轮操作之间最少等多久，防连点。 */
  actionGapMs: 600,
  /** 截图缓存多少张就删旧的（主人说 2GB 上限，这张数按 2MB/张估）。 */
  keepShots: 200
}

export function normalizeConfig(raw = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...(raw || {}) }
  cfg.mode = cfg.mode === 'auto' ? 'auto' : 'advise'
  cfg.device = String(cfg.device || DEFAULT_DEVICE).trim() || DEFAULT_DEVICE
  cfg.actionGapMs = Math.max(200, Number(cfg.actionGapMs) || DEFAULT_CONFIG.actionGapMs)
  cfg.keepShots = Math.max(20, Number(cfg.keepShots) || DEFAULT_CONFIG.keepShots)
  return cfg
}
