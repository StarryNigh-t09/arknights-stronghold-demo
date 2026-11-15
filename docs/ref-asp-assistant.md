# 参考项目评估：ASP Assistant · Arknights（2026-11-10）

## 是什么

BV1cYWb62E1F（UP：冰云河，8936 播放）。C#/.NET 8 + WPF 的**侧边查询面板**，贴在游戏窗口旁边，不是自动化脚本、不碰输入。

- 本项目：https://github.com/bingyunhe/asp-assistant-arknights （Apache-2.0，v1.3.0，2026-11-09 改）
- 上游：https://github.com/Moonfair/ASP_Assistant （同样 Apache-2.0，基线 93b2ba8）
- 能力来源：**MaaFramework** 提供图像识别（MaaCardDetector / MaaOcrEngine / MaaBanIconMatcher）
- 本机落地：`refs/asp-assistant-arknights-main/`（zip 69.0 MB，`refs/asp-main.zip` 可删）

## 能用的（按价值排序）

### 1. 数据：羁绊 + 干员 + 装备（我们正缺的）

| 文件 | 大小 | 内容 |
|---|---|---|
| `data/covenants.json` | 3,191 B | **26 条盟约**：10 SEASON（乌萨斯/伊比利亚/…）+ 16 REGULAR（不屈/助力/坚守/精准/灵巧/聚合/迅捷/远见/奥术/奇迹/绝技/突袭/调和/独行/投资人/协防干员）。每条 `{name, bondType, activateCount}`，activateCount 取 3/2/1 |
| `data/operators.json` | 99,420 B | **141 干员**：`{name, tier, coreCovenants[], additionalCovenants[], normal:{traits[]}, elite:{traits[]}}`；traits 的 `traitType` 只有 5 类：持续叠加/整备能力/作战能力/单次叠加/特异化，`traitDescription` 是**原文**（如「<休整期结束时>使已激活的【莱塔尼亚】层数+8」） |
| `data/equipment.json` | 26,822 B | **70 件装备** + `manualJobChangeEquipments`（转职装备）；`{name, tier, normal, elite}`，普通/精锐两套数值 |
| `data/equipment_categories.json` | 4,032 B | 装备功能分类（攻击/防御/生存/技力/经济/盟约/其他） |
| `data/bosses.json` | 12,439 B | 10 首领 |
| `data/enemy_types.json` | 20,398 B | 9 特训类型 / 93 变体 |
| `data/skin_avatar_map.json` | 15,369 B | **皮肤 → 干员映射**（商店卡认人时可救场） |

对我们最直接的作用：用户 m03063 要的「羁绊知识库」里，**干员↔盟约的对应关系和叠层文本**这一半，它已经整理好了；我们手上只有 covenants.json（88 KB，单源 BV1BTWH6nEXK 的强度评价）和 unit-roles.json，没有 141 人的盟约归属表。装备数据同样是空白（道具补给三选一现在纯瞎选中间那张）。

### 2. 禁屏（确认本局信息）识别

`GarrisonOcrStrategy.cs` 把各区域写成百分比（适配任意分辨率），其中禁屏三段是实测出来的：

```
BanConfirmText       x 0.25  y 0.00  w 0.50  h 0.10   // 找「确认本局信息」标题
BanFactionPanel      x 0.05  y 0.00  w 0.25  h 0.90   // 左侧阵营栏
BanCoreSection       x 0.00  y 0.16  w 0.70  h 0.24   // 核心盟约标题 y≈0.18 + 图标行 0.27–0.33 + 名字 y≈0.36
BanAdditionalSection x 0.00  y 0.43  w 0.70  h 0.42   // 附加盟约标题 y≈0.44，名字 0.62 与 0.80
```

还有 `BanIconBrightness.cs` / `BanIconGrid.cs`（按亮度判图标是否被 ban，灰图标=禁用）、`MaaBanIconMatcher.cs`（MAA 模板匹配图标）、`BanScreenAnalyzer.cs` + `BanCovenantReader.cs`（17 KB，把两栏读成本局可用/禁用盟约）。

我们能直接抄的是**判定思路**：禁屏一屏不滚动读完 + 灰图标=禁 + 按图标而非文字认盟约。我们的 `enterRun` 现在是盲点「核心盟约 A 组 (473,371)」，根本不知道本局 ban 了什么。

### 3. 商店读名（灰卡/冻结/扫光）

`ShopReader.cs`（12.7 KB）+ `ShopStateStabilizer.cs`：先按名称长度降序做前缀匹配（避免「灰喉」被「灰」吃掉），支持灰卡（买不起）、冻结雪花、金色扫光三种遮挡下仍读名字；`MatchNames` 按**实际名字位置**定位，不写死五格。

我们用 OCR 读卡面文字，遇到金光扫过会读空。它的做法可以借鉴（多帧取稳定值 + 名称白名单前缀匹配）。

## 不能用的

- **没有自动化**：无输入注入、无状态机、无站位逻辑。它是给「人边打边查」用的。
- **没有攻击范围**：`operators.json` 里 0 条 class/profession/range 字段 —— 范围数据还得靠我们从 PRTS 抓的那份（143 人）。
- **要 .NET 8 + WPF 才能跑**：我们不改它，只取数据和思路。
- 它是 Windows 桌面程序，直接装一份给人用可以，但不能替代我们的陪玩插件。

## 许可证

Apache-2.0，改动需保留 LICENSE / NOTICE / 来源声明。**我们只取数据要标注来源**：在 `world/data/` 对应文件加 `source` 字段写明 ASP Assistant（bingyunhe）与上游 Moonfair，许可证 Apache-2.0。

## 建议的接入顺序

1. 把 `operators.json` + `covenants.json` 转成我们的 `world/data/covenants-map.json`（干员→盟约 + 叠层文本），先只读不接决策，补上知识库缺口。
2. 把 `equipment.json` 接进道具补给三选一：按当前阵容职业挑装备，别再盲选中间。
3. 抄禁屏识别进 `enterRun`：读本局 ban 掉的盟约 → 喂给 `decide.js` 选策略。
4. 商店读名的手法是备选，暂时不动（我们现在靠 OCR 也读出来了）。