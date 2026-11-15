import { writeFileSync } from 'node:fs'
const out = { step: 'start' }
try {
  const { screenshot } = await import('../lib/adb.js')
  const { scanDeckChips } = await import('../lib/run.js')
  let t = Date.now()
  const b = screenshot()
  out.shot = Date.now() - t
  writeFileSync('../_probe_shot.png', b)
  out.step = 'shot-ok'
  t = Date.now()
  const r = await scanDeckChips()
  out.scan = Date.now() - t
  out.chips = r.chips.length
  out.ok = r.ok
} catch (e) {
  out.error = String(e && e.stack || e)
}
writeFileSync('../_probe_bench.json', JSON.stringify(out, null, 1))
