// 「Dify 知识库」独立视图：拉取 Dify 云知识库列表，选中后语义检索
import { useCallback, useEffect, useState } from 'react'
import { difyDatasets, difyRetrieveDataset } from '../api'
import type { DifyDataset, RetrievalRecord } from '../api'
import { IconSearch, IconBook } from './icons'
import { Modal } from './ui'

export function DifyPanel({ onBack }: { onBack: () => void }) {
  const [datasets, setDatasets] = useState<DifyDataset[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<RetrievalRecord[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const r = await difyDatasets()
      setDatasets(r.datasets ?? [])
      if (r.mock) setLoadError('当前为 mock 模式，未连接真实 Dify')
    } catch (e) {
      setLoadError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function handleSearch() {
    if (!selectedId || !query.trim()) return
    setSearching(true)
    setError('')
    setResults([])
    try {
      const r = await difyRetrieveDataset({ datasetId: selectedId, query: query.trim(), topK: 5 })
      setResults(r.records ?? [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSearching(false)
    }
  }

  const selected = datasets.find((d) => d.id === selectedId) ?? null

  return (
    <div className="dify-panel">
      <div className="main-tabs">
        <button className="main-tab" onClick={onBack}>本地知识库</button>
        <button className="main-tab active">Dify 知识库</button>
      </div>
      <div className="dify-head">
        <div>
          <h2>Dify 知识库</h2>
          <div className="breadcrumb">独立接入 Dify 云知识库，按知识库检索（不占用本地分区）</div>
        </div>
        <button className="btn-ghost" onClick={refresh} disabled={loading}>
          {loading ? '拉取中…' : '刷新列表'}
        </button>
      </div>

      {loadError && (
        <div className="dify-banner error">
          <span>⚠️ {loadError}</span>
          <button className="btn-ghost sm" onClick={() => setLoadError('')}>关闭</button>
        </div>
      )}

      <div className="dify-body">
        <div className="dify-list">
          <div className="dify-list-title">Dify 云知识库（{datasets.length}）</div>
          {datasets.length === 0 && !loading && (
            <div className="empty" style={{ padding: '30px 10px' }}>
              <div className="emoji">📚</div>
              <div style={{ fontSize: 13 }}>未拉取到知识库</div>
            </div>
          )}
          {datasets.map((d) => (
            <div
              key={d.id}
              className={`dify-item${selectedId === d.id ? ' active' : ''}`}
              onClick={() => {
                setSelectedId(d.id)
                setResults([])
                setError('')
              }}
            >
              <span className="dify-item-icon">
                <IconBook width={16} height={16} />
              </span>
              <div className="dify-item-main">
                <div className="dify-item-name">{d.name}</div>
                <div className="dify-item-meta">
                  {d.document_count} 文档 · {d.word_count} 词
                  {d.embedding_model ? ` · ${d.embedding_model}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="dify-search">
          {!selected ? (
            <div className="empty" style={{ padding: '60px 20px' }}>
              <div className="emoji">👈</div>
              <div style={{ fontSize: 13 }}>从左侧选择一个 Dify 知识库开始检索</div>
            </div>
          ) : (
            <>
              <div className="dify-search-box">
                <div style={{ fontWeight: 600, marginBottom: 10 }}>{selected.name}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="输入查询语句…"
                    autoFocus
                    style={{ flex: 1 }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  />
                  <button className="btn-grad" disabled={searching || !query.trim()} onClick={handleSearch}>
                    <IconSearch width={15} height={15} /> {searching ? '检索中…' : '检索'}
                  </button>
                </div>
              </div>

              {results.length > 0 && (
                <div className="dify-results">
                  {results.map((r, i) => (
                    <div key={r.segmentId || i} className="dify-result">
                      <div className="dify-result-head">
                        <span style={{ fontWeight: 600, fontSize: 12 }}>
                          {r.documentName || r.docName || '分段'}
                        </span>
                        <span style={{ color: 'var(--accent, #007aff)', fontSize: 12, fontWeight: 600 }}>
                          score {(r.score ?? 0).toFixed(4)}
                        </span>
                      </div>
                      <div className="dify-result-content">{r.content}</div>
                    </div>
                  ))}
                </div>
              )}
              {!searching && query && results.length === 0 && (
                <div className="empty" style={{ padding: '20px 0' }}>无召回结果</div>
              )}
            </>
          )}
        </div>
      </div>

      {error && (
        <Modal title="检索失败" subtitle="Dify 检索接口返回错误" onClose={() => setError('')}>
          <div className="dify-error-msg">{error}</div>
          <div className="modal-actions">
            <button className="btn-primary" onClick={() => setError('')}>知道了</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
