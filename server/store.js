// 数据持久化层（JSON 文件存储）
//
// 设计：所有数据访问通过本模块的函数完成，页面/路由不直接读文件。
// 未来切换到 MySQL 时，只需将下面每个函数内部实现替换为 SQL，
// 保持函数签名不变，即可无缝切换（预留 MySQL 接入点）。

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, extname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_FILE = join(__dirname, 'data.json')
export const MEDIA_DIR = join(__dirname, 'media')
export const FILES_DIR = join(__dirname, 'files')

export function genId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

// ---------------------------------------------------------------------------
// 种子数据
// ---------------------------------------------------------------------------

const now = Date.now()

const seed = {
  datasets: [
    {
      id: 'ds_product',
      name: '产品知识库',
      description: '产品术语、功能清单与使用文档',
      createdAt: now - 90 * 86400000,
      updatedAt: now - 2 * 86400000,
    },
    {
      id: 'ds_tech',
      name: '技术文档库',
      description: '接口规范、架构设计与运维手册',
      createdAt: now - 60 * 86400000,
      updatedAt: now - 5 * 86400000,
    },
  ],
  folders: [
    { id: 'f_terms', datasetId: 'ds_product', parentId: null, name: '术语与规范' },
    { id: 'f_docs', datasetId: 'ds_product', parentId: null, name: '产品文档' },
    { id: 'f_api', datasetId: 'ds_tech', parentId: null, name: 'API 文档' },
    { id: 'f_arch', datasetId: 'ds_tech', parentId: null, name: '架构设计' },
    { id: 'f_sub', datasetId: 'ds_tech', parentId: 'f_arch', name: '微服务' },
  ],
  tables: [
    {
      id: 't_terms',
      datasetId: 'ds_product',
      folderId: 'f_terms',
      name: '术语对照表',
      description: '产品术语中英文对照与缩写',
      createdAt: now - 80 * 86400000,
      updatedAt: now - 1 * 86400000,
      columns: [
        { key: 'zh', label: '中文术语', type: 'text' },
        { key: 'en', label: '英文术语', type: 'text' },
        { key: 'abbr', label: '缩写', type: 'text' },
        { key: 'note', label: '说明', type: 'text' },
      ],
      rows: [
        { id: 'r1', zh: '知识库', en: 'Knowledge Base', abbr: 'KB', note: '用于 RAG 检索的文档集合' },
        { id: 'r2', zh: '文档', en: 'Document', abbr: 'Doc', note: '知识库中的单个文件' },
        { id: 'r3', zh: '分段', en: 'Chunk', abbr: '', note: '文档切分后的最小检索单元' },
        { id: 'r4', zh: '召回', en: 'Retrieval', abbr: '', note: '根据查询返回相关分段' },
        { id: 'r5', zh: '向量化', en: 'Embedding', abbr: 'Emb', note: '将文本转为向量表示' },
      ],
    },
    {
      id: 't_features',
      datasetId: 'ds_product',
      folderId: 'f_terms',
      name: '产品功能清单',
      description: '各模块功能点与负责人',
      createdAt: now - 75 * 86400000,
      updatedAt: now - 3 * 86400000,
      columns: [
        { key: 'module', label: '功能模块', type: 'text' },
        { key: 'feature', label: '功能点', type: 'text' },
        { key: 'status', label: '状态', type: 'text' },
        { key: 'owner', label: '负责人', type: 'text' },
      ],
      rows: [
        { id: 'f1', module: '知识库', feature: '创建/删除知识库', status: '已上线', owner: 'Rick' },
        { id: 'f2', module: '文档', feature: '文件导入与解析', status: '已上线', owner: 'Alice' },
        { id: 'f3', module: '检索', feature: '多路召回', status: '开发中', owner: 'Bob' },
        { id: 'f4', module: '检索', feature: 'Rerank 重排序', status: '规划中', owner: 'Bob' },
      ],
    },
    {
      id: 't_apis',
      datasetId: 'ds_tech',
      folderId: 'f_api',
      name: '接口清单',
      description: '对外开放 API 列表',
      createdAt: now - 50 * 86400000,
      updatedAt: now - 4 * 86400000,
      columns: [
        { key: 'method', label: '方法', type: 'text' },
        { key: 'path', label: '路径', type: 'text' },
        { key: 'desc', label: '描述', type: 'text' },
      ],
      rows: [
        { id: 'a1', method: 'GET', path: '/datasets', desc: '获取知识库列表' },
        { id: 'a2', method: 'POST', path: '/datasets', desc: '创建知识库' },
        { id: 'a3', method: 'GET', path: '/datasets/{id}/documents', desc: '获取文档列表' },
      ],
    },
  ],
  images: [
    { id: 'img_arch', datasetId: 'ds_tech', folderId: 'f_arch', name: '系统架构图', file: 'arch-blue.png', mime: 'image/png', size: 57768, width: 900, height: 520, updatedAt: now - 12 * 86400000 },
    { id: 'img_flow', datasetId: 'ds_tech', folderId: 'f_sub', name: '微服务调用流程图', file: 'flow-green.png', mime: 'image/png', size: 41343, width: 900, height: 520, updatedAt: now - 6 * 86400000 },
    { id: 'img_terms', datasetId: 'ds_product', folderId: 'f_terms', name: '术语关系图', file: 'terms-orange.png', mime: 'image/png', size: 56076, width: 900, height: 520, updatedAt: now - 9 * 86400000 },
    { id: 'img_ui', datasetId: 'ds_product', folderId: 'f_docs', name: '界面设计稿', file: 'ui-purple.png', mime: 'image/png', size: 58494, width: 900, height: 520, updatedAt: now - 4 * 86400000 },
    { id: 'img_photo', datasetId: 'ds_tech', folderId: 'f_api', name: '接口示例截图', file: 'photo-coral.png', mime: 'image/png', size: 39354, width: 900, height: 520, updatedAt: now - 2 * 86400000 },
  ],
  documents: [
    { id: 'd1', datasetId: 'ds_product', folderId: 'f_docs', name: '快速入门指南.pdf', type: 'pdf', size: 1024000, updatedAt: now - 10 * 86400000, status: 'completed' },
    { id: 'd2', datasetId: 'ds_product', folderId: 'f_docs', name: '常见问题 FAQ.md', type: 'md', size: 24000, updatedAt: now - 8 * 86400000, status: 'completed' },
    { id: 'd3', datasetId: 'ds_tech', folderId: 'f_arch', name: '系统架构设计.md', type: 'md', size: 68000, updatedAt: now - 12 * 86400000, status: 'completed' },
    { id: 'd4', datasetId: 'ds_tech', folderId: 'f_sub', name: '微服务治理指南.md', type: 'md', size: 52000, updatedAt: now - 6 * 86400000, status: 'indexing' },
  ],
  // 分区 id ↔ Dify 知识库 id 映射（RAG 桥接层使用）
  difyMappings: [
    { folderId: 'f_arch', difyDatasetId: 'dify_ds_arch', datasetName: '架构设计', status: 'ready', syncedAt: now - 1 * 86400000 },
  ],
}

