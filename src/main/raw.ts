import { open, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import sharp from 'sharp'

/**
 * 各家 RAW 的常见扩展名。
 * 这里不解 RAW 像素（需要 libraw/dcraw 这类解码器），统一走文件里自带的 JPEG 预览：
 * 相机写入的预览通常是全尺寸或接近全尺寸（尼康 NEF 就是完整的 6000×4000），
 * 既能覆盖绝大多数型号，又不用额外依赖，也不会碰原图。
 */
export const RAW_EXTENSIONS = new Set([
  '.nef', '.nrw', // 尼康
  '.cr2', '.cr3', '.crw', // 佳能
  '.arw', '.srf', '.sr2', // 索尼
  '.dng', // Adobe / 手机 / 大疆
  '.raf', // 富士
  '.orf', // 奥林巴斯 / OM
  '.rw2', '.raw', '.rwl', // 松下 / 徕卡
  '.pef', // 宾得
  '.srw', // 三星
  '.3fr', '.fff', // 哈苏
  '.iiq', // 飞思
  '.mos', '.mrw', '.dcr', '.kdc', // 飞思 / 美能达 / 柯达
  '.x3f', // 适马
  '.gpr', // GoPro
  '.erf' // 爱普生
])

const DEFAULT_SCAN_LIMIT_BYTES = 48 * 1024 * 1024
const MAX_CANDIDATES = 16
/** 比手机 RAW 里的迷你缩略图还小的就不当作预览了。 */
const MIN_PREVIEW_EDGE = 256
const JPEG_START = Buffer.from([0xff, 0xd8, 0xff])

export function isRawFile(filePath: string): boolean {
  return RAW_EXTENSIONS.has(extname(filePath).toLowerCase())
}

export interface JpegCandidate {
  start: number
  end: number
}

export interface RawPreview {
  buffer: Buffer
  width: number
  height: number
}

/** 只读文件开头的一段：预览基本都在前半段，避免把几十 MB 的 RAW 全读进内存。 */
async function readHead(filePath: string, limit: number): Promise<Buffer> {
  const info = await stat(filePath)
  const size = Math.max(0, Math.min(info.size, limit))
  if (size === 0) return Buffer.alloc(0)
  const buffer = Buffer.allocUnsafe(size)
  const handle = await open(filePath, 'r')
  try {
    let offset = 0
    while (offset < size) {
      const { bytesRead } = await handle.read(buffer, offset, size - offset, offset)
      if (bytesRead <= 0) break
      offset += bytesRead
    }
    return offset === size ? buffer : buffer.subarray(0, offset)
  } finally {
    await handle.close()
  }
}

/**
 * 找出文件里所有完整的 JPEG 流。按 JPEG 段结构走，跳过 APP1 里塞的缩略图，
 * 否则一个内嵌小图就会把全尺寸预览提前截断。
 */
export function findJpegCandidates(buffer: Buffer, limit = 256): JpegCandidate[] {
  const candidates: JpegCandidate[] = []
  let index = 0
  while (index < buffer.length - 3 && candidates.length < limit) {
    const start = buffer.indexOf(JPEG_START, index)
    if (start < 0) break
    const end = findJpegEnd(buffer, start)
    if (end != null && end - start > 128) candidates.push({ start, end })
    index = end != null && end > start ? end : start + 3
  }
  return candidates
}

function findJpegEnd(buffer: Buffer, start: number): number | null {
  let position = start + 2
  while (position + 1 < buffer.length) {
    if (buffer[position] !== 0xff) {
      position += 1
      continue
    }
    const marker = buffer[position + 1]
    // 填充字节和独立标记（RSTn、TEM）没有长度字段。
    if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      position += 2
      continue
    }
    if (marker === 0xd8) {
      position += 2
      continue
    }
    if (marker === 0xd9) return position + 2
    if (position + 3 >= buffer.length) return null
    const length = buffer.readUInt16BE(position + 2)
    if (length < 2) return null
    if (marker === 0xda) {
      // 扫描段：长度之后再往后找真正的 EOI，跳过 FF00 填充和重启标记。
      position += 2 + length
      while (position + 1 < buffer.length) {
        if (buffer[position] !== 0xff) {
          position += 1
          continue
        }
        const next = buffer[position + 1]
        if (next === 0x00 || next === 0xff || (next >= 0xd0 && next <= 0xd7)) {
          position += 2
          continue
        }
        if (next === 0xd9) return position + 2
        break
      }
      continue
    }
    position += 2 + length
  }
  return null
}

/** 从 RAW 文件内容里挑出像素最多的内嵌 JPEG 预览。 */
export async function extractPreviewFromBuffer(buffer: Buffer): Promise<RawPreview | null> {
  const candidates = findJpegCandidates(buffer)
    .sort((left, right) => (right.end - right.start) - (left.end - left.start))
    .slice(0, MAX_CANDIDATES)
  let best: RawPreview | null = null
  for (const candidate of candidates) {
    const slice = buffer.subarray(candidate.start, candidate.end)
    try {
      const metadata = await sharp(slice, { failOn: 'none' }).metadata()
      const width = metadata.width ?? 0
      const height = metadata.height ?? 0
      if (Math.max(width, height) < MIN_PREVIEW_EDGE) continue
      if (best && width * height <= best.width * best.height) continue
      best = { buffer: Buffer.from(slice), width, height }
    } catch {
      // RAW 里也有长得像 JPEG 的其他数据，解不开就跳过。
    }
  }
  return best
}

export async function extractRawPreview(filePath: string, scanLimitBytes = DEFAULT_SCAN_LIMIT_BYTES): Promise<RawPreview | null> {
  const head = await readHead(filePath, scanLimitBytes)
  return extractPreviewFromBuffer(head)
}

/**
 * 交给 sharp 读取之前把 RAW 换成内嵌预览。返回 Buffer 时 sharp 直接解码预览，
 * 不用再落盘；普通图片原样返回路径。
 */
export async function loadSourceForSharp(filePath: string): Promise<string | Buffer> {
  if (!isRawFile(filePath)) return filePath
  try {
    const preview = await extractRawPreview(filePath)
    if (preview) return preview.buffer
  } catch {
    // 读不到就退回让 libvips 自己试（部分手机 DNG 只有 TIFF 里的小预览）。
  }
  return filePath
}
