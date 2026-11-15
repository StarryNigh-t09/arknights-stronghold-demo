import { operatorInfo, roleGroup } from '../lib/gamemap.js'
for (const n of ['拜松','摆渡人','褐果','陨星','蛇屠箱','泡泡','瑰盐','安哲拉','奥斯塔','复奏','星源','波登可','维式重锤']) {
  const i = operatorInfo(n)
  console.log(n, i ? i.class + ' g=' + roleGroup(n) + ' ' + JSON.stringify(i.range) : 'NULL')
}
