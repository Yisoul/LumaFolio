import { useEffect, useMemo, useRef, useState } from 'react'
import type { FolderSummary, SourceRoot } from '../../shared/types'
import { buildFolderTree, type FolderTreeNode } from './folder-tree'
import { IconChevronDown, IconChevronRight, IconFolder } from './icons'

interface FolderTreeProps {
  folders: FolderSummary[]
  roots: SourceRoot[]
  selectedPaths: string[]
  /** additive 为 true（Ctrl/⌘ 点击）时把目录加进已选，否则只选它。 */
  onToggle: (path: string, additive: boolean) => void
  onClear: () => void
  totalCount: number
  /** 鼠标悬浮照片时联动高亮的目录。 */
  linkedPath?: string | null
}

export default function FolderTree(props: FolderTreeProps) {
  const tree = useMemo(() => buildFolderTree(props.folders, props.roots), [props.folders, props.roots])
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const rootRef = useRef<HTMLDivElement>(null)

  // 悬浮照片时把对应目录滚动到可见区域（只高亮，不改变筛选）。
  useEffect(() => {
    const linked = props.linkedPath
    if (!linked || !rootRef.current) return
    const rows = rootRef.current.querySelectorAll('.tree-row[data-path]')
    for (const row of rows) {
      if (row.getAttribute('data-path') === linked.replace(/\//g, '\\')) {
        row.scrollIntoView?.({ block: 'nearest' })
        break
      }
    }
  }, [props.linkedPath])

  // 默认展开第一层，并在选中项变化时自动展开它的祖先。
  useEffect(() => {
    setExpanded((current) => {
      const next = new Set(current)
      for (const node of tree) next.add(node.path)
      for (const path of props.selectedPaths) {
        let parent = path
        while (parent) {
          const index = Math.max(parent.lastIndexOf('\\'), parent.lastIndexOf('/'))
          if (index <= 0) break
          parent = parent.slice(0, index)
          if (!/^[A-Za-z]:$/.test(parent)) next.add(parent.replace(/\//g, '\\'))
        }
      }
      return next
    })
  }, [tree, props.selectedPaths])

  const toggleExpand = (path: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const renderNode = (node: FolderTreeNode, depth: number) => {
    const isExpanded = expanded.has(node.path)
    const hasChildren = node.children.length > 0
    const selected = props.selectedPaths.includes(node.path)
    const linked = Boolean(props.linkedPath) && props.linkedPath!.replace(/\//g, '\\') === node.path
    return (
      <div key={node.path}>
        <div className={`tree-row ${selected ? 'selected' : ''} ${linked ? 'linked' : ''}`} data-path={node.path} style={{ paddingLeft: `${6 + depth * 12}px` }} title={node.path}>
          <button
            type="button"
            className={`tree-caret ${hasChildren ? '' : 'empty'}`}
            onClick={(event) => { event.stopPropagation(); if (hasChildren) toggleExpand(node.path) }}
            aria-label={isExpanded ? '折叠' : '展开'}
          >
            {hasChildren ? (isExpanded ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />) : null}
          </button>
          <button type="button" className="tree-label" onClick={(event) => props.onToggle(node.path, event.ctrlKey || event.metaKey)}>
            <IconFolder size={14} />
            <span>{node.name}</span>
          </button>
          <b>{node.totalCount}</b>
        </div>
        {hasChildren && isExpanded && node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    )
  }

  return (
    <div className="folder-tree" ref={rootRef}>
      <div className={`tree-row all ${props.selectedPaths.length === 0 ? 'selected' : ''}`} onClick={props.onClear}>
        <button type="button" className="tree-caret empty" tabIndex={-1} />
        <button type="button" className="tree-label"><IconFolder size={14} /><span>全部文件夹</span></button>
        <b>{props.totalCount}</b>
      </div>
      {tree.map((node) => renderNode(node, 0))}
    </div>
  )
}
