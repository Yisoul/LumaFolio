export interface JustifiedInput {
  id: string
  width: number
  height: number
}

export interface JustifiedRowItem {
  id: string
  width: number
}

export interface JustifiedRow {
  height: number
  items: JustifiedRowItem[]
}

export interface JustifiedLayout {
  rows: JustifiedRow[]
  height: number
}

export interface JustifiedOptions {
  containerWidth: number
  targetHeight: number
  gap?: number
  minHeight?: number
  maxHeight?: number
}

function aspectOf(item: JustifiedInput): number {
  if (!Number.isFinite(item.width) || !Number.isFinite(item.height) || item.width <= 0 || item.height <= 0) return 1
  return item.width / item.height
}

/**
 * 按原图宽高比排"对齐行"：同一行等高、宽度按比例、行宽铺满容器。
 * 最后一行为不完整行时保持目标行高，不拉伸。
 */
export function computeJustifiedRows(items: JustifiedInput[], options: JustifiedOptions): JustifiedLayout {
  const containerWidth = Math.max(1, options.containerWidth)
  const targetHeight = Math.max(1, options.targetHeight)
  const gap = Math.max(0, options.gap ?? 6)
  const minHeight = Math.max(1, options.minHeight ?? targetHeight * 0.5)
  const maxHeight = Math.max(minHeight, options.maxHeight ?? targetHeight * 1.5)

  const rows: JustifiedRow[] = []
  let pending: JustifiedInput[] = []
  let aspectSum = 0

  const flush = (stretch: boolean): void => {
    if (pending.length === 0) return
    const gaps = gap * (pending.length - 1)
    const fitted = stretch ? (containerWidth - gaps) / aspectSum : targetHeight
    // 单张照片（尤其是超宽全景）允许低于最小行高，否则会横向溢出容器。
    const lowerBound = pending.length === 1 ? 1 : minHeight
    const height = Math.round(Math.max(lowerBound, Math.min(maxHeight, fitted)))
    rows.push({
      height,
      items: pending.map((item) => ({ id: item.id, width: Math.round(aspectOf(item) * height) }))
    })
    pending = []
    aspectSum = 0
  }

  for (const item of items) {
    pending.push(item)
    aspectSum += aspectOf(item)
    if (aspectSum * targetHeight + gap * (pending.length - 1) >= containerWidth) flush(true)
  }
  flush(false)

  const height = rows.reduce((total, row) => total + row.height, 0) + Math.max(0, rows.length - 1) * gap
  return { rows, height }
}
