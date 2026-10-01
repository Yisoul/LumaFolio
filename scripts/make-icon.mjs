// 从 build/icon.svg 生成 Windows 图标：build/icon.png 和多尺寸 build/icon.ico。
// 用法：node scripts/make-icon.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const buildDirectory = join(root, 'build')
const svg = await readFile(join(buildDirectory, 'icon.svg'))

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

async function render(size) {
  return sharp(svg, { density: 384 }).resize(size, size, { fit: 'contain' }).png({ compressionLevel: 9 }).toBuffer()
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
await writeFile(join(buildDirectory, 'icon.png'), await render(1024))
await writeFile(join(buildDirectory, 'icon.ico'), buildIco(sizes))
console.log(`icon.png 与 icon.ico 已生成（${ICO_SIZES.join(', ')}）`)
