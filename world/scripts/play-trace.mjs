import { autoRun } from '../lib/drive.js'
import { peek } from '../lib/run.js'
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs'

const maxRounds = Math.max(1, Number(process.argv[2]) || 1)
const boardCount = Math.max(0, Number(process.argv[3]) || 0)
const deploy = process.argv[4] !== 'nodeploy'
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const dir = '../trace-' + stamp
mkdirSync(dir, { recursive: true })
const say = (l) => { appendFileSync(dir + '/run.log', l + '\n'); console.log(l) }
const t0 = Date.now()
let last = t0
say('TRACE_DIR ' + dir)
say('START state=' + JSON.stringify(peek().state) + ' maxRounds=' + maxRounds + ' deploy=' + deploy)
const hb = setInterval(() => say('…still ' + Math.round((Date.now() - t0) / 1000) + 's'), 30000)
let r
try {
  r = await autoRun({ maxRounds, totalRounds: 12, deploy, boardCount, wantList: 'auto', trace: dir,
    onRound: (x) => { const now = Date.now(); say('ROUND ' + JSON.stringify(x) + ' 本轮耗时 ' + Math.round((now - last) / 1000) + 's'); last = now } })
} finally { clearInterval(hb) }
say('RESULT stop=' + r.stop + ' rounds=' + r.rounds.length + ' 总耗时 ' + Math.round((Date.now() - t0) / 1000) + 's')
for (const l of r.log || []) say('  ' + l)
writeFileSync(dir + '/rounds.json', JSON.stringify(r.rounds || [], null, 2))
say('DONE')
