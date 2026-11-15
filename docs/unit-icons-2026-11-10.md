# Q 版小人素材库（unit-icons）· 2026-11-10

> 目的：插件要做「纯图像识别干员」，但原有素材只有 PRTS 头像/半身像/立绘（`world/assets/portraits/*.png`，128×128），而甲板和战场上出现的是 Q 版小人，头像对不上。
> 本文记录这条素材线怎么来的、能信到什么程度、缺什么、以后怎么加。
> 配套数据：`world/data/unit-icons.json`；素材：`world/assets/unit-icons/<干员名>/default.png`。

## 1. 结论先说

| 项 | 数字 |
|---|---|
| 干员数 | 162 |
| 图片数 | 162（每人 1 张 `default`） |
| 尺寸/格式 | 256×256 RGBA PNG，透明底，主体按 alpha 包围盒裁切后居中 |
| 覆盖本站季默认阵容 | 138 / 141 |
| 阵容内缺口 | 奥尔佳、冻河、塔露拉（3 人） |
| 阵容外有图 | 24 人（能天使、银灰、陈、德克萨斯、闪灵、泥岩、风笛、灰烬、号角、澄闪、令、星熊、白面鸮、桃金娘、黑、焰影苇草、百炼嘉维尔、伊内丝、菲亚梅塔、推进之王、赫默、傀影、年、凯尔希 等） |

## 2. 采集路线（按尝试顺序，含失败记录）

### 2.1 PRTS（prts.wiki）—— 证伪，没有 Q 版小人
- MediaWiki API `action=query&list=allimages&aiprefix=小人`、`Q版`、`战斗`、`spine` **全部空结果**；`list=search&srsearch=小人` 只有 3 个文件，且是「基建8 带小人.png」这类基建界面截图，不是干员小人。
- File: 命名空间实际只有三套命名：`头像_<名>.png`、`半身像_<名>_<编号>.png`、`立绘_<名>_<编号>.png`，另有 `Char_<id>_<皮肤>.png`（皮肤宣传图）、`Avatar_activity_*.png`、`干员图鉴_*.png`。
- 素材站 `https://torappu.prts.wiki/assets/<folder>/<file>.png` 实测**只有** `char_portrait`、`uniequip_img`、`build_skill_icon` 等目录可用；`charpack/`、`avatar/`、`chararts/`、`chibi/`、`spine/`、`portraits/` 全部 404。
- **结论：PRTS 不提供 Q 版小人 / 战斗小人 / spine 资源，此路不通。**（这个结论本身有价值，省得以后重复试）

### 2.2 社区图包
- `yuanyan3060/ArknightsGameResource`：顶层只有 avatar / building_skill / enemy / gamedata / item / map / portrait / skill / skin，无 chibi/charpack。
- `ArknightsAssets/ArknightsAssets`：2025-04-22 已归档，且是数据/立绘为主。
- 均无现成 Q 版小人 PNG。

### 2.3 最终采用：isHarryh/Ark-Models 的官方 spine 资源，本地离屏渲染 ✅
- 仓库根目录 `models/` 下有 953 个目录，每个是 `build_char_<id>.{skel,atlas,png}` —— 这套 `build_char_*` 就是游戏里「甲板/战场小人」用的同一套骨骼动画资产（官方 building 资源）。
- 因此**不需要靠肉眼看图猜是谁**：目录 id 直接就是 charId，身份由资源本身保证，这是本文可信度的根基。
- 渲染方式：Spine 官方运行时 `spine-webgl 3.8`（skel 头部版本号实测 `3.8`），在本地起静态服务 + headless 浏览器，用 `Default` 动画 `t=0.33s` 的姿态取包围盒，等比缩放到 512×512 后导出 PNG，再裁 alpha 包围盒、居中到 256×256 透明底。

## 3. 每张图的可信度

`unit-icons.json` 里每条都是同一个逻辑，逐项写清：

- `source`：`https://raw.githubusercontent.com/isHarryh/Ark-Models/main/models/<charId>/build_char_<charId>.skel`（原始资源地址，可复查）
- `charId`：官方内部 id，如 `002_amiya`、`350_surtr`
- `tier` + `tierSource`：该干员在 PRTS《卫戍协议·规程》默认阵容里的等阶（Ⅰ–Ⅵ），字段来自 `world/data/live-strategy-2026-11-10.json` 的 `operatorTierTable`
- `variants.default.pose` = "Default 动画 t=0.33s"，`background` = "transparent RGBA"，`sha256` 可校验完整性
- `confidence`：统一 `fact`

