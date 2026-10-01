import { useEffect, useRef, useState } from 'react'
import type { Orientation, SearchFilters, SearchSort } from '../../shared/types'
import { RATING_FILTER_OPTIONS, ratingFilterPatch, ratingFilterValue } from './helpers'
import { IconChevronDown, IconClose } from './icons'

type FilterState = Omit<SearchFilters, 'limit' | 'offset'>

interface FilterChipsProps {
  filters: FilterState
  onChange: (patch: Partial<FilterState>) => void
  onClear: () => void
}

const ORIENTATIONS: Array<[Orientation | '', string]> = [['', '全部方向'], ['landscape', '横图'], ['portrait', '竖图'], ['square', '方图']]
const SORTS: Array<[SearchSort, string]> = [
  ['captured_desc', '拍摄时间 · 新到旧'],
  ['captured_asc', '拍摄时间 · 旧到新'],
  ['added_desc', '导入时间 · 新到旧'],
  ['added_asc', '导入时间 · 旧到新'],
  ['rating_desc', '星级 · 高到低'],
  ['filename_asc', '文件名 · A-Z'],
  ['filename_desc', '文件名 · Z-A']
]

export default function FilterChips(props: FilterChipsProps) {
  const [open, setOpen] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(null) }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])

  const { filters } = props
  const ratingValue = ratingFilterValue(filters)
  const activeCount = [
    filters.orientation, ratingValue, filters.favorite, filters.cameraModel, filters.lens,
    filters.capturedFrom, filters.capturedTo
  ].filter(Boolean).length

  const chip = (key: string, label: string, active: boolean, body: React.ReactNode) => (
    <div className="chip-wrap" key={key}>
      <button
        type="button"
        className={`chip ${active ? 'active' : ''}`}
        onClick={() => setOpen(open === key ? null : key)}
        aria-expanded={open === key}
      >
        {label}
        <IconChevronDown size={12} />
      </button>
      {open === key && <div className="chip-popover" role="dialog">{body}</div>}
    </div>
  )

  const optionList = (options: Array<[string, string]>, current: string, apply: (value: string) => void) => (
    <div className="chip-options">
      {options.map(([value, label]) => (
        <button key={value} type="button" className={current === value ? 'active' : ''} onClick={() => { apply(value); setOpen(null) }}>{label}</button>
      ))}
    </div>
  )

  return (
    <div className="filter-chips" ref={rootRef}>
      {chip('orientation', filters.orientation ? ORIENTATIONS.find(([value]) => value === filters.orientation)?.[1] ?? '方向' : '方向',
        Boolean(filters.orientation),
        optionList(ORIENTATIONS as Array<[string, string]>, filters.orientation ?? '', (value) => props.onChange({ orientation: (value || undefined) as Orientation | undefined })))}

      {chip('rating', ratingValue ? RATING_FILTER_OPTIONS.find((option) => option.value === ratingValue)?.label ?? '星级' : '星级',
        Boolean(ratingValue),
        optionList(RATING_FILTER_OPTIONS.map((option) => [option.value, option.label]), ratingValue, (value) => props.onChange(ratingFilterPatch(value))))}

      {chip('favorite', '收藏', Boolean(filters.favorite), (
        <div className="chip-options">
          <button type="button" className={filters.favorite ? 'active' : ''} onClick={() => { props.onChange({ favorite: filters.favorite ? undefined : true }); setOpen(null) }}>仅看已收藏</button>
        </div>
      ))}

      {chip('camera', filters.cameraModel ? `相机 · ${filters.cameraModel}` : '相机', Boolean(filters.cameraModel), (
        <input
          className="chip-input"
          autoFocus
          placeholder="相机品牌或型号，支持中英文"
          defaultValue={filters.cameraModel ?? ''}
          onKeyDown={(event) => { if (event.key === 'Enter') { props.onChange({ cameraModel: event.currentTarget.value.trim() || undefined }); setOpen(null) } }}
          onBlur={(event) => props.onChange({ cameraModel: event.target.value.trim() || undefined })}
        />
      ))}

      {chip('lens', filters.lens ? `镜头 · ${filters.lens}` : '镜头', Boolean(filters.lens), (
        <input
          className="chip-input"
          autoFocus
          placeholder="镜头型号"
          defaultValue={filters.lens ?? ''}
          onKeyDown={(event) => { if (event.key === 'Enter') { props.onChange({ lens: event.currentTarget.value.trim() || undefined }); setOpen(null) } }}
          onBlur={(event) => props.onChange({ lens: event.target.value.trim() || undefined })}
        />
      ))}

      {chip('date', filters.capturedFrom || filters.capturedTo ? '拍摄时间 · 已筛选' : '拍摄时间', Boolean(filters.capturedFrom || filters.capturedTo), (
        <div className="chip-date">
          <label>从<input type="date" value={filters.capturedFrom ?? ''} onChange={(event) => props.onChange({ capturedFrom: event.target.value || undefined })} /></label>
          <label>到<input type="date" value={filters.capturedTo ?? ''} onChange={(event) => props.onChange({ capturedTo: event.target.value || undefined })} /></label>
        </div>
      ))}

      {chip('sort', SORTS.find(([value]) => value === (filters.sort ?? 'captured_desc'))?.[1] ?? '排序', false,
        optionList(SORTS as Array<[string, string]>, filters.sort ?? 'captured_desc', (value) => props.onChange({ sort: value as SearchSort })))}

      {activeCount > 0 && <button type="button" className="chip chip-clear" onClick={() => { props.onClear(); setOpen(null) }}><IconClose size={12} />清除筛选</button>}
    </div>
  )
}
