// 表格数据查看/编辑视图
import { useEffect, useMemo, useState } from 'react'
import type { DataTable } from '../types'
import { getTable, updateRow, addRow, deleteRow } from '../api'
import { IconPlus, IconTrash, IconBack } from '../components/icons'

export function TableView({
  tableId,
  onBack,
  onToast,
}: {
  tableId: string
  onBack: () => void
  onToast: (t: string) => void
}) {
  const [table, setTable] = useState<DataTable | null>(null)
  const [editing, setEditing] = useState<Record<string, string>>({}) // rowId -> cellKey -> value 暂存

  useEffect(() => {
    getTable(tableId).then(setTable)
  }, [tableId])

  function cellValue(rowId: string, key: string): string {
    const k = `${rowId}::${key}`
    return editing[k] ?? String(table!.rows.find((r) => r.id === rowId)?.[key] ?? '')
  }

  function setCell(rowId: string, key: string, val: string) {
    setEditing((p) => ({ ...p, [`${rowId}::${key}`]: val }))
  }

  async function commitCell(rowId: string, key: string) {
    const k = `${rowId}::${key}`
    const val = editing[k]
    if (val === undefined) return
    await updateRow(tableId, rowId, { [key]: val })
    const t = await getTable(tableId)
    setTable(t)
    setEditing((p) => {
      const n = { ...p }
      delete n[k]
      return n
    })
  }

  async function handleAddRow() {
    if (!table) return
    const empty: Record<string, string | number> = {}
    table.columns.forEach((c) => (empty[c.key] = ''))
    await addRow(tableId, empty)
    const t = await getTable(tableId)
    setTable(t)
    onToast('已添加空行')
  }

  async function handleDeleteRow(rowId: string) {
    await deleteRow(tableId, rowId)
    const t = await getTable(tableId)
    setTable(t)
    onToast('已删除行')
  }

  const dirty = useMemo(() => Object.keys(editing).length > 0, [editing])

  if (!table) return <div className="empty">加载中…</div>

  return (
    <div>
      <div className="table-toolbar">
        <button className="icon-btn" onClick={onBack} title="返回">
          <IconBack width={18} height={18} />
        </button>
        <span style={{ fontWeight: 600 }}>{table.name}</span>
        {table.description && (
          <span style={{ color: 'var(--text-2)', fontSize: 12 }}>{table.description}</span>
        )}
        <span className="spacer" />
        {dirty && (
          <span style={{ color: 'var(--warning)', fontSize: 12 }}>
            有未提交的修改（失焦自动保存）
          </span>
        )}
        <button className="btn-grad sm" onClick={handleAddRow}>
          <IconPlus width={14} height={14} /> 添加行
        </button>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {table.columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
              <th style={{ width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.id}>
                {table.columns.map((c) => (
                  <td key={c.key}>
                    <input
                      value={String(cellValue(row.id, c.key))}
                      onChange={(e) => setCell(row.id, c.key, e.target.value)}
                      onBlur={() => commitCell(row.id, c.key)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                      }}
                    />
                  </td>
                ))}
                <td>
                  <div className="row-actions">
                    <button
                      className="icon-btn danger"
                      onClick={() => handleDeleteRow(row.id)}
                      title="删除行"
                    >
                      <IconTrash width={16} height={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-3)' }}>
        共 {table.rows.length} 行 · {table.columns.length} 列 · 点击单元格直接编辑，失焦或回车自动保存
      </div>
    </div>
  )
}
