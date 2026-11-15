import { createTouch } from "../lib/touch.js";
const t = createTouch({ adb: "C:/Program Files/Netease/MuMu/nx_main/adb.exe", serial: "127.0.0.1:16416", log: console.log });
console.log("tapDeck", t.tap(1130, 620).ok);
