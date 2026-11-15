# 进度存档 · 2026-11-11 夜（重启电脑前）

写给重启后的自己看。**先读这一份，再读 buyloop-2026-11-11.md 与 decision-plan-2026-11-11.md。**

## 一句话状态
机械链路（买卡/刷新/冻结/升级/上场/开战/结算）已稳定跑通多局；今晚按用户最新口径改了**站位、凑对子、升级**三处决策；最后一局跑在第 5 回合、血量 2，等于废局，重启后重开一局验证三处改动。

## 用户今晚给的最新口径（最高依据，逐条对应代码）
1. **m04007**：「1本随便刷的目的是凑对子然后三合一，而不是找某个干员」→ 店里有「手里已有 1~2 张」且买得起的卡，**先买它**，优先于刷新；低本（level≤2）只刷 1 次，没配对就先买人。
2. **m04007**：「我干员不是叫你放最上面一排的吗」「你放的地方敌人都不经过」→ 分道排序改成**先填最上面一排**（row 最小），排内再看覆盖。
3. **m04048**（站位，非常具体）：「2 3 4 适合部署近战干员，1 7 8 适合远程，奶如果是向前三格的就放在 7，向前只有两格就放在 8，接下来的干员围绕这些位置放，覆盖范围大就行，覆盖 3 4 5 的权重大于其他格子」。
4. **m04079**：「按照别人教的节奏升级，我那句『钱刚好够之后下一回合升级』忘了吧」→ 删掉「升完只剩 0~1 块就先不升」的闸门，够钱就升。
5. **m03928**：装备只买本局盟约的转职/盟约装备，其他盟约的一件不买。
6. **m03861**：升级节奏/4 阶卡/停本刷/不升六/冻结 全按视频（strategy-2026-11-10.md）；阵容按盟约体系。

## 这一轮改的代码（都 node --check 通过，单测 32/32 绿）
### world/lib/gamemap.js
- `deployTilesByCoverage`：排序权重 `(10 - t.row) * 100000 + gain * 1000 + t.col * 10` → 最上面一排优先。
- 新增 `export const ROLE_SLOTS = { melee: [2,3,4], ranged: [1,7,8] }`、`export function healerSlot(info)`（range 里 dx 最大值 ≥3 → 7 号，否则 8 号）。
- `planTilesForNames` 重写：编号 = 19 个可部署格按 (row, col) 排序后的 1..19（就是 `C:\Users\18539\Desktop\tiles-for-you.png` 上标的号）；医疗先站（7 或 8）→ 远程（1/7/8）→ 近战（2/3/4）→ 其余按 `hot(3/4/5 号格) * 40 + walk 覆盖 * 10 + 行优先` 挑。实测：摆渡人→#2、褐果→#7、陨星→#1、拜松→#3。
- 编号对照（后面报问题要用）：1 C3(725,347) 2 C4(845,348) 3 C5(964,350) 4 C6(1081,351) 5 C7(1196,353) 6 C8(1311,354) 7 C3-2行(715,444) 8 C4-2行(840,445) 9 C6-2行(1086,447) 10 C7-2行(1207,448) 11 C8-2行(1326,449) 12 C3-3行(704,550) 13 C4-3行(835,551) 14 C7-3行(1218,552) 15 C8-3行(1342,552) 16 C3-4行(692,667) 17 C4-4行(829,667) 18 C8-4行(1360,665) 19 C9-4行(1489,665)。

### world/lib/restplan.js
- 新增「凑对子」分支（排在刷新之前）：`pairBuys = affordableUnits.filter(c => num(c.have) >= 1)`，按 have 降序、价升序取第一张。
- 低本刷新预算 `refreshBudget = level <= 2 ? 1 : REFRESH_BEFORE_BUY(3)`。
- 升级闸门：删掉 `round >= 3 && money - upgradeCost <= 1` 这条「先不升」，改成够钱就升（保留「一回合最多升一次」的 `ctx.upgraded` 闸）。
- 单测 world/test/restplan.test.mjs 对应改 1 条（原「升完只剩 1 块 → 买卡」改成「照升」），现在 32 pass / 0 fail。

### world/lib/drive.js
- **升级费读不出就直接不升级**这个坑：新增 `let lastUpCost` 记忆最近一次读到的升级费；`restBuyTurn` 的 `upgradeCost` 在 OCR 为 null 时用它兜底。来由：21:54 那局升级后 OCR 读不出新费用，决策器整局只买卡不升级（用户当场问「为什么不升级商店了」）。
- 失败格不再记账（`occupiedPx.add` 已删），只在 `map-issues.jsonl` 记一笔。
- 升级节奏表 `targetShopLevel(round)`：r≤2→1，r≤3→2，r≤6→3，r≤9→4，否则 5（永不升六）。
- 装备按本局盟约过滤：`covNow` + `equipAllowed(name)`，认不出盟约就一件不买。

## 重启后怎么继续（照抄能跑）
```
cd C:\Users\18539\DSH-Workspaces\coopanion\coopanion-arknights\world
export COOPANION_DEVICE=127.0.0.1:16416
export COOP_OCR_PYTHON='C:\Python314\python.exe'
export TEMP/TMP/TMPDIR='C:\Users\18539\DSH-Workspaces\coopanion\.tmp'
export USERPROFILE=C:\Users\18539 APPDATA=C:\Users\18539\AppData\Roaming LOCALAPPDATA=C:\Users\18539\AppData\Local
export PYTHONIOENCODING=utf-8 PYTHONUTF8=1 COOP_DEPLOY_HOLD_MS=250
node scripts/run-attach.mjs     # 接手当前对局
node scripts/run-full.mjs       # 从大厅开新局
```
- 模拟器重启后先 `adb connect 127.0.0.1:16416`（MuMu 可能换端口，7555 也试）。
- 单测：`node test/restplan.test.mjs`（**不要**用 `node --test`，会 EPERM）。
- 杀进程：`taskkill /F /PID <pid>`；杀掉正在拖拽的进程会留下「按住」状态，用 `adb shell input tap 960 540` 取消一次。

## 重启前的现场（记录用）
第 5 回合休整期、金币 0、血量 2、剩余可放置 4 —— 废局，重启后直接重开。
截图：`C:\Users\18539\DSH-Workspaces\coopanion\_state-before-reboot.png`

## 还没做（重启后按这个顺序）
1. 重开一局，验证三处改动：升级是否按节奏走（Lv2@R3、Lv3@R4-6、Lv4@R7-9、Lv5@R10+）、对子是否优先买、站位是否落在 #2/#3/#4（近战）、#1/#7/#8（远程）、奶 #7/#8。
2. 甲板卡区分干员/装备（装备拖起来是青带 +「拖拽至此销毁」，硬拖会白试 4 格 ≈ 24s）。
3. 卖人改成「不需要就卖、先卖低阶」补经济（不再绑整备区 10/10）。
4. 目标池按「阶 + 本局盟约」接进 wantList（wants.js 已有能力）。
5. 决策层剩余：每级商店目标细化、装备优先表、叠层干员清单。
