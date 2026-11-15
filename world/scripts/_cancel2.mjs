import { tapAt, peek, sleep } from '../lib/run.js'
await tapAt([960, 540], 1500, '拖回中心取消')
await sleep(800)
console.log('state', JSON.stringify(peek().state))
