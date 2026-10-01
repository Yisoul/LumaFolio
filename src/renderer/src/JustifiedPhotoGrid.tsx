import { useEffect, useMemo, useRef, useState } from 'react'
import type { MediaAssetSummary } from '../../shared/types'
import { computeJustifiedRows } from './grid'
import { fileName, ratingStars, thumbnailUrl } from './helpers'
import { IconCheck, IconStar } from './icons'

export interface JustifiedPhotoGridProps {
  photos: MediaAssetSummary[]
  /** 目标行高，来自设置里的缩略图尺寸。 */
  targetHeight: number
  selectedIds: Set<string>
  activeId: string | null
  onActivate: (asset: MediaAssetSummary, additive: boolean) => void
  onOpen: (asset: MediaAssetSummary) => void
  onContextMenu?: (event: React.MouseEvent, asset: MediaAssetSummary) => void
  /** 鼠标移到某张照片上时回调，用来联动高亮左侧文件夹。 */
  onHover?: (asset: MediaAssetSummary | null) => void
  /** 任何会影响可用宽度的变化（面板开关、栏宽、界面缩放）都要重新量一次。 */
  remeasureKey?: string
  /** Ctrl/⌘ + 滚轮调整缩略图大小；手势期间只做 transform 预览，松手才真正重排。 */
  onSizeChange?: (size: number) => void
  minSize?: number
  maxSize?: number
}

