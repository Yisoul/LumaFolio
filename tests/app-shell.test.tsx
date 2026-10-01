/** @vitest-environment jsdom */
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MediaAssetSummary } from '../src/shared/types'
import AppRaw from '../src/renderer/src/App'
import { ShortcutProvider } from '../src/renderer/src/shortcuts'

/** 应用依赖快捷键注册表，测试里统一套一层 Provider。 */
function App() {
  return <ShortcutProvider><AppRaw /></ShortcutProvider>
}

function libraryAsset(index: number): MediaAssetSummary {
  return {
    id: `asset-${index}`,
    contentHash: `hash-${index}`,
    width: 1200,
    height: 800,
    format: 'jpeg',
    capturedAt: '2026-01-01T10:00:00.000Z',
    cameraMake: 'Fujifilm',
    cameraModel: 'X-T5',
    lens: 'XF 35mm F1.4',
    focalLength: 35,
    aperture: 1.4,
    shutterSpeed: '1/250',
    iso: 200,
    orientation: 'landscape',
    rating: 3,
    favorite: false,
    missing: false,
    primaryPath: `C:\\photos\\shot-${index}.jpg`,
    primaryRootId: 'root-1',
    primaryDirectoryPath: 'C:\\photos',
    locationCount: 1
  }
}

function stubApi(theme: 'dark' | 'light', assets: MediaAssetSummary[] = [], roots: unknown[] = [], folders: unknown[] = []) {
  const api = {
    app: {
      getStats: vi.fn(async () => ({ assets: 12, duplicateGroups: 1, missing: 0, roots: 1 })),
      getSettings: vi.fn(async () => ({ thumbnailCacheLimitGb: 10, autoWatch: true, theme, uiScale: 1, thumbnailSize: 200 })),
      saveSettings: vi.fn(async (settings: unknown) => settings),
      chooseFolders: vi.fn(async () => []),
      chooseExportDirectory: vi.fn(async () => null),
      scanAll: vi.fn(async () => undefined),
      backupNow: vi.fn(async () => 'C:\\backup.sqlite'),
      readClipboardText: vi.fn(async () => ''),
      writeClipboardText: vi.fn(async () => undefined),
      setFullscreen: vi.fn(async () => undefined),
      onFullscreenChange: vi.fn(() => () => undefined),
      onScanProgress: vi.fn(() => () => undefined)
    },
    library: {
      listRoots: vi.fn(async () => roots),
      search: vi.fn(async () => ({ items: assets, total: assets.length })),
      listFolders: vi.fn(async () => folders),
      listDuplicates: vi.fn(async () => []),
      getRootImpact: vi.fn(async () => ({ assetCount: 0, locationCount: 0 })),
      addRoots: vi.fn(async () => []),
      removeRoot: vi.fn(),
      setRootEnabled: vi.fn(),
      scanRoot: vi.fn(),
      get: vi.fn(),
      listLocations: vi.fn(async () => []),
      setPreferredLocation: vi.fn(),
      setFavorite: vi.fn(),
      ignoreAsset: vi.fn(),
      deleteOriginal: vi.fn(),
      showInFolder: vi.fn()
    },
    albums: {
      list: vi.fn(async () => []),
      create: vi.fn(),
      remove: vi.fn(),
      listAssets: vi.fn(async () => []),
      addAssets: vi.fn(),
      removeAsset: vi.fn(),
      reorder: vi.fn(),
      setCover: vi.fn()
    },
    works: {},
    fonts: {},
    templates: { list: vi.fn(async () => []), save: vi.fn() },
    exporter: { run: vi.fn() }
  }
  vi.stubGlobal('albumApi', api)
  return api
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.theme
})

