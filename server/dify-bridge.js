// Dify 桥接层（RAG）— 真实云 Dify 版
//
// 职责：把后台「分区」映射到 Dify「知识库(Dataset)」，将解析后的文本/文件
// 推送到 Dify 做「分段 → embedding → 向量检索」，并用 hybrid_search + rerank
// 检索召回。
//
// 凭据来源：server/api-pool.json（API 池），运行时动态读取，不再硬编码。
//   - resolveApi(apiId)：apiId 给定时取对应 API，否则取池中第一个
//   - 池为空 / 无 key 时自动降级为 mock 模式
//
// 端点（已通过阶段 0 实测）：
//   POST  /datasets                                     → 创建知识库
//   POST  /datasets/{id}/document/create_by_text        → 文本入库
//   POST  /datasets/{id}/document/create_by_file        → 文件入库(multipart)
//   GET   /datasets/{id}/documents                      → 文档列表
//   POST  /datasets/{id}/retrieve                       → 检索（注意是 retrieve 不是 retrieval）
//   DELETE /datasets/{id}                               → 删除知识库
//   DELETE /datasets/{id}/documents/{docId}             → 删除文档

import * as store from './store.js'
import * as apiPool from './api-pool.js'
import { logger } from './logger.js'

const DEFAULT_BASE = 'https://api.dify.ai/v1'

// 解析目标 API 配置：apiId 给定时取对应项，否则取池中第一个；池空返回 null
function resolveApi(apiId) {
  const apis = apiPool.readPool().apis
  if (apis.length === 0) return null
  if (apiId) return apis.find((a) => a.id === apiId) ?? apis[0] ?? null
  return apis[0]
}

// 是否有真实 API（池中存在带 key 的项）
function hasRealApi() {
  return apiPool.readPool().apis.some((a) => !!a.apiKey)
}

function headers(apiKey, extra = {}) {
  return { Authorization: `Bearer ${apiKey}`, ...extra }
}

async function difyFetch(api, method, path, { body, json, raw } = {}) {
  if (!api || !api.apiKey) throw new Error('未配置可用的 Dify API（API 池为空）')
  const base = (api.baseUrl || DEFAULT_BASE).replace(/\/+$/, '')
  const url = `${base}${path}`
  const init = { method, headers: headers(api.apiKey, json ? { 'Content-Type': 'application/json' } : {}) }
  if (body) init.body = body
  if (json) init.body = JSON.stringify(json)
  const res = await fetch(url, init)
  if (res.status === 204) return null
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  if (!res.ok) {
    const msg = typeof data === 'object' && data?.message ? data.message : `HTTP ${res.status}`
    throw new Error(`Dify ${path}: ${msg}`)
  }
  return data
}

// 根据分区拿 Dify 检索模型配置（从 Dify 已配置的知识库读回，避免硬编码）
function defaultRetrievalModel(topK = 5, rerankingEnable = true) {
  return {
    search_method: 'hybrid_search',
    reranking_enable: rerankingEnable,
    reranking_mode: null,
    reranking_model: {
      reranking_provider_name: 'langgenius/tongyi/tongyi',
      reranking_model_name: 'qwen3-rerank',
    },
    weights: null,
    top_k: topK,
    score_threshold_enabled: false,
    score_threshold: 0.5,
  }
}

// ---------------------------------------------------------------------------
// 知识库（Dataset）生命周期
// ---------------------------------------------------------------------------

export async function ensureDatasetForFolder(folderId, apiId) {
  const folder = store.getTree().folders.find((f) => f.id === folderId)
  if (!folder) throw new Error(`分区不存在: ${folderId}`)

  const existing = store.getDifyMapping(folderId)
  if (existing && existing.difyDatasetId) return existing

  const api = resolveApi(apiId)
  if (!api || !api.apiKey) {
    return store.setDifyMapping(folderId, { difyDatasetId: `mock_${folderId}`, datasetName: folder.name, status: 'mock', apiId: null })
  }

  const data = await difyFetch(api, 'POST', '/datasets', {
    json: { name: folder.name, indexing_technique: 'high_quality' },
  })
  logger.info('dify', `为分区 [${folder.name}] 创建 Dify 知识库: ${data.id}`)
  return store.setDifyMapping(folderId, {
    difyDatasetId: data.id,
    datasetName: folder.name,
    status: 'ready',
    apiId: api.id,
  })
}

// ---------------------------------------------------------------------------
// 文档入库
// ---------------------------------------------------------------------------

// 文本入库
export async function indexDocument({ folderId, name, text, docId, apiId }) {
  const mapping = await ensureDatasetForFolder(folderId, apiId)
  const api = resolveApi(apiId ?? mapping.apiId)
  if (!api || !api.apiKey) return { docId: docId || store.genId('doc'), datasetId: mapping.difyDatasetId, status: 'mock' }

  const data = await difyFetch(api, 'POST', `/datasets/${mapping.difyDatasetId}/document/create_by_text`, {
    json: {
      name,
      text,
      indexing_technique: 'high_quality',
      process_rule: { mode: 'automatic' },
    },
  })
  return {
    docId: data.document?.id ?? docId,
    datasetId: mapping.difyDatasetId,
    status: 'indexing',
  }
}

