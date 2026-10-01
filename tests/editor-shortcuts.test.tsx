/** @vitest-environment jsdom */
import React from 'react'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkDocument } from '../src/shared/types'
import { ShortcutProvider } from '../src/renderer/src/shortcuts'

// jsdom 没有 canvas，Konva 图层用空组件替身，测试只关心快捷键逻辑。
vi.mock('react-konva', () => {
  const stub = (name: string) => {
    const Component = ({ children }: { children?: React.ReactNode }) => <div data-konva={name}>{children}</div>
    Component.displayName = name
    return Component
  }
  return { Stage: stub('Stage'), Layer: stub('Layer'), Group: stub('Group'), Rect: stub('Rect'), Line: stub('Line'), Text: stub('Text'), Image: stub('Image'), Transformer: stub('Transformer') }
})

import Editor from '../src/renderer/src/Editor'

const workDocument: WorkDocument = {
  work: {
    id: 'work-1', albumId: 'album-1', name: '测试作品', outputMode: 'pages',
    canvasWidth: 1080, canvasHeight: 1440, background: '#ffffff', createdAt: 0, updatedAt: 0
  },
  pages: [{
    id: 'page-1', workId: 'work-1', position: 0, background: '#ffffff',
    layers: [{
      id: 'layer-1', pageId: 'page-1', type: 'image', assetId: 'asset-1',
      x: 0.1, y: 0.2, width: 0.5, height: 0.5, rotation: 0, zIndex: 1,
      style: { fit: 'contain', radius: 0 }, text: null
    }]
  }]
}

function stubApi() {
  const api = {
    works: {
      get: vi.fn(async () => workDocument),
      updateLayer: vi.fn(async () => undefined),
      deleteLayer: vi.fn(async () => undefined),
      update: vi.fn(async () => workDocument.work),
      createPage: vi.fn(), deletePage: vi.fn(), updatePage: vi.fn(),
      createImageLayer: vi.fn(), createTextLayer: vi.fn(),
      reorderLayers: vi.fn(), replaceImageLayerAsset: vi.fn(), updateTextLayer: vi.fn(), remove: vi.fn(), list: vi.fn()
    },
    albums: { listAssets: vi.fn(async () => []) },
    fonts: { list: vi.fn(async () => []) },
    templates: { save: vi.fn() },
    app: { getSettings: vi.fn(async () => ({ thumbnailCacheLimitGb: 10, autoWatch: true, theme: 'dark' })) }
  }
  vi.stubGlobal('albumApi', api)
  return api
}

async function renderEditor() {
  const api = stubApi()
  const { container } = render(<ShortcutProvider><Editor workId="work-1" onBack={async () => undefined} onToast={() => undefined} /></ShortcutProvider>)
  await waitFor(() => expect(container.querySelector('.editor-shell')).not.toBeNull())
  fireEvent.click(container.querySelector('.layer-select')!)
  return { api, container }
}

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('editor shortcuts', () => {
  it('deletes the selected layer with Delete after confirming', async () => {
    const { api, container } = await renderEditor()

    fireEvent.keyDown(window, { key: 'Delete' })

    await waitFor(() => expect(api.works.deleteLayer).toHaveBeenCalledWith('layer-1'))
    await waitFor(() => expect(container.querySelectorAll('.layer-row')).toHaveLength(0))
  })

  it('keeps the layer when the confirmation is declined', async () => {
    const { api, container } = await renderEditor()
    vi.mocked(window.confirm).mockReturnValue(false)

    fireEvent.keyDown(window, { key: 'Backspace' })

    expect(api.works.deleteLayer).not.toHaveBeenCalled()
    expect(container.querySelectorAll('.layer-row')).toHaveLength(1)
  })

  it('nudges the selected layer by one canvas pixel and ten with Shift', async () => {
    const { api } = await renderEditor()

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    await waitFor(() => expect(api.works.updateLayer).toHaveBeenCalledWith('layer-1', expect.objectContaining({ x: 0.1 + 1 / 1080 })))

    fireEvent.keyDown(window, { key: 'ArrowDown', shiftKey: true })
    await waitFor(() => expect(api.works.updateLayer).toHaveBeenCalledWith('layer-1', expect.objectContaining({ y: 0.2 + 10 / 1440 })))
  })

  it('zooms the canvas with +, - and 0', async () => {
    const { container } = await renderEditor()
    const zoomLabel = () => container.querySelector('.canvas-toolbar span')?.textContent
    expect(zoomLabel()).toBe('100%')

    fireEvent.keyDown(window, { key: '+' })
    expect(zoomLabel()).toBe('110%')

    fireEvent.keyDown(window, { key: '-' })
    fireEvent.keyDown(window, { key: '-' })
    expect(zoomLabel()).toBe('90%')

    fireEvent.keyDown(window, { key: '0' })
    expect(zoomLabel()).toBe('100%')
  })

  it('clears the selection with Escape', async () => {
    const { container } = await renderEditor()
    expect(container.querySelector('.layer-row.active')).not.toBeNull()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(container.querySelector('.layer-row.active')).toBeNull()
  })

  it('does not steal keys while typing in the layer text inspector', async () => {
    const { api, container } = await renderEditor()

    const nameInput = container.querySelector('.editor-name-input') as HTMLInputElement
    fireEvent.keyDown(nameInput, { key: 'Delete' })
    fireEvent.keyDown(nameInput, { key: 'ArrowRight' })

    expect(api.works.deleteLayer).not.toHaveBeenCalled()
    expect(api.works.updateLayer).not.toHaveBeenCalled()
  })
})
