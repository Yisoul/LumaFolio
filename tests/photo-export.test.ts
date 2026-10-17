import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import exifr from 'exifr'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppDatabase } from '../src/main/database'
import { exportPhotos } from '../src/main/photo-export'

describe('exportPhotos', () => {
  let directory: string
  let target: string
  let db: AppDatabase
  let rootId: string
  let hashCounter = 0

  beforeEach(async () => {
    hashCounter = 0
    directory = await mkdtemp(join(tmpdir(), 'luma-export-'))
    target = join(directory, 'out')
    db = new AppDatabase(':memory:')
    db.migrate()
    rootId = db.createSourceRoot(directory).id
  })

  afterEach(async () => {
    db.close()
    await rm(directory, { recursive: true, force: true })
  })

  async function addPhoto(buffer: Buffer, name: string, width: number, height: number): Promise<string> {
    hashCounter += 1
    const folder = join(directory, `src-${hashCounter}`)
    await mkdir(folder, { recursive: true })
    const file = join(folder, name)
    await writeFile(file, buffer)
    return db.upsertMediaLocation({
      rootId, absolutePath: file, relativePath: name, contentHash: `hash-${name}-${hashCounter}`, sizeBytes: buffer.length,
      modifiedAt: 1, width, height, format: 'jpeg', orientation: 'landscape'
    }).assetId
  }

  it('copies originals byte for byte and avoids duplicate names', async () => {
    const first = await sharp({ create: { width: 120, height: 80, channels: 3, background: '#336699' } }).jpeg().toBuffer()
    const second = await sharp({ create: { width: 120, height: 80, channels: 3, background: '#993366' } }).jpeg().toBuffer()
    const firstId = await addPhoto(first, 'shot.jpg', 120, 80)
    const secondId = await addPhoto(second, 'shot.jpg', 120, 80)

    const result = await exportPhotos(db, { assetIds: [firstId, secondId], directory: target, mode: 'original' })

    expect(result).toEqual({ exported: 2, failed: 0, skipped: 0 })
    expect((await readdir(target)).sort()).toEqual(['shot (2).jpg', 'shot.jpg'])
    expect(await readFile(join(target, 'shot.jpg'))).toEqual(first)
  })

  it('exports JPEG with a 2560 long edge and keeps EXIF', async () => {
    const source = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#446688' } })
      .withMetadata({ exif: { IFD0: { Make: 'TestCam' } } })
      .jpeg()
      .toBuffer()
    const assetId = await addPhoto(source, 'big.jpg', 4000, 3000)

    const result = await exportPhotos(db, { assetIds: [assetId], directory: target, mode: 'jpeg' })

    expect(result.exported).toBe(1)
    const exported = await sharp(join(target, 'big.jpg')).metadata()
    expect(exported.format).toBe('jpeg')
    expect([exported.width, exported.height]).toEqual([2560, 1920])
    const parsed = await exifr.parse(join(target, 'big.jpg'))
    expect(parsed?.Make).toBe('TestCam')
  })

  it('skips photos whose original is missing', async () => {
    const assetId = db.upsertMediaLocation({
      rootId, absolutePath: join(directory, 'gone.jpg'), relativePath: 'gone.jpg', contentHash: 'gone',
      sizeBytes: 1, modifiedAt: 1, width: 100, height: 100, format: 'jpeg', orientation: 'landscape'
    }).assetId
    db.markRootLocationsMissing(rootId)

    const result = await exportPhotos(db, { assetIds: [assetId], directory: target, mode: 'original' })

    expect(result).toEqual({ exported: 0, failed: 0, skipped: 1 })
  })
})
