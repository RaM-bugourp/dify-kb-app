// Dify API 池管理
//
// 目的：把 Dify 凭据从「代码硬编码 / 单一 .env」迁移到「本地 API 池文件」，
//       支持多个 Dify API（不同账号/环境），运行时动态读取，改文件即生效，无需改代码重编译。
//
// 存储：server/api-pool.json（本地保留，已加入 .gitignore，不随代码 push）
// 结构：
//   {
//     "apis": [
//       { "id": "api_xxx", "name": "主 Dify 云", "baseUrl": "https://api.dify.ai/v1", "apiKey": "dataset-xxx" }
//     ]
//   }
//
// 路径规范：池文件路径统一通过 join 拼接；写入采用「临时文件 + rename」原子写。

import { readFileSync, writeFileSync, existsSync, renameSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { loadEnv } from './config.js'
import { logger } from './logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const API_POOL_FILE = join(__dirname, 'api-pool.json')

export function genId(prefix = 'api') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

// 原子写：写临时文件 → rename 覆盖；Windows 上 rename 若目标存在失败则先删再 rename
function atomicWriteJson(filePath, data) {
  const tmp = `${filePath}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8')
  try {
    renameSync(tmp, filePath)
  } catch {
    try { unlinkSync(filePath) } catch { /* 目标不存在则忽略 */ }
    renameSync(tmp, filePath)
  }
}

// 从旧 .env 迁移初始池（仅当池文件不存在时执行一次）
function migrateFromEnv() {
  loadEnv()
  const legacyKey = process.env.DIFY_API_KEY || ''
  const legacyBase = process.env.DIFY_BASE_URL || 'https://api.dify.ai/v1'
  const pool = { apis: [] }
  if (legacyKey) {
    pool.apis.push({
      id: genId('api'),
      name: process.env.DIFY_API_NAME || '默认 Dify',
      baseUrl: legacyBase,
      apiKey: legacyKey,
    })
    logger.info('api-pool', '已从 .env 迁移 1 个 Dify API 到 API 池')
  } else {
    logger.info('api-pool', '初始化空 API 池（未在 .env 发现 DIFY_API_KEY）')
  }
  atomicWriteJson(API_POOL_FILE, pool)
  return pool
}

// 读取池（每次读文件，保证「动态改变」即时生效）
export function readPool() {
  if (!existsSync(API_POOL_FILE)) return migrateFromEnv()
  try {
    const data = JSON.parse(readFileSync(API_POOL_FILE, 'utf-8'))
    if (!Array.isArray(data.apis)) data.apis = []
    return data
  } catch (e) {
    logger.error('api-pool', 'API 池文件解析失败，返回空池:', e.message)
    return { apis: [] }
  }
}

export function writePool(pool) {
  atomicWriteJson(API_POOL_FILE, pool)
}

// 列出（脱敏 key，绝不下发明文 key）
export function listApis() {
  return readPool().apis.map((a) => ({
    id: a.id,
    name: a.name,
    baseUrl: a.baseUrl,
    apiKeyMasked: a.apiKey ? `${a.apiKey.slice(0, 6)}****${a.apiKey.slice(-4)}` : '',
  }))
}

// 按 id 取原始凭据（含明文 key，仅供服务端调用 Dify 时使用，绝不返回给前端）
export function getApi(id) {
  return readPool().apis.find((a) => a.id === id) ?? null
}

export function addApi({ name, baseUrl, apiKey }) {
  const pool = readPool()
  const api = { id: genId('api'), name, baseUrl, apiKey }
  pool.apis.push(api)
  writePool(pool)
  logger.info('api-pool', `新增 API [${name}]`)
  return api
}

export function removeApi(id) {
  const pool = readPool()
  const idx = pool.apis.findIndex((a) => a.id === id)
  if (idx < 0) return null
  const [removed] = pool.apis.splice(idx, 1)
  writePool(pool)
  logger.info('api-pool', `移除 API [${removed.name}]`)
  return removed
}

export function updateApi(id, patch) {
  const pool = readPool()
  const api = pool.apis.find((a) => a.id === id)
  if (!api) return null
  Object.assign(api, patch)
  writePool(pool)
  return api
}
