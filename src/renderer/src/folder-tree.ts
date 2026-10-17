import type { FolderSummary, SourceRoot } from '../../shared/types'

export interface FolderTreeNode {
  path: string
  name: string
  /** 该目录自身的照片数。 */
  count: number
  /** 含所有子目录的照片总数，和点击该节点筛选出的数量一致。 */
  totalCount: number
  children: FolderTreeNode[]
}

/** 统一成反斜杠，避免同一个目录因为分隔符不同被拆成两个节点。 */
function normalizePath(path: string): string {
  return path.replace(/[\\/]+$/, '').replace(/\//g, '\\')
}

/** child 是否就是 parent 或位于 parent 之下（Windows 路径不区分大小写）。 */
export function isPathInsideFolder(child: string, parent: string): boolean {
  const base = normalizePath(parent).toLowerCase()
  if (!base) return false
  const target = normalizePath(child).toLowerCase()
  return target === base || target.startsWith(`${base}\\`)
}

/** 找出某个目录所属的来源目录；目录本身是来源目录时也返回它。 */
export function findRootForPath(path: string, roots: SourceRoot[]): SourceRoot | null {
  const matches = roots.filter((root) => isPathInsideFolder(path, root.path))
  if (matches.length === 0) return null
  // 嵌套来源目录时取最深的那个，保证移除的是用户看到的那个根。
  return matches.sort((left, right) => right.path.length - left.path.length)[0]
}

export function isSameFolder(left: string, right: string): boolean {
  return normalizePath(left).toLowerCase() === normalizePath(right).toLowerCase()
}

/** 目录查表/展开状态用的稳定键：统一分隔符并忽略大小写。 */
export function folderKey(path: string): string {
  return normalizePath(path).toLowerCase()
}

function parentPathOf(path: string): string | null {
  const index = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  if (index <= 0) return null
  const parent = path.slice(0, index)
  const normalized = parent.endsWith(':') ? `${parent}\\` : parent
  // 不再往上补出 "D:\" 这种盘符节点。
  if (/^[A-Za-z]:[\\/]?$/.test(normalized)) return null
  return normalized === path ? null : normalized
}

function nameOf(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path
}

/**
 * 把扁平的目录列表整理成可折叠的树：中间层即使没有照片也会补出来，
 * 每个节点的 totalCount 包含所有子目录，和"点父目录筛出子目录照片"的语义一致。
 */
export function buildFolderTree(folders: FolderSummary[], roots: SourceRoot[] = []): FolderTreeNode[] {
  const nodes = new Map<string, FolderTreeNode>()
  const ensure = (path: string): FolderTreeNode => {
    const key = normalizePath(path)
    const existing = nodes.get(key)
    if (existing) return existing
    const created: FolderTreeNode = { path: key, name: nameOf(key), count: 0, totalCount: 0, children: [] }
    nodes.set(key, created)
    return created
  }

  for (const root of roots) {
    const normalized = normalizePath(root.path)
    if (normalized) ensure(normalized)
  }

  for (const folder of folders) {
    const path = normalizePath(folder.path)
    if (!path) continue
    const node = ensure(path)
    node.count += folder.assetCount
    let parent = parentPathOf(path)
    while (parent) {
      ensure(parent)
      parent = parentPathOf(parent)
    }
  }

  const topLevel: FolderTreeNode[] = []
  for (const node of nodes.values()) {
    const parent = parentPathOf(node.path)
    const parentNode = parent ? nodes.get(parent) : undefined
    if (parentNode) parentNode.children.push(node)
    else topLevel.push(node)
  }

  const sortTree = (list: FolderTreeNode[]): void => {
    list.sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN', { numeric: true }))
    for (const node of list) sortTree(node.children)
  }
  sortTree(topLevel)

  const accumulate = (node: FolderTreeNode): number => {
    node.totalCount = node.count + node.children.reduce((total, child) => total + accumulate(child), 0)
    return node.totalCount
  }
  for (const node of topLevel) accumulate(node)

  return topLevel
}
