import { useEffect, useRef, useState } from 'react'

export function useScrollEdges() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showLeft, setShowLeft] = useState(false)
  const [showRight, setShowRight] = useState(true)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => {
      setShowLeft(el.scrollLeft > 0)
      setShowRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1)
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    return () => el.removeEventListener('scroll', update)
  }, [])

  return { scrollRef, showLeft, showRight }
}
