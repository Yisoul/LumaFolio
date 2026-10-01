import { useEffect } from 'react'
import type { MediaAssetSummary } from '../../shared/types'
import { formatCamera, formatDate, previewUrl, ratingStars } from './helpers'
import { useShortcut } from './shortcuts'

export interface LightboxProps {
  assets: MediaAssetSummary[]
  index: number
  onChangeIndex: (index: number) => void
  onClose: () => void
  marked?: Set<string>
  onToggleMark?: (asset: MediaAssetSummary) => void
  pendingMarkId?: string | null
}

/** 全屏看图：←→/↑↓ 翻页，空格或 Esc 退出，T 切换临时相册标记。 */
export default function Lightbox(props: LightboxProps) {
  const asset = props.assets[props.index] ?? null
  const marked = props.marked ?? new Set<string>()

  // 预加载相邻两张，翻页时不用等解码。
  useEffect(() => {
    for (const offset of [-1, 1]) {
      const neighbor = props.assets[props.index + offset]
      if (!neighbor || neighbor.missing) continue
      const image = new window.Image()
      image.decoding = 'async'
      image.src = previewUrl(neighbor.id, 2560)
    }
  }, [props.index, props.assets])

  const step = (delta: number) => {
    if (props.assets.length === 0) return
    const next = Math.min(props.assets.length - 1, Math.max(0, props.index + delta))
    if (next !== props.index) props.onChangeIndex(next)
  }

  useShortcut({ id: 'lightbox.close', keys: ['escape', 'space'], scope: 'lightbox', label: '关闭大图', run: props.onClose })
  useShortcut({ id: 'lightbox.next', keys: ['arrowright', 'arrowdown'], scope: 'lightbox', label: '下一张', run: () => step(1) })
  useShortcut({ id: 'lightbox.previous', keys: ['arrowleft', 'arrowup'], scope: 'lightbox', label: '上一张', run: () => step(-1) })
  useShortcut({
    id: 'lightbox.mark',
    keys: ['t'],
    scope: 'lightbox',
    label: '加入 / 移出临时相册',
    when: () => Boolean(asset && props.onToggleMark),
    run: () => { if (asset) props.onToggleMark?.(asset) }
  })

  if (!asset) return null

  return (
    <div className="lightbox" onClick={(event) => { if (event.target === event.currentTarget) props.onClose() }}>
      <button className="lightbox-close" onClick={props.onClose} aria-label="关闭大图">×</button>
      <button className="lightbox-nav previous" onClick={() => step(-1)} aria-label="上一张">‹</button>
      {asset.missing
        ? <div className="lightbox-missing">原图不可用</div>
        : <img className="lightbox-image" src={previewUrl(asset.id, 2560)} alt={fileName(asset.primaryPath)} />}
      <button className="lightbox-nav next" onClick={() => step(1)} aria-label="下一张">›</button>
      <div className="lightbox-counter">{props.index + 1} / {props.assets.length}</div>
      <div className="lightbox-info">
        <strong>{fileName(asset.primaryPath)}</strong>
        <span>{formatDate(asset.capturedAt)}</span>
        <span>{formatCamera(asset)}</span>
        <span>{asset.rating > 0 ? `${ratingStars(asset.rating)} 相机 ${asset.rating} 星` : '未评级'}</span>
        {props.onToggleMark && <button className="button secondary compact" onClick={() => props.onToggleMark?.(asset)} disabled={Boolean(props.pendingMarkId)}>
          {marked.has(asset.id) ? '移出临时相册（T）' : '加入临时相册（T）'}
        </button>}
        <span className="lightbox-hint">←→ 翻页 · 空格 / Esc 退出</span>
      </div>
    </div>
  )
}

function fileName(path: string | null): string {
  if (!path) return '文件缺失'
  return path.split(/[\\/]/).pop() || path
}
