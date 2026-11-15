/**
 * definition.js — WorldDefinition：告诉 Coopanion 这个世界里有什么。
 *
 * id 会变成配置里的一节（worlds['arknights-wz']）和面板路由里的名字，改它等于搬家，
 * 所以定死 'arknights-wz'，以后也别动。
 */
import { WzWorld } from './world.js'
import { DEFAULT_CONFIG, normalizeConfig } from './config.js'

/** @type {import('cortico/world.ts').WorldDefinition<Record<string, unknown>>} */
const definition = {
  id: 'arknights-wz',
  label: '明日方舟·卫戍协议',

  /** 默认关着：能不能动手要主人自己打开，插件不替她决定。 */
  defaults() {
    return { ...DEFAULT_CONFIG, enabled: false }
  },

  /** 开之前先确认外部依赖在：模拟器、adb、Python+Pillow。缺了就在控制台说清楚，不等到点下去才报错。 */
  preflight(ctx) {
    const cfg = normalizeConfig(ctx.cfg || {})
    ctx.console?.warn?.('[arknights-wz] 用 ADB 操作 MuMu：设备 ' + cfg.device + '，adb ' + cfg.adbPath)
    if (!cfg.adbPath) ctx.console?.warn?.('[arknights-wz] 没配 adb 路径，会用 MuMu 默认位置；不对的话改 worlds.arknights-wz.adbPath')
  },

  create(ctx) {
    return new WzWorld(ctx)
  }
}

export default definition
