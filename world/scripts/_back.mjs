import { tapAt, sleep, peek } from '../lib/run.js'
await tapAt([1430, 672], 1800, '确认离开（试 672）')
await sleep(1200)
const p = await peek()
console.log('state', p.state)
if (p.state === 'wz_prep' || p.state === 'wz_rest') {
  await tapAt([1430, 742], 1800, '确认离开（试 742）')
  await sleep(1500)
  console.log('state2', (await peek()).state)
}
