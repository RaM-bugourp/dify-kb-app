import { useEffect } from 'react'
import type { ReactNode } from 'react'

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div className="modal" onClick={onClose}>
      <div
        className={`modal-card${wide ? ' wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{title}</h3>
        {subtitle && <p className="modal-sub">{subtitle}</p>}
        {children}
      </div>
    </div>
  )
}

export function Confirm({
  title,
  message,
  confirmText = '删除',
  onConfirm,
  onCancel,
}: {
  title: string
  message: string
  confirmText?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal title={title} subtitle={message} onClose={onCancel}>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onCancel}>
          取消
        </button>
        <button className="btn-danger" onClick={onConfirm}>
          {confirmText}
        </button>
      </div>
    </Modal>
  )
}
