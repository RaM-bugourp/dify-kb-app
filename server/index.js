import express from 'express'
import cors from 'cors'
import { existsSync, mkdirSync, unlinkSync, writeFileSync, readFileSync } from 'fs'
import { join, dirname, extname } from 'path'
import { fileURLToPath } from 'url'
import * as store from './store.js'
import * as dify from './dify-bridge.js'
import * as parser from './parser.js'
import * as apiPool from './api-pool.js'
import { logger } from './logger.js'
import { loadEnv, externalApiKeys } from './config.js'

loadEnv()

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = express()
app.use(cors())
app.use(express.json({ limit: '50mb' }))

mkdirSync(store.MEDIA_DIR, { recursive: true })
mkdirSync(store.FILES_DIR, { recursive: true })
app.use('/media', express.static(store.MEDIA_DIR, { maxAge: '1d' }))

const wrap = (fn) => (req, res) => {
  try {
    const result = fn(req, res)
    if (result && typeof result.then === 'function') {
      result.then((r) => { if (r !== undefined && !res.headersSent) res.json(r) })
        .catch((e) => { if (!res.headersSent) res.status(500).json({ error: e.message }) })
      return
    }
    if (result !== undefined && !res.headersSent) res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}

// ---- 健康检查 ----
app.get('/api/health', (req, res) => res.json({ ok: true }))

// ---- 树结构 ----
app.get('/api/tree', wrap(() => store.getTree()))

// ---- 知识库 ----
app.post('/api/datasets', wrap((req) => store.createDataset(req.body)))
app.patch('/api/datasets/:id', wrap((req) => store.updateDataset(req.params.id, req.body)))
app.delete('/api/datasets/:id', wrap((req) => store.deleteDataset(req.params.id)))

// ---- 分区 ----
app.post('/api/folders', wrap((req) => store.createFolder(req.body)))
app.patch('/api/folders/:id', wrap((req) => store.updateFolder(req.params.id, req.body)))
app.delete('/api/folders/:id', wrap((req) => store.deleteFolder(req.params.id)))

// ---- 资源列表 ----
app.get('/api/datasets/:datasetId/resources', wrap((req) =>
  store.listResources(req.params.datasetId, req.query.folderId ?? null),
))

// ---- 数据表 ----
app.post('/api/tables', wrap((req) => store.createTable(req.body)))
app.get('/api/tables/:id', wrap((req) => store.getTable(req.params.id)))
app.patch('/api/tables/:id', wrap((req) => store.updateTable(req.params.id, req.body)))
app.delete('/api/tables/:id', wrap((req) => store.deleteTable(req.params.id)))

app.post('/api/tables/:id/rows', wrap((req) => store.addRow(req.params.id, req.body)))
app.patch('/api/tables/:id/rows/:rowId', wrap((req) => store.updateRow(req.params.id, req.params.rowId, req.body)))
app.delete('/api/tables/:id/rows/:rowId', wrap((req) => store.deleteRow(req.params.id, req.params.rowId)))

app.post('/api/tables/:id/columns', wrap((req) => store.addColumn(req.params.id, req.body)))
app.patch('/api/tables/:id/columns/:key', wrap((req) => store.updateColumn(req.params.id, req.params.key, req.body)))

// ---- 术语表导出 ----
app.get('/api/tables/:id/export', wrap((req) => {
  const format = req.query.format === 'csv' ? 'csv' : 'json'
  const table = store.getTable(req.params.id)
  if (!table) { res.status(404).json({ error: '数据表不存在' }); return }
  if (format === 'csv') {
    const cols = table.columns
    const header = cols.map((c) => `"${c.label}"`).join(',')
    const lines = table.rows.map((r) => cols.map((c) => `"${String(r[c.key] ?? '').replace(/"/g, '""')}"`).join(','))
    const csv = [header, ...lines].join('\n')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(table.name)}.csv"`)
    res.send('\ufeff' + csv)
    return
  }
  return table
}))

