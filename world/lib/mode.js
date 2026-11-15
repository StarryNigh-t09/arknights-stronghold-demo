/**
 * 两种陪玩模式的开关。
 *
 * 用户要的是两种玩法（原话：A「她有电脑操作，自己登号」，C「一起玩」）：
 *   advise —— 同玩模式：只给建议，一个像素都不碰。用户自己握着鼠标/手机，
 *             脚本乱点会直接抢操作，所以这是默认值。
 *   auto   —— 全托管：她登自己的号，自己点、自己打。
 *
 * 为什么放在进程内存而不是写盘：模式跟着会话走。写盘的坏处是下次冷启动
 * 还留着上次的 auto，某天用户只是想看看建议，脚本却自己动起来了。
 */
const MODES = new Set(['advise', 'auto']);
let current = 'advise';

export function getMode() {
  return current;
}

export function setMode(next) {
  if (!MODES.has(next)) {
    throw new Error('未知模式：' + next + '（只有 advise / auto）');
  }
  const before = current;
  current = next;
  return { before, after: current };
}

export function modeLabel(m = current) {
  return m === 'auto' ? '全托管（会自己点）' : '同玩（只给建议，不动手）';
}

const ACT_HINT = '现在是「同玩」模式，我只给建议、不动你的画面。要我动手就先把模式切成 auto（wz_mode），'
  + '或者只在这一次调用里带 force: true。';

/** 动手前的闸门：模式不允许就直接抛错，让调用方能读懂为什么被拦。 */
export function assertCanAct(force = false) {
  if (current === 'auto' || force) return true;
  const err = new Error(ACT_HINT);
  err.code = 'MODE_ADVISE';
  throw err;
}
