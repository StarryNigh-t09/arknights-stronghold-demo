import { dragHold } from '../lib/adb.js'
console.log(await dragHold(1388, 668, 563, 480, { holdMs: 600, steps: 20, stepMs: 40 }))