export default function JustifiedPhotoGrid(props: JustifiedPhotoGridProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const zoomRef = useRef({ scale: 1, frame: 0, idle: 0 })
  const minSize = props.minSize ?? 120
  const maxSize = props.maxSize ?? 520
  // 手势期间父组件可能重渲染，这里用 ref 存最新值，监听只挂一次，避免提交被清理掉。
  const sizeChangeRef = useRef(props.onSizeChange)
  const targetHeightRef = useRef(props.targetHeight)
  sizeChangeRef.current = props.onSizeChange
  targetHeightRef.current = props.targetHeight
  const boundsRef = useRef({ min: minSize, max: maxSize })
  boundsRef.current = { min: minSize, max: maxSize }

  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const update = () => setContainerWidth(node.clientWidth)
    update()
    // 页面缩放（Electron zoom）不一定触发 ResizeObserver，这里再挂一次 resize。
    window.addEventListener('resize', update)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => {
      window.removeEventListener('resize', update)
      observer.disconnect()
    }
  }, [props.remeasureKey])

  // 面板开关/栏宽变化后补测一次，避免用旧的容器宽度排出过宽的行。
  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const frame = window.requestAnimationFrame(() => setContainerWidth(node.clientWidth))
    return () => window.cancelAnimationFrame(frame)
  }, [props.remeasureKey, props.photos.length])

  const assetById = useMemo(() => new Map(props.photos.map((photo) => [photo.id, photo])), [props.photos])
  const layout = useMemo(() => computeJustifiedRows(
    props.photos.map((photo) => ({ id: photo.id, width: photo.width, height: photo.height })),
    { containerWidth: containerWidth || 960, targetHeight: props.targetHeight, gap: 6 }
  ), [containerWidth, props.photos, props.targetHeight])

  useEffect(() => {
    const node = gridRef.current
    if (!node) return

    const paint = () => {
      zoomRef.current.frame = 0
      const { scale } = zoomRef.current
      node.style.transformOrigin = 'top left'
      node.style.transform = scale === 1 ? '' : `scale(${scale})`
    }
    const commit = () => {
      zoomRef.current.idle = 0
      const { scale } = zoomRef.current
      zoomRef.current.scale = 1
      node.style.transform = ''
      if (Math.abs(scale - 1) < 0.001) return
      const { min, max } = boundsRef.current
      sizeChangeRef.current?.(Math.max(min, Math.min(max, Math.round(targetHeightRef.current * scale))))
    }
    const onWheel = (event: WheelEvent) => {
      if (!sizeChangeRef.current) return
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const factor = event.deltaY > 0 ? 0.92 : 1.08
      zoomRef.current.scale = Math.max(0.4, Math.min(2.5, zoomRef.current.scale * factor))
      if (!zoomRef.current.frame) zoomRef.current.frame = window.requestAnimationFrame(paint)
      if (zoomRef.current.idle) window.clearTimeout(zoomRef.current.idle)
      zoomRef.current.idle = window.setTimeout(commit, 140)
    }

    // 挂在滚动容器上，鼠标落在图片区任何位置（包括行末空白）都能缩放。
    const target = node.parentElement ?? node
    target.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      target.removeEventListener('wheel', onWheel)
      if (zoomRef.current.frame) window.cancelAnimationFrame(zoomRef.current.frame)
      if (zoomRef.current.idle) window.clearTimeout(zoomRef.current.idle)
      zoomRef.current.frame = 0
      zoomRef.current.idle = 0
      zoomRef.current.scale = 1
      node.style.transform = ''
    }
  }, [])

  return (
    <div className="justified-grid" ref={(node) => { containerRef.current = node; gridRef.current = node }}>
      {layout.rows.map((row, rowIndex) => (
        <div className="justified-row" key={rowIndex}>
          {row.items.map((item) => {
            const asset = assetById.get(item.id)
            if (!asset) return null
            return (
              <PhotoTile
                key={asset.id}
                asset={asset}
                width={item.width}
                height={row.height}
                selected={props.selectedIds.has(asset.id)}
                active={props.activeId === asset.id}
                onActivate={props.onActivate}
                onOpen={props.onOpen}
                onContextMenu={props.onContextMenu}
                onHover={props.onHover}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}

function PhotoTile(props: {
  asset: MediaAssetSummary
  width: number
  height: number
  selected: boolean
  active: boolean
  onActivate: (asset: MediaAssetSummary, additive: boolean) => void
  onOpen: (asset: MediaAssetSummary) => void
  onContextMenu?: (event: React.MouseEvent, asset: MediaAssetSummary) => void
  onHover?: (asset: MediaAssetSummary | null) => void
}) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [props.asset.id])

  const unavailable = props.asset.missing || failed
  return (
    <figure
      className={`tile ${props.selected ? 'selected' : ''} ${props.active ? 'active' : ''}`}
      style={{ width: `${props.width}px` }}
      onMouseEnter={() => props.onHover?.(props.asset)}
      onMouseLeave={() => props.onHover?.(null)}
    >
      <button
        type="button"
        className="tile-image"
        style={{ height: `${props.height}px` }}
        onClick={(event) => props.onActivate(props.asset, event.ctrlKey || event.metaKey || event.shiftKey)}
        onDoubleClick={() => props.onOpen(props.asset)}
        onContextMenu={(event) => { if (props.onContextMenu) { event.preventDefault(); props.onContextMenu(event, props.asset) } }}
        title={fileName(props.asset.primaryPath)}
      >
        {unavailable
          ? <span className="tile-placeholder">原图不可用</span>
          : <img
            src={thumbnailUrl(props.asset.id, 480)}
            alt={fileName(props.asset.primaryPath)}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
          />}
        {props.asset.favorite && <span className="tile-favorite" title="已收藏"><IconStar size={14} filled /></span>}
        {props.asset.locationCount > 1 && <span className="tile-badge">{props.asset.locationCount} 份副本</span>}
      </button>
      <button
        type="button"
        className="tile-check"
        title="加入多选（也可按 Ctrl / Shift 点击图片）"
        aria-label={props.selected ? '取消选择' : '加入多选'}
        onClick={(event) => { event.stopPropagation(); props.onActivate(props.asset, true) }}
      >
        {props.selected ? <IconCheck size={12} /> : null}
      </button>
      <figcaption className="tile-caption">
        <span className="tile-name">{fileName(props.asset.primaryPath)}</span>
        {props.asset.rating > 0 && <span className="tile-stars" title={`相机内评星 ${props.asset.rating} 星`}>{ratingStars(props.asset.rating)}</span>}
      </figcaption>
    </figure>
  )
}
