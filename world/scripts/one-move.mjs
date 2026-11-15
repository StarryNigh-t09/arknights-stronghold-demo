import { mouseDrag, mouseFacing } from '../lib/adb.js'
mouseDrag(840, 360, 563, 645, { holdMs: 120, steps: 24, stepMs: 30 })
console.log('moved')
