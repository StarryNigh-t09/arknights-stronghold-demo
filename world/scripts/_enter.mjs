import { enterOrResume, peek, sleep } from '../lib/run.js'
const r = await enterOrResume({ mode: 'independent' })
console.log('ENTER', JSON.stringify({ ok: r.ok, resumed: r.resumed, state: r.state, blocked: r.blocked }))
for (let i = 0; i < 36; i++) {
  const st = await peek()
  console.log('PEEK', i, st.state, st.dist)
  if (st.state === 'wz_rest' || st.state === 'wz_prep' || st.state === 'wz_battle') break
  await sleep(3000)
}
