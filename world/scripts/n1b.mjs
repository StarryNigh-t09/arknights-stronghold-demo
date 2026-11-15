import { shopAction } from '../lib/run.js'

console.log(JSON.stringify(await shopAction({ buyPoints: [[1047, 930]] })))
