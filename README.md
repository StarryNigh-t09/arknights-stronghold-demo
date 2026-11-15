# 卫戍协议自动化代理（Demo）

> 明日方舟「卫戍协议 · 规程」模式的自动打局代理：**截图 → OCR/视觉识别 → 规则+搜索决策 → adb 手势**。
> 跑在 MuMu 模拟器（1920×1080）上，全程不读内存、不改客户端，只做「看屏幕 + 点屏幕」。

这是一个**阶段性 demo**，不是成品。它已经能自己从第 1 回合连续打 10~15 个回合、买东西、布阵、换人，
但还没打通 BOSS 关。

---

## 现在能做到什么（实测数据，2026-11-15）

| 指标 | 实测值 |
|---|---|
| 最好成绩 | **通过 13 回合**（第 14 回合 BOSS 打到 6/19 波，三名敌方领袖剩 3%/1%/1%） |
| 最近一局 | 通过 10 回合、00 时 48 分 35 秒 |
| 盟约目标 | 多局达成「**3 个盟约同时激活并叠层**」（顶栏实测：精准 16 / 坚守 3 / 谢拉格 8） |
| 单回合休整期耗时 | 110~160s（目标 70s，**未达标**） |
| 自动复盘 | 每局结束自动出 `docs/review-<trace>.md`：每回合上场数、REST 耗时、买卡/换人/失败原因 |
| 测试 | 仓库内 39 个测试文件、39 通过（纯逻辑 + 合成图；另 9 个依赖真实游戏截图/本地资源的用例未附带） |

---

## 架构

```
world/
  lib/         决策与编排（33 个模块）
    adb.js         adb 截图 / 点击 / 滑动
    run.js         状态机：登录→大厅→选模式→休整期→战斗→结算
    drive.js       休整期主循环（买卡、升级、布阵、撤回换人、商店开合）  ← 最核心，最大
    restplan.js    买卡/升级/刷新的规则决策
    covenantplan.js 盟约凑人、换人评分、卖卡选择
    deployorder.js 站位规则（重装 x=7/8、近战居中、医疗/远程 x=5/6 高台、朝右）
    gamemap.js     地图格与格位池
    bossplan.js    第 14 回合 BOSS 关布阵
    planner.js     2 层 beam 搜索（目标函数打分，可影子/接管）
    snapshot.js    结构化状态快照
    guideplan.js   按攻略频次表选核心盟约、加权
  sidecar/     视觉/OCR 的 Python 侧（66 个脚本，Pillow + PaddleOCR）
    deck.py        整备区张数与按压点
    boardocc.py    棋盘占格判定
    covnames.py    顶栏盟约名 + 层数
    numocr.py      血量/金币/名额/等级
  scripts/     复盘、对比报告等工具
  test/        48 个测试（node:test）
  data/        地图、盟约表、攻略频次表等配置
data/          干员职业/射程表
docs/          交接文档、复盘报告、验收截图
```

数据流：

```
adb screencap ──► sidecar/*.py (Pillow 切区域 / PaddleOCR 认字)
                     │
                     ▼
            lib/*.js 规则 + planner 打分
                     │
                     ▼
         adb input tap / swipe（拖拽部署、点卡片、折叠商店）
```

设计要点：
- **只依赖像素**：所有状态都从截图读（OCR 数字 + 区域亮度 + 模板匹配），不 hook 游戏。
- **规则兜底 + 搜索优化**：`restplan` 是手工规则；`planner` 用 2 层 beam 搜索给每一步打分，
  默认影子运行（只记录与规则的对比，写 `data/planner-compare.jsonl`），设 `COOP_PLANNER_MODE=apply` 才接管买卡/升级。
- **失败也要留证据**：每回合写 trace（`trace-night-*/steps.jsonl` + 每步截图），结束自动生成复盘报告。

---

## 怎么跑（Windows + MuMu）

依赖：
- Node.js ≥ 20
- Python 3.14（`Pillow`、`paddleocr`、`numpy`）
- MuMu 模拟器（adb 走 `nx_main/adb.exe`），分辨率固定 1920×1080

```bash
# 1) 设备号必须显式给，否则默认 127.0.0.1:16416 会拿到 0 字节截图
set COOPANION_DEVICE=emulator-5556
set COOP_OCR_PYTHON=C:/Python314/python.exe
set COOPANION_PYTHON=C:/Python314/python.exe
set PYTHONPATH=<你的 site-packages>

# 2) 从当前休整期开始跑 N 个回合
node world/.tmp/oneshot.mjs 14      # 这个脚本是本地调试用的，按需自己写

# 3) 跑测试
node world/scripts/test-all.mjs
```

> `.tmp/` 下的脚本是这些天临时写的驱动/探针，没有随仓库提供；
> 需要的话按 `lib/run.js` 的 `enterRun()` / `drive.js` 的 `autoRun()` 自己拼一个入口即可。

---

## 已知限制（别当成能直接用的工具）

1. **分辨率写死**：地图格位、按压点、OCR 区域全部按 1920×1080 标定，换分辨率要重标。
2. **休整期太慢**：110~160s/回合，主要花在「认人」（20~27s）和商店开合（每回合 2~3 次）。
3. **BOSS 没通**：第 14 回合能进关，打到 6/19 波。
4. **OCR 会抖**：名额/血量偶尔读错，代码里有若干兜底（连读两次、按容量反推、账本交叉校验），但不是零错。
5. **没有自选编队逻辑**：3/3 页面直接「准备就绪」，阵容靠系统给。

---

## 免责声明

- 仅用于**学习与自动化研究**（CV/OCR/决策搜索）。
- 游戏《明日方舟》及其素材版权归**鹰角网络**所有；仓库内截图仅作识别样本，不含任何游戏本体或资源包。
- 使用第三方自动化可能违反游戏用户协议，**风险自负**，与作者无关。
