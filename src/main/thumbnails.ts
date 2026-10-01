import { mkdir, readdir, rename, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import type { AppDatabase } from './database'
import { loadSourceForSharp } from './raw'

export class ThumbnailService {
  private readonly pending = new Map<string, Promise<string>>()
  private active = 0
  private readonly queue: Array<() => void> = []
  /** 同时最多生成 4 张，避免快速滚动时几十张缩略图一起抢 CPU 造成卡顿。 */
  private readonly maxConcurrent = 4

  constructor(
    private readonly db: AppDatabase,
    private readonly cacheDirectory: string
  ) {}

  getThumbnail(assetId: string, maxSize = 320): Promise<string> {
    return this.getCachedImage(assetId, maxSize, 78)
  }

  getPreview(assetId: string, maxSize = 1600): Promise<string> {
    return this.getCachedImage(assetId, maxSize, 86)
  }

  async enforceCacheLimit(maxBytes: number): Promise<{ deleted: number; freedBytes: number }> {
    let entries: Array<{ path: string; size: number; modifiedAt: number }>
    try {
      const names = await readdir(this.cacheDirectory)
      entries = await Promise.all(names.filter((name) => name.endsWith('.webp')).map(async (name) => {
        const path = join(this.cacheDirectory, name)
        const info = await stat(path)
        return { path, size: info.size, modifiedAt: info.mtimeMs }
      }))
    } catch {
      return { deleted: 0, freedBytes: 0 }
    }

    let total = entries.reduce((sum, entry) => sum + entry.size, 0)
    let deleted = 0
    let freedBytes = 0
    for (const entry of entries.sort((left, right) => left.modifiedAt - right.modifiedAt)) {
      if (total <= Math.max(0, maxBytes)) break
      await unlink(entry.path).catch(() => undefined)
      total -= entry.size
      freedBytes += entry.size
      deleted += 1
    }
    return { deleted, freedBytes }
  }
  private getCachedImage(assetId: string, maxSize: number, quality: number): Promise<string> {
    const key = `${assetId}:${maxSize}`
    const existing = this.pending.get(key)
    if (existing) return existing
    const task = this.generate(assetId, maxSize, quality).finally(() => this.pending.delete(key))
    this.pending.set(key, task)
    return task
  }

  private async generate(assetId: string, maxSize: number, quality: number): Promise<string> {
    const asset = this.db.getAsset(assetId)
    const location = this.db.getPreferredLocation(assetId)
    if (!asset || !location) throw new Error('照片文件不可用')

    await mkdir(this.cacheDirectory, { recursive: true })
    const safeSize = Math.max(64, Math.min(4096, Math.round(maxSize)))
    const cachePath = join(this.cacheDirectory, `${assetId}_${asset.contentHash.slice(0, 12)}_${safeSize}.webp`)
    try {
      const info = await stat(cachePath)
      if (info.size > 0) return cachePath
    } catch {
      // Cache miss.
    }

    return this.withSlot(() => this.renderToCache(location.absolutePath, cachePath, safeSize, quality))
  }

  private async withSlot<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.queue.push(resolve))
    }
    this.active += 1
    try {
      return await task()
    } finally {
      this.active -= 1
      this.queue.shift()?.()
    }
  }

  private async renderToCache(sourcePath: string, cachePath: string, safeSize: number, quality: number): Promise<string> {
    const temporaryPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`
    // 大图只求快，缩略图才值得多花点编码时间换体积。
    const effort = safeSize >= 1280 ? 2 : 4
    try {
      // RAW 先换成文件里内嵌的 JPEG 预览，sharp 本身解不了 RAW 像素。
      const source = await loadSourceForSharp(sourcePath)
      await sharp(source, { failOn: 'none' })
        .rotate()
        .resize({ width: safeSize, height: safeSize, fit: 'inside', withoutEnlargement: true })
        .webp({ quality, effort })
        .toFile(temporaryPath)
      await rename(temporaryPath, cachePath)
      return cachePath
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined)
      throw error
    }
  }
}
