import { senseRun, toCandidates } from '../lib/drive.js'
import { adviseRest, DEFAULT_LEVELUP_COST } from '../lib/decide.js'

for (const lv of [2, 3]) {
  const st = await senseRun(lv)
  const shop = toCandidates(st.shop)
  const levelupCost = { ...DEFAULT_LEVELUP_COST }
  if (st.upgradeCost != null) levelupCost[lv] = Number(st.upgradeCost)
  const adv = adviseRest({ config: { levelupCost }, money: Number(st.money) || 0,
    centerLevel: lv, round: Number(st.round) || 1, totalRounds: 9, shop, owned: {} })
  console.log('level=' + lv, 'slots=' + (st.shop || []).length, 'cards=' + shop.map(c => c.name + '/' + c.price).join(','),
    'money=' + st.money, 'up=' + st.upgradeCost, '=>', adv.action, adv.target || '', adv.reason || '')
}
