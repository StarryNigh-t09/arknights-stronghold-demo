import { deployFromDeck, senseRun } from '../lib/drive.js'

const r = await deployFromDeck([{ index: 0, name: '?' }, { index: 1, name: '?' }], { facing: 'right' })
console.log(JSON.stringify(r, null, 2))
const after = await senseRun()
console.log('after:', after.screen, 'slotsLeft', after.slotsLeft)
