import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
const NODE = 'C:\\Program Files\\nodejs\\node.exe';
function run(script, args, log) {
  return new Promise((res) => {
    const fd = openSync(log, 'a');
    const p = spawn(NODE, [script, ...args], { cwd: './world', stdio: ['ignore', fd, fd], env: process.env });
    p.on('exit', (c) => { res(c); });
  });
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const log1 = '../_night-finish.log';
const log2 = '../_night-full.log';
console.log('step1 finish current run');
await run('scripts/play-from-rest.mjs', ['4', 'deploy', '0'], log1);
console.log('step2 full 12-round run');
await run('scripts/live-run.mjs', ['12', 'deploy', 'want', 'free'], log2);
console.log('done', stamp);
