import { autoRun } from '../lib/drive.js'
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs'

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const dir = '../trace-' + stamp
mkdirSync(dir, { recursive: true })
const say = (l) => {
  appendFileSync(dir + '/run.log', l + '\n')
  console.log(l)
}
const t0 = Date.now()
let last = t0
say('TRACE_DIR ' + dir)
const r = await autoRun({
  maxRounds: 14,
  totalRounds: 12,
  deploy: true,
  boardCount: 0,
  wantList: 'auto',
  trace: dir,
  onRound: (x) => {
    const now = Date.now()
    say('ROUND ' + JSON.stringify(x) + ' 本轮耗时 ' + Math.round((now - last) / 1000) + 's')
    last = now
  },
})
say('RESULT stop=' + r.stop + ' rounds=' + r.rounds.length + ' 总耗时 ' + Math.round((Date.now() - t0) / 1000) + 's')
for (const l of r.log || []) say('  ' + l)
writeFileSync(dir + '/rounds.json', JSON.stringify(r.rounds || [], null, 2))
say('DONE')
