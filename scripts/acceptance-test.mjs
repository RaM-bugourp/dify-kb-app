// 完整验收测试：拉取 Dify 知识库 → 绑定 → 检索 → 对外 API 检索
const BASE = 'http://localhost:3001'
let pass = 0, fail = 0

function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name} ${extra}`) }
  else { fail++; console.log(`  ✗ ${name} ${extra}`) }
}

async function j(method, path, body, headers = {}) {
  const init = { method, headers: { ...headers } }
  if (body instanceof FormData) init.body = body
  else if (body !== undefined) { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json' }
  const res = await fetch(`${BASE}${path}`, init)
  const text = await res.text()
  let data = null
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data }
}

console.log('=== 1. 健康检查 ===')
let r = await j('GET', '/api/health')
check('health 200', r.status === 200, `(${JSON.stringify(r.data)})`)

console.log('\n=== 2. 拉取 Dify 真实知识库 ===')
r = await j('GET', '/api/dify/datasets')
check('datasets 200', r.status === 200)
const dsList = r.data?.datasets ?? []
check('有知识库', dsList.length > 0, `(共 ${dsList.length} 个)`)
if (dsList.length > 0) console.log('  第一个:', dsList[0].id, '|', dsList[0].name, '| documents:', dsList[0].document_count)
const realDsId = dsList[0]?.id
const realDsName = dsList[0]?.name

console.log('\n=== 3. 绑定真实知识库到本地分区 f_arch ===')
r = await j('POST', '/api/dify/bind', { folderId: 'f_arch', difyDatasetId: realDsId, datasetName: realDsName })
check('bind 200', r.status === 200, `(${JSON.stringify(r.data).slice(0, 120)})`)
check('difyDatasetId 为真实 UUID', typeof r.data?.difyDatasetId === 'string' && r.data.difyDatasetId.length === 36)

console.log('\n=== 4. 检索（通过本地 /api/dify/retrieval）===')
r = await j('POST', '/api/dify/retrieval', { folderId: 'f_arch', query: 'GMP 生物杀灭剂', topK: 3 })
check('retrieval 200', r.status === 200, r.status !== 200 ? JSON.stringify(r.data).slice(0, 200) : '')
const recs = r.data?.records ?? []
check('有召回结果', recs.length > 0, `(共 ${recs.length} 条)`)
if (recs.length > 0) console.log(`  top1 score=${recs[0].score.toFixed(4)} | ${(recs[0].content || '').slice(0, 50)}`)

console.log('\n=== 5. 对外 API 鉴权（/api/v1）===')

console.log('\n  5a. 无 key 应 401')
r = await j('POST', '/api/v1/retrieval', { query: 'GMP', topK: 3, folderId: 'f_arch' })
check('v1 无 key 返回 401', r.status === 401, `status=${r.status}`)
r = await j('GET', '/api/v1/health')
check('v1 health 无 key 返回 401', r.status === 401, `status=${r.status}`)

console.log('\n  5b. 带 Bearer key 检索')
r = await j('POST', '/api/v1/retrieval', { query: 'GMP 生物杀灭剂', topK: 3, folderId: 'f_arch' }, { Authorization: 'Bearer kb-external-demo-token' })
check('v1 retrieval 200', r.status === 200, `status=${r.status}`)
check('返回 code=ok', r.data?.code === 'ok', `(${JSON.stringify(r.data?.code)})`)
const v1recs = r.data?.data?.records ?? []
check('v1 有召回结果', v1recs.length > 0, `(共 ${v1recs.length} 条)`)

console.log('\n=== 6. 对外 API 读取数据表（结构化数据）===')
r = await j('GET', '/api/v1/tables/t_terms/rows', undefined, { Authorization: 'Bearer kb-external-demo-token' })
check('tables rows 200', r.status === 200, `status=${r.status}`)
check('有列定义', (r.data?.data?.columns?.length ?? 0) > 0, `(${r.data?.data?.columns?.length} 列)`)
check('有行数据', (r.data?.data?.rows?.length ?? 0) > 0, `(${r.data?.data?.rows?.length} 行)`)

console.log('\n=== 7. 对外 API 拉取知识库列表 ===')
r = await j('GET', '/api/v1/datasets', undefined, { Authorization: 'Bearer kb-external-demo-token' })
check('v1 datasets 200', r.status === 200, `status=${r.status}`)
check('code=ok', r.data?.code === 'ok', '')

console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`)
process.exit(fail > 0 ? 1 : 0)
