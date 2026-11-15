import { senseRun } from '../lib/drive.js'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
for (let i = 0; i < 40; i++) {
  const st = await senseRun()
  if (st.state === 'wz_rest') {
    console.log(JSON.stringify({ hit: true, money: st.money, hp: st.hp, slotsLeft: st.slotsLeft, level: st.level, upgradeCost: st.upgradeCost,
      shop: (st.shop||[]).map(c => ({ slot: c.slot, name: c.name, cost: c.cost, empty: c.empty })) }))
    process.exit(0)
  }
  await sleep(4000)
}
console.log(JSON.stringify({ hit: false }))
