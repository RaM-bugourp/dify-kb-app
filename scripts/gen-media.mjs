// 生成演示用示例图片（PNG），写入 server/media/
// 用 Node 内置 zlib 手工编码 PNG，无需第三方依赖
import { deflateSync } from 'zlib'
import { writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '..', 'server', 'media')
mkdirSync(OUT_DIR, { recursive: true })

// ---- CRC32 ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crc])
}

function encodePng(width, height, pixelFn) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: RGB
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0 // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelFn(x, y, width, height)
      const o = y * (width * 3 + 1) + 1 + x * 3
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
    }
  }
  const idat = deflateSync(raw, { level: 9 })
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

// ---- 颜色工具 ----
const lerp = (a, b, t) => Math.round(a + (b - a) * t)
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]

function gradientPixel(c1, c2, cx, cy, width, height) {
  return (x, y, w, h) => {
    const t = (x / w + y / h) / 2
    return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)]
  }
}

// 叠加一个居中的柔和圆（模拟图示主体）
function withCircle(base, radiusRatio = 0.32) {
  return (x, y, w, h) => {
    const [r, g, b] = base(x, y, w, h)
    const dx = x - w / 2
    const dy = y - h / 2
    const d = Math.sqrt(dx * dx + dy * dy)
    const R = Math.min(w, h) * radiusRatio
    if (d < R) {
      const k = 0.55 * (1 - d / R)
      return [lerp(r, 255, k), lerp(g, 255, k), lerp(b, 255, k)]
    }
    return [r, g, b]
  }
}

// 横向渐变 + 斜向条纹，模拟"流程图"
function withStripes(base, stripes = 14) {
  return (x, y, w, h) => {
    const [r, g, b] = base(x, y, w, h)
    const band = Math.floor((x / w) * stripes)
    if (band % 2 === 0) return [r, g, b]
    return [lerp(r, 255, 0.08), lerp(g, 255, 0.08), lerp(b, 255, 0.08)]
  }
}

const samples = [
  { file: 'arch-blue.png', c1: '#007aff', c2: '#5ac8fa', fn: withCircle },
  { file: 'flow-green.png', c1: '#34c759', c2: '#a8e063', fn: withStripes },
  { file: 'terms-orange.png', c1: '#ff9500', c2: '#ffd66e', fn: withCircle },
  { file: 'ui-purple.png', c1: '#5856d6', c2: '#b06ab3', fn: withCircle },
  { file: 'photo-coral.png', c1: '#ff3b30', c2: '#ff7f50', fn: withStripes },
]

const W = 900
const H = 520

for (const s of samples) {
  const c1 = hex(s.c1)
  const c2 = hex(s.c2)
  const base = gradientPixel(c1, c2)
  const pixelFn = s.fn(base)
  const buf = encodePng(W, H, pixelFn)
  const out = join(OUT_DIR, s.file)
  writeFileSync(out, buf)
  console.log(`generated ${s.file} (${buf.length} bytes)`)
}

console.log('done ->', OUT_DIR)
