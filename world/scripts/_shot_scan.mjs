import { scanFreeTiles } from '../lib/run.js'
const r = await scanFreeTiles({ holdStartMs: 250 })
console.log('SCAN ' + JSON.stringify({ ok: r.ok, n: (r.tiles||[]).length, shot: r.shot, err: r.error }))
