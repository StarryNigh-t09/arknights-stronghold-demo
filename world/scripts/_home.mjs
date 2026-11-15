import { tapAt, sleep } from '../lib/run.js'
await tapAt([1753, 1004], 900, '返回主页')
await sleep(12000)
console.log('tapped')
