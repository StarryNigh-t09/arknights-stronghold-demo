import { senseRun } from '../lib/drive.js'
const st = await senseRun()
console.log(JSON.stringify({ state: st.state, money: st.money, hp: st.hp, slotsLeft: st.slotsLeft, level: st.level, upgradeCost: st.upgradeCost, shop: (st.shop||[]).map(c => ({ slot: c.slot, name: c.name, cost: c.cost, empty: c.empty })) }, null, 0))
