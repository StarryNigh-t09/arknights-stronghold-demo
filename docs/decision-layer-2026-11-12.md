# 决策层实测报告（2026-11-12 早）

结论：**升级真的升上去了**（连续两回合有扣钱＝升级费的硬证据）、**决策链在真机跑通**（战术决策→买卡→升级→布阵→开打→下一回合）。还剩两处：卖人未真机验证、`scanDeckChips` 张数会假阳性。

## 1. 升级：从「账本自嗨」到「有硬证据」

### 之前为什么一直 1 级
1. 整备区 ≥6 张时商店阶段整段 `return`（`drive.js` 旧 `bench >= 6` 分支）→ 升级判定根本没跑。
2. 升级要**连点两次同一坐标**才生效，旧代码只点一次。
3. 升级按钮坐标按等级排版（`panel_geometry(level)`），Lv1、4 格时真中心是 **(578,972)**，写死的 `POINTS.upgrade=(337,972)` 点不到。
4. 判成功靠猜：LEVEL 动画误读 + 商店格数 3→5 都算成功 → 账本虚高一级，之后按错等级算坐标。

### 改了什么
- `restplan.js`：`judgeUpgrade(before, after)` 新增硬信号 **「扣钱正好等于升级费」**（`bMoney - aMoney === bCost`）；`costDropped` 单独返回（旧 bug 把「升级费变小」当升级）。
- `restplan.js`：新增 `shopEntryPlan(ctx)` → `{benchBlock, mayUpgrade, enterShop}`，满员只关「买卡」，升级照 PACE 走。
- `drive.js` `doUpgrade`：点之前先 `senseRun` 校准等级、取 `base.upgradePoint`；判据不成立**原地再点一次**再读。
- `drive.js` 商店展开后：画面等级比记账**高**且是首轮 → 按画面校准（低的不采信，折叠态会读低一档）。

### 真机证据（`world/traces/decision-2026-11-12T00-13-36-763Z/steps.jsonl`）
```
回合 5  买卡 → upgrade：节奏 Lv1 → Lv3：钱 8 ≥ 升级费 7（升完还剩 1 块）
        升到 Lv2（判据：扣钱 8→1（＝升级费 7）；升级费 7→11）
        升级记账：自己记 Lv2，本回合点过 1 次（与点击次数一致）
回合 6  校准商店等级：自己记 Lv1，画面 Lv2 → 按画面继续
回合 7  升级费 9
        买卡 → upgrade：节奏 Lv2 → Lv4：钱 10 ≥ 升级费 9（升完还剩 1 块）
        升到 Lv3（判据：扣钱 10→1（＝升级费 9）；LEVEL Lv2→3；升级费 9→12）
```
旧版本一整季没升过一级；现在同一局 4 回合内 **Lv1 → Lv3**。

### 补：OCR 读不到面板时的坐标兜底（08:35 修，08:36 真机验证）

旧代码在 `upgradePoint` 为 null 时退回写死的 `POINTS.upgrade=(337,972)` —— 那是 **Lv2** 的中心，Lv1（4 格）真中心是 **578**，点上去毫无反应（回合 2 实测 `升级没生效（升级费 4→4，面板 x null→null，格数 3→3，LEVEL 读数 1→1）`）。

现在按自己记的等级现算（`placement.js` 新纯函数 `upgradePanelCenter(level)`，公式与 `sidecar/ocr.py` 的 `panel_geometry` 同源：最右卡中心 1527、卡宽 240、间距 240、格子数 = 3+level）：

```
Lv1 → 579,972   Lv2 → 339,972   Lv3 → 99,972（越界夹到 ≥60）
```

真机证据（`traces/decision-2026-11-12T00-32-11-933Z/steps.jsonl`）：
```
回合 3  升级费 3 → 买卡 → upgrade：节奏 Lv1 → Lv2：钱 6 ≥ 升级费 3
        读不到升级面板 → 按 Lv1 现算按钮 (579,972)
        升到 Lv2（判据：扣钱 6→3（＝升级费 3）；LEVEL Lv1→2；升级费 3→8）
回合 4  升级费 7 → 买卡 → upgrade：节奏 Lv2 → Lv3：钱 7 ≥ 升级费 7
        读不到升级面板 → 按 Lv2 现算按钮 (339,972)
        升到 Lv3（判据：扣钱 7→0（＝升级费 7）；升级费 7→11）
```
两回合连升两级，坐标一次没点空。

## 2. 决策链实测（`world/data/decision-log.jsonl`）

