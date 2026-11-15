import { deployFromDeck } from '../lib/drive.js'
const r = await deployFromDeck([{ name: 'a' }, { name: 'b' }], { slotsLeft: 4, smart: false, freeScan: false })
console.log(JSON.stringify(r, null, 1))