// ---------------------------------------------------------------------------
// 加载 / 持久化
// ---------------------------------------------------------------------------

let db

function load() {
  let data
  if (existsSync(DATA_FILE)) {
    try {
      data = JSON.parse(readFileSync(DATA_FILE, 'utf-8'))
    } catch {
      data = null
    }
  }
  if (!data) {
    data = JSON.parse(JSON.stringify(seed))
  }
  // 轻量迁移：新版本新增的顶层字段（如 images）在旧数据文件中不存在时自动补上
  for (const key of Object.keys(seed)) {
    if (data[key] === undefined) data[key] = JSON.parse(JSON.stringify(seed[key]))
  }
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8')
  return data
}

function persist() {
  writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8')
}

db = load()

// ---------------------------------------------------------------------------
// 导出数据访问函数
// ---------------------------------------------------------------------------

export function getTree() {
  return {
    datasets: db.datasets.map(({ id, name, description, updatedAt }) => ({
      id,
      name,
      description,
      updatedAt,
    })),
    folders: db.folders,
  }
}

// ---- 知识库 ----
export function createDataset({ name, description = '' }) {
  const ds = {
    id: genId('ds'),
    name,
    description,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  db.datasets.push(ds)
  persist()
  return ds
}

export function updateDataset(id, patch) {
  const ds = db.datasets.find((d) => d.id === id)
  if (!ds) return null
  Object.assign(ds, patch, { updatedAt: Date.now() })
  persist()
  return ds
}

export function deleteDataset(id) {
  db.datasets = db.datasets.filter((d) => d.id !== id)
  db.folders = db.folders.filter((f) => f.datasetId !== id)
  db.tables = db.tables.filter((t) => t.datasetId !== id)
  db.documents = db.documents.filter((d) => d.datasetId !== id)
  db.images = (db.images ?? []).filter((i) => i.datasetId !== id)
  const orphanFolderIds = new Set(db.folders.filter((f) => f.datasetId === id).map((f) => f.id))
  db.difyMappings = db.difyMappings.filter((m) => !orphanFolderIds.has(m.folderId))
  persist()
}

// ---- 分区（文件夹）----
export function createFolder({ datasetId, parentId = null, name }) {
  const f = { id: genId('f'), datasetId, parentId, name }
  db.folders.push(f)
  persist()
  return f
}

export function updateFolder(id, patch) {
  const f = db.folders.find((x) => x.id === id)
  if (!f) return null
  Object.assign(f, patch)
  persist()
  return f
}

export function deleteFolder(id) {
  // 收集要删除的分区（含后代）
  const toDelete = new Set([id])
  let changed = true
  while (changed) {
    changed = false
    for (const f of db.folders) {
      if (f.parentId && toDelete.has(f.parentId) && !toDelete.has(f.id)) {
        toDelete.add(f.id)
        changed = true
      }
    }
  }
  db.folders = db.folders.filter((f) => !toDelete.has(f.id))
  db.tables = db.tables.filter((t) => !toDelete.has(t.folderId))
  db.documents = db.documents.filter((d) => !toDelete.has(d.folderId))
  db.images = (db.images ?? []).filter((i) => !toDelete.has(i.folderId))
  db.difyMappings = db.difyMappings.filter((m) => !toDelete.has(m.folderId))
  persist()
}

// ---- 资源列表（某节点下的数据表 + 文档）----
export function listResources(datasetId, folderId) {
  const fid = folderId === 'null' || folderId === '' || folderId == null ? null : folderId
  const tables = db.tables.filter((t) => t.datasetId === datasetId && (t.folderId ?? null) === fid)
  const documents = db.documents.filter((d) => d.datasetId === datasetId && (d.folderId ?? null) === fid)
  const images = (db.images ?? []).filter((i) => i.datasetId === datasetId && (i.folderId ?? null) === fid)
  return { tables, documents, images }
}

// ---- 数据表 ----
export function createTable({ datasetId, folderId = null, name, description = '', columns = [], rows = [] }) {
  const fid = folderId === 'null' || folderId === '' ? null : folderId
  const t = {
    id: genId('t'),
    datasetId,
    folderId: fid,
    name,
    description,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    columns,
    rows: rows.map((r) => ({ id: genId('r'), ...r })),
  }
  db.tables.push(t)
  persist()
  return t
}

export function getTable(id) {
  return db.tables.find((t) => t.id === id) ?? null
}

export function updateTable(id, patch) {
  const t = db.tables.find((x) => x.id === id)
  if (!t) return null
  Object.assign(t, patch, { updatedAt: Date.now() })
  persist()
  return t
}

export function deleteTable(id) {
  db.tables = db.tables.filter((t) => t.id !== id)
  persist()
}

export function addRow(tableId, data) {
  const t = db.tables.find((x) => x.id === tableId)
  if (!t) return null
  const row = { id: genId('r'), ...data }
  t.rows.push(row)
  t.updatedAt = Date.now()
  persist()
  return row
}

export function updateRow(tableId, rowId, data) {
  const t = db.tables.find((x) => x.id === tableId)
  if (!t) return null
  const row = t.rows.find((r) => r.id === rowId)
  if (!row) return null
  Object.assign(row, data)
  t.updatedAt = Date.now()
  persist()
  return row
}

export function deleteRow(tableId, rowId) {
  const t = db.tables.find((x) => x.id === tableId)
  if (!t) return
  t.rows = t.rows.filter((r) => r.id !== rowId)
  t.updatedAt = Date.now()
  persist()
}

export function addColumn(tableId, { key, label, type = 'text' }) {
  const t = db.tables.find((x) => x.id === tableId)
  if (!t) return null
  const col = { key, label, type }
  t.columns.push(col)
  // 给已有行补空值
  t.rows.forEach((r) => {
    if (r[key] == null) r[key] = ''
  })
  t.updatedAt = Date.now()
  persist()
  return col
}

export function updateColumn(tableId, key, patch) {
  const t = db.tables.find((x) => x.id === tableId)
  if (!t) return null
  const col = t.columns.find((c) => c.key === key)
  if (!col) return null
  Object.assign(col, patch)
  t.updatedAt = Date.now()
  persist()
  return col
}

// ---- 文档 ----
export function addDocument({ datasetId, folderId = null, name, file, type, mime, size, parsedText, difyDocId }) {
  const fid = folderId === 'null' || folderId === '' || folderId == null ? null : folderId
  const doc = {
    id: genId('doc'),
    datasetId,
    folderId: fid,
    name: name || file,
    file: file || null,
    type,
    mime: mime || 'application/octet-stream',
    size: size || 0,
    parsedText: parsedText || '',
    difyDocId: difyDocId || null,
    status: difyDocId ? 'indexing' : 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  if (!db.documents) db.documents = []
  db.documents.push(doc)
  persist()
  return doc
}

export function getDocument(id) {
  return (db.documents ?? []).find((d) => d.id === id) ?? null
}

export function updateDocument(id, patch) {
  const doc = (db.documents ?? []).find((d) => d.id === id)
  if (!doc) return null
  Object.assign(doc, patch, { updatedAt: Date.now() })
  persist()
  return doc
}

export function deleteDocument(id) {
  const doc = (db.documents ?? []).find((d) => d.id === id)
  db.documents = (db.documents ?? []).filter((d) => d.id !== id)
  persist()
  return doc
}

// ---- 图片 ----
export function addImage({ datasetId, folderId = null, name, file, mime, size, width, height }) {
  const fid = folderId === 'null' || folderId === '' || folderId == null ? null : folderId
  const img = {
    id: genId('img'),
    datasetId,
    folderId: fid,
    name: name || file,
    file,
    mime: mime || 'image/png',
    size: size || 0,
    width: width || 0,
    height: height || 0,
    updatedAt: Date.now(),
  }
  if (!db.images) db.images = []
  db.images.push(img)
  persist()
  return img
}

export function deleteImage(id) {
  if (!db.images) return
  const img = db.images.find((i) => i.id === id)
  db.images = db.images.filter((i) => i.id !== id)
  persist()
  return img
}

export function getImage(id) {
  return (db.images ?? []).find((i) => i.id === id) ?? null
}

// 静态文件类型映射（用于上传时推断 mime）
export function mimeFromExt(filename) {
  const ext = extname(filename).toLowerCase()
  const map = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
  }
  return map[ext] ?? 'application/octet-stream'
}

// ---------------------------------------------------------------------------
// Dify 知识库映射（RAG 桥接层使用）
// ---------------------------------------------------------------------------

export function setDifyMapping(folderId, { difyDatasetId, datasetName, status = 'ready' }) {
  const existing = db.difyMappings.find((m) => m.folderId === folderId)
  const now = Date.now()
  if (existing) {
    Object.assign(existing, { difyDatasetId, datasetName, status, syncedAt: now })
    persist()
    return existing
  }
  const m = { folderId, difyDatasetId, datasetName, status, syncedAt: now }
  db.difyMappings.push(m)
  persist()
  return m
}

export function getDifyMapping(folderId) {
  return db.difyMappings.find((m) => m.folderId === folderId) ?? null
}

export function getDifyMappingByDataset(difyDatasetId) {
  return db.difyMappings.find((m) => m.difyDatasetId === difyDatasetId) ?? null
}

export function listDifyMappings() {
  return db.difyMappings
}

export function removeDifyMapping(folderId) {
  db.difyMappings = db.difyMappings.filter((m) => m.folderId !== folderId)
  persist()
}
