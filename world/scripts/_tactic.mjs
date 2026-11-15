import { pickTactic, tacticPreference } from '../lib/run.js'
const tk = await pickTactic({ preferList: tacticPreference({ covenants: [] }).order })
console.log(JSON.stringify(tk))
