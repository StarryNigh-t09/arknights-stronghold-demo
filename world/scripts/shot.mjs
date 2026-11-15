// shot.mjs — 截一张「小图」，给模型看 / 给 OCR 吃（用户 m02001：少花 token、省解析时间）
//
//   node scripts/shot.mjs --out shot.png
//   node scripts/shot.mjs --preset top --out top.png            # 顶栏（回合/金币/规则等级）
//   node scripts/shot.mjs --preset shop --scale 0.6 --out shop.png
//   node scripts/shot.mjs --box 0,620,1920,760 --out band.png    # 自定义逻辑坐标
//
// 预设（1920x1080 逻辑坐标）：
//   full  全屏                      top   顶栏 y0-170
//   shop  商店整排 y700-1080        deck  甲板/整备区 y820-1000
//   slots 右上「剩余可放置角色」     buttons 冻结/刷新 y560-680
import { writeFileSync } from 'node:fs'
import { screenshot, screenshotCrop, BASE_W, BASE_H } from '../lib/adb.js'

const PRESET = {
  full: [0, 0, BASE_W, BASE_H],
  top: [0, 0, 1920, 170],
  shop: [250, 700, 1750, 1080],
  deck: [80, 820, 1720, 1000],
  slots: [1430, 620, 1920, 720],
  buttons: [1400, 560, 1920, 700],
}

const argv = process.argv.slice(2)
const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }
const preset = arg('--preset', null)
const out = arg('--out', 'shot.png')
const scale = Number(arg('--scale', '1')) || 1
const boxArg = arg('--box', null)
const box = boxArg ? boxArg.split(',').map(Number) : (preset && PRESET[preset]) || PRESET.full

const t0 = Date.now()
const full = screenshot()
const tShot = Date.now() - t0
const c = screenshotCrop(box, { buf: full, scale, tag: preset || 'box' })
if (!c.ok) { console.error(JSON.stringify({ ok: false, error: c.error })); process.exit(1) }
writeFileSync(out, fsRead(c.path))
function fsRead(p) { return process.getBuiltinModule('node:fs').readFileSync(p) }
console.log(JSON.stringify({
  ok: true, out, box, scale, w: c.w, h: c.h,
  fullBytes: full.length, cropBytes: c.bytes,
  shotMs: tShot, totalMs: Date.now() - t0,
}))
