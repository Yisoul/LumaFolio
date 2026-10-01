import { useRef } from 'react'

interface SplitterProps {
  /** 该栏当前宽度，拖动期间以按下瞬间的值为基准计算，避免受重渲染影响。 */
  width: number
  min: number
  max: number
  /** 分隔条在目标栏右侧时（例如右侧信息栏）传 true，拖动方向要反过来。 */
  invert?: boolean
  onResize: (width: number) => void
}

export default function Splitter({ width, min, max, invert = false, onResize }: SplitterProps) {
  const stateRef = useRef({ startX: 0, startWidth: width, dragging: false })

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    stateRef.current = { startX: event.clientX, startWidth: width, dragging: true }
    const move = (moveEvent: PointerEvent) => {
      if (!stateRef.current.dragging) return
      const delta = moveEvent.clientX - stateRef.current.startX
      const next = stateRef.current.startWidth + (invert ? -delta : delta)
      onResize(Math.max(min, Math.min(max, Math.round(next))))
    }
    const up = () => {
      stateRef.current.dragging = false
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return <div className="splitter" role="separator" aria-orientation="vertical" onPointerDown={handlePointerDown} />
}
