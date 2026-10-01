import { IconMinus, IconPlus } from './icons'

interface ThumbSizeSliderProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
}

/** 参考图顶部那条缩略图尺寸滑杆。 */
export default function ThumbSizeSlider({ value, onChange, min = 120, max = 360 }: ThumbSizeSliderProps) {
  const clamp = (next: number) => Math.max(min, Math.min(max, next))
  return (
    <div className="thumb-slider" title="调整缩略图大小">
      <button type="button" className="icon-button" onClick={() => onChange(clamp(value - 20))} aria-label="缩小缩略图"><IconMinus size={14} /></button>
      <input
        type="range"
        min={min}
        max={max}
        step={10}
        value={value}
        aria-label="缩略图大小"
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <button type="button" className="icon-button" onClick={() => onChange(clamp(value + 20))} aria-label="放大缩略图"><IconPlus size={14} /></button>
    </div>
  )
}