// ---- 术语表 → 可检索文本（表→文本序列化，供推 Dify）----
function tableToText(table) {
  const cols = table.columns
  const header = cols.map((c) => c.label).join(' | ')
  const lines = table.rows.map((r) => cols.map((c) => String(r[c.key] ?? '')).join(' | '))
  return [`# ${table.name}`, table.description || '', '', header, ...lines].filter(Boolean).join('\n')
}

// ---- 同步术语表到 Dify ----
app.post('/api/tables/:id/sync-dify', wrap(async (req) => {
  const table = store.getTable(req.params.id)
  if (!table) { res.status(404).json({ error: '数据表不存在' }); return }
  const text = tableToText(table)
  const result = await dify.indexDocument({
    folderId: table.folderId,
    name: `${table.name}.txt`,
    text,
    docId: `table_${table.id}`,
  })
  return { ...result, chars: text.length }
}))

// ===========================================================================
// 通用 multipart 字节解析（解决中文文件名乱码，图片/文档共用）
// ===========================================================================

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'])

// 解析 multipart body → { fields: {}, file: { name, mime, content } | null }
function parseMultipart(body, boundaryBuf) {
  const boundaries = []
  let i = 0
  while ((i = body.indexOf(boundaryBuf, i)) !== -1) {
    boundaries.push(i)
    i += boundaryBuf.length
  }
  if (boundaries.length < 2) return null

  const fields = {}
  let file = null

  for (let k = 0; k < boundaries.length - 1; k++) {
    let s = boundaries[k] + boundaryBuf.length
    if (body[s] === 0x0d && body[s + 1] === 0x0a) s += 2
    let e = boundaries[k + 1] - 2
    if (e <= s) continue

    const section = body.subarray(s, e)
    const hdrEnd = section.indexOf(Buffer.from([0x0d, 0x0a, 0x0d, 0x0a]))
    if (hdrEnd < 0) continue
    const headersBuf = section.subarray(0, hdrEnd)
    const content = section.subarray(hdrEnd + 4)

    const cdPrefix = Buffer.from('Content-Disposition: form-data; ', 'ascii')
    let dispStart = -1
    let p = 0
    while ((p = headersBuf.indexOf(cdPrefix, p)) !== -1) {
      if (p === 0 || headersBuf[p - 1] === 0x0a) { dispStart = p; break }
      p += cdPrefix.length
    }
    if (dispStart < 0) continue

    let dispEnd = headersBuf.indexOf(Buffer.from([0x0d, 0x0a]), dispStart)
    if (dispEnd < 0) dispEnd = headersBuf.length
    const dispBuf = headersBuf.subarray(dispStart, dispEnd)

    const filenameKey = Buffer.from('filename="', 'ascii')
    const filenameStart = dispBuf.indexOf(filenameKey)
    if (filenameStart >= 0) {
      const fnValStart = filenameStart + filenameKey.length
      const fnValEnd = dispBuf.indexOf(Buffer.from('"', 'ascii'), fnValStart)
      const originalName = dispBuf.subarray(fnValStart, fnValEnd).toString('utf8')
      const ctPrefix = Buffer.from('Content-Type: ', 'ascii')
      let ctStart = headersBuf.indexOf(ctPrefix)
      let mimeType = 'application/octet-stream'
      if (ctStart >= 0) {
        let ctEnd = headersBuf.indexOf(Buffer.from([0x0d, 0x0a]), ctStart)
        if (ctEnd < 0) ctEnd = headersBuf.length
        mimeType = headersBuf.subarray(ctStart + ctPrefix.length, ctEnd).toString('ascii').trim()
      }
      file = { name: originalName, mime: mimeType, content }
    } else {
      const nameKey = Buffer.from('name="', 'ascii')
      const ns = dispBuf.indexOf(nameKey)
      if (ns >= 0) {
        const ns2 = ns + nameKey.length
        const ne = dispBuf.indexOf(Buffer.from('"', 'ascii'), ns2)
        const fieldName = dispBuf.subarray(ns2, ne).toString('ascii')
        const value = content.toString('utf8').trim()
        fields[fieldName] = value
      }
    }
  }
  return { fields, file }
}

