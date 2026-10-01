/** @vitest-environment jsdom */
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaAssetSummary } from '../src/shared/types'
import WaterfallViewRaw from '../src/renderer/src/WaterfallView'
import { ShortcutProvider } from '../src/renderer/src/shortcuts'

/** 组件依赖快捷键注册表，测试里统一套一层 Provider。 */
function WaterfallView(props: React.ComponentProps<typeof WaterfallViewRaw>) {
  return <ShortcutProvider><WaterfallViewRaw {...props} /></ShortcutProvider>
}

class MockIntersectionObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function asset(index: number, overrides: Partial<MediaAssetSummary> = {}): MediaAssetSummary {
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
    rating: 0,
    favorite: false,
    missing: false,
    primaryPath: `C:\\photos\\shot-${index}.jpg`,
    primaryRootId: 'root-1',
    primaryDirectoryPath: 'C:\\photos',
    locationCount: 1,
    ...overrides
  }
}

function createApiMock(assets: MediaAssetSummary[], existingAlbums: Array<{ id: string; name: string; updatedAt: number }> = []) {
  const albums = new Map<string, Set<string>>()
  const api = {
    app: {
      setFullscreen: vi.fn(async () => undefined)
    },
    library: {
      search: vi.fn(async (filters: { offset: number; limit: number }) => ({
        items: assets.slice(filters.offset, filters.offset + filters.limit),
        total: assets.length
      }))
    },
    albums: {
      list: vi.fn(async () => existingAlbums.map((album) => ({ ...album, coverAssetId: null, createdAt: album.updatedAt }))),
      listAssets: vi.fn(async () => []),
      create: vi.fn(async (name: string) => {
        const id = `album-${albums.size + 1}`
        albums.set(id, new Set())
        return { id, name, coverAssetId: null, createdAt: 0, updatedAt: 0 }
      }),
      addAssets: vi.fn(async (albumId: string, assetIds: string[]) => {
        for (const id of assetIds) albums.get(albumId)?.add(id)
      }),
      removeAsset: vi.fn(async (albumId: string, assetId: string) => {
        albums.get(albumId)?.delete(assetId)
      })
    }
  }
  vi.stubGlobal('albumApi', api)
  return { api, albums }
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('WaterfallView', () => {
  it('renders photos with their natural aspect ratio and star rating', async () => {
    const assets = [asset(1, { rating: 4 }), asset(2, { width: 800, height: 1200 })]
    createApiMock(assets)

    const { container } = render(<WaterfallView source={{ kind: 'library', title: '图库', filters: { sort: 'captured_desc' } }} onClose={() => undefined} onToast={() => undefined} />)

    await waitFor(() => expect(container.querySelectorAll('.waterfall-item')).toHaveLength(2))
    const images = container.querySelectorAll('.waterfall-item img')
    expect(images[0].getAttribute('style')).toContain('aspect-ratio: 1.5')
    expect(images[1].getAttribute('style')).toContain('aspect-ratio: 0.666')
    expect(container.querySelector('.waterfall-stars')?.textContent).toBe('★★★★')
  })

  it('selects with a click and moves the selection with arrow keys', async () => {
    const assets = [asset(1), asset(2)]
    createApiMock(assets)

    const { container } = render(<WaterfallView source={{ kind: 'library', title: '图库', filters: { sort: 'captured_desc' } }} onClose={() => undefined} onToast={() => undefined} />)

    await waitFor(() => expect(container.querySelectorAll('.waterfall-item')).toHaveLength(2))
    const items = container.querySelectorAll('.waterfall-item')
    fireEvent.click(items[1])
    expect(container.querySelector('.waterfall-file')?.textContent).toBe('shot-2.jpg')

    fireEvent.keyDown(window, { key: 'ArrowUp' })
    expect(container.querySelector('.waterfall-file')?.textContent).toBe('shot-1.jpg')
  })

  it('opens the lightbox on double click and closes it with Escape', async () => {
    const onClose = vi.fn()
    createApiMock([asset(1), asset(2)])

    const { container } = render(<WaterfallView source={{ kind: 'library', title: '图库', filters: { sort: 'captured_desc' } }} onClose={onClose} onToast={() => undefined} />)

    await waitFor(() => expect(container.querySelectorAll('.waterfall-item')).toHaveLength(2))
    fireEvent.doubleClick(container.querySelectorAll('.waterfall-item')[0])
    expect(container.querySelector('.lightbox-image')).not.toBeNull()

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(container.querySelector('.lightbox-info strong')?.textContent).toBe('shot-2.jpg')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(container.querySelector('.lightbox-image')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('creates one temporary album on the first mark and toggles photos in and out of it', async () => {
    const { api, albums } = createApiMock([asset(1), asset(2)])
    const onToast = vi.fn()

    const { container } = render(<WaterfallView source={{ kind: 'library', title: '图库', filters: { sort: 'captured_desc' } }} onClose={() => undefined} onToast={onToast} />)

    await waitFor(() => expect(container.querySelectorAll('.waterfall-item')).toHaveLength(2))
    await waitFor(() => expect(container.querySelector('.waterfall-file')?.textContent).toBe('shot-1.jpg'))
    fireEvent.keyDown(window, { key: 't' })
    await waitFor(() => expect(api.albums.addAssets).toHaveBeenCalledWith('album-1', ['asset-1']))
    expect(api.albums.create).toHaveBeenCalledTimes(1)
    expect(api.albums.create.mock.calls[0][0]).toContain('临时选片')
    expect(onToast).toHaveBeenCalledWith(expect.objectContaining({ kind: 'info' }))

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'T' })
    await waitFor(() => expect(api.albums.addAssets).toHaveBeenCalledWith('album-1', ['asset-2']))
    expect(api.albums.create).toHaveBeenCalledTimes(1)
    expect([...(albums.get('album-1') ?? [])].sort()).toEqual(['asset-1', 'asset-2'])

    fireEvent.keyDown(window, { key: 'ArrowUp' })
    fireEvent.keyDown(window, { key: 't' })
    await waitFor(() => expect(api.albums.removeAsset).toHaveBeenCalledWith('album-1', 'asset-1'))
    expect([...(albums.get('album-1') ?? [])]).toEqual(['asset-2'])
  })

  it('passes the session rating filter into the library query', async () => {
    const { api } = createApiMock([asset(1)])

    const { container } = render(<WaterfallView source={{ kind: 'library', title: '图库', filters: { sort: 'captured_desc' } }} onClose={() => undefined} onToast={() => undefined} />)

    await waitFor(() => expect(api.library.search).toHaveBeenCalled())
    fireEvent.change(screen.getByLabelText('星级筛选'), { target: { value: 'min3' } })
    await waitFor(() => expect(api.library.search).toHaveBeenLastCalledWith(expect.objectContaining({ ratingMin: 3, ratingMax: undefined })))
    expect(container.querySelector('.waterfall-hint')).toBeNull()
  })

  it('resizes the grid with Ctrl + wheel and keeps the grid unchanged otherwise', async () => {
    createApiMock([asset(1), asset(2)])

    const { container } = render(<WaterfallView source={{ kind: 'library', title: '图库', filters: { sort: 'captured_desc' } }} onClose={() => undefined} onToast={() => undefined} />)

    await waitFor(() => expect(container.querySelectorAll('.waterfall-item')).toHaveLength(2))
    const body = container.querySelector('.waterfall-body')!
    const grid = container.querySelector('.waterfall-grid')!
    expect((grid as HTMLElement).style.columnWidth).toBe('240px')

    fireEvent.wheel(body, { ctrlKey: true, deltaY: -120 })
    await waitFor(() => expect((container.querySelector('.waterfall-grid') as HTMLElement).style.columnWidth).toBe('260px'))

    fireEvent.wheel(body, { ctrlKey: true, deltaY: 120 })
    fireEvent.wheel(body, { ctrlKey: true, deltaY: 120 })
    await waitFor(() => expect((container.querySelector('.waterfall-grid') as HTMLElement).style.columnWidth).toBe('220px'))

    fireEvent.wheel(body, { deltaY: -120 })
    expect((container.querySelector('.waterfall-grid') as HTMLElement).style.columnWidth).toBe('220px')
  })

  it('opens the lightbox with the space key and closes it again', async () => {
    createApiMock([asset(1), asset(2)])

    const { container } = render(<WaterfallView source={{ kind: 'library', title: '图库', filters: { sort: 'captured_desc' } }} onClose={() => undefined} onToast={() => undefined} />)

    await waitFor(() => expect(container.querySelector('.waterfall-file')?.textContent).toBe('shot-1.jpg'))
    fireEvent.keyDown(window, { key: ' ' })
    expect(container.querySelector('.lightbox-image')).not.toBeNull()
    expect(container.querySelector('.lightbox-counter')?.textContent).toBe('1 / 2')

    fireEvent.keyDown(window, { key: ' ' })
    expect(container.querySelector('.lightbox-image')).toBeNull()
  })

  it('switches the window to system fullscreen while open', async () => {
    const { api } = createApiMock([asset(1)])

    const { container, unmount } = render(<WaterfallView source={{ kind: 'library', title: '图库', filters: { sort: 'captured_desc' } }} onClose={() => undefined} onToast={() => undefined} />)

    await waitFor(() => expect(container.querySelectorAll('.waterfall-item')).toHaveLength(1))
    expect(api.app.setFullscreen).toHaveBeenCalledWith(true)

    unmount()
    expect(api.app.setFullscreen).toHaveBeenLastCalledWith(false)
  })

  it('offers to continue the previous temp album and reuses it by default', async () => {
    const previous = { id: 'album-old', name: '临时选片 10-01 10:00', updatedAt: 500 }
    const { api } = createApiMock([asset(1)], [previous])

    const { container } = render(<WaterfallView source={{ kind: 'library', title: '图库', filters: { sort: 'captured_desc' } }} onClose={() => undefined} onToast={() => undefined} />)

    await waitFor(() => expect(container.querySelector('.waterfall-hintbar')).not.toBeNull())
    // 不点提示条直接按 T，默认继续往上次的临时相册里加。
    fireEvent.keyDown(window, { key: 't' })

    await waitFor(() => expect(api.albums.addAssets).toHaveBeenCalledWith('album-old', ['asset-1']))
    expect(api.albums.create).not.toHaveBeenCalled()
  })

  it('creates a fresh temp album when asked to start a new one', async () => {
    const previous = { id: 'album-old', name: '临时选片 10-01 10:00', updatedAt: 500 }
    const { api } = createApiMock([asset(1)], [previous])

    const { container } = render(<WaterfallView source={{ kind: 'library', title: '图库', filters: { sort: 'captured_desc' } }} onClose={() => undefined} onToast={() => undefined} />)

    await waitFor(() => expect(container.querySelector('.waterfall-hintbar')).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: '新建一个' }))
    fireEvent.keyDown(window, { key: 't' })

    await waitFor(() => expect(api.albums.create).toHaveBeenCalledTimes(1))
    expect(api.albums.addAssets).toHaveBeenCalledWith('album-1', ['asset-1'])
  })

  it('hides the blurred placeholder once the big preview is loaded', async () => {
    createApiMock([asset(1)])

    const { container } = render(<WaterfallView source={{ kind: 'library', title: '图库', filters: { sort: 'captured_desc' } }} onClose={() => undefined} onToast={() => undefined} />)

    await waitFor(() => expect(container.querySelectorAll('.waterfall-item')).toHaveLength(1))
    fireEvent.doubleClick(container.querySelectorAll('.waterfall-item')[0])

    const thumb = container.querySelector('.lightbox-thumb')!
    expect(thumb.classList.contains('hidden')).toBe(false)

    fireEvent.load(container.querySelector('.lightbox-image')!)
    expect(thumb.classList.contains('hidden')).toBe(true)
  })
})
