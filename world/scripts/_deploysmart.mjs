import { deployFromDeck } from '../lib/drive.js'
import { senseRun } from '../lib/drive.js'
const st = await senseRun()
console.log('slots', st.slotsLeft, 'screen', st.screen)
const deck = new Array(10).fill(0).map((_, i) => ({ index: i, name: '' }))
const r = await deployFromDeck(deck, { smart: true, slotsLeft: Number(st.slotsLeft), facing: 'right' })
console.log(JSON.stringify({ placed: r.placed, steps: r.steps }, null, 1))
