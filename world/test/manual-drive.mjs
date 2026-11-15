
import { toCandidates, tierOf } from '../lib/drive.js'
import { readState } from '../lib/ocr.js'
import { adviseRest } from '../lib/decide.js'
for (const f of ['shots/wz_rest_r1.png','shots/wz_battle2.png']) {
  const st = await readState(f)
  const shop = toCandidates(st.shop)
  const adv = adviseRest({ money: st.money, centerLevel: st.centerLevel, round: st.round, totalRounds: 9, shop, owned: {} })
  console.log(f, JSON.stringify({round: st.round, money: st.money, center: st.centerLevel, up: st.upgradeCost, shop}))
  console.log('  →', adv.action, adv.target || '', '|', adv.reason)
}
console.log('tierOf', tierOf('III'), tierOf('VI'), tierOf(4), tierOf('x'))
