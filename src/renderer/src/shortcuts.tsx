import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export type ShortcutScope =
  | 'help'
  | 'context-menu'
  | 'lightbox'
  | 'dialog'
  | 'waterfall'
  | 'editor'
  | 'album'
  | 'library'
  | 'global'

export interface ShortcutCommand {
  id: string
  keys: string[]
  scope: ShortcutScope
  label: string
  group?: string
  /** 返回 false 时该命令本次不参与派发。 */
  when?: () => boolean
  /** 默认 false：输入框里只有带修饰键的命令才会继续执行。 */
  allowInInput?: boolean
  /** 为 true 时即使在输入框聚焦也完全跳过，例如 Ctrl+A 要保留原生全选。 */
  skipInInput?: boolean
  run: (event: KeyboardEvent) => void
}

/** 高优先级在前，命中即消费事件。 */
export const SCOPE_PRIORITY: ShortcutScope[] = [
  'help', 'context-menu', 'lightbox', 'dialog', 'waterfall', 'editor', 'album', 'library', 'global'
]

export const SCOPE_LABELS: Record<ShortcutScope, string> = {
  global: '全局',
  library: '图库',
  album: '相册详情',
  waterfall: '全屏浏览',
  lightbox: '大图查看',
  dialog: '照片详情',
  editor: '排版编辑器',
  'context-menu': '右键菜单',
  help: '快捷键面板'
}

/** 需要 Shift 才能打出来的符号，匹配时忽略 Shift 状态。 */
const SHIFTED_SYMBOLS = new Set(['?', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_', ':', '"', '<', '>', '~', '{', '}', '|', 'plus'])
const MODIFIERS = new Set(['ctrl', 'cmd', 'meta', 'alt', 'shift'])

const KEY_LABELS: Record<string, string> = {
  space: '空格',
  enter: '回车',
  escape: 'Esc',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  delete: 'Delete',
  backspace: 'Backspace',
  plus: '+',
  minus: '−',
  equal: '='
}

interface RegistryEntry {
  order: number
  command: ShortcutCommand
}

interface RegistryHandle {
  entries: Map<string, RegistryEntry>
  nextOrder: () => number
  bump: () => void
}

const RegistryContext = createContext<RegistryHandle | null>(null)
const VersionContext = createContext(0)

export function normalizeKey(key: string): string {
  const lower = key.toLowerCase()
  if (lower === ' ' || lower === 'spacebar') return 'space'
  if (lower === 'esc') return 'escape'
  if (lower === '+') return 'plus'
  if (lower === '-') return 'minus'
  if (lower === '=') return 'equal'
  return lower
}

function comboParts(combo: string): { key: string; ctrl: boolean; alt: boolean; shift: boolean } {
  const parts = combo.toLowerCase().split('+').map((part) => part.trim()).filter(Boolean)
  return {
    key: normalizeKey(parts[parts.length - 1] ?? ''),
    ctrl: parts.includes('ctrl') || parts.includes('cmd') || parts.includes('meta'),
    alt: parts.includes('alt'),
    shift: parts.includes('shift')
  }
}

export function comboMatches(combo: string, event: KeyboardEvent): boolean {
  const parsed = comboParts(combo)
  if (!parsed.key || parsed.key !== normalizeKey(event.key)) return false
  if (parsed.ctrl !== (event.ctrlKey || event.metaKey)) return false
  if (parsed.alt !== event.altKey) return false
  if (parsed.shift) return event.shiftKey
  // 字母、方向键这些要求 Shift 状态完全一致；? + 之类的符号不受 Shift 影响。
  return SHIFTED_SYMBOLS.has(parsed.key) || !event.shiftKey
}

function comboHasModifier(combo: string): boolean {
  return combo.toLowerCase().split('+').map((part) => part.trim()).some((part) => MODIFIERS.has(part))
}

export function formatCombo(combo: string): string {
  const parts = combo.toLowerCase().split('+').map((part) => part.trim()).filter(Boolean)
  const key = normalizeKey(parts[parts.length - 1] ?? '')
  const modifiers = parts.slice(0, -1).map((part) => (
    part === 'ctrl' ? 'Ctrl' : part === 'cmd' || part === 'meta' ? 'Cmd' : part === 'shift' ? 'Shift' : part === 'alt' ? 'Alt' : part
  ))
  const label = KEY_LABELS[key] ?? (/^[a-z]$/.test(key) ? key.toUpperCase() : key)
  return [...modifiers, label].join('+')
}

export function formatKeys(keys: string[]): string {
  return keys.map(formatCombo).join(' / ')
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false
  const element = target as HTMLElement
  if (typeof element.tagName !== 'string') return false
  const tag = element.tagName.toUpperCase()
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable === true
}

export function ShortcutProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0)
  const handleRef = useRef<RegistryHandle | null>(null)
  if (!handleRef.current) {
    const entries = new Map<string, RegistryEntry>()
    let order = 0
    handleRef.current = {
      entries,
      nextOrder: () => { order += 1; return order },
      bump: () => setVersion((current) => current + 1)
    }
  }
  const handle = handleRef.current

  useEffect(() => {
    const dispatch = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      const inInput = isTypingTarget(event.target)
      const sorted = [...handle.entries.values()].sort((left, right) => {
        const byScope = SCOPE_PRIORITY.indexOf(left.command.scope) - SCOPE_PRIORITY.indexOf(right.command.scope)
        return byScope !== 0 ? byScope : right.order - left.order
      })
      for (const entry of sorted) {
        const command = entry.command
        if (command.when && !command.when()) continue
        const matched = command.keys.find((combo) => comboMatches(combo, event))
        if (!matched) continue
        // 输入框里只放行明确带 Ctrl/⌘ 的命令，其它按键留给原生输入行为。
        if (inInput) {
          if (command.skipInInput) continue
          if (!command.allowInInput && !comboHasModifier(matched)) continue
        }
        event.preventDefault()
        command.run(event)
        return
      }
    }
    window.addEventListener('keydown', dispatch)
    return () => window.removeEventListener('keydown', dispatch)
  }, [handle])

  return (
    <RegistryContext.Provider value={handle}>
      <VersionContext.Provider value={version}>{children}</VersionContext.Provider>
    </RegistryContext.Provider>
  )
}

