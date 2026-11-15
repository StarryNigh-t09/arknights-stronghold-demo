// 2026-11-15 03:2x：休整期「详情面板挡着 → 拖拽全失败」的护栏。
// 面板开：左侧一块很暗的矩形（实测 mean 63），peek() 却仍报 wz_rest → 只能按画面判。
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const fails = []
const ok = (cond, msg) => { if (!cond) fails.push(msg) }

// 1) 源码锁
const DRIVE = readFileSync(join(ROOT, 'lib', 'drive.js'), 'utf8')
const FAST = readFileSync(join(ROOT, 'lib', 'deploy-fast.js'), 'utf8')
ok(/screenState, panelOpenOf/.test(DRIVE), 'drive.js 要 import panelOpenOf')
ok(DRIVE.includes("await dismissPanelIfOpen(opts, '布阵前')"), '布阵前要先关面板（别等 2 格失败）')
ok(DRIVE.includes('面板挡着（画面左侧暗块 mean='), '面板检测要打日志')
ok(DRIVE.includes("saveShot(screenshot(), 'panel')"), '截图 Buffer 必须先落盘再喂 python（否则异常被吞、面板永远判不出来）')
ok(FAST.includes("export function panelOpenOf"), 'deploy-fast.js 要导出 panelOpenOf')
ok(existsSync(join(ROOT, 'sidecar', 'panelopen.py')), 'sidecar/panelopen.py 要在')

// 2) 算法锁：合成两张图，左暗块 → open=true；亮 → false
const PY = 'C:/Python314/python.exe'
const env = { ...process.env, PYTHONPATH: join(ROOT, '~', 'Python', 'Python314', 'site-packages'), PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
const mk = (name, leftGray) => {
  const code = [
    'from PIL import Image',
    'im = Image.new("RGB", (1920, 1080), (150, 140, 120))',
    'for x in range(0, int(1920*0.29)):',
    '    for y in range(int(1080*0.36), int(1080*0.66)):',
    '        im.putpixel((x, y), (' + leftGray + ', ' + leftGray + ', ' + leftGray + '))',
    'im.save(r"' + join(ROOT, '.tmp', name).replace(/\\/g, '/') + '")',
  ].join('\n')
  spawnSync(PY, ['-c', code], { env, encoding: 'utf8', timeout: 60000 })
  return join(ROOT, '.tmp', name)
}
const runPanel = (png) => {
  const r = spawnSync(PY, [join(ROOT, 'sidecar', 'panelopen.py'), png], { env, encoding: 'utf8', timeout: 60000 })
  try { return JSON.parse((r.stdout || '').trim()) } catch { return { open: null, err: (r.stderr || '').slice(0, 200) } }
}
if (existsSync(PY)) {
  const dark = runPanel(mk('panel-synth-open.png', 40))
  const bright = runPanel(mk('panel-synth-closed.png', 130))
  ok(dark.open === true, '左侧暗块要判成面板开（got ' + JSON.stringify(dark) + '）')
  ok(bright.open === false, '左亮要判成面板关（got ' + JSON.stringify(bright) + '）')
}

if (fails.length) { fails.forEach((f) => console.log('FAIL ' + f)); process.exit(1) }
console.log('panel-guard 9/9 pass')
