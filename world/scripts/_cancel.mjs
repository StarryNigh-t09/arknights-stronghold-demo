import { tapAt, peek, sleep } from '../lib/run.js'
const r = await tapAt([1072, 469], 1500, '取消拖拽')
console.log('tap', JSON.stringify(r))
await sleep(600)
console.log('state', JSON.stringify(peek()))