| 回合 | 钱 | 等级 | 名额 | 买 | 上场 | 休整耗时 |
|---|---|---|---|---|---|---|
| 1 | 4 | 1 | 8 | 2 | 2 | 71.2s |
| 2 | 5 | 1 | 8 | 2 | 2 | 90.8s |
| 3 | 6 | 2 | 4 | 3 | 2 | 147.4s |
| 4 | 3 | 1 | 3 | 0 | 0 | 52.5s |
| 5 | 8 | 2 | 3 | 0 | 0 | 63.5s |
| 6 | 9 | 2 | 3 | 3 | 2 | 148.7s |
| 7 | 10 | 3 | null | 0 | 0 | 65.8s |
| 8 | 10 | 3 | null | 3 | 1 | 167.9s |

- 战术决策页自动接手：`战术决策 → {"ok":true,"picked":1,"state":"wz_rest"}`（选「财富」+1 资金）。
- 回合 4/5 买 0：钱不够且清单里没有 ≤ 余钱的卡，属正常收工，不是卡死。

## 3. 落位（已定型，本轮再确认）
- 三步：按待命区精灵中心 hold 20ms → 分步拖 150ms 到格心 → 松手进待确认 → `adb shell input swipe (x,y-50)→(x,y-200) 400ms` 确认（滑的方向＝朝向）。
- 实测单次 4.1~4.8s（`上场 夏栎 (1562,883 → 1330,540) 朝right 起手 20ms 用时 4.8s`），判成功只看「待命区少一张牌」。
- 本轮修：`isPending(st)` 改成「绿格多 **或** 红 X 像素多」双判据 —— 有地图的帧绿格本来就少，实测 `green=771` 的真待确认帧被旧判据当成「没拎起来」，白换按压点。

## 4. 换人（已接入，未真机验证）
- `placement.js` 新增 `replaceTargets(occupiedPx, {limit})`：把已占格按 y、x 排序取前 N。
- `deployFromDeck` 新增 `replace:true`：名额 ≤0 时不再直接收手，改成「把最左 1~2 张拖到已占格替换」，成功日志追加「（换人：替换原本站在该格的干员）」。
- 真机还没跑到场满 8 的那一步，**这条只有单测证据**（`test/replace.test.mjs` 4/4）。

## 5. 验收命令与结果（本轮实跑）

| # | 断言 | 命令 | 实测 |
|---|---|---|---|
| C1 | 五个改动文件语法可解析 | `node --check` ×5 | 全部 exit 0 |
| C2 | 休整期决策 40 条不回归 | `node test/restplan.test.mjs` | pass 40 / fail 0 |
| C3 | 升级判定 24 条 | `node test/shop-gate.test.mjs` | pass 24 / fail 0 |
| C4 | 换人候选 4 条 | `node test/replace.test.mjs` | pass 4 / fail 0 |
| C5 | 其余 6 套 | wiring/covenant/decide/placement/wants/tactic | 17/7/32/18/7/5 全 pass |
| C6 | 不冻结分支 | `node test/restplan-nofreeze.mjs` | ALL PASS |
| C7 | 升级有硬证据 | 看 steps.jsonl | 回合5 扣钱 8→1（费 7）、回合7 扣钱 10→1（费 9），Lv1→Lv2→Lv3 |
| C8 | 落位速度 | 看 steps.jsonl `用时` | 4.1~4.8s/人，起手 20ms |
| C9 | 决策链连续 | decision-log.jsonl | 8 个回合全部有记录，买/上场/等级都有值 |
| C10 | 升级坐标兜底随等级变 | `node test/upgrade-geo.test.mjs` | pass 6 / fail 0（579/339/99） |
| C11 | 兜底坐标真能点中 | steps.jsonl 回合3/4 | 按 Lv1(579,972) 升到 Lv2、按 Lv2(339,972) 升到 Lv3 |

合计 **160 条断言全过**（40+24+4+17+7+32+18+7+5+6）+ nofreeze 5 条。

## 6. 还没做
1. **卖人**（整备区满 10 张）真机没验到；`sellDeckUnit` 只按位置（最左＝最早买入）选，不认人。
2. `scanDeckChips` 张数假阳性：回合 7 先报「整备区实测 3 张」，收尾又「整备区空了 → 本回合共上 0 个」。
3. 名额 OCR 常读 `null`（回合 7/8 都是），现在靠 `isPending`+甲板少一张兜底，但配额闸门没法提前判。
4. 决策层样本只有 8 回合，离「整局到结算」还差。

## 7. 复现
```powershell
# 起（WMI detached，env 必须 set "K=V" 带引号）
Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine='cmd.exe /c "set "COOPANION_DEVICE=emulator-5556" && cd /d <world> && node scripts/_decision-run.mjs 8 >> <world>\.tmp\decision.out 2>&1"'}
# 停
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match '_decision-run' -and $_.Name -match 'node|cmd' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```
