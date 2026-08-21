// 轻量配置加载器（避免额外依赖 dotenv）
// 从项目根 .env 读取，合并到 process.env（不覆盖已存在的环境变量）
//
// 注意：Dify 凭据已迁移到 server/api-pool.json（API 池），本模块不再读取
// DIFY_* 变量，只保留通用环境变量加载与对外 API key 读取。
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENV_FILE = join(__dirname, '..', '.env')

export function loadEnv() {
  if (!existsSync(ENV_FILE)) return
  const raw = readFileSync(ENV_FILE, 'utf-8')
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq < 0) continue
    const key = t.slice(0, eq).trim()
    let val = t.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (key && process.env[key] === undefined) process.env[key] = val
  }
}

// 模块加载时立即读入 .env（确保被 import 时配置已就绪）
loadEnv()

// ---- 对外 API key ----
export function externalApiKeys() {
  const raw = process.env.EXTERNAL_API_KEYS || ''
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}
