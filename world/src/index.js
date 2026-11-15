/**
 * index.js — World 扩展入口。
 *
 * Cortico 的加载器只认一个 default 导出（WorldDefinition）。真正的实现都在
 * definition.js / world.js / tools.js 里，这里保持最薄，方便别人一眼看到全貌。
 */
import definition from './definition.js'

export default definition
