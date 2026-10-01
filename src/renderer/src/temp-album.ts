import type { Album } from '../../shared/types'

/** 临时相册靠这个名字前缀识别，改名后就不再被当成临时相册。 */
export const TEMP_ALBUM_PREFIX = '临时选片 '

/** 取最近更新的那个临时相册；没有就返回 null。 */
export function pickLatestTempAlbum(albums: Album[]): Album | null {
  const candidates = albums.filter((album) => album.name.startsWith(TEMP_ALBUM_PREFIX))
  if (candidates.length === 0) return null
  return candidates.reduce((latest, album) => (album.updatedAt > latest.updatedAt ? album : latest))
}