describe('App shell', () => {
  it('renders the Eagle shell and applies the saved theme', async () => {
    stubApi('light')
    const { container } = render(<App />)

    expect(screen.getByText('光影册')).toBeTruthy()
    expect(container.querySelector('.sidebar')).not.toBeNull()
    expect(container.querySelector('.nav-button.active')?.textContent).toContain('图库')

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'))
    await waitFor(() => expect(screen.getByText('12 张照片')).toBeTruthy())
  })

  it('falls back to the dark theme when settings cannot be read', async () => {
    const api = stubApi('dark')
    api.app.getSettings.mockRejectedValueOnce(new Error('settings unavailable'))

    render(<App />)

    await waitFor(() => expect(screen.getByText('还没有启用的照片来源')).toBeTruthy())
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('opens the fullscreen viewer with the space key after selecting a photo', async () => {
    stubApi('dark', [libraryAsset(1), libraryAsset(2)], [{ id: 'root-1', path: 'C:\\photos', enabled: true, createdAt: 0 }])
    const { container } = render(<App />)

    await waitFor(() => expect(container.querySelectorAll('.tile')).toHaveLength(2))
    fireEvent.click(container.querySelectorAll('.tile-image')[1])
    fireEvent.keyDown(window, { key: ' ' })

    expect(container.querySelector('.lightbox-image')).not.toBeNull()
    expect(container.querySelector('.lightbox-info strong')?.textContent).toBe('shot-2.jpg')

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(container.querySelector('.lightbox-info strong')?.textContent).toBe('shot-1.jpg')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(container.querySelector('.lightbox-image')).toBeNull()
  })

  it('switches pages with Ctrl+number and focuses the search box with /', async () => {
    stubApi('dark', [libraryAsset(1)], [{ id: 'root-1', path: 'C:\\photos', enabled: true, createdAt: 0 }])
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector('.browse-toolbar')).not.toBeNull())

    fireEvent.keyDown(window, { key: '4', ctrlKey: true })
    await waitFor(() => expect(screen.getByText('照片来源目录')).toBeTruthy())

    fireEvent.keyDown(window, { key: '/' })
    await waitFor(() => expect(document.activeElement).toBe(screen.getByPlaceholderText('搜索文件名或文件夹路径')))

    // 普通切回图库不应该再自动聚焦搜索框。
    fireEvent.keyDown(window, { key: '4', ctrlKey: true })
    await waitFor(() => expect(screen.getByText('照片来源目录')).toBeTruthy())
    fireEvent.keyDown(window, { key: '1', ctrlKey: true })
    await waitFor(() => expect(container.querySelector('.browse-toolbar')).not.toBeNull())
    expect(document.activeElement).not.toBe(screen.getByPlaceholderText('搜索文件名或文件夹路径'))
  })

  it('opens the shortcut help with ? and closes it with Escape', async () => {
    stubApi('dark')
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector('.browse-toolbar')).not.toBeNull())

    fireEvent.keyDown(window, { key: '?', shiftKey: true })
    expect(await screen.findByRole('heading', { name: '快捷键' })).toBeTruthy()
    expect(screen.getByText('切换到图库')).toBeTruthy()

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('heading', { name: '快捷键' })).toBeNull())
  })

  it('keeps Delete unbound in the library', async () => {
    const api = stubApi('dark', [libraryAsset(1)], [{ id: 'root-1', path: 'C:\\photos', enabled: true, createdAt: 0 }])
    const { container } = render(<App />)

    await waitFor(() => expect(container.querySelectorAll('.tile')).toHaveLength(1))
    fireEvent.click(container.querySelector('.tile-image')!)
    fireEvent.keyDown(window, { key: 'Delete' })

    expect(api.library.ignoreAsset).not.toHaveBeenCalled()
    expect(api.library.deleteOriginal).not.toHaveBeenCalled()
    expect(container.querySelectorAll('.tile')).toHaveLength(1)
  })

  it('changes the interface scale from the settings page', async () => {
    const api = stubApi('dark')
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector('.browse-toolbar')).not.toBeNull())

    fireEvent.keyDown(window, { key: '4', ctrlKey: true })
    await waitFor(() => expect(screen.getByText('界面缩放')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '125%' }))

    await waitFor(() => expect(api.app.saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ uiScale: 1.25 })))
  })

  it('steps the interface scale with Ctrl shortcuts', async () => {
    const api = stubApi('dark')
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector('.browse-toolbar')).not.toBeNull())

    fireEvent.keyDown(window, { key: '=', ctrlKey: true })
    await waitFor(() => expect(api.app.saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ uiScale: 1.1 })))

    fireEvent.keyDown(window, { key: '-', ctrlKey: true })
    await waitFor(() => expect(api.app.saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ uiScale: 1 })))

    fireEvent.keyDown(window, { key: '0', ctrlKey: true })
    await waitFor(() => expect(api.app.saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ uiScale: 1 })))
  })

  it('keeps the interface scale when the theme changes', async () => {
    const api = stubApi('dark')
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector('.browse-toolbar')).not.toBeNull())

    fireEvent.keyDown(window, { key: '=', ctrlKey: true })
    await waitFor(() => expect(api.app.saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ uiScale: 1.1 })))

    fireEvent.keyDown(window, { key: '4', ctrlKey: true })
    await waitFor(() => expect(screen.getByText('外观')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /浅色/ }))

    await waitFor(() => expect(api.app.saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'light', uiScale: 1.1 })))
  })

  it('shows the selected photo in the inspector without a rename field', async () => {
    stubApi('dark', [libraryAsset(1)], [{ id: 'root-1', path: 'C:\\photos', enabled: true, createdAt: 0 }])
    const { container } = render(<App />)

    await waitFor(() => expect(container.querySelectorAll('.tile')).toHaveLength(1))
    fireEvent.click(container.querySelector('.tile-image')!)

    await waitFor(() => expect(container.querySelector('.inspector-panel')).not.toBeNull())
    expect(container.querySelector('.inspector-name')?.textContent).toBe('shot-1.jpg')
    // 原图不允许重命名，信息栏里不应该出现输入框。
    expect(container.querySelector('.inspector-panel input')).toBeNull()
  })

  it('highlights active filter chips and clears them', async () => {
    stubApi('dark', [libraryAsset(1)], [{ id: 'root-1', path: 'C:\\photos', enabled: true, createdAt: 0 }])
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector('.browse-toolbar')).not.toBeNull())

    fireEvent.click(screen.getByRole('button', { name: /星级/ }))
    fireEvent.click(screen.getByRole('button', { name: '≥3 星' }))
    await waitFor(() => expect(container.querySelector('.chip.active')?.textContent).toContain('≥3 星'))

    fireEvent.click(screen.getByRole('button', { name: /清除筛选/ }))
    await waitFor(() => expect(container.querySelector('.chip.active')).toBeNull())
  })

  it('selects a single folder at a time and clears back to all folders', async () => {
    stubApi('dark', [libraryAsset(1)], [
      { id: 'root-1', path: 'C:\\photos', enabled: true, createdAt: 0 }
    ])
    const { container } = render(<App />)

    await waitFor(() => expect(container.querySelectorAll('.tree-row').length).toBeGreaterThan(0))
    expect(container.querySelector('.tree-row.all')?.classList.contains('selected')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'photos' }))
    await waitFor(() => expect(container.querySelector('.tree-row.selected .tree-label')?.textContent).toContain('photos'))
    // 选了子目录之后「全部文件夹」不再处于选中态。
    expect(container.querySelector('.tree-row.all')?.classList.contains('selected')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: /全部文件夹/ }))
    await waitFor(() => expect(container.querySelector('.tree-row.all')?.classList.contains('selected')).toBe(true))
  })

  it('links the hovered photo to its folder in the tree', async () => {
    stubApi('dark', [libraryAsset(1)], [{ id: 'root-1', path: 'C:\\photos', enabled: true, createdAt: 0 }])
    const { container } = render(<App />)

    await waitFor(() => expect(container.querySelectorAll('.tile')).toHaveLength(1))
    fireEvent.mouseEnter(container.querySelector('.tile')!)
    await waitFor(() => expect(container.querySelector('.tree-row.linked')).not.toBeNull())

    fireEvent.mouseLeave(container.querySelector('.tile')!)
    await waitFor(() => expect(container.querySelector('.tree-row.linked')).toBeNull())
  })

  it('adds more folders to the filter with ctrl+click', async () => {
    stubApi('dark', [libraryAsset(1)], [{ id: 'root-1', path: 'C:\\photos', enabled: true, createdAt: 0 }], [
      { path: 'C:\\photos\\a', name: 'a', assetCount: 2 },
      { path: 'C:\\photos\\b', name: 'b', assetCount: 3 }
    ])
    const { container } = render(<App />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'a' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'a' }))
    await waitFor(() => expect(container.querySelectorAll('.tree-row.selected')).toHaveLength(1))

    fireEvent.click(screen.getByRole('button', { name: 'b' }), { ctrlKey: true })
    await waitFor(() => expect(container.querySelectorAll('.tree-row.selected')).toHaveLength(2))

    // 普通点击会替换掉多选，只剩当前这一个。
    fireEvent.click(screen.getByRole('button', { name: 'a' }))
    await waitFor(() => expect(container.querySelectorAll('.tree-row.selected')).toHaveLength(1))
  })

  it('keeps captions out of the row height so tiles cannot overlap', async () => {
    stubApi('dark', [libraryAsset(1), libraryAsset(2)], [{ id: 'root-1', path: 'C:\\photos', enabled: true, createdAt: 0 }])
    const { container } = render(<App />)

    await waitFor(() => expect(container.querySelectorAll('.tile')).toHaveLength(2))
    const row = container.querySelector('.justified-row') as HTMLElement
    const image = container.querySelector('.tile-image') as HTMLElement
    // 行高由图片撑开，说明文字在下面占据自己的空间。
    expect(row.style.height).toBe('')
    expect(image.style.height).not.toBe('')
  })
})
