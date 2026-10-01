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
}

export default function JustifiedPhotoGrid(props: JustifiedPhotoGridProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const update = () => setContainerWidth(node.clientWidth)
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const assetById = useMemo(() => new Map(props.photos.map((photo) => [photo.id, photo])), [props.photos])
  const layout = useMemo(() => computeJustifiedRows(
    props.photos.map((photo) => ({ id: photo.id, width: photo.width, height: photo.height })),
    { containerWidth: containerWidth || 960, targetHeight: props.targetHeight, gap: 6 }
  ), [containerWidth, props.photos, props.targetHeight])

  return (
    <div className="justified-grid" ref={containerRef}>
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
