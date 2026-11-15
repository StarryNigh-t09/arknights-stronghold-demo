import { autoRest } from '../lib/drive.js'
const t0 = Date.now()
const ts = () => ((Date.now() - t0) / 1000).toFixed(1) + 's'
console.log(ts(), 'start autoRest')
const r = await autoRest({ maxSteps: 1, deck: [], boardCount: 5, wantList: null, activeCovenants: [] })
console.log(ts(), 'done', JSON.stringify({ ok: r.ok, error: r.error, centerLevel: r.centerLevel }))
for (const s of r.steps || []) console.log('  ', s)
