import { useCallback, useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import type { Selection } from './components/Sidebar'
import { TableView } from './components/TableView'
import { DifyPanel } from './components/DifyPanel'
import { Modal, Confirm } from './components/ui'
import { IconTable, IconDoc, IconUpload, IconTrash, IconPlus, IconClose, IconSearch } from './components/icons'
import type { DataTable, DocItem, ImageItem, Resources, TreeData } from './types'
import {
  getTree,
  createDataset,
  createFolder,
  deleteFolder,
  listResources,
  createTable,
  deleteTable,
  uploadImage,
  deleteImage,
  imageUrl,
  uploadDocument,
  deleteDocument,
  syncDocument,
  documentDownloadUrl,
  syncTable,
  difyStatus,
  difyRetrieval,
} from './api'
import type { RetrievalRecord } from './api'

export default function App() {
  const [tree, setTree] = useState<TreeData>({ datasets: [], folders: [] })
  const [selection, setSelection] = useState<Selection | null>(null)
  const [resources, setResources] = useState<Resources>({ tables: [], documents: [], images: [] })
  const [view, setView] = useState<'kb' | 'dify'>('kb')

  // 弹窗状态
  const [showNewDataset, setShowNewDataset] = useState(false)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [showNewTable, setShowNewTable] = useState(false)
  const [contextTarget, setContextTarget] = useState<{ kind: 'folder'; id: string; name: string } | null>(null)
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState<string | null>(null)
  const [confirmDeleteTable, setConfirmDeleteTable] = useState<{ id: string; name: string } | null>(null)
  const [confirmDeleteImage, setConfirmDeleteImage] = useState<{ id: string; name: string } | null>(null)

  // 图片查看器
  const [viewerImage, setViewerImage] = useState<ImageItem | null>(null)
  const [uploading, setUploading] = useState(false)

  // 表格视图
  const [openTableId, setOpenTableId] = useState<string | null>(null)

  const [toast, setToastState] = useState('')

  // 文档查看器（解析文本预览）
  const [viewerDoc, setViewerDoc] = useState<DocItem | null>(null)
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<{ id: string; name: string } | null>(null)

  // Dify 检索测试台
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<RetrievalRecord[]>([])
  const [searching, setSearching] = useState(false)
  const [difyMode, setDifyMode] = useState('')
  const [searchError, setSearchError] = useState('')

  // 文档上传 ref（接受多文件）
  const [uploadingDoc, setUploadingDoc] = useState(false)

  const showToast = useCallback((t: string) => {
    setToastState(t)
    setTimeout(() => setToastState(''), 1800)
  }, [])

  async function refreshTree() {
    const t = await getTree()
    setTree(t)
  }

  useEffect(() => {
    refreshTree()
    difyStatus().then((s) => setDifyMode(s.mode)).catch(() => {})
  }, [])

  // 默认选中第一个知识库
  useEffect(() => {
    if (!selection && tree.datasets.length > 0) {
      setSelection({ type: 'dataset', id: tree.datasets[0].id })
    }
  }, [tree, selection])

  async function loadResources(sel: Selection) {
    if (sel.type === 'dataset') {
      const r = await listResources(sel.id, null)
      setResources(r)
    } else {
      const r = await listResources(sel.datasetId, sel.id)
      setResources(r)
    }
  }

  useEffect(() => {
    if (selection) {
      loadResources(selection)
      setOpenTableId(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection])

  const currentName = useMemo2(() => {
    if (!selection) return ''
    if (selection.type === 'dataset') {
      return tree.datasets.find((d) => d.id === selection.id)?.name ?? ''
    }
    return tree.folders.find((f) => f.id === selection.id)?.name ?? ''
  })

  // ---- 创建操作 ----
  async function handleCreateDataset(input: { name: string; description: string }) {
    await createDataset(input)
    setShowNewDataset(false)
    showToast('知识库已创建')
    await refreshTree()
  }

  async function handleCreateFolder(input: { name: string }) {
    if (!selection) return
    const datasetId = selection.type === 'dataset' ? selection.id : selection.datasetId
    const parentId = selection.type === 'folder' ? selection.id : null
    await createFolder({ datasetId, parentId, name: input.name })
    setShowNewFolder(false)
    showToast('分区已创建')
    await refreshTree()
    if (selection.type === 'dataset') loadResources(selection)
    else loadResources({ type: 'folder', id: selection.id, datasetId: selection.datasetId })
  }

  async function handleCreateTable(input: { name: string; description: string }) {
    if (!selection) return
    const datasetId = selection.type === 'dataset' ? selection.id : selection.datasetId
    const folderId = selection.type === 'folder' ? selection.id : null
    await createTable({ datasetId, folderId, name: input.name, description: input.description })
    setShowNewTable(false)
    showToast('数据表已创建')
    loadResources(selection)
  }

  async function handleDeleteFolder() {
    if (!confirmDeleteFolder) return
    await deleteFolder(confirmDeleteFolder)
    setConfirmDeleteFolder(null)
    setContextTarget(null)
    showToast('分区已删除')
    await refreshTree()
    if (selection?.type === 'folder' && selection.id === confirmDeleteFolder) {
      const ds = tree.datasets[0]
      setSelection(ds ? { type: 'dataset', id: ds.id } : null)
    } else if (selection) {
      loadResources(selection)
    }
  }

  async function handleDeleteTable() {
    if (!confirmDeleteTable) return
    await deleteTable(confirmDeleteTable.id)
    setConfirmDeleteTable(null)
    showToast('数据表已删除')
    if (selection) loadResources(selection)
  }

  async function handleDeleteImage() {
    if (!confirmDeleteImage) return
    await deleteImage(confirmDeleteImage.id)
    setConfirmDeleteImage(null)
    setViewerImage(null)
    showToast('图片已删除')
    if (selection) loadResources(selection)
  }

  async function handleUpload(file: File) {
    if (!selection) return
    const datasetId = selection.type === 'dataset' ? selection.id : selection.datasetId
    const folderId = selection.type === 'folder' ? selection.id : null
    const fd = new FormData()
    fd.append('file', file)
    fd.append('datasetId', datasetId)
    if (folderId) fd.append('folderId', folderId)
    setUploading(true)
    try {
      await uploadImage(fd)
      showToast('图片已上传')
      loadResources(selection)
    } catch (e) {
      showToast(`上传失败：${(e as Error).message}`)
    } finally {
      setUploading(false)
    }
  }

  async function handleUploadDoc(file: File) {
    if (!selection) return
    const datasetId = selection.type === 'dataset' ? selection.id : selection.datasetId
    const folderId = selection.type === 'folder' ? selection.id : null
    const fd = new FormData()
    fd.append('file', file)
    fd.append('datasetId', datasetId)
    if (folderId) fd.append('folderId', folderId)
    setUploadingDoc(true)
    try {
      await uploadDocument(fd)
      showToast('文档已上传，解析中…')
      loadResources(selection)
    } catch (e) {
      showToast(`上传失败：${(e as Error).message}`)
    } finally {
      setUploadingDoc(false)
    }
  }

  async function handleDeleteDoc() {
    if (!confirmDeleteDoc) return
    await deleteDocument(confirmDeleteDoc.id)
    setConfirmDeleteDoc(null)
    setViewerDoc(null)
    showToast('文档已删除')
    if (selection) loadResources(selection)
  }

  async function handleSyncDoc(doc: DocItem) {
    try {
      await syncDocument(doc.id)
      showToast('已推送到 Dify，索引中…')
    } catch (e) {
      showToast(`同步失败：${(e as Error).message}`)
    }
  }

  async function handleSyncTable(tableId: string) {
    try {
      await syncTable(tableId)
      showToast('术语表已推送到 Dify')
    } catch (e) {
      showToast(`同步失败：${(e as Error).message}`)
    }
  }

  async function openDocViewer(doc: DocItem) {
    setViewerDoc(doc)
  }

  async function handleSearch() {
    if (!selection || selection.type !== 'folder' || !searchQuery.trim()) return
    setSearching(true)
    setSearchResults([])
    setSearchError('')
    try {
      const r = await difyRetrieval({ folderId: selection.id, query: searchQuery.trim(), topK: 5 })
      setSearchResults(r.records ?? [])
    } catch (e) {
      setSearchError((e as Error).message)
    } finally {
      setSearching(false)
    }
  }

  function fmtSize(n: number) {
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
    return `${(n / 1024 / 1024).toFixed(1)} MB`
  }

  function fmtTime(ts: number) {
    const d = new Date(ts)
    return `${d.getMonth() + 1}月${d.getDate()}日`
  }

  return (
    <div className="app">
      <Sidebar
        tree={tree}
        selection={selection}
        onSelect={setSelection}
        onNewDataset={() => setShowNewDataset(true)}
        onNewFolder={() => setShowNewFolder(true)}
      />

      {view === 'dify' ? (
        <DifyPanel onBack={() => setView('kb')} />
      ) : (
        <main className="main">
        <div className="main-tabs">
          <button className="main-tab active" onClick={() => setView('kb')}>
            本地知识库
          </button>
          <button className="main-tab" onClick={() => setView('dify')}>
            Dify 知识库
          </button>
        </div>
        <div className="main-head">
          <div>
            <h2>{openTableId ? '数据表' : currentName || '知识库管理'}</h2>
            <div className="breadcrumb">
              知识库 {selection?.type === 'folder' ? ` / ${currentName}` : ''}
            </div>
          </div>
          {!openTableId && selection && (
            <div style={{ display: 'flex', gap: 8 }}>
              {selection.type === 'folder' && (
                <button
                  className="btn-ghost"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  onClick={() => setShowSearch(true)}
                >
                  <IconSearch width={15} height={15} /> 检索测试
                </button>
              )}
              <label className="btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                <IconDoc width={15} height={15} /> 上传文档
                <input
                  type="file"
                  accept=".pdf,.md,.markdown,.txt,.docx"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleUploadDoc(f)
                    e.target.value = ''
                  }}
                />
              </label>
              <label className="btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                <IconUpload width={15} height={15} /> 上传图片
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleUpload(f)
                    e.target.value = ''
                  }}
                />
              </label>
              <button className="btn-grad" onClick={() => setShowNewTable(true)}>
                <IconPlus width={15} height={15} /> 新建数据表
              </button>
            </div>
          )}
        </div>

        <div className="main-body">
          {openTableId ? (
            <TableView
              tableId={openTableId}
              onBack={() => setOpenTableId(null)}
              onToast={showToast}
            />
          ) : !selection ? (
            <div className="empty">
              <div className="emoji">👈</div>
              <div>请从左侧选择一个知识库或分区</div>
            </div>
          ) : resources.tables.length === 0 && resources.documents.length === 0 && resources.images.length === 0 ? (
            <div className="empty">
              <div className="emoji">📁</div>
              <div>当前分区为空</div>
              <div style={{ fontSize: 13, marginTop: 8 }}>
                点击右上角「新建数据表」「上传图片」或左侧「新建分区」
              </div>
            </div>
          ) : (
            <div className="resource-grid">
              {resources.tables.map((t: DataTable) => (
                <div
                  key={t.id}
                  className="resource-card"
                  onClick={() => setOpenTableId(t.id)}
                >
                  <div className="rc-icon table">
                    <IconTable width={20} height={20} />
                  </div>
                  <div className="rc-name">{t.name}</div>
                  <div className="rc-desc">{t.description || '数据表'}</div>
                  <div className="rc-meta">
                    {t.rows.length} 行 · {t.columns.length} 列
                    <button
                      className="icon-btn"
                      style={{ float: 'right', width: 22, height: 22, marginLeft: 4 }}
                      title="同步到 Dify"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleSyncTable(t.id)
                      }}
                    >
                      <IconUpload width={14} height={14} />
                    </button>
                    <button
                      className="icon-btn danger"
                      style={{ float: 'right', width: 22, height: 22 }}
                      title="删除"
                      onClick={(e) => {
                        e.stopPropagation()
                        setConfirmDeleteTable({ id: t.id, name: t.name })
                      }}
                    >
                      <IconTrash width={14} height={14} />
                    </button>
                  </div>
                </div>
              ))}
              {resources.documents.map((d: DocItem) => (
                <div key={d.id} className="resource-card" onClick={() => openDocViewer(d)}>
                  <div className="rc-icon doc">
                    <IconDoc width={20} height={20} />
                  </div>
                  <div className="rc-name">{d.name}</div>
                  <div className="rc-desc">
                    文档 · {d.status === 'completed' ? '已完成' : d.status === 'indexing' ? '索引中' : d.status === 'pending' ? '待同步' : d.status === 'error' ? '解析失败' : d.status === 'parsing' ? '解析中' : '—'}
                  </div>
                  <div className="rc-meta">
                    {fmtSize(d.size)} · {fmtTime(d.updatedAt)}
                    <button
                      className="icon-btn"
                      style={{ float: 'right', width: 22, height: 22, marginLeft: 4 }}
                      title="同步到 Dify"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleSyncDoc(d)
                      }}
                    >
                      <IconUpload width={14} height={14} />
                    </button>
                    <button
                      className="icon-btn danger"
                      style={{ float: 'right', width: 22, height: 22 }}
                      title="删除"
                      onClick={(e) => {
                        e.stopPropagation()
                        setConfirmDeleteDoc({ id: d.id, name: d.name })
                      }}
                    >
                      <IconTrash width={14} height={14} />
                    </button>
                  </div>
                </div>
              ))}
              {resources.images.map((img: ImageItem) => (
                <div key={img.id} className="resource-card image-card" onClick={() => setViewerImage(img)}>
                  <div className="image-thumb">
                    <img src={imageUrl(img.file)} alt={img.name} loading="lazy" />
                  </div>
                  <div className="rc-name">{img.name}</div>
                  <div className="rc-desc">图片 · {img.width && img.height ? `${img.width}×${img.height}` : '图片文件'}</div>
                  <div className="rc-meta">
                    {fmtSize(img.size)} · {fmtTime(img.updatedAt)}
                    <button
                      className="icon-btn danger"
                      style={{ float: 'right', width: 22, height: 22 }}
                      onClick={(e) => {
                        e.stopPropagation()
                        setConfirmDeleteImage({ id: img.id, name: img.name })
                      }}
                    >
                      <IconTrash width={14} height={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      )}

      {/* 新建知识库 */}
      {showNewDataset && (
        <DatasetModal
          onClose={() => setShowNewDataset(false)}
          onSubmit={handleCreateDataset}
        />
      )}

      {/* 新建分区 */}
      {showNewFolder && (
        <FolderModal
          onClose={() => setShowNewFolder(false)}
          onSubmit={handleCreateFolder}
        />
      )}

      {/* 新建数据表 */}
      {showNewTable && (
        <TableModal
          onClose={() => setShowNewTable(false)}
          onSubmit={handleCreateTable}
        />
      )}

      {/* 分区右键操作 */}
      {contextTarget && (
        <Modal
          title={contextTarget.name}
          subtitle="分区操作"
          onClose={() => setContextTarget(null)}
        >
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn-danger"
              onClick={() => setConfirmDeleteFolder(contextTarget.id)}
            >
              删除分区
            </button>
            <button className="btn-ghost" onClick={() => setContextTarget(null)}>
              取消
            </button>
          </div>
        </Modal>
      )}

      {confirmDeleteFolder && (
        <Confirm
          title="删除分区"
          message="将删除该分区及其下的所有数据表和文档，此操作不可逆。"
          onConfirm={handleDeleteFolder}
          onCancel={() => setConfirmDeleteFolder(null)}
        />
      )}

      {confirmDeleteTable && (
        <Confirm
          title="删除数据表"
          message={`确定删除「${confirmDeleteTable.name}」吗？此操作不可逆。`}
          onConfirm={handleDeleteTable}
          onCancel={() => setConfirmDeleteTable(null)}
        />
      )}

      {confirmDeleteImage && (
        <Confirm
          title="删除图片"
          message={`确定删除「${confirmDeleteImage.name}」吗？`}
          confirmText="删除"
          onConfirm={handleDeleteImage}
          onCancel={() => setConfirmDeleteImage(null)}
        />
      )}

      {/* 图片查看器 */}
      {viewerImage && (
        <div className="viewer" onClick={() => setViewerImage(null)}>
          <div className="viewer-head" onClick={(e) => e.stopPropagation()}>
            <div className="viewer-title">
              <div style={{ fontWeight: 600 }}>{viewerImage.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                {viewerImage.width && viewerImage.height ? `${viewerImage.width}×${viewerImage.height} · ` : ''}
                {fmtSize(viewerImage.size)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="icon-btn danger"
                title="删除"
                onClick={() => setConfirmDeleteImage({ id: viewerImage.id, name: viewerImage.name })}
              >
                <IconTrash width={18} height={18} />
              </button>
              <button className="icon-btn" title="关闭" onClick={() => setViewerImage(null)}>
                <IconClose width={20} height={20} />
              </button>
            </div>
          </div>
          <div className="viewer-body" onClick={(e) => e.stopPropagation()}>
            <img src={imageUrl(viewerImage.file)} alt={viewerImage.name} />
          </div>
        </div>
      )}

      {/* 文档查看器（解析文本预览 + 下载 + 同步）*/}
      {viewerDoc && (
        <Modal title={viewerDoc.name} subtitle={`文档 · ${fmtSize(viewerDoc.size)}`} onClose={() => setViewerDoc(null)} wide>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <a
              className="btn-ghost"
              href={documentDownloadUrl(viewerDoc.id)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}
            >
              <IconDoc width={14} height={14} /> 下载原文件
            </a>
            <button className="btn-grad sm" onClick={() => handleSyncDoc(viewerDoc)}>
              <IconUpload width={14} height={14} /> 同步到 Dify
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-3)', alignSelf: 'center' }}>
              {viewerDoc.difyDocId ? '已推送' : '未推送'}
            </span>
          </div>
          <div
            style={{
              maxHeight: '50vh',
              overflow: 'auto',
              background: 'var(--bg-2)',
              borderRadius: 8,
              padding: 14,
              fontSize: 13,
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
            }}
          >
            {viewerDoc.parsedText || (viewerDoc.status === 'parsing' ? '解析中…' : '（暂无解析文本）')}
          </div>
        </Modal>
      )}

      {confirmDeleteDoc && (
        <Confirm
          title="删除文档"
          message={`确定删除「${confirmDeleteDoc.name}」吗？将同时删除本地文件及 Dify 索引。`}
          onConfirm={handleDeleteDoc}
          onCancel={() => setConfirmDeleteDoc(null)}
        />
      )}

      {/* Dify 检索测试台 */}
      {showSearch && (
        <Modal title="检索测试台" subtitle={difyMode === 'real' ? '云 Dify · hybrid_search + rerank' : 'Mock 模式'} onClose={() => setShowSearch(false)} wide>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="输入查询语句…"
              autoFocus
              style={{ flex: 1 }}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button className="btn-grad" disabled={searching || !searchQuery.trim()} onClick={handleSearch}>
              {searching ? '检索中…' : '检索'}
            </button>
          </div>
          {searchResults.length > 0 && (
            <div style={{ maxHeight: '55vh', overflow: 'auto' }}>
              {searchResults.map((r, i) => (
                <div
                  key={r.segmentId || i}
                  style={{
                    padding: 10,
                    marginBottom: 8,
                    background: 'var(--bg-2)',
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 12 }}>
                      {r.documentName || r.docName || '分段'}
                    </span>
                    <span style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 600 }}>
                      score {(r.score ?? 0).toFixed(4)}
                    </span>
                  </div>
                  <div style={{ lineHeight: 1.6, color: 'var(--text-1)' }}>{r.content}</div>
                </div>
              ))}
            </div>
          )}
          {!searching && searchQuery && searchResults.length === 0 && (
            <div className="empty" style={{ padding: '20px 0' }}>无召回结果</div>
          )}
        </Modal>
      )}

      {searchError && (
        <Modal title="检索失败" subtitle="Dify 检索接口返回错误" onClose={() => setSearchError('')}>
          <div className="dify-error-msg">{searchError}</div>
          <div className="modal-actions">
            <button className="btn-primary" onClick={() => setSearchError('')}>知道了</button>
          </div>
        </Modal>
      )}

      {uploading && <div className="toast">正在上传…</div>}
      {uploadingDoc && <div className="toast">正在上传文档…</div>}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

// 简单 useMemo 包装（避免命名冲突）
function useMemo2<T>(fn: () => T): T {
  return fn()
}

function DatasetModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void
  onSubmit: (v: { name: string; description: string }) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  return (
    <Modal title="新建知识库" subtitle="创建一个新的知识库容器" onClose={onClose}>
      <div className="form-field">
        <label>名称</label>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="例如：产品知识库" />
      </div>
      <div className="form-field">
        <label>描述（可选）</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="简要说明用途" />
      </div>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>取消</button>
        <button className="btn-primary" disabled={!name.trim()} onClick={() => onSubmit({ name: name.trim(), description: description.trim() })}>
          创建
        </button>
      </div>
    </Modal>
  )
}

function FolderModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void
  onSubmit: (v: { name: string }) => void
}) {
  const [name, setName] = useState('')
  return (
    <Modal title="新建分区" subtitle="在当前位置创建一个分区文件夹" onClose={onClose}>
      <div className="form-field">
        <label>分区名称</label>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="例如：术语与规范" />
      </div>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>取消</button>
        <button className="btn-primary" disabled={!name.trim()} onClick={() => onSubmit({ name: name.trim() })}>
          创建
        </button>
      </div>
    </Modal>
  )
}

function TableModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void
  onSubmit: (v: { name: string; description: string }) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  return (
    <Modal title="新建数据表" subtitle="创建一个可编辑的结构化数据表（如术语对照）" onClose={onClose}>
      <div className="form-field">
        <label>表名称</label>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="例如：术语对照表" />
      </div>
      <div className="form-field">
        <label>描述（可选）</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="说明这张表存什么数据" />
      </div>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>取消</button>
        <button className="btn-primary" disabled={!name.trim()} onClick={() => onSubmit({ name: name.trim(), description: description.trim() })}>
          创建
        </button>
      </div>
    </Modal>
  )
}
