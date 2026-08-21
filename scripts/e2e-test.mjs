// 端到端测试：文档上传 → 解析 → 同步 Dify → 检索 → 对外 API
// 用法：先启动 server，再运行 node scripts/e2e-test.mjs
const BASE = 'http://localhost:3001'

async function j(method, path, body, headers = {}) {
  const init = { method, headers: { ...headers } }
  if (body instanceof FormData) init.body = body
  else if (body) { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json' }
  const res = await fetch(`${BASE}${path}`, init)
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data }
}

// 1. 创建测试分区
console.log('=== 1. 创建测试分区 ===')
const ds = (await j('GET', '/api/tree')).data.datasets[0]
const folder = await j('POST', '/api/folders', { datasetId: ds.id, name: 'e2e测试分区' })
console.log('folder:', folder.status, JSON.stringify(folder.data).slice(0, 200))
const folderId = folder.data.id

// 2. 建 Dify 知识库
console.log('\n=== 2. 建 Dify 知识库 ===')
const mapping = await j('POST', `/api/dify/folders/${folderId}/dataset`)
console.log('mapping:', mapping.status, JSON.stringify(mapping.data).slice(0, 200))

// 3. 生成一个测试 md 文档（比 PDF 简单，先验证链路）
console.log('\n=== 3. 上传测试文档 ===')
const fd = new FormData()
const content = '# GMP 生物杀灭剂清单\n\n韩国主管部门发布了适用于良好生产规范（GMP）设施的获批生物杀灭剂产品清单。\n\n该清单紧跟用户说明会的步伐，为制药及生物科技生产环境提供合规指引。'
fd.append('file', new Blob([content], { type: 'text/plain' }), 'GMP测试文档.md')
fd.append('datasetId', ds.id)
fd.append('folderId', folderId)
const upload = await j('POST', '/api/documents', fd)
console.log('upload:', upload.status, JSON.stringify(upload.data).slice(0, 200))
const docId = upload.data.id

// 4. 等解析完成
console.log('\n=== 4. 等解析 ===')
await new Promise((r) => setTimeout(r, 1500))
const doc = await j('GET', `/api/documents/${docId}`)
console.log('doc status:', doc.data.status, 'parsedText len:', doc.data.parsedText?.length ?? 0)

// 5. 同步到 Dify
console.log('\n=== 5. 同步到 Dify ===')
const sync = await j('POST', `/api/documents/${docId}/sync-dify`)
console.log('sync:', sync.status, JSON.stringify(sync.data).slice(0, 200))

// 6. 等 Dify 索引
console.log('\n=== 6. 等 Dify 索引（8s）===')
await new Promise((r) => setTimeout(r, 8000))

// 7. 检索
console.log('\n=== 7. 检索 ===')
const retr = await j('POST', '/api/dify/retrieval', { folderId, query: 'GMP 生物杀灭剂', topK: 3 })
console.log('retrieval:', retr.status, 'records:', retr.data?.records?.length ?? 'ERR')
if (retr.data?.records) {
  for (const rec of retr.data.records.slice(0, 2)) {
    console.log('  - score', rec.score, '|', (rec.content || '').slice(0, 60))
  }
}

// 8. 对外 API 检索
console.log('\n=== 8. 对外 API 检索 ===')
const v1 = await j('POST', '/api/v1/retrieval', { query: 'GMP 生物杀灭剂', topK: 3, folderId }, { Authorization: 'Bearer kb-external-demo-token' })
console.log('v1:', v1.status, 'code:', v1.data?.code, 'records:', v1.data?.data?.records?.length ?? 'ERR')

console.log('\n=== 完成，folderId =', folderId, '（清理可删除） ===')
