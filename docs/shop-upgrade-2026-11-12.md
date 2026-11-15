# 商店为什么没升级（2026-11-12 07:20）

用户 m02102：「为什么不升级商店，打到第九回合还是1级商店」——查了一遍日志和代码，三个原因叠加。

## 1) 主因：整备区满了我把整段商店阶段跳过了

drive.js 买卡前有一道我自己加的闸门：

```
if (bench != null && bench >= 6 && !opts.forceBuy)
  → step('整备区 N 张（场上满员放不上去）→ 本回合先不买')  → return
```

它是 `return`，不是「不买卡但继续升级」。_perf.log 原文（23:03 之后每回合都是这一行）：

```
2026-11-11T23:03:49.224Z step +0s 整备区 7 张（场上满员放不上去）→ 本回合先不买
2026-11-11T23:06:54.560Z step +0s 整备区 7 张（场上满员放不上去）→ 本回合先不买
2026-11-11T23:09:27.412Z step +0s 整备区 7 张（场上满员放不上去）→ 本回合先不买
2026-11-11T23:12:23.947Z step +0s 整备区 7 张（场上满员放不上去）→ 本回合先不买
```

场上满员（容量 8）→ 名额 0 → 放不上去 → 整备区堆到 6 张以上 → 闸门关闭 → 连升级都不看。
满员恰恰是最该升级的时候，我却把这件事一起关掉了。

## 2) 升级「成功」的判据会虚记

doUpgrade（drive.js:971）用三条猜：升级费变了 / 升级面板 x 变了 / 商店格数变了。
日志里的两次「成功」都站不住：

```
22:49:26 升级费读不出，改按商店格数判断（3→5）
22:49:27 升到 Lv2（升级费 3→null）
22:51:48 升到 Lv3（升级费 2→1）   ← 费用 2→1 变小，真升级应该是变大
```

于是内部账本记成 Lv3，UI 上还是 Lv1 —— 账面和现场分家。之后所有「钱够不够升级」的判断都建在这个假等级上。

## 3) 升级费本身读不稳

同一局里读到过 7 / 5 / 4 / 3 / 2 / 1 / null。判断条件要求 upgradeCost 是非空有限数，读不到就静默不升（后来加了 lastUpgradeCost 兜底，兜的也是脏数据）。22:54 起就再没出现过 upgrade 决策，只有 refresh / stop。

## 修法（还没动，等点头）

1. 满员闸门从「整段跳过」改成「只关买卡，升级照节奏走」——按 PACE 表（restplan.js：3 回合 Lv2 / 4-6 回合 Lv3 / 7-9 回合 Lv4 / 10 起 Lv5，永不升六）。
2. 升级成功改判 UI 上的 LEVEL 罗马数字（左侧 LEVEL 面板），不再看升级费/格数。
3. 每回合开头用一次真实读取校准 level；进程启动时的 firstSlotLeft 反推在折叠态读不到，别当依据。
4. 升级费读不到要显式写一行日志「读不到，本回合不升」，不许静默。

## 顺带记下的规则（用户 m02102 给的）

换人 = **把新干员拖到原干员所在格子**，落位时照样要滑动选定方向。不需要先卖掉原干员。
（之前的怀疑「已上场干员点不动/拖不动」指的是想移动或卖掉它；换人是覆盖，不是移动。）

---

# 修完了（2026-11-12 07:2x，用户 m02251 放行后）

用户 m02251 原话：「首先判定pace升级然后再决定买卡。满员了先卖卡。2是对的，同时辅以自己记忆点了几次升级。3可以。」
逐条对应下面五处改动。全部只动代码 + 单测，真机没碰（m02102 要求停模拟器，尚未放行）。

## 1) 闸门拆开：整备区满只关买卡，不关升级（主因）

- `world/lib/restplan.js`：新增 `BENCH_STOP_BUY = 6` 与纯函数 `shopEntryPlan(ctx)` → `{benchBlock, mayUpgrade, enterShop}`。
  判定：整备区 ≥6 张 → 只关买卡；只要「没到本回合该到的等级 + 钱够升级费」→ 仍然 `enterShop=true`。
- `world/lib/restplan.js`：`benchBlocked = benchFull || ctx.benchBlock`，买卡/冻结/刷新/凑对子/兜底买人共 8 处判据从 `!benchFull` 改成 `!benchBlocked`。
- `world/lib/drive.js`（autoRest 商店阶段）：原来 `if (bench>=6) {log; return}` 整段退出 → 现在喂 `shopEntryPlan`，
  只有 `!gate.enterShop` 才跳过（省 3~5s），否则照常展开商店；日志会写「本回合不买卡，只走升级」。

## 2) PACE 升级排到买卡之前（m02251 第一句）

