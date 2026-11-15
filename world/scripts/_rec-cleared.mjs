import fs from 'node:fs';
const rec = {"at":"2026-11-10T07:46:00.000Z","maxRounds":6,"rounds":[{"round":9,"hp":40,"moneyLeft":11,"bought":["流明","至简","角峰"]},{"round":10,"hp":40,"moneyLeft":11,"bought":["温蒂","流明","星源"]},{"round":11,"hp":40,"moneyLeft":11,"bought":["淬羽赫默","哈洛德"]},{"round":12,"hp":40,"moneyLeft":11,"bought":["极光","机械师"]},{"round":13,"hp":40,"moneyLeft":11,"bought":["卡涅利安"]}],"stop":"没进到战斗界面（第14回合是最后一回合，直接进结算）","settle":{"cleared":true,"passedRounds":14,"cert":250,"certCap":"1220/6250","duration":"00时47分11秒"},"log":["首次「模拟完成」（打通 14 回合）","R9–R13 血量 40 一滴没掉","中心 Lv1→Lv4","甲板上不了的卡每回合被清空"]};
fs.appendFileSync('data/runs.jsonl', JSON.stringify(rec) + '\n');
const n = fs.readFileSync('data/runs.jsonl','utf8').split('\n').filter(Boolean).length;
console.log('records', n);
