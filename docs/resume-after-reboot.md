# 重启后怎么续（2026-11-14 12:2x 写的）

## 一、重启前的现场（照这个对账）
- 游戏停在第 12 回合「休息一下」：HP 20、剩余可放置角色 0（名额满）、钱 1、整备区 10 张、调度中心 Lv5、场上 9 人。
- 重启会杀掉 MuMu 和无头安卓，游戏内的这局可能回到大厅、也可能续在第 12 回合 —— **开机后先截一张图看 state，别直接 assumption 续跑**。
- 没有 oneshot 进程在跑（重启前查过，只剩 DSH 自己的 ego-browser worker）。

## 二、环境（每次都要设，缺一个就跑不起来）
- node：`D:/DSH/DSH NEXT/DSH NEXT.exe`，必须带 `ELECTRON_RUN_AS_NODE=1`。
- python：`C:/Python314/python.exe`，必须带 `PYTHONPATH=../~/Python/Python314/site-packages`（PIL 在这），`COOP_OCR_PYTHON=C:/Python314/python.exe`，PATH 里要有 `C:/Python314`。
- adb：`C:/Program Files/Netease/MuMu/nx_main/adb.exe`，设备 `emulator-5556`。MuMu 启动后等 20~30 秒再 `adb devices`。

## 三、开机后的顺序
1. 起 MuMu（模拟器进安卓桌面），`"C:/Program Files/Netease/MuMu/nx_main/adb.exe" devices` 看到 `emulator-5556 device` 才算就绪。
2. 查残留：`powershell Get-CimInstance Win32_Process -Filter "Name='DSH NEXT.exe'" | ? { $_.CommandLine -like '*oneshot*' }` —— 有就先 `taskkill /PID <pid> /F`，一个模拟器只能跑一个。
3. 截图看现场：`adb -s emulator-5556 exec-out screencap -p > world/.tmp/live.png`，再 `C:/Python314/python.exe world/.tmp/shrink.py world/.tmp/live.png` 生成 `-s.jpg` 给我看。
4. 在局内（休整或战斗）→ 直接续跑：`bash world/.tmp/run14e.sh` 那类脚本（只跑 oneshot）。在大厅/结算页 → 先 `newrun.mjs` 开新局再 oneshot。
5. 长跑必须 `ops_bash({run_in_background:true})`；run_code 里 spawn 的进程会随 evaluation 结束被杀。

## 四、这轮改了但还没上真机验证的东西（优先验这些）
1. 决策层四条规则（world/lib/covenantplan.js、restplan.js、drive.js）：只买计划内+输出羁绊、台下杂牌到 6 张就卖、盟约内三合一压过升级、8 回合起换人只认阶数升级。单测 30/30 绿，真机 0 次。
2. 站位重排（world/data/maps/wz-01.json 的 deployOrder）：重装 [[7,1],[8,4]] 朝右、近战占走道、远程上高台；`world/lib/deployorder.js` 新增 roleAcceptsCell 做硬过滤。
3. 棋盘占格检测（world/sidecar/boardocc.py + drive.js 的 detectOccupiedTiles）：开跑前剔掉已占格，省掉每格 5.8s 盲试。
4. 甲板按压点（sidecar/deck.py 的 bench_rail 取 bottom 最大那条 + pickChipsFromDeckJson 的 minPressY 分支修 lowConfidence 误判）。

## 五、已知没解决的问题
- **换人执行手势**：甲板牌拖到「已占格」用 minitouch / motionevent / mouseDrag 三种注入都只进待确认态、松手不落位（用户真实鼠标能成）；空格落位正常。两条路：找 MuMu 鼠标注入写法，或名额 0 时「先撤回（recallBoardUnit 可用）再正常部署」。
- 休息期 100~148s（目标 70s）：回合头 13s（3 次整屏 OCR）、认人 13~19s、商店+买卡 22~60s、布阵 48~95s。
- 皮肤小人导出（86 套）卡在 PRTS 前端 404，chibi 快通道实测 top1 0%，未接线。

## 六、回滚
- 决策层改动之前：`../_backup/20261114-1220-world-after-decision`（2214 文件 1,004,441,753 字节，与源逐文件一致，已核对）。
- 整个 P0 改造之前：`../_backup/20261113-2350-world-before-p0/world`（1562 文件 312,139,349 字节）。
- 地图站位：`world/data/maps/_backup-wz-01-1794626430205.json`。
- 回滚 = 把备份里对应文件按原路径拷回去。
