import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppDatabase } from '../src/main/database'
import { ThumbnailService } from '../src/main/thumbnails'

describe('ThumbnailService', () => {
  let directory: string
  let db: AppDatabase
  let assetId: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'album-thumb-'))
    db = new AppDatabase(':memory:')
    db.migrate()
    const root = db.createSourceRoot(directory)
    const source = join(directory, 'large.png')
    await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#557799' } }).png().toFile(source)
    assetId = db.upsertMediaLocation({
      rootId: root.id,
      absolutePath: source,
      relativePath: 'large.png',
      contentHash: 'thumbnail-source',
      sizeBytes: 100,
      modifiedAt: 1,
      width: 2400,
      height: 1600,
      format: 'png',
      orientation: 'landscape'
    }).assetId
  })

  afterEach(async () => {
    db.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('evicts old cache files when the configured size limit is exceeded', async () => {
    const service = new ThumbnailService(db, join(directory, 'cache'))
    const thumbnail = await service.getThumbnail(assetId, 320)

    const result = await service.enforceCacheLimit(1)

    expect(result.deleted).toBeGreaterThan(0)
    await expect(stat(thumbnail)).rejects.toThrow()
  })
  it('creates and reuses a bounded WebP thumbnail', async () => {
    const service = new ThumbnailService(db, join(directory, 'cache'))
    const first = await service.getThumbnail(assetId, 320)
    const second = await service.getThumbnail(assetId, 320)
    const metadata = await sharp(await readFile(first)).metadata()
    const file = await stat(first)

    expect(first).toBe(second)
    expect(file.size).toBeGreaterThan(0)
    expect(metadata.format).toBe('webp')
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBeLessThanOrEqual(320)
  })

  it('renders RAW thumbnails from the embedded preview, not the TIFF thumbnail', async () => {
    const rawPath = join(directory, 'DSC_0009.nef')
    const small = await sharp({ create: { width: 160, height: 120, channels: 3, background: '#101010' } }).jpeg({ quality: 70 }).toBuffer()
    const preview = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#446699' } }).jpeg({ quality: 70 }).toBuffer()
    const padding = Buffer.alloc(4096, 3)
    await writeFile(rawPath, Buffer.concat([padding, small, padding, preview, padding]))
    const root = db.listSourceRoots()[0]
    const rawAssetId = db.upsertMediaLocation({
      rootId: root.id,
      absolutePath: rawPath,
      relativePath: 'DSC_0009.nef',
      contentHash: 'raw-source',
      sizeBytes: 100,
      modifiedAt: 1,
      width: 2400,
      height: 1600,
      format: 'nef',
      orientation: 'landscape'
    }).assetId

    const service = new ThumbnailService(db, join(directory, 'cache'))
    const thumbnail = await service.getThumbnail(rawAssetId, 320)
    const metadata = await sharp(await readFile(thumbnail)).metadata()

    expect(metadata.format).toBe('webp')
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBe(320)
  })
})