// 文件入库（真实文件直推 Dify，Dify 自己解析）
export async function indexFile({ folderId, name, fileBuffer, mime, docId, apiId }) {
  const mapping = await ensureDatasetForFolder(folderId, apiId)
  const api = resolveApi(apiId ?? mapping.apiId)
  if (!api || !api.apiKey) return { docId: docId || store.genId('doc'), datasetId: mapping.difyDatasetId, status: 'mock' }

  const fd = new FormData()
  fd.append('file', new Blob([fileBuffer], { type: mime || 'application/octet-stream' }), name)
  fd.append('indexing_technique', 'high_quality')
  fd.append('process_rule', JSON.stringify({ mode: 'automatic' }))

  const data = await difyFetch(api, 'POST', `/datasets/${mapping.difyDatasetId}/document/create_by_file`, {
    body: fd,
  })
  return {
    docId: data.document?.id ?? docId,
    datasetId: mapping.difyDatasetId,
    status: 'indexing',
  }
}

// ---------------------------------------------------------------------------
// 检索（语义检索，hybrid_search + rerank）
// ---------------------------------------------------------------------------

function mapRecords(data) {
  return (data.records ?? []).map((r) => ({
    segmentId: r.segment?.id,
    documentId: r.segment?.document_id,
    documentName: r.segment?.document?.name ?? '',
    content: r.segment?.content ?? '',
    score: r.score ?? 0,
    childChunks: r.child_chunks ?? null,
  }))
}

async function retrieveById(api, datasetId, query, topK, rerankingEnable) {
  const data = await difyFetch(api, 'POST', `/datasets/${datasetId}/retrieve`, {
    json: {
      query,
      retrieval_model: defaultRetrievalModel(topK, rerankingEnable),
    },
  })
  return mapRecords(data)
}

export async function retrieval({ folderId, query, topK = 5, rerankingEnable = true }) {
  const mapping = await ensureDatasetForFolder(folderId)

  const api = resolveApi(mapping.apiId)
  if (api && api.apiKey) {
    const records = await retrieveById(api, mapping.difyDatasetId, query, topK, rerankingEnable)
    return { records, query, datasetId: mapping.difyDatasetId }
  }

  // mock：关键词打分（保留降级能力）
  return { records: [], query, datasetId: mapping.difyDatasetId, mock: true }
}

// 直接按 Dify 知识库 id 检索（不经过本地分区映射，供「Dify 知识库」独立 Tab 使用）
export async function retrievalByDataset({ datasetId, query, topK = 5, rerankingEnable = true, apiId }) {
  if (!datasetId) throw new Error('缺少 datasetId')
  const api = resolveApi(apiId)
  if (!api || !api.apiKey) return { records: [], query, datasetId, mock: true }
  const records = await retrieveById(api, datasetId, query, topK, rerankingEnable)
  return { records, query, datasetId }
}

// ---------------------------------------------------------------------------
// 拉取 / 绑定（把 Dify 云上已有的知识库接入本地分区，不新建）
// ---------------------------------------------------------------------------

// 列出某个 API 的 Dify 云上真实知识库
export async function listDifyDatasets(apiId) {
  const api = resolveApi(apiId)
  if (!api || !api.apiKey) return { datasets: [], total: 0, mock: true }
  const data = await difyFetch(api, 'GET', '/datasets?limit=50')
  return { datasets: data.data ?? [], total: data.total ?? 0, apiId: api.id, apiName: api.name }
}

// 绑定已有 Dify 知识库到本地分区（写入真实 difyDatasetId）
export async function bindDataset(folderId, difyDatasetId, datasetName, apiId) {
  const folder = store.getTree().folders.find((f) => f.id === folderId)
  if (!folder) throw new Error(`分区不存在: ${folderId}`)
  return store.setDifyMapping(folderId, {
    difyDatasetId,
    datasetName: datasetName || folder.name,
    status: 'ready',
    apiId: apiId ?? null,
  })
}

// ---------------------------------------------------------------------------
// API 池探测：返回每个 API 是否可用（供前端「只显示可用」）
// ---------------------------------------------------------------------------

export async function listAvailableApis() {
  const apis = apiPool.readPool().apis
  const results = await Promise.all(
    apis.map(async (api) => {
      const mask = api.apiKey ? `${api.apiKey.slice(0, 6)}****${api.apiKey.slice(-4)}` : ''
      const base = { id: api.id, name: api.name, baseUrl: api.baseUrl, apiKeyMasked: mask }
      if (!api.apiKey) {
        return { ...base, available: false, reason: '未配置 API key', datasets: [] }
      }
      try {
        const data = await difyFetch(api, 'GET', '/datasets?limit=50')
        return { ...base, available: true, datasets: data.data ?? [] }
      } catch (e) {
        return { ...base, available: false, reason: e.message, datasets: [] }
      }
    }),
  )
  return results
}

// ---------------------------------------------------------------------------
// 查询辅助
// ---------------------------------------------------------------------------

export async function listDocuments(folderId) {
  const mapping = store.getDifyMapping(folderId)
  if (!mapping || !mapping.difyDatasetId) return []
  const api = resolveApi(mapping.apiId)
  if (!api || !api.apiKey) return []
  const data = await difyFetch(api, 'GET', `/datasets/${mapping.difyDatasetId}/documents?limit=50`)
  return data.data ?? []
}

export async function deleteDocument(folderId, docId) {
  const mapping = store.getDifyMapping(folderId)
  if (!mapping || !mapping.difyDatasetId) return null
  const api = resolveApi(mapping.apiId)
  if (!api || !api.apiKey) return null
  return difyFetch(api, 'DELETE', `/datasets/${mapping.difyDatasetId}/documents/${docId}`)
}

export function getMapping(folderId) {
  return store.getDifyMapping(folderId)
}

export function listMappings() {
  return store.listDifyMappings()
}

export function status() {
  return {
    mode: hasRealApi() ? 'real' : 'mock',
    baseUrl: null,
    mappings: store.listDifyMappings(),
  }
}
