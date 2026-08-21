// API 客户端（对接本地 Node 后端）
import type { DataTable, Dataset, Folder, ImageItem, Resources, TreeData, DocItem } from './types'

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData
  const headers: Record<string, string> = isForm ? {} : { 'Content-Type': 'application/json' }
  const res = await fetch(`/api${path}`, {
    headers,
    ...init,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text}`)
  }
  return (await res.json()) as T
}

// ---- 树 ----
export const getTree = () => http<TreeData>('/tree')

// ---- 知识库 ----
export const createDataset = (body: { name: string; description?: string }) =>
  http<Dataset>('/datasets', { method: 'POST', body: JSON.stringify(body) })

export const updateDataset = (id: string, body: Partial<Dataset>) =>
  http<Dataset>(`/datasets/${id}`, { method: 'PATCH', body: JSON.stringify(body) })

export const deleteDataset = (id: string) =>
  http<void>(`/datasets/${id}`, { method: 'DELETE' })

// ---- 分区 ----
export const createFolder = (body: { datasetId: string; parentId?: string | null; name: string }) =>
  http<Folder>('/folders', { method: 'POST', body: JSON.stringify(body) })

export const updateFolder = (id: string, body: Partial<Folder>) =>
  http<Folder>(`/folders/${id}`, { method: 'PATCH', body: JSON.stringify(body) })

export const deleteFolder = (id: string) =>
  http<void>(`/folders/${id}`, { method: 'DELETE' })

// ---- 资源 ----
export const listResources = (datasetId: string, folderId: string | null) =>
  http<Resources>(`/datasets/${datasetId}/resources?folderId=${folderId ?? ''}`)

// ---- 数据表 ----
export const createTable = (body: {
  datasetId: string
  folderId?: string | null
  name: string
  description?: string
  columns?: { key: string; label: string; type: string }[]
  rows?: Record<string, string | number>[]
}) => http<DataTable>('/tables', { method: 'POST', body: JSON.stringify(body) })

export const getTable = (id: string) => http<DataTable>(`/tables/${id}`)

export const updateTable = (id: string, body: Partial<DataTable>) =>
  http<DataTable>(`/tables/${id}`, { method: 'PATCH', body: JSON.stringify(body) })

export const deleteTable = (id: string) =>
  http<void>(`/tables/${id}`, { method: 'DELETE' })

export const addRow = (tableId: string, data: Record<string, string | number>) =>
  http<Record<string, string | number>>(`/tables/${tableId}/rows`, {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const updateRow = (tableId: string, rowId: string, data: Record<string, string | number>) =>
  http<Record<string, string | number>>(`/tables/${tableId}/rows/${rowId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })

export const deleteRow = (tableId: string, rowId: string) =>
  http<void>(`/tables/${tableId}/rows/${rowId}`, { method: 'DELETE' })

export const addColumn = (tableId: string, body: { key: string; label: string; type?: string }) =>
  http<unknown>(`/tables/${tableId}/columns`, { method: 'POST', body: JSON.stringify(body) })

// ---- 图片 ----
export const uploadImage = (formData: FormData) =>
  http<ImageItem>('/images', { method: 'POST', body: formData })

export const deleteImage = (id: string) => http<void>(`/images/${id}`, { method: 'DELETE' })

export const imageUrl = (file: string) => `/media/${file}`

// ---- 文档 ----
export const uploadDocument = (formData: FormData) =>
  http<DocItem>('/documents', { method: 'POST', body: formData })

export const getDocument = (id: string) => http<DocItem>(`/documents/${id}`)

export const deleteDocument = (id: string) => http<void>(`/documents/${id}`, { method: 'DELETE' })

export const syncDocument = (id: string) =>
  http<{ docId: string; datasetId: string; status: string }>(`/documents/${id}/sync-dify`, { method: 'POST' })

export const documentDownloadUrl = (id: string) => `/api/documents/${id}/download`

export const syncTable = (id: string) =>
  http<{ docId: string; datasetId: string; status: string; chars: number }>(`/tables/${id}/sync-dify`, { method: 'POST' })

// ---- Dify 桥接 ----
export const difyStatus = () => http<{ mode: string; baseUrl: string | null; mappings: unknown[] }>('/dify/status')

export const difyDatasets = (apiId?: string) =>
  http<{ datasets: DifyDataset[]; total: number; mock?: boolean; apiId?: string; apiName?: string }>(
    `/dify/datasets${apiId ? `?apiId=${encodeURIComponent(apiId)}` : ''}`,
  )

// 可用 API 列表（含各 API 的知识库；后端已过滤不可用的，只返回可用的）
export const difyAvailableApis = () => http<AvailableApi[]>(`/dify/apis/available`)

export interface AvailableApi {
  id: string
  name: string
  baseUrl: string
  apiKeyMasked: string
  available: boolean
  reason?: string
  datasets: DifyDataset[]
}

export const difyRetrieveDataset = (body: { datasetId: string; query: string; topK?: number; apiId?: string }) =>
  http<{ records: RetrievalRecord[]; query: string; datasetId: string }>('/dify/retrieve-dataset', {
    method: 'POST',
    body: JSON.stringify(body),
  })

export const difyRetrieval = (body: { folderId: string; query: string; topK?: number }) =>
  http<{ records: RetrievalRecord[]; query: string }>('/dify/retrieval', { method: 'POST', body: JSON.stringify(body) })

export interface DifyDataset {
  id: string
  name: string
  description: string
  document_count: number
  word_count: number
  embedding_model?: string
  indexing_technique?: string
  created_at: number
}

export interface RetrievalRecord {
  docId?: string
  docName?: string
  segmentId?: string
  documentName?: string
  content: string
  score: number
}