// 通用上传入口：解析 multipart 后交给 handler(fields, file, res)
function makeUploadHandler(handler) {
  return (req, res) => {
    const ct = req.headers['content-type'] || ''
    const m = ct.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i)
    if (!m) { res.status(400).json({ error: '缺少 multipart boundary' }); return }
    const boundaryBuf = Buffer.from('--' + (m[1] || m[2]), 'ascii')
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      try {
        const parsed = parseMultipart(Buffer.concat(chunks), boundaryBuf)
        if (!parsed) { res.status(400).json({ error: 'multipart 数据不完整' }); return }
        handler(parsed.fields, parsed.file, res)
      } catch (e) {
        logger.error('upload', 'multipart 解析失败:', e)
        if (!res.headersSent) res.status(500).json({ error: e.message })
      }
    })
    req.on('error', (e) => {
      if (!res.headersSent) res.status(500).json({ error: e.message })
    })
  }
}

// ---- 图片上传 ----
app.post('/api/images', makeUploadHandler((fields, file, res) => {
  if (!file) { res.status(400).json({ error: '未接收到文件' }); return }
  if (!fields.datasetId) { res.status(400).json({ error: '缺少 datasetId' }); return }
  if (!ALLOWED_IMAGE_MIME.has(file.mime)) { res.status(400).json({ error: '仅支持 jpg/png/gif/webp/bmp 图片' }); return }
  if (file.content.length > 20 * 1024 * 1024) { res.status(413).json({ error: '文件过大' }); return }

  const ext = (file.name.match(/\.[a-zA-Z0-9]+$/) || ['.png'])[0].toLowerCase()
  const fname = `${store.genId('img')}${ext}`
  writeFileSync(join(store.MEDIA_DIR, fname), file.content)

  const meta = store.addImage({
    datasetId: fields.datasetId,
    folderId: fields.folderId || null,
    name: fields.name || file.name,
    file: fname,
    mime: file.mime,
    size: file.content.length,
    width: 0,
    height: 0,
  })
  res.json(meta)
}))

app.delete('/api/images/:id', wrap((req) => {
  const img = store.deleteImage(req.params.id)
  if (img) {
    const p = join(store.MEDIA_DIR, img.file)
    if (existsSync(p)) unlinkSync(p)
  }
  return { ok: true }
}))

// ---- 文档上传（PDF/md/txt/docx）----
const ALLOWED_DOC_MIME = new Set([
  'application/pdf',
  'text/markdown',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream',
])
const DOC_MAX = 50 * 1024 * 1024

app.post('/api/documents', makeUploadHandler(async (fields, file, res) => {
  if (!file) { res.status(400).json({ error: '未接收到文件' }); return }
  if (!fields.datasetId) { res.status(400).json({ error: '缺少 datasetId' }); return }

  const ext = extname(file.name).toLowerCase()
  if (!parser.isSupportedDocument(file.name) && !ALLOWED_DOC_MIME.has(file.mime)) {
    res.status(400).json({ error: '仅支持 pdf/md/txt/docx 文档' })
    return
  }
  if (file.content.length > DOC_MAX) { res.status(413).json({ error: '文件过大（>50MB）' }); return }

  // 落盘原文件到 files/
  const fname = `${store.genId('doc')}${ext || '.txt'}`
  writeFileSync(join(store.FILES_DIR, fname), file.content)

  const type = ext.replace('.', '') || 'file'
  const doc = store.addDocument({
    datasetId: fields.datasetId,
    folderId: fields.folderId || null,
    name: fields.name || file.name,
    file: fname,
    type,
    mime: file.mime,
    size: file.content.length,
    status: 'parsing',
  })

  // 后台解析文本（不阻塞响应）
  parser.parseFile(fname, doc.id)
    .then((text) => store.updateDocument(doc.id, { parsedText: text, status: 'pending' }))
    .catch((e) => {
      logger.error('parser', `解析文档 ${doc.id} 失败:`, e)
      store.updateDocument(doc.id, { status: 'error', error: e.message })
    })

  res.json(doc)
}))

app.get('/api/documents/:id', wrap((req) => {
  const doc = store.getDocument(req.params.id)
  if (!doc) { res.status(404).json({ error: '文档不存在' }); return }
  return doc
}))

