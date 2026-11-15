import { sh, adb, currentDevice } from '../lib/adb.js'
console.log('DEV ' + currentDevice())
try { const d = sh('devices'); console.log('DEVICES ' + JSON.stringify(String(d && d.out && d.out.toString ? d.out.toString() : d).slice(0, 300))) } catch (e) { console.log('DEVICES ERR ' + e.message) }
try { const r = sh('screencap -p /sdcard/coop_shot.png'); console.log('SCREENCAP ' + JSON.stringify({code:r&&r.code, err:String(r&&r.err||'').slice(0,200)})) } catch (e) { console.log('SCREENCAP ERR ' + e.message) }
try { const r = adb(['pull','/sdcard/coop_shot.png','../.tmp/probe-pull.png']); console.log('PULL ' + JSON.stringify({code:r&&r.code, out:String(r&&r.out||'').slice(0,200), err:String(r&&r.err||'').slice(0,200)})) } catch (e) { console.log('PULL ERR ' + e.message) }