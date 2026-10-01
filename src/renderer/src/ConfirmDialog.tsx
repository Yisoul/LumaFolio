import { useEffect, useState } from 'react'

export interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void
}

let pending: PendingConfirm | null = null
let notify: (() => void) | null = null

/**
 * 应用内确认弹窗，替代 window.confirm：
 * 直接 `if (!(await confirmDialog({...}))) return` 即可。
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    pending = { ...options, resolve }
    notify?.()
  })
}

export function ConfirmHost() {
  const [, forceRender] = useState(0)

  useEffect(() => {
    notify = () => forceRender((value) => value + 1)
    return () => { notify = null }
  }, [])

  useEffect(() => {
    if (!pending) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') finish(false) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  if (!pending) return null
  const current = pending

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) finish(false) }}>
      <div className="modal confirm-modal" role="dialog" aria-modal="true">
        <header><h2>{current.title}</h2><button aria-label="关闭" onClick={() => finish(false)}>×</button></header>
        <div className="modal-body">
          <div className="confirm-dialog">
            <div className={`confirm-icon ${current.danger ? '' : 'plain'}`}>{current.danger ? '⌫' : '?'}</div>
            <div><p>{current.message}</p></div>
            <div className="dialog-actions">
              <button className="button secondary" onClick={() => finish(false)}>{current.cancelLabel ?? '取消'}</button>
              <button className={`button ${current.danger ? 'danger-solid' : 'primary'}`} onClick={() => finish(true)}>{current.confirmLabel ?? '确认'}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function finish(value: boolean): void {
  const entry = pending
  pending = null
  entry?.resolve(value)
  notify?.()
}