/**
 * 在组件挂载期间注册一条快捷键。命令对象每帧都可能重建，
 * 注册表里存的是取值器，派发时读取最新闭包。
 */
export function useShortcut(command: ShortcutCommand): void {
  const handle = useContext(RegistryContext)
  const liveRef = useRef(command)
  liveRef.current = command

  useEffect(() => {
    if (!handle) return
    const entry: RegistryEntry = {
      order: handle.nextOrder(),
      command: {
        get id() { return liveRef.current.id },
        get keys() { return liveRef.current.keys },
        get scope() { return liveRef.current.scope },
        get label() { return liveRef.current.label },
        get group() { return liveRef.current.group },
        get when() { return liveRef.current.when },
        get allowInInput() { return liveRef.current.allowInInput },
        get skipInInput() { return liveRef.current.skipInInput },
        get run() { return liveRef.current.run }
      }
    }
    handle.entries.set(command.id, entry)
    handle.bump()
    return () => {
      handle.entries.delete(command.id)
      handle.bump()
    }
  }, [handle, command.id])
}

/** 当前注册的命令快照，供快捷键面板使用。 */
export function useShortcutList(): ShortcutCommand[] {
  const handle = useContext(RegistryContext)
  const version = useContext(VersionContext)
  return useMemo(() => {
    if (!handle) return []
    return [...handle.entries.values()]
      .sort((left, right) => {
        const byScope = SCOPE_PRIORITY.indexOf(left.command.scope) - SCOPE_PRIORITY.indexOf(right.command.scope)
        return byScope !== 0 ? byScope : right.order - left.order
      })
      .map((entry) => entry.command)
    // version 变化代表注册表增删，需要重新取快照。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, version])
}
