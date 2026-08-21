// 临时探测：验证真实 Dify API 连通性 + 列出知识库
import { difyConfig, loadEnv } from '../server/config.js'

loadEnv()
const cfg = difyConfig()
const BASE = cfg.baseUrl.replace(/\/+$/, '')
console.log('useReal =', cfg.useReal)
console.log('base    =', BASE)
console.log('keyLen  =', cfg.apiKey.length, 'prefix =', cfg.apiKey.slice(0, 8) + '…')

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, json }
}

console.log('\n[1] GET /datasets?limit=50')
let r = await req('GET', '/datasets?limit=50')
console.log('status =', r.status)
console.log(JSON.stringify(r.json, null, 2).slice(0, 4000))
