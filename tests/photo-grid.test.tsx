/** @vitest-environment jsdom */
import React from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import JustifiedPhotoGrid from '../src/renderer/src/JustifiedPhotoGrid'
import type { MediaAssetSummary } from '../src/shared/types'

afterEach(cleanup)

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

    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }), true)
  })

  it('treats shift click on the image as multi selection too', () => {
    const onActivate = vi.fn()
    const { container } = render(<JustifiedPhotoGrid
      photos={[asset('a')]}
      targetHeight={200}
      selectedIds={new Set()}
      activeId={null}
      onActivate={onActivate}
      onOpen={() => undefined}
    />)

    fireEvent.click(container.querySelector('.tile-image')!, { shiftKey: true })

    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), true)
  })
})
