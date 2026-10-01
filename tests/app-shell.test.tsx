/** @vitest-environment jsdom */
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MediaAssetSummary } from '../src/shared/types'
import App from '../src/renderer/src/App'

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

function stubApi(theme: 'dark' | 'light', assets: MediaAssetSummary[] = [], roots: unknown[] = []) {
  const api = {
    app: {
      getStats: vi.fn(async () => ({ assets: 12, duplicateGroups: 1, missing: 0, roots: 1 })),
      getSettings: vi.fn(async () => ({ thumbnailCacheLimitGb: 10, autoWatch: true, theme })),
      saveSettings: vi.fn(async (settings: unknown) => settings),
      chooseFolders: vi.fn(async () => []),
      chooseExportDirectory: vi.fn(async () => null),
      scanAll: vi.fn(async () => undefined),
      backupNow: vi.fn(async () => 'C:\\backup.sqlite'),
      readClipboardText: vi.fn(async () => ''),
      writeClipboardText: vi.fn(async () => undefined),
      onScanProgress: vi.fn(() => () => undefined)
    },
    library: {
      listRoots: vi.fn(async () => roots),
      search: vi.fn(async () => ({ items: assets, total: assets.length })),
      listFolders: vi.fn(async () => []),
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

    expect(screen.getByText('相册工作台')).toBeTruthy()
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

    await waitFor(() => expect(container.querySelectorAll('.photo-card')).toHaveLength(2))
    fireEvent.click(container.querySelectorAll('.photo-card')[1])
    fireEvent.keyDown(window, { key: ' ' })

    expect(container.querySelector('.lightbox-image')).not.toBeNull()
    expect(container.querySelector('.lightbox-info strong')?.textContent).toBe('shot-2.jpg')

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(container.querySelector('.lightbox-info strong')?.textContent).toBe('shot-1.jpg')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(container.querySelector('.lightbox-image')).toBeNull()
  })
})
