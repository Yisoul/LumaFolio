import { useEffect, useMemo, useState } from 'react'
import type { FolderSummary, SourceRoot } from '../../shared/types'
import { buildFolderTree, type FolderTreeNode } from './folder-tree'
import { IconChevronDown, IconChevronRight, IconFolder } from './icons'

interface FolderTreeProps {
  folders: FolderSummary[]
  roots: SourceRoot[]
  selectedPaths: string[]
  onToggle: (path: string) => void
  onClear: () => void
  totalCount: number
}

export default function FolderTree(props: FolderTreeProps) {
  const tree = useMemo(() => buildFolderTree(props.folders, props.roots), [props.folders, props.roots])
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

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
    return (
      <div key={node.path}>
        <div className={`tree-row ${selected ? 'selected' : ''}`} style={{ paddingLeft: `${6 + depth * 12}px` }} title={node.path}>
          <button
            type="button"
            className={`tree-caret ${hasChildren ? '' : 'empty'}`}
            onClick={(event) => { event.stopPropagation(); if (hasChildren) toggleExpand(node.path) }}
            aria-label={isExpanded ? '折叠' : '展开'}
          >
            {hasChildren ? (isExpanded ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />) : null}
          </button>
          <button type="button" className="tree-label" onClick={() => props.onToggle(node.path)}>
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
    <div className="folder-tree">
      <div className={`tree-row all ${props.selectedPaths.length === 0 ? 'selected' : ''}`} onClick={props.onClear}>
        <button type="button" className="tree-caret empty" tabIndex={-1} />
        <button type="button" className="tree-label"><IconFolder size={14} /><span>全部文件夹</span></button>
        <b>{props.totalCount}</b>
      </div>
      {tree.map((node) => renderNode(node, 0))}
    </div>
  )
}