- `world/lib/restplan.js`：`planRestStep` 里升级分支从「1)」提到「0)」，排在第 1 回合凑对子、阶数必买、第 2 回合冻结之前。
  代价：`6 回合前 4 阶必买` 遇到 PACE 到期且钱够时，先升级、下回合再买（写进单测并注明来由）。

## 3) 满员先卖卡（m02251 第二句）

- `world/lib/restplan.js`：整备区满 10 张 → 返回 `action:'sell'`（同一回合只卖一张，`ctx.soldThisTurn` 挡住重复卖）。
  有买得起的装备时**不卖**（装备占独立 5 格，跟整备区无关）。
- `world/lib/drive.js`（restBuyTurn）：新增 `sell` 分支 —— `scanDeckChips({minPressY:840})` 取最左那张（最早买入的过渡卡，
  `run.js sellToAfford` 注释同口径），`sellDeckUnit([x,y])` 拖进右下「+1 拖拽至此售出」，成功则 `bench-1 / money+1 / deck.shift()`。

## 4) 升级判据改成结构性信号 + 等级对账（m02251「2 是对的，辅以记忆点了几次」）

- `world/lib/restplan.js` 新增 `judgeUpgrade(before, after)`：只认 `LEVEL 读数变高 / 商店格数变多 / 面板左移 x 变化 / 升级费变高`；
  升级费变小单独返回 `costDropped`（旧代码就是把它当成升级，把 Lv1 记成 Lv3）。
- `world/lib/restplan.js` 新增 `reconcileLevel({tracked, ocr, clicks, base})`：自己数的等级为主，点击次数当第二证据，
  OCR 只在和两者之一对得上时才采信，对不上留 note。
- `world/lib/drive.js` 的 `doUpgrade` 改成读四个数（LEVEL 读数 / 升级费 / 面板 x / 格数）喂 `judgeUpgrade`；
  成功日志写「升到 LvN（判据：…）」，并追加一行「升级记账：自己记 LvN，本回合点过 N 次」。

## 5) 换人（m02251 第三句「3 可以」）

- `world/lib/placement.js`：新增 `replaceTargets(occupiedPx, {limit})` —— 把已占格按「y 小优先、再 x」排成候选格。
- `world/lib/drive.js`（deployFromDeck）：新增 `opts.replace` 模式，候选格换成已占格，日志「换人模式：候选换成 N 个已占格…」。
  落位手势完全不变（拖到格 → 待确认 → `adb input swipe` 选方向），成功后日志追加「（换人：替换原本站在该格的干员）」。
- `world/lib/drive.js`（autoRest）：名额读成 0 不再「试放一次然后收手」，改成 `replaceTurn=true`、
  一回合换 1~2 个（`remaining = min(2, benchLeft)`，`replaceMax: 2`）；换人不吃名额（`d.replacing` 时不清 `remaining`）。
  这就是之前「整备区 10 张、4 个回合一个人没放、血掉到 0」的那条死路的结构性解法。

## 实测数字（跑过的命令与结果）

| 命令 | 结果 |
| --- | --- |
| `node --check lib/restplan.js` / `lib/drive.js` / `lib/placement.js` | exit 0 / 0 / 0 |
| `node test/restplan.test.mjs` | tests 40 / pass 40 / fail 0 |
| `node test/shop-gate.test.mjs` | tests 21 / pass 21 / fail 0 |
| `node test/replace.test.mjs` | tests 4 / pass 4 / fail 0 |
| `node test/restplan-nofreeze.mjs` | 5 条 PASS + ALL PASS |
| 合计 | 65 个断言用例全过 + nofreeze 全过 |
| `node -e "import('./lib/drive.js')"` | exit 0，导出 autoRest/deployFromDeck 都是 function |

单测里明确锁住的回归点：

- `整备区满 10 张 + 钱够升级 → enterShop=true`（这就是「第九回合还是 Lv1」的 bug）
- `升级费 2→1 不算升级`（老 bug：账本 Lv3、UI Lv1）
- `LEVEL Lv2→3` 算升级（用户要的「UI 的 LEVEL 数字」）
- `PACE 到期 + 4 阶卡在店里 → 先升级`（m02251 的排序）
- `整备区满 → sell；本回合已卖过 → stop`

## 还没做

1. **真机验证**（要用户放行才动模拟器）：满员回合应出现「本回合不买卡，只走升级」且升级费变高 / 格数变多；
   名额 0 时应出现「改走换人」并真的替换掉场上某个人。
2. 卖谁只按位置（最左＝最早买入），没有按真实强弱挑；要认人得用 `identifyDeck`，它会轻按甲板把状态机推进详情页（2026-11-10 踩过），暂不接。
