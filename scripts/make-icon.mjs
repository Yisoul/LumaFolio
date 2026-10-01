// 从 build/icon-source.png 生成 Windows 图标：build/icon.png 和多尺寸 build/icon.ico。
// 用法：node scripts/make-icon.mjs
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const buildDirectory = join(root, 'build')
const sourcePng = join(buildDirectory, 'icon-source.png')

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
const ICON_SIZE = 1024
const CORNER_RADIUS_RATIO = 0.225
/** 和所在行/列的背景参考差多少才算"图块本体"，用来跳过外发光和投影。 */
const TILE_DIFF_THRESHOLD = 14

/** 圆角方形遮罩：让图标外围透明，贴到浅色背景上也不露出深色边。 */
function roundedMask(size) {
  const radius = Math.round(size * CORNER_RADIUS_RATIO)
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#ffffff"/></svg>`)
}

/** 裁掉画布上的深色留白，只保留中间那块圆角图块。 */
async function trimSource() {
  const { data, info } = await sharp(sourcePng).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  // 背景是竖向渐变，逐像素和角落比色不可靠：
  // 用每一行自己的左右边缘像素当该行的背景参考，再看中间有多少像素明显不同。
  const rowHits = new Array(info.height).fill(0)
  const columnHits = new Array(info.width).fill(0)
  for (let y = 0; y < info.height; y += 1) {
    const leftIndex = (y * info.width) * 4
    const rightIndex = (y * info.width + info.width - 1) * 4
    const rowBackground = [
      (data[leftIndex] + data[rightIndex]) / 2,
      (data[leftIndex + 1] + data[rightIndex + 1]) / 2,
      (data[leftIndex + 2] + data[rightIndex + 2]) / 2
    ]
    for (let x = 0; x < info.width; x += 1) {
      const index = (y * info.width + x) * 4
      if (data[index + 3] < 12) continue
      const diff = Math.max(
        Math.abs(data[index] - rowBackground[0]),
        Math.abs(data[index + 1] - rowBackground[1]),
        Math.abs(data[index + 2] - rowBackground[2])
      )
      if (diff <= TILE_DIFF_THRESHOLD) continue
      rowHits[y] += 1
    }
  }
  const rowThreshold = info.width * 0.25
  const minY = rowHits.findIndex((hits) => hits >= rowThreshold)
  const maxY = rowHits.findLastIndex((hits) => hits >= rowThreshold)

  // 列方向同理，用每一列自己的上下边缘像素当参考。
  for (let x = 0; x < info.width; x += 1) {
    const topIndex = x * 4
    const bottomIndex = ((info.height - 1) * info.width + x) * 4
    const columnBackground = [
      (data[topIndex] + data[bottomIndex]) / 2,
      (data[topIndex + 1] + data[bottomIndex + 1]) / 2,
      (data[topIndex + 2] + data[bottomIndex + 2]) / 2
    ]
    for (let y = 0; y < info.height; y += 1) {
      const index = (y * info.width + x) * 4
      if (data[index + 3] < 12) continue
      const diff = Math.max(
        Math.abs(data[index] - columnBackground[0]),
        Math.abs(data[index + 1] - columnBackground[1]),
        Math.abs(data[index + 2] - columnBackground[2])
      )
      if (diff <= TILE_DIFF_THRESHOLD) continue
      columnHits[x] += 1
    }
  }
  const columnThreshold = info.height * 0.25
  const minX = columnHits.findIndex((hits) => hits >= columnThreshold)
  const maxX = columnHits.findLastIndex((hits) => hits >= columnThreshold)
  if (minX < 0 || minY < 0 || maxX < minX || maxY < minY) return sharp(sourcePng).png().toBuffer()

  const boxSize = Math.min(info.width, info.height, Math.max(maxX - minX + 1, maxY - minY + 1))
  const left = Math.max(0, Math.min(info.width - boxSize, Math.round(minX - (boxSize - (maxX - minX + 1)) / 2)))
  const top = Math.max(0, Math.min(info.height - boxSize, Math.round(minY - (boxSize - (maxY - minY + 1)) / 2)))
  console.log(`裁切图块：${boxSize}×${boxSize} @ (${left}, ${top})，源图 ${info.width}×${info.height}`)
  return sharp(sourcePng).extract({ left, top, width: boxSize, height: boxSize }).png().toBuffer()
}

const source = await trimSource()

async function render(size) {
  const trimmed = await sharp(source).resize(size, size, { fit: 'cover' }).png().toBuffer()
  return sharp(trimmed)
    .composite([{ input: roundedMask(size), blend: 'dest-in' }])
    .png({ compressionLevel: 9 })
    .toBuffer()
}

function buildIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  const directory = Buffer.alloc(images.length * 16)
  let offset = 6 + directory.length
  images.forEach(({ size, data }, index) => {
    const entry = index * 16
    directory.writeUInt8(size >= 256 ? 0 : size, entry)
    directory.writeUInt8(size >= 256 ? 0 : size, entry + 1)
    directory.writeUInt8(0, entry + 2)
    directory.writeUInt8(0, entry + 3)
    directory.writeUInt16LE(1, entry + 4)
    directory.writeUInt16LE(32, entry + 6)
    directory.writeUInt32LE(data.length, entry + 8)
    directory.writeUInt32LE(offset, entry + 12)
    offset += data.length
  })

  return Buffer.concat([header, directory, ...images.map((image) => image.data)])
}

await mkdir(buildDirectory, { recursive: true })
const sizes = await Promise.all(ICO_SIZES.map(async (size) => ({ size, data: await render(size) })))
await writeFile(join(buildDirectory, 'icon.png'), await render(ICON_SIZE))
await writeFile(join(buildDirectory, 'icon.ico'), buildIco(sizes))
console.log(`icon.png 与 icon.ico 已生成（${ICO_SIZES.join(', ')}）`)
