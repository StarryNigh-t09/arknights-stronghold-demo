import { deployTilesByCoverage } from '../lib/gamemap.js'
const r = deployTilesByCoverage()
console.log(r.map((x,i)=>(i+1)+':(' + x.col + ',' + x.row + ')@' + x.px.join(',') + ' gain=' + x.gain).join('\n'))
