import { useMemo, useState } from 'react'
import type { Folder, TreeData } from '../types'
import {
  IconFolder,
  IconFolderOpen,
  IconChevronRight,
  IconBook,
  IconPlus,
} from './icons'

export type Selection =
  | { type: 'dataset'; id: string }
  | { type: 'folder'; id: string; datasetId: string }

export function Sidebar({
  tree,
  selection,
  onSelect,
  onNewDataset,
  onNewFolder,
}: {
  tree: TreeData
  selection: Selection | null
  onSelect: (s: Selection) => void
  onNewDataset: () => void
  onNewFolder: () => void
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    tree.datasets.forEach((d) => (init[d.id] = true))
    return init
  })

  const foldersByParent = useMemo(() => {
    const map: Record<string, Folder[]> = {}
    tree.folders.forEach((f) => {
      const key = f.parentId ?? f.datasetId
      ;(map[key] ??= []).push(f)
    })
    return map
  }, [tree])

  function toggle(id: string) {
    setExpanded((p) => ({ ...p, [id]: !p[id] }))
  }

  function renderFolder(f: Folder, depth: number) {
    const children = foldersByParent[f.id] ?? []
    const isOpen = expanded[f.id]
    const isActive = selection?.type === 'folder' && selection.id === f.id
    return (
      <div key={f.id} className="tree-node">
        <div
          className={`tree-node-row${isActive ? ' active' : ''}`}
          style={{ paddingLeft: 8 + depth * 16 }}
          onClick={() => {
            toggle(f.id)
            onSelect({ type: 'folder', id: f.id, datasetId: f.datasetId })
          }}
        >
          <span className={`tree-caret${children.length ? ' open' : ' empty'}${isOpen ? ' open' : ''}`}>
            <IconChevronRight width={14} height={14} />
          </span>
          <span className="tree-icon">
            {isOpen ? <IconFolderOpen width={16} height={16} /> : <IconFolder width={16} height={16} />}
          </span>
          <span className="tree-label">{f.name}</span>
        </div>
        {isOpen && children.map((c) => renderFolder(c, depth + 1))}
      </div>
    )
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <h1>
          <span className="logo">
            <IconBook width={16} height={16} />
          </span>
          知识库
        </h1>
        <button className="btn-grad sm" onClick={onNewDataset}>
          <IconPlus width={14} height={14} /> 新建
        </button>
      </div>

      <div className="sidebar-body">
        {tree.datasets.map((ds) => {
          const isOpen = expanded[ds.id]
          const rootFolders = foldersByParent[ds.id] ?? []
          const isActive = selection?.type === 'dataset' && selection.id === ds.id
          return (
            <div key={ds.id} className="tree-node">
              <div
                className={`tree-node-row ds${isActive ? ' active' : ''}`}
                onClick={() => {
                  toggle(ds.id)
                  onSelect({ type: 'dataset', id: ds.id })
                }}
              >
                <span className={`tree-caret${rootFolders.length ? ' open' : ' empty'}${isOpen ? ' open' : ''}`}>
                  <IconChevronRight width={14} height={14} />
                </span>
                <span className="tree-icon">
                  <IconBook width={16} height={16} />
                </span>
                <span className="tree-label">{ds.name}</span>
              </div>
              {isOpen && (
                <>
                  {rootFolders.map((f) => renderFolder(f, 1))}
                  <div
                    className="tree-node-row"
                    style={{ paddingLeft: 24, color: 'var(--text-3)', fontSize: 12 }}
                    onClick={() => {
                      toggle(ds.id)
                      onSelect({ type: 'dataset', id: ds.id })
                      onNewFolder()
                    }}
                  >
                    <span className="tree-icon">
                      <IconPlus width={14} height={14} />
                    </span>
                    <span className="tree-label">新建分区</span>
                  </div>
                </>
              )}
            </div>
          )
        })}

        {tree.datasets.length === 0 && (
          <div className="empty" style={{ padding: '40px 10px' }}>
            <div className="emoji">📚</div>
            <div style={{ fontSize: 13 }}>暂无知识库</div>
          </div>
        )}
      </div>
    </aside>
  )
}