**为什么这里敢标 fact**：图不是从视频里截的、也没有经过任何人工判断——是官方资源文件直接渲染，"这张图是哪个干员"由文件路径决定，不存在识别误差。唯一的人工成分是姿态选点（t=0.33s，取站立基准姿势，避免举武器/前倾），这不影响身份。

**已知限制（用的时候必须知道）**：
1. 站姿固定，不是战斗中的动作帧；战场上小人会跑动、举武器、背对镜头，**纯靠同一张站姿图做匹配会吃亏**。
2. 部分干员默认立绘带持械/飘带，包围盒因此偏宽，小人本体在 256×256 里偏小；做模板匹配前建议统一缩放到同一身高（比如按脚底到头顶的像素高归一）。
3. 皮肤（`#1`～`#N` 后缀目录）**没有**渲染，只有默认外观。战场上如果敌人/干员换了皮肤，这套图对不上。

## 4. 缺口：3 个阵容干员没图

| 干员 | 原因 | 现有可能的替代 |
|---|---|---|
| 奥尔佳 | `models_data.json` 里完全没有这个 id/名字（资源快照早于该干员上线） | 无 |
| 冻河 | 同上 | 无 |
| 塔露拉 | 只有 `1503_talula`、`3002_ftrtal` 两个目录，`style=null`（非 BuildingDefault，是剧情/BOSS 资源） | 渲染出来外观与卡面不一致，不敢用 |

这 3 人的头像在 `world/data/portraits.json` 里有（class 分别是 近卫/辅助/近卫），但**头像不能冒充 Q 版小人**，所以索引里没有放。要用只能等 Ark-Models 更新快照，或从实战录像截帧。

## 5. 以后怎么扩

1. **补皮肤/新干员**：拿新快照的 `models_data.json`，把 `{charId, name, style:"BuildingDefault", assetList}` 追加进 `_wk/spine/models_all.json`（脚本 `_wk/build_models_all.py` 的输入来源），然后跑 `_wk/spine/dl2.py` 下载 → 起 8777 服务 → `render.html?v=<时间戳>` → `_wk/build_icons.py` → `_wk/build_index.py`。
2. **多变体**：`unit-icons/<名>/` 下允许放多张，命名 `<变体>.png`（如 `skin2.png`、`back.png`），索引 `variants` 里加一条即可；目前全是 `default`。
3. **要真实战场外观**：唯一可靠来源是实战录像截帧（甲板行的小人正面、无遮挡、约 110px 高，同帧卡片上有名字可对照）。这条线没做，因为截帧分辨率（720p）和遮挡都不稳定，做出来可信度不如官方资源。

## 6. 复现清单（都在 `coopanion-arknights/_wk/`）

- `spine/models_all.json`：163 条 {id, name, files}（含中文名）
- `spine/dl2.py`：断点续传下载，走 `axisnow.gh-proxy.org`
- `spine/server.py`：127.0.0.1:8777 静态服务 + `POST /save` 收 base64 PNG
- `spine/render.html` + `spine/spine-webgl.js`：离屏渲染（运行时 3.8）
- `build_icons.py`：裁 alpha 包围盒 → 256×256 透明底 → 生成 `icons_sheet.jpg` 拼图自检
- `build_index.py`：写 `world/data/unit-icons.json`
- 自检拼图：`_wk/icons_sheet.jpg`（960×4320，6 列 × 27 行），已切片肉眼确认全部人形站姿、透明底、无白边

## 7. 踩过的坑（别再踩）

- Spine 3.8 的 `AssetManager` **没有 `loadAll()`**，只能 `downloadText/downloadBinary/loadBinary...` 后轮询 `isLoadingComplete()`。
- 调 `skeleton.setSkin(name)` 会抛 `newSkin.getAttachment is not a function` —— **不要调 setSkin**，构造器已带默认皮肤。
- 浏览器导航到同一 URL 会复用页面不重载，必须带 `?v=<变化值>`。
- `subprocess` 带 pipe 在沙箱里报 `PermissionError: [WinError 5]`，脚本里别抓子进程输出。
- 本机 bash 执行器不可用（`CreateFileMapping ... Win32 error 5`），一律走 pwsh；中文控制台乱码属正常，判读用 read 读 JSON。
