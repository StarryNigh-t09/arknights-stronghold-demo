import { enterRun } from '../lib/run.js'

const r = await enterRun({ mode: 'independent' })
console.log(JSON.stringify(r, null, 1))
