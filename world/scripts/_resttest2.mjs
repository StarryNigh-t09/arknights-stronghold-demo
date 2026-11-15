import { autoRest, senseRun } from '../lib/drive.js'
const st = await senseRun()
console.log('BEFORE', JSON.stringify({screen: st.screen, money: st.money, level: st.level, slotsLeft: st.slotsLeft, cards: (st.shop||[]).filter(x=>x&&!x.empty).map(x=>x.name)}))
const r = await autoRest({ board: [], boardCount: 0, wantAuto: true, freeScan: true, smart: false, maxSteps: 4, centerLevel: 1 })
console.log('STEPS:\n' + (r.steps||[]).join('\n'))
const st2 = await senseRun()
console.log('AFTER', JSON.stringify({screen: st2.screen, money: st2.money, level: st2.level, slotsLeft: st2.slotsLeft, deck: (st2.deckUnits||[]).length}))
process.exit(0)