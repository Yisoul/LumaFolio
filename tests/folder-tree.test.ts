import { describe, expect, it } from 'vitest'
import type { SourceRoot } from '../src/shared/types'
import { buildFolderTree } from '../src/renderer/src/folder-tree'

const root: SourceRoot = { id: 'root-1', path: 'D:\\LR项目', enabled: true, createdAt: 0 }

describe('buildFolderTree', () => {
  it('nests folders and accumulates counts from children', () => {
    const tree = buildFolderTree([
      { path: 'D:\\LR项目\\调色成品\\2024.10', name: '2024.10', assetCount: 5 },
      { path: 'D:\\LR项目\\调色成品\\2024.12', name: '2024.12', assetCount: 7 },
      { path: 'D:\\LR项目\\拍摄', name: '拍摄', assetCount: 3 }
    ], [root])

    expect(tree).toHaveLength(1)
    const treeRoot = tree[0]
    expect(treeRoot.name).toBe('LR项目')
    expect(treeRoot.totalCount).toBe(15)
    const tuned = treeRoot.children.find((child) => child.name === '调色成品')!
    expect(tuned.count).toBe(0)
    expect(tuned.totalCount).toBe(12)
    expect(tuned.children.map((child) => child.name)).toEqual(['2024.10', '2024.12'])
    expect(tuned.children[0].totalCount).toBe(5)
  })

  it('adds intermediate levels that have no photos of their own', () => {
    const tree = buildFolderTree([{ path: 'D:\\LR项目\\a\\b\\c', name: 'c', assetCount: 2 }], [root])

    const a = tree[0].children.find((child) => child.name === 'a')!
    const b = a.children.find((child) => child.name === 'b')!
    const c = b.children.find((child) => child.name === 'c')!
    expect([a.count, b.count, c.count]).toEqual([0, 0, 2])
    expect(a.totalCount).toBe(2)
  })

  it('sorts numeric folder names naturally', () => {
    const tree = buildFolderTree([
      { path: 'D:\\LR项目\\2024.12', name: '2024.12', assetCount: 1 },
      { path: 'D:\\LR项目\\2024.2', name: '2024.2', assetCount: 1 },
      { path: 'D:\\LR项目\\2024.10', name: '2024.10', assetCount: 1 }
    ], [root])

    expect(tree[0].children.map((child) => child.name)).toEqual(['2024.2', '2024.10', '2024.12'])
  })

  it('keeps folders without a registered source root as top level entries', () => {
    const tree = buildFolderTree([{ path: 'E:\\其他\\街拍', name: '街拍', assetCount: 4 }], [root])

    expect(tree.map((node) => node.name).sort()).toEqual(['LR项目', '其他'])
    expect(tree.find((node) => node.name === '其他')!.totalCount).toBe(4)
  })

  it('handles forward slashes and trailing separators', () => {
    const tree = buildFolderTree([{ path: 'D:/LR项目/调色/', name: '调色', assetCount: 6 }], [root])

    expect(tree[0].children[0].name).toBe('调色')
    expect(tree[0].totalCount).toBe(6)
  })
})
