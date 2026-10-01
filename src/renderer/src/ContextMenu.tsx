import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useShortcut } from './shortcuts'

export interface ContextMenuItem {
  label: string
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
  separator?: boolean
  /** 右侧的按键提示，例如“空格”“T”。 */
  hint?: string
}

export default function ContextMenu(props: { x: number; y: number; items: ContextMenuItem[]; onClose: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: props.x, top: props.y })
  const navigable = props.items.map((item, index) => ({ item, index })).filter(({ item }) => !item.separator && !item.disabled)
  const [activePos, setActivePos] = useState(0)

  const move = (delta: number) => {
    if (navigable.length === 0) return
    setActivePos((current) => (current + delta + navigable.length) % navigable.length)
  }
  const runActive = () => {
    const target = navigable[Math.min(activePos, navigable.length - 1)]
    if (!target) return
    target.item.onClick?.()
    props.onClose()
  }

  useShortcut({ id: 'context-menu.next', keys: ['arrowdown'], scope: 'context-menu', label: '下一项', when: () => navigable.length > 0, run: () => move(1) })
  useShortcut({ id: 'context-menu.previous', keys: ['arrowup'], scope: 'context-menu', label: '上一项', when: () => navigable.length > 0, run: () => move(-1) })
  useShortcut({ id: 'context-menu.run', keys: ['enter'], scope: 'context-menu', label: '执行选中项', when: () => navigable.length > 0, run: runActive })
  useShortcut({ id: 'context-menu.close', keys: ['escape'], scope: 'context-menu', label: '关闭菜单', allowInInput: true, run: props.onClose })

  useLayoutEffect(() => {
    const node = menuRef.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    setPosition({
      left: Math.max(8, Math.min(props.x, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(props.y, window.innerHeight - rect.height - 8))
    })
  }, [props.x, props.y])

  useEffect(() => {
    const close = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) props.onClose() }
    const closeNow = () => props.onClose()
    window.addEventListener('pointerdown', close)
    window.addEventListener('blur', closeNow)
    window.addEventListener('resize', closeNow)
    window.addEventListener('wheel', closeNow, { passive: true })
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('blur', closeNow)
      window.removeEventListener('resize', closeNow)
      window.removeEventListener('wheel', closeNow)
    }
  }, [props.onClose])

  return createPortal(<div ref={menuRef} className="context-menu" role="menu" style={position} onContextMenu={(event) => event.preventDefault()}>
    {props.items.map((item, index) => {
      const highlight = !item.separator && !item.disabled && navigable[activePos]?.index === index
      return <Fragment key={`${item.label}-${index}`}>
        {item.separator && <div className="context-menu-separator" />}
        <button
          className={`${item.danger ? 'danger' : ''} ${highlight ? 'active' : ''}`}
          disabled={item.disabled}
          onMouseEnter={() => { const pos = navigable.findIndex((entry) => entry.index === index); if (pos >= 0) setActivePos(pos) }}
          onClick={() => { if (item.disabled) return; item.onClick?.(); props.onClose() }}
        >
          <span>{item.label}</span>
          {item.hint && <em className="context-menu-hint">{item.hint}</em>}
        </button>
      </Fragment>
    })}
  </div>, document.body)
}

export function GlobalTextContextMenu() {
  const [menu, setMenu] = useState<{ x: number; y: number; target: HTMLInputElement | HTMLTextAreaElement } | null>(null)

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof HTMLTextAreaElement) && !(target instanceof HTMLInputElement)) return
      if (target instanceof HTMLInputElement && !['text', 'search', 'url', 'email', 'password', 'tel'].includes(target.type)) return
      event.preventDefault()
      target.focus()
      setMenu({ x: event.clientX, y: event.clientY, target })
    }
    document.addEventListener('contextmenu', handler, true)
    return () => document.removeEventListener('contextmenu', handler, true)
  }, [])

  if (!menu) return null
  const target = menu.target
  const selectionStart = target.selectionStart ?? 0
  const selectionEnd = target.selectionEnd ?? selectionStart
  const hasSelection = selectionEnd > selectionStart

  const setValue = (value: string) => {
    const prototype = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
    setter?.call(target, value)
    target.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const replaceSelection = (value: string) => {
    const next = target.value.slice(0, selectionStart) + value + target.value.slice(selectionEnd)
    setValue(next)
    requestAnimationFrame(() => { target.focus(); target.setSelectionRange(selectionStart + value.length, selectionStart + value.length) })
  }
  const copy = async () => { if (hasSelection) await window.albumApi.app.writeClipboardText(target.value.slice(selectionStart, selectionEnd)) }
  const cut = async () => { if (!hasSelection) return; await copy(); replaceSelection('') }
  const paste = async () => replaceSelection(await window.albumApi.app.readClipboardText())

  return <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} items={[
    { label: '剪切', disabled: !hasSelection, onClick: () => void cut() },
    { label: '复制', disabled: !hasSelection, onClick: () => void copy() },
    { label: '粘贴', onClick: () => void paste() },
    { label: '全选', separator: true, onClick: () => target.select() }
  ]} />
}
