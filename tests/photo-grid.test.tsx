/** @vitest-environment jsdom */
import React from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import JustifiedPhotoGrid from '../src/renderer/src/JustifiedPhotoGrid'
import type { MediaAssetSummary } from '../src/shared/types'

afterEach(cleanup)

/** 第一行（top 相同）的 tiles 总宽度，用来验证行宽铺满容器。 */
function firstRowWidth(container: HTMLElement): number {
  const tiles = Array.from(container.querySelectorAll('.tile')) as HTMLElement[]
  if (tiles.length === 0) return 0
  const top = tiles[0].style.top
  const row = tiles.filter((tile) => tile.style.top === top)
  return row.reduce((sum, tile) => sum + Number.parseFloat(tile.style.width), 0) + 6 * (row.length - 1)
}

function asset(id: string): MediaAssetSummary {
  return {
    id, contentHash: `hash-${id}`, addedAt: 0, width: 1200, height: 800, format: 'jpeg',
    capturedAt: null, cameraMake: null, cameraModel: null, lens: null, focalLength: null,
    aperture: null, shutterSpeed: null, iso: null, orientation: 'landscape', rating: 0,
    favorite: false, missing: false, primaryPath: `C:\\photos\\${id}.jpg`, primaryRootId: null,
    primaryDirectoryPath: null, locationCount: 1
  }
}

describe('JustifiedPhotoGrid', () => {
  it('toggles multi selection from the tile checkbox', () => {
    const onActivate = vi.fn()
    const { container } = render(<JustifiedPhotoGrid
      photos={[asset('a'), asset('b')]}
      targetHeight={200}
      selectedIds={new Set(['a'])}
      activeId={null}
      onActivate={onActivate}
      onOpen={() => undefined}
    />)

    fireEvent.click(container.querySelectorAll('.tile-check')[1])

    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }), 'toggle')
  })

  it('distinguishes plain, ctrl and shift clicks', () => {
    const onActivate = vi.fn()
    const { container } = render(<JustifiedPhotoGrid
      photos={[asset('a')]}
      targetHeight={200}
      selectedIds={new Set()}
      activeId={null}
      onActivate={onActivate}
      onOpen={() => undefined}
    />)

    const image = container.querySelector('.tile-image')!
    fireEvent.click(image)
    expect(onActivate).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'a' }), 'replace')

    fireEvent.click(image, { ctrlKey: true })
    expect(onActivate).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'a' }), 'toggle')

    fireEvent.click(image, { shiftKey: true })
    expect(onActivate).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'a' }), 'range')
  })

  it('measures the scroll container instead of its own inflated width', () => {
    const { container } = render(<div className="host" style={{ paddingLeft: '14px', paddingRight: '14px' }}>
      <JustifiedPhotoGrid
        photos={[asset('a'), asset('b'), asset('c'), asset('d')]}
        targetHeight={200}
        selectedIds={new Set()}
        activeId={null}
        onActivate={() => undefined}
        onOpen={() => undefined}
      />
    </div>)
    const host = container.querySelector('.host') as HTMLElement
    const grid = container.querySelector('.justified-grid') as HTMLElement
    // 模拟"网格被行宽撑到 2000，滚动容器只有 900"这种真实故障场景。
    Object.defineProperty(host, 'clientWidth', { configurable: true, value: 900 })
    Object.defineProperty(grid, 'clientWidth', { configurable: true, value: 2000 })

    fireEvent(window, new Event('resize'))

    expect(Math.abs(firstRowWidth(container) - 872)).toBeLessThanOrEqual(6)
  })

  it('re-measures when the viewport changes without any resize event', () => {
    vi.useFakeTimers()
    try {
      const { container } = render(<div className="host" style={{ paddingLeft: '14px', paddingRight: '14px' }}>
        <JustifiedPhotoGrid
          photos={[asset('a'), asset('b'), asset('c'), asset('d')]}
          targetHeight={200}
          selectedIds={new Set()}
          activeId={null}
          onActivate={() => undefined}
          onOpen={() => undefined}
        />
      </div>)
      const host = container.querySelector('.host') as HTMLElement
      const grid = container.querySelector('.justified-grid') as HTMLElement
      Object.defineProperty(host, 'clientWidth', { configurable: true, value: 900 })
      Object.defineProperty(grid, 'clientWidth', { configurable: true, value: 2000 })
      act(() => { vi.advanceTimersByTime(300) })
      expect(Math.abs(firstRowWidth(container) - 872)).toBeLessThanOrEqual(6)

      // 模拟 Electron 改界面缩放：视口和容器都变窄，但没有任何事件派发。
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
      Object.defineProperty(host, 'clientWidth', { configurable: true, value: 500 })
      act(() => { vi.advanceTimersByTime(300) })
      expect(Math.abs(firstRowWidth(container) - 472)).toBeLessThanOrEqual(6)
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops the zoom preview when the size already hit the limit', async () => {
    const onSizeChange = vi.fn()
    const { container } = render(<div className="host">
      <JustifiedPhotoGrid
        photos={[asset('a'), asset('b')]}
        targetHeight={120}
        selectedIds={new Set()}
        activeId={null}
        onActivate={() => undefined}
        onOpen={() => undefined}
        onSizeChange={onSizeChange}
      />
    </div>)
    const host = container.querySelector('.host') as HTMLElement
    const grid = container.querySelector('.justified-grid') as HTMLElement

    fireEvent.wheel(host, { deltaY: 120, ctrlKey: true })
    await new Promise((resolve) => setTimeout(resolve, 60))
    // 已经是最小尺寸：继续往下滚不应该再把画面缩小。
    expect(grid.style.transform).toBe('')
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(onSizeChange).not.toHaveBeenCalled()

    cleanup()
    const max = render(<div className="host">
      <JustifiedPhotoGrid
        photos={[asset('a'), asset('b')]}
        targetHeight={360}
        selectedIds={new Set()}
        activeId={null}
        onActivate={() => undefined}
        onOpen={() => undefined}
        onSizeChange={onSizeChange}
      />
    </div>)
    const maxGrid = max.container.querySelector('.justified-grid') as HTMLElement
    fireEvent.wheel(max.container.querySelector('.host') as HTMLElement, { deltaY: -120, ctrlKey: true })
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(maxGrid.style.transform).toBe('')
  })
})
