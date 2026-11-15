import { readCovenants, knownCovenantNames } from '../lib/covenants.js'
const png = process.argv[2]
const r = readCovenants(png)
console.log('COV ' + JSON.stringify(r))
console.log('KNOWN ' + knownCovenantNames().length)