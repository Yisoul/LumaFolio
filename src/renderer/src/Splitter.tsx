import { useRef } from 'react'

/** 竖向分隔条：按住拖动时把横向位移回调出去，由父组件决定改哪一栏宽度。 */
export default function Splitter({ onResize }: { onResize: (deltaX: number) => void }) {
  const lastRef = useRef(0)

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    lastRef.current = event.clientX
    const move = (moveEvent: PointerEvent) => {
      onResize(moveEvent.clientX - lastRef.current)
      lastRef.current = moveEvent.clientX
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return <div className="splitter" role="separator" aria-orientation="vertical" onPointerDown={handlePointerDown} />
}
