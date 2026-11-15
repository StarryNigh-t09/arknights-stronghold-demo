/**
 * try-tool.mjs — 不走 Coopanion，直接在命令行里跑一个工具。
 *
 * 用法：node scripts/try-tool.mjs wz_state
 *       node scripts/try-tool.mjs wz_tap '{"x":960,"y":540,"force":true}'
 *
 * 截图类的工具会把附件写到 shots/ 下，方便肉眼看。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import definition from '../src/definition.js'

const name = process.argv[2]
const args = process.argv[3] ? JSON.parse(process.argv[3]) : {}
if (!name) {
  console.error('用法：node scripts/try-tool.mjs <工具名> [JSON 参数]')
  process.exit(1)
}

const world = definition.create({
  cfg: { ...definition.defaults(), mode: 'auto' },
  console: { info: (m) => console.error(m), warn: (m) => console.error(m) },
  persist: async () => {},
  dataDir: process.cwd()
})
await world.start({ pushEvent: async () => ({}) })

const tool = world.tools().find((t) => t.name === name)
if (!tool) {
  console.error('没有这个工具：' + name)
  process.exit(1)
}

const t0 = Date.now()
const out = await tool.handler(args, { log: console, role: 'dev' })
const ms = Date.now() - t0
if (typeof out === 'string') {
  console.log(out)
} else {
  console.log(out.text)
  if (out.failed) console.log('（failed）')
  if (out.blobs?.length) {
    const dir = fileURLToPath(new URL('../shots/', import.meta.url))
    mkdirSync(dir, { recursive: true })
    for (const b of out.blobs) {
      const p = join(dir, (b.name || 'blob.bin').replace(/[^\w.-]/g, '_'))
      writeFileSync(p, Buffer.from(b.bytes))
      console.log('附件：' + p + '（' + b.mime + '，' + b.bytes.length + ' 字节）')
    }
  }
}
console.error('耗时 ' + ms + 'ms')