app.get('/api/documents/:id/download', wrap((req) => {
  const doc = store.getDocument(req.params.id)
  if (!doc || !doc.file) { res.status(404).json({ error: '文档不存在' }); return }
  const p = join(store.FILES_DIR, doc.file)
  if (!existsSync(p)) { res.status(404).json({ error: '文件已丢失' }); return }
  res.setHeader('Content-Type', doc.mime || 'application/octet-stream')
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(doc.name)}`)
  res.send(readFileSync(p))
}))

app.delete('/api/documents/:id', wrap(async (req) => {
  const doc = store.deleteDocument(req.params.id)
  if (doc) {
    if (doc.file) {
      const p = join(store.FILES_DIR, doc.file)
      if (existsSync(p)) unlinkSync(p)
    }
    // 若已推送到 Dify，删除对应文档
    if (doc.difyDocId && doc.folderId) {
      try { await dify.deleteDocument(doc.folderId, doc.difyDocId) } catch (e) { logger.warn('dify', '删除 Dify 文档失败:', e.message) }
    }
  }
  return { ok: true }
}))

// ---- 文档同步到 Dify（解析后文本入库）----
app.post('/api/documents/:id/sync-dify', wrap(async (req) => {
  const doc = store.getDocument(req.params.id)
  if (!doc) { res.status(404).json({ error: '文档不存在' }); return }
  if (!doc.parsedText) { res.status(400).json({ error: '文档尚未解析完成' }); return }
  const result = await dify.indexDocument({
    folderId: doc.folderId,
    name: `${doc.name}.txt`,
    text: doc.parsedText,
    docId: doc.id,
  })
  store.updateDocument(doc.id, { difyDocId: result.docId, status: 'indexing' })
  return result
}))

// ---- Dify RAG 桥接 ----
app.get('/api/dify/status', wrap(() => dify.status()))
app.get('/api/dify/mappings', wrap(() => dify.listMappings()))
app.get('/api/dify/datasets', wrap(async (req) => await dify.listDifyDatasets(req.query.apiId ?? null)))

// ---- API 池管理（凭据脱敏，绝不下发明文 key）----
app.get('/api/dify/api-pool', wrap(() => apiPool.listApis()))
app.post('/api/dify/api-pool', wrap((req) => {
  const { name, baseUrl, apiKey } = req.body ?? {}
  if (!name || !baseUrl || !apiKey) throw new Error('缺少 name/baseUrl/apiKey')
  const api = apiPool.addApi({ name, baseUrl, apiKey })
  return apiPool.listApis().find((a) => a.id === api.id) ?? api
}))
app.delete('/api/dify/api-pool/:id', wrap((req) => {
  const removed = apiPool.removeApi(req.params.id)
  if (!removed) { res.status(404).json({ error: 'API 不存在' }); return }
  return { ok: true }
}))

// 可用 API 列表（前端据此只显示可用 API，含各自知识库）
app.get('/api/dify/apis/available', wrap(async () => await dify.listAvailableApis()))

app.post('/api/dify/retrieve-dataset', wrap(async (req) => {
  const { datasetId, query, topK, apiId } = req.body
  if (!datasetId || !query) throw new Error('缺少 datasetId 或 query')
  return await dify.retrievalByDataset({ datasetId, query, topK, apiId })
}))
app.post('/api/dify/bind', wrap(async (req) => {
  const { folderId, difyDatasetId, datasetName, apiId } = req.body
  if (!folderId || !difyDatasetId) throw new Error('缺少 folderId 或 difyDatasetId')
  return await dify.bindDataset(folderId, difyDatasetId, datasetName, apiId)
}))
app.post('/api/dify/folders/:folderId/dataset', wrap(async (req) =>
  await dify.ensureDatasetForFolder(req.params.folderId),
))
app.post('/api/dify/documents', wrap(async (req) => {
  const { folderId, name, text, docId } = req.body
  if (!folderId || !text) throw new Error('缺少 folderId 或 text')
  return await dify.indexDocument({ folderId, name, text, docId })
}))
app.post('/api/dify/retrieval', wrap(async (req) => {
  const { folderId, query, topK } = req.body
  if (!folderId || !query) throw new Error('缺少 folderId 或 query')
  return await dify.retrieval({ folderId, query, topK })
}))

// ===========================================================================
// 对外 API 层（阶段 4：/api/v1，Bearer 鉴权）
// ===========================================================================

function requireAuth(req, res, next) {
  const keys = externalApiKeys()
  const h = req.headers['authorization'] || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : ''
  if (keys.length === 0 || keys.includes(token)) {
    next()
    return
  }
  res.status(401).json({ code: 'unauthorized', data: null, error: '无效的 API key' })
}

const ok = (data) => ({ code: 'ok', data, error: null })

app.use('/api/v1', requireAuth)

app.get('/api/v1/health', (req, res) => res.json(ok({ status: 'up', dify: dify.status().mode })))

app.get('/api/v1/tree', wrap(() => ok(store.getTree())))

app.get('/api/v1/datasets', wrap(() => ok(store.getTree().datasets)))

app.post('/api/v1/retrieval', wrap(async (req) => {
  const { query, topK, folderId, scope } = req.body ?? {}
  if (!query) { res.status(400).json({ code: 'invalid', data: null, error: '缺少 query' }); return }

  // scope 支持指定分区或知识库（遍历其下所有分区）
  const folders = store.getTree().folders
  let targetFolders = []
  if (folderId) {
    targetFolders = [folderId]
  } else if (scope) {
    targetFolders = folders.filter((f) => f.datasetId === scope || f.id === scope).map((f) => f.id)
  } else {
    targetFolders = folders.map((f) => f.id)
  }

  const all = []
  for (const fid of targetFolders) {
    const mapping = dify.getMapping(fid)
    if (!mapping || !mapping.difyDatasetId) continue
    try {
      const r = await dify.retrieval({ folderId: fid, query, topK, rerankingEnable: true })
      const folder = folders.find((f) => f.id === fid)
      for (const rec of r.records) {
        all.push({ ...rec, sourceType: 'document', folderId: fid, folderName: folder?.name ?? '' })
      }
    } catch (e) {
      logger.warn('dify', `检索分区 ${fid} 失败:`, e.message)
    }
  }
  all.sort((a, b) => b.score - a.score)
  return ok({ records: all.slice(0, topK ?? 5), query })
}))

app.get('/api/v1/tables/:id/rows', wrap((req) => {
  const table = store.getTable(req.params.id)
  if (!table) { res.status(404).json({ code: 'not_found', data: null, error: '数据表不存在' }); return }
  const { filter, page = 1, pageSize = 50 } = req.query
  let rows = table.rows
  if (filter) {
    const [k, v] = String(filter).split('=')
    if (k && v) rows = rows.filter((r) => String(r[k] ?? '').includes(v))
  }
  const p = Number(page) || 1
  const ps = Number(pageSize) || 50
  const start = (p - 1) * ps
  return ok({ columns: table.columns, rows: rows.slice(start, start + ps), total: rows.length })
}))

app.get('/api/v1/documents/:id', wrap((req) => {
  const doc = store.getDocument(req.params.id)
  if (!doc) { res.status(404).json({ code: 'not_found', data: null, error: '文档不存在' }); return }
  return ok(doc)
}))

app.get('/api/v1/files/:id/download', wrap((req) => {
  const doc = store.getDocument(req.params.id)
  if (!doc || !doc.file) { res.status(404).json({ code: 'not_found', data: null, error: '文件不存在' }); return }
  const p = join(store.FILES_DIR, doc.file)
  if (!existsSync(p)) { res.status(404).json({ code: 'not_found', data: null, error: '文件已丢失' }); return }
  res.setHeader('Content-Type', doc.mime || 'application/octet-stream')
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(doc.name)}`)
  res.send(readFileSync(p))
}))

// ---- 生产模式 ----
const DIST = join(__dirname, '..', 'dist')
if (existsSync(DIST)) {
  app.use(express.static(DIST))
  app.get(/^(?!\/api\b|\/media\b).*/, (req, res) => {
    res.sendFile(join(DIST, 'index.html'))
  })
}

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  logger.info('server', `listening on http://localhost:${PORT}`)
  logger.info('server', `dify mode: ${dify.status().mode}`)
})
