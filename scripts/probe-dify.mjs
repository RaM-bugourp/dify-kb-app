// 阶段 0 V0-1：Dify 云连通性验证脚本
// 用法：node scripts/probe-dify.mjs
const BASE = process.env.DIFY_BASE_URL || 'https://api.dify.ai/v1'
const KEY = process.env.DIFY_API_KEY || 'dataset-EDDp51EaQwxARnMv5vBrXRgP'

async function req(method, path, body) {
  const url = `${BASE}${path}`
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, url, json }
}

console.log('=== Dify 云连通验证 ===')
console.log('base_url =', BASE)
console.log('key      =', KEY.slice(0, 12) + '…')

// 1. 列出该 key 可访问的知识库
let r = await req('GET', '/datasets?limit=20')
console.log('\n[1] GET /datasets →', r.status)
console.log(JSON.stringify(r.json, null, 2).slice(0, 2000))

// 如果拿到 dataset id，继续验证检索
const id = r.json?.data?.[0]?.id || r.json?.id
if (id) {
  console.log('\n检测到 dataset id =', id)

  // 2. 检索（空 query 可能报错，先试一个常见词）
  r = await req('POST', `/datasets/${id}/retrieval`, {
    query: '知识库',
    retrieval_model: { search_method: 'hybrid_search', reranking_enable: false, top_k: 3 },
  })
  console.log('\n[2] POST retrieval →', r.status)
  console.log(JSON.stringify(r.json, null, 2).slice(0, 3000))
}
