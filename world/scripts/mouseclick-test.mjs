import { sh, tap } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
const mpress = (x,y) => sh('input mouse motionevent MOVE ' + x + ' ' + y + '; sleep 0.2; input mouse motionevent DOWN ' + x + ' ' + y + '; sleep 0.15; input mouse motionevent UP ' + x + ' ' + y, { timeoutMs: 20000 })
await mpress(1178, 910)     // 用鼠标点「烈夏」卡
await sleep(1200)
console.log('mouse click card done')
