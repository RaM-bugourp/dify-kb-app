// 确认真实检索端点 + 用真实 dataset id 检索
import { difyConfig, loadEnv } from '../server/config.js'
loadEnv()
const cfg = difyConfig()
const BASE = cfg.baseUrl.replace(/\/+$/, '')
const DSID = 'efbbdbd0-090c-441b-b9a3-e43a22bd43e5'

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

const model = {
  search_method: 'hybrid_search',
  reranking_enable: true,
  reranking_mode: null,
  reranking_model: {
    reranking_provider_name: 'langgenius/tongyi/tongyi',
    reranking_model_name: 'qwen3-rerank',
  },
  weights: null,
  top_k: 5,
  score_threshold_enabled: false,
  score_threshold: 0.5,
}

console.log('[A] 试 /datasets/{id}/retrieve')
let r = await req('POST', `/datasets/${DSID}/retrieve`, { query: 'GMP 生物杀灭剂', retrieval_model: model })
console.log('status =', r.status, typeof r.json === 'object' ? '(json)' : '(text)')
console.log(JSON.stringify(r.json, null, 2).slice(0, 1500))

if (r.status >= 400) {
  console.log('\n[B] 试 /datasets/{id}/retrieval')
  r = await req('POST', `/datasets/${DSID}/retrieval`, { query: 'GMP 生物杀灭剂', retrieval_model: model })
  console.log('status =', r.status)
  console.log(JSON.stringify(r.json, null, 2).slice(0, 1500))
}

console.log('\n[C] 列出该知识库的文档')
r = await req('GET', `/datasets/${DSID}/documents?limit=20`)
console.log('status =', r.status)
console.log(JSON.stringify(r.json, null, 2).slice(0, 2000))
