// 「Dify 知识库」独立视图：按「可用 API」分 TAB，每个 TAB 下展示该 API 的知识库列表
// 只显示可用（后端已过滤）的 API；选中知识库后语义检索
import { useCallback, useEffect, useState } from 'react'
import { difyAvailableApis, difyRetrieveDataset } from '../api'
import type { AvailableApi, RetrievalRecord } from '../api'
import { IconSearch, IconBook } from './icons'
import { Modal } from './ui'

export function DifyPanel({ onBack }: { onBack: () => void }) {
  const [apis, setApis] = useState<AvailableApi[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [activeApiId, setActiveApiId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<RetrievalRecord[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const list = await difyAvailableApis()
      setApis(list ?? [])
      setActiveApiId((prev) => prev ?? list?.[0]?.id ?? null)
    } catch (e) {
      setLoadError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const activeApi = apis.find((a) => a.id === activeApiId) ?? null
  const datasets = activeApi?.datasets ?? []
  const selected = datasets.find((d) => d.id === selectedId) ?? null

  async function handleSearch() {
    if (!selectedId || !query.trim() || !activeApiId) return
    setSearching(true)
    setError('')
    setResults([])
    try {
      const r = await difyRetrieveDataset({
        datasetId: selectedId,
        query: query.trim(),
        topK: 5,
        apiId: activeApiId,
      })
      setResults(r.records ?? [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="dify-panel">
      <div className="main-tabs">
        <button className="main-tab" onClick={onBack}>本地知识库</button>
        <button className="main-tab active">Dify 知识库</button>
      </div>
      <div className="dify-head">
        <div>
          <h2>Dify 知识库</h2>
          <div className="breadcrumb">按可用 Dify API 分 Tab，每个 API 下独立检索知识库</div>
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

      {/* API Tab 条 */}
      <div className="dify-api-tabs">
        {apis.map((a) => (
          <button
            key={a.id}
            className={`dify-api-tab${activeApiId === a.id ? ' active' : ''}`}
            onClick={() => {
              setActiveApiId(a.id)
              setSelectedId(null)
              setResults([])
              setError('')
            }}
            title={`${a.name} · ${a.baseUrl}`}
          >
            <span className="dot" />
            {a.name}
          </button>
        ))}
        {!loading && apis.length === 0 && (
          <span className="dify-api-tab-empty">暂无可用 API</span>
        )}
      </div>

      <div className="dify-body">
        <div className="dify-list">
          <div className="dify-list-title">
            {activeApi ? `${activeApi.name} · 知识库（${datasets.length}）` : '知识库'}
          </div>
          {datasets.length === 0 && !loading && (
            <div className="empty" style={{ padding: '30px 10px' }}>
              <div className="emoji">📚</div>
              <div style={{ fontSize: 13 }}>该 API 下未拉取到知识库</div>
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
              <div style={{ fontSize: 13 }}>从左侧选择一个知识库开始检索</div>
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
