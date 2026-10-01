import { describe, expect, it } from 'vitest'
import type { Album } from '../src/shared/types'
import { pickLatestTempAlbum } from '../src/renderer/src/temp-album'

function album(id: string, name: string, updatedAt: number): Album {
  return { id, name, coverAssetId: null, createdAt: updatedAt, updatedAt }
}

describe('pickLatestTempAlbum', () => {
  it('picks the most recently updated temp album', () => {
    const albums = [
      album('a', '临时选片 10-01 10:00', 100),
      album('b', '临时选片 10-01 15:30', 300),
      album('c', '临时选片 10-01 12:00', 200)
    ]
    expect(pickLatestTempAlbum(albums)?.id).toBe('b')
  })

  it('ignores albums that are not temp albums', () => {
    const albums = [album('a', '街拍', 100), album('b', '临时选片备份', 200)]
    expect(pickLatestTempAlbum(albums)).toBeNull()
  })

  it('returns null when there is no temp album', () => {
    expect(pickLatestTempAlbum([])).toBeNull()
    expect(pickLatestTempAlbum([album('a', '旅行', 1)])).toBeNull()
  })
})
