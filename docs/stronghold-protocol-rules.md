# 卫戍协议：上阵操作与「剩余可放置角色」规则

> 来源分级：**官方**=明日方舟游戏内帮助（PRTS 转录）；**复刻**=玩家自制网页复刻 Stronghold-Protocol 的文档与界面文案，**不是官方**，官方帮助页里没有这些字样。查不到的写「不确定」，别当规则用。

## 1. 待命区干员怎么上场：拖到格子后还要不要确认

- 官方：从手牌区选干员部署到战场区，只有战场区的干员参与作战；所有行动内远程干员可部署在近战位。该部署只代表初始站位（一般固定站位）。 https://prts.wiki/w/卫戍协议/帮助
- 复刻：拖到棋盘格只是「放入」；**松手后进入选朝向状态**，出现方向轮盘，向上/右/下/左滑动选朝向后松手才算完成；松在轮盘中心或点「✕ 点击取消」= 取消。 https://github.com/sganggs/Stronghold-Protocol/blob/master/docs/PLAYING.md
- 两步之间点了别处 → 这次放入自动撤销。 https://github.com/mario02222227/sp-guide
- 结论：**要额外一个确认动作（选朝向）**，拖到位不算完成；只改朝向 = 把干员拖回它自己的格子再选方向，不算重新部署。 https://github.com/sganggs/Stronghold-Protocol/blob/master/docs/PLAYING.md

## 2.「剩余可放置角色：N」

- 官方没有这个字样，官方口径是「部署位限制，初始为 8」。 https://prts.wiki/w/卫戍协议/帮助
- 复刻里它是 HUD 计数：格子空出来 → 「剩余可放置角色加 1」。说明它算的是「场上还能放几个」的余量，不是每回合发放的资源。 https://github.com/sganggs/Stronghold-Protocol/blob/master/docs/PLAYING.md
- 另有攻略写「棋盘最多 8 名」（该文注明部分内容 AI 辅助生成，仅作旁证）。 https://blog.csdn.net/gitblog_00145/article/details/167270166
- **不确定**：每回合给多少、归零后是否完全不能再部署、有没有主动增加的办法。公开资料不足以定论。

## 3. 绿色格、红色「点击取消」、干员头顶箭头

- 绿色（高亮格）= **可放置格**：拖动时近战位/远程位分别高亮，只有这些格子能落。 https://github.com/sganggs/Stronghold-Protocol/blob/master/docs/PLAYING.md
- 红色「✕ 点击取消」= **方向轮盘中心的取消键**，点它（或松在轮盘中心）撤销这次部署。 https://github.com/sganggs/Stronghold-Protocol
- 干员头顶箭头 = **选朝向指示**：按住棋子向外拖动时，格子里出现朝向箭头 + 橙色条纹攻击范围预览，松手定朝向。 https://github.com/mario02222227/sp-guide
- 容易混的一点：作战中倒地干员头顶的圆圈是**再部署倒计时**（绿色圆环 + 秒数，变黄色「DP」= 费用不够），跟选朝向的箭头不是一回事。 https://github.com/sganggs/Stronghold-Protocol/blob/master/docs/PLAYING.md

## 4. 部署失败 / 回弹的常见原因

- **非法地形**：深水区（战场#08 涨潮控制中间水池）任何干员和召唤物都放不上去，直接拒绝部署。 https://github.com/sganggs/Stronghold-Protocol/blob/master/docs/PLAYING.md
- **高台/地面限制**：普通近战只能放地面；特性写「可以放置于远程位」的近战（钩索师、推击手：歌蕾蒂娅、崖心、见行者、温蒂）才能上高台。同上
- **格子已占用**：拖到已有干员的格子上是**交换位置**，不是新增一个，所以看起来像「没放上去」。 https://github.com/mario02222227/sp-guide
- **名额满**：部署位（初始 8）用完，或整备区 10 格 + 临时整备区 5 格都满（临时区有单位时还不能点「准备就绪」）。 https://blog.csdn.net/gitblog_00145/article/details/167270166
- 顺带：部署时干员的「部署效果」不生效，只是站位——不是失败，但容易误判。 https://prts.wiki/w/卫戍协议/帮助

## 不确定清单

- 「剩余可放置角色」每回合发放量、归零后的行为、增加途径：**不确定**。
- 官方手游界面是否真的用绿色格 / 红色「点击取消」/ 头顶箭头这套表现：官方帮助页未提，**不确定**（上述 UI 描述均出自同人复刻）。
