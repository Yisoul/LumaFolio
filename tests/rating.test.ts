import { mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppDatabase } from '../src/main/database'
import { CURRENT_METADATA_VERSION, LibraryScanner, normalizeRating } from '../src/main/scanner'

describe('normalizeRating', () => {
  it('keeps a rating written by the camera or by Windows', () => {
    expect(normalizeRating({ Rating: 4 })).toBe(4)
  })

  it('takes the larger value when EXIF and XMP disagree', () => {
    expect(normalizeRating({ Rating: 2, RatingPercent: 100 })).toBe(5)
  })

  it('falls back to RatingPercent when Rating is missing', () => {
    expect(normalizeRating({ RatingPercent: 60 })).toBe(3)
  })

  it('clamps out-of-range values and treats junk as unrated', () => {
    expect(normalizeRating({ Rating: 9 })).toBe(5)
    expect(normalizeRating({ Rating: -3 })).toBe(0)
    expect(normalizeRating({ Rating: '不是数字' })).toBe(0)
    expect(normalizeRating({})).toBe(0)
  })
})

describe('library star rating', () => {
  let rootDir: string
  let db: AppDatabase
  let scanner: LibraryScanner
  let baseJpeg: Buffer

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'album-studio-rating-'))
    db = new AppDatabase(':memory:')
    db.migrate()
    scanner = new LibraryScanner(db)
    baseJpeg = await sharp({ create: { width: 240, height: 160, channels: 3, background: '#7b8fa1' } }).jpeg().toBuffer()
  })

  afterEach(async () => {
    db.close()
    await rm(rootDir, { recursive: true, force: true })
  })

  it('reads xmp:Rating while indexing and filters by it', async () => {
    const ratedPath = join(rootDir, 'rated.jpg')
    const plainPath = join(rootDir, 'plain.jpg')
    const fivePath = join(rootDir, 'five.jpg')
    await writeFile(ratedPath, withXmpRating(baseJpeg, 4))
    await writeFile(fivePath, withXmpRating(baseJpeg, 5))
    await writeFile(plainPath, baseJpeg)

    const source = db.createSourceRoot(rootDir)
    await scanner.scanRoot(source)

    const rated = db.getLocationByPath(ratedPath)!
    expect(db.getAsset(rated.assetId)!.rating).toBe(4)
    const five = db.getLocationByPath(fivePath)!
    expect(db.getAsset(five.assetId)!.rating).toBe(5)
    const plain = db.getLocationByPath(plainPath)!
    expect(db.getAsset(plain.assetId)!.rating).toBe(0)

    expect(db.searchAssets({ ratingMin: 3, limit: 10, offset: 0 }).total).toBe(2)
    expect(db.searchAssets({ ratingMin: 5, limit: 10, offset: 0 }).total).toBe(1)
    expect(db.searchAssets({ ratingMin: 0, ratingMax: 0, limit: 10, offset: 0 }).total).toBe(1)
    expect(db.searchAssets({ limit: 10, offset: 0, sort: 'rating_desc' }).items.map((item) => item.rating)).toEqual([5, 4, 0])
  })

  it('refreshes stale metadata without re-hashing unchanged files', async () => {
    const filePath = join(rootDir, 'upgraded.jpg')
    const first = withXmpRating(baseJpeg, 4)
    const second = withXmpRating(baseJpeg, 5)
    expect(second.length).toBe(first.length)
    await writeFile(filePath, first)
    const source = db.createSourceRoot(rootDir)
    await scanner.scanRoot(source)

    const location = db.getLocationByPath(filePath)!
    const originalHash = db.getAsset(location.assetId)!.contentHash
    const originalStat = await stat(filePath)

    // 模拟升级前建立的索引：文件被替换成同样大小、同样 mtime 的新内容。
    await writeFile(filePath, second)
    await utimes(filePath, originalStat.atime, originalStat.mtime)
    db.markLocationMetadataStale(location.id)
    expect(db.getLocation(location.id)!.metadataVersion).toBe(0)

    await scanner.scanRoot(source)

    const refreshed = db.getLocationByPath(filePath)!
    expect(refreshed.metadataVersion).toBe(CURRENT_METADATA_VERSION)
    expect(db.getAsset(refreshed.assetId)!.rating).toBe(5)
    expect(db.getAsset(refreshed.assetId)!.contentHash).toBe(originalHash)
  })
})

/** 在 SOI 之后插入一段 XMP APP1，内容长度固定，方便构造同尺寸文件。 */
function withXmpRating(jpeg: Buffer, rating: number): Buffer {
  const padding = ' '.repeat(600)
  const xml = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>`
    + `<x:xmpmeta xmlns:x="adobe:ns:meta/">`
    + `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">`
    + `<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmp:Rating="${rating}"/>`
    + padding
    + `</rdf:RDF></x:xmpmeta><?xpacket end="w"?>`
  const header = Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'latin1')
  const body = Buffer.from(xml, 'utf8')
  const length = header.length + body.length + 2
  const segment = Buffer.concat([Buffer.from([0xff, 0xe1, (length >> 8) & 0xff, length & 0xff]), header, body])
  return Buffer.concat([jpeg.subarray(0, 2), segment, jpeg.subarray(2)])
}
