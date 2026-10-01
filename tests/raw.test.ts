import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RAW_EXTENSIONS, extractPreviewFromBuffer, extractRawPreview, findJpegCandidates, isRawFile, loadSourceForSharp } from '../src/main/raw'

async function jpeg(width: number, height: number, background: string): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background } }).jpeg({ quality: 70 }).toBuffer()
}

function padding(size: number, seed = 0): Buffer {
  const buffer = Buffer.alloc(size)
  for (let index = 0; index < size; index += 1) buffer[index] = (index * 31 + seed) % 251
  return buffer
}

/** 模拟相机 RAW：TIFF 头 + 小缩略图 + 大预览 + 后面的原始像素数据。 */
function fakeRawFile(small: Buffer, big: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from('II*\u0000\u0010\u0000\u0000\u0000', 'latin1'),
    padding(4096, 7),
    small,
    padding(2048, 11),
    big,
    padding(8192, 13)
  ])
}

describe('RAW 扩展名', () => {
  it('识别尼康和其它家的 RAW，并且不误判普通图片', () => {
    expect(isRawFile('D:\\photos\\DSC_0130.NEF')).toBe(true)
    expect(isRawFile('a/b/shot.nef')).toBe(true)
    expect(isRawFile('IMG_1234.CR3')).toBe(true)
    expect(isRawFile('DSC0001.ARW')).toBe(true)
    expect(isRawFile('sample.dng')).toBe(true)
    expect(isRawFile('cover.jpg')).toBe(false)
    expect(isRawFile('cover.png')).toBe(false)
    expect(RAW_EXTENSIONS.has('.nef')).toBe(true)
  })
})

describe('findJpegCandidates', () => {
  it('找出容器里每一段完整的 JPEG', async () => {
    const small = await jpeg(160, 120, '#aa3333')
    const big = await jpeg(600, 400, '#336699')
    const candidates = findJpegCandidates(fakeRawFile(small, big))

    expect(candidates).toHaveLength(2)
    expect(candidates.map((candidate) => candidate.end - candidate.start)).toEqual([small.length, big.length])
  })

  it('不会因为 APP1 里塞了缩略图就把大图提前截断', async () => {
    const small = await jpeg(120, 90, '#22aa55')
    const big = await jpeg(800, 600, '#ffee88')
    const segmentLength = Buffer.alloc(2)
    segmentLength.writeUInt16BE(small.length + 2)
    const withThumbnail = Buffer.concat([
      big.subarray(0, 2),
      Buffer.from([0xff, 0xe1]),
      segmentLength,
      small,
      big.subarray(2)
    ])

    const candidates = findJpegCandidates(withThumbnail)

    expect(candidates).toHaveLength(1)
    expect(candidates[0].start).toBe(0)
    expect(candidates[0].end).toBe(withThumbnail.length)
  })

  it('没有 JPEG 时返回空数组', () => {
    expect(findJpegCandidates(padding(4096))).toEqual([])
  })
})

describe('extractPreviewFromBuffer', () => {
  it('挑像素最多的那一段，而不是字节数最大的', async () => {
    const small = await jpeg(160, 120, '#aa3333')
    const big = await jpeg(600, 400, '#336699')
    const preview = await extractPreviewFromBuffer(fakeRawFile(small, big))

    expect(preview).not.toBeNull()
    expect([preview!.width, preview!.height]).toEqual([600, 400])
    const decoded = await sharp(preview!.buffer).metadata()
    expect(decoded.format).toBe('jpeg')
    expect(decoded.width).toBe(600)
  })

  it('内嵌数据里全是解不开的片段时返回 null', async () => {
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), padding(4096, 3), Buffer.from([0xff, 0xd9])])
    expect(await extractPreviewFromBuffer(broken)).toBeNull()
  })
})

describe('extractRawPreview', () => {
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'luma-raw-'))
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('直接从 RAW 文件里读出大预览', async () => {
    const path = join(directory, 'DSC_0001.NEF')
    await writeFile(path, fakeRawFile(await jpeg(160, 120, '#111111'), await jpeg(1200, 800, '#4488cc')))

    const preview = await extractRawPreview(path)

    expect([preview?.width, preview?.height]).toEqual([1200, 800])
  })

  it('普通图片不会被当成 RAW 处理', async () => {
    const path = join(directory, 'cover.jpg')
    await writeFile(path, await jpeg(300, 200, '#888888'))

    expect(await loadSourceForSharp(path)).toBe(path)
  })

  it('RAW 交给 sharp 之前会替换成内嵌预览', async () => {
    const path = join(directory, 'DSC_0002.nef')
    await writeFile(path, fakeRawFile(await jpeg(160, 120, '#111111'), await jpeg(900, 600, '#cc8844')))

    const source = await loadSourceForSharp(path)

    expect(Buffer.isBuffer(source)).toBe(true)
    expect(await sharp(source as Buffer).metadata()).toMatchObject({ width: 900, height: 600 })
  })
})
