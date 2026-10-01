/** @vitest-environment jsdom */
import React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../src/renderer/src/App'

function stubApi(theme: 'dark' | 'light') {
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
      listRoots: vi.fn(async () => []),
      search: vi.fn(async () => ({ items: [], total: 0 })),
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
})
