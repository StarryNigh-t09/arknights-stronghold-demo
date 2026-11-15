import { autoRest } from '../lib/drive.js'

const t0 = Date.now()
const tick = setInterval(() => console.log('  ...' + Math.round((Date.now() - t0) / 1000) + 's'), 10000)
try {
  const r = await autoRest({ maxSteps: 6, centerLevel: Number(process.argv[2] || 1) })
  console.log(JSON.stringify(r, null, 1))
} finally {
  clearInterval(tick)
}
