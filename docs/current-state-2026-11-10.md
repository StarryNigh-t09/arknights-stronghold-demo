# 卫戍协议插件 · 当前状态（2026-11-10 17:00）

## 最好成绩
「模拟完成」14 回合 / ×250 / 1220⁄6250 / 47:11（15:32 那局，从 R9 续打）。
其余几局都是「模拟中断」（= 输了），最好 13 回合 / ×160 / 910。累计认证 1352/6250。

## 已跑通（真机）
- 整局链路：大厅 → 独立模拟 → 难度 → 开局选项 → 休整期循环（买卡 / 升级 / 刷新 / 冻结 / 上场 / 道具补给 / 战术决策）→ 战斗等待 → 结算读数 → 落盘 runs.jsonl。
- 拖上场：minitouch 长按 450ms → 分段拖 → 松手前补偿幻影偏移 (−33,−120) → 再拖定朝向。
- 认人：轻按甲板小牌 → 左侧详情面板 → OCR 大字名字（实测 4/4 对）。
- 道具补给三选一：卡中心 (478/981/1450, 470)，确认条要按 y=728。
- 卖卡：长按拖到右下角 (1840,860)，每张 +1 块。
- 空可站格扫描：抓取态绿格 → freetiles.py（绿占比阈值 0.55）。

## 已知缺口（按影响排序）
1. **站位**：能站人的格 ≠ 该站人的格。写死的 12 个格位到中后期不够；扫出来的绿格没有地图路径可打分（map:{} 时所有格同分，反而把人塞到路线外，实测掉血更快）。→ 缺 data/maps/wz-01.json（红门/蓝门/可行走格/高台）。
2. **装备**：还没自动佩戴。真机确认装备图标在干员头顶那一排，按格子拖到干员脚下格；卖干员装备回甲板；攻击装给输出、防御装给重装。
3. **三合一**：买卡没优先凑对子（用户与实况都说有对子优先拿对碰，凑 3 个拿商店免费高阶卡）。
4. **vision 误判**：休整期偶尔认成 wz_admin / wz_hall，会把局提前掐断。
5. 认人播种在接手对局时会把状态机推进 wz_buydetail，已改成只数牌。

## 代码位置
- 状态机 / 决策 / 上场：world/lib/drive.js（autoRun / autoRest / deployFromDeck / sellToAfford / targetShopLevel）
- 手势 / 截图 / 结算：world/lib/run.js（placeUnit / scanDeckChips / identifyDeck / scanFreeTiles / readSettle）
- 站位打分：world/lib/placement.js（scoreAt / bestPlacement / planDeploy / DEPLOY_RANK）
- 目标阵容：world/lib/wants.js（buildWantList / wantGaps / pickFromShop）
- OCR / 视觉：world/sidecar/ocr.py（含 read_shop_level）、vision.py、deck.py、freetiles.py、dialog.py、item.py、names_ocr.py、portrait.py
- 数据：world/data（covenants-map.json / equipment.json / operator-ranges.json）、coopanion-arknights/data/operator-ranges.json
- 测试：world/test 6 个文件 87 条全绿（沙箱里别用 node --test，直接 node test/x.test.mjs）

## 口径
「模拟中断」= 输了；只有「模拟完成」算通关。通过回合：中断 = 打完 − 1，完成 = 打完回合数（readSettle 已按此实现）。
