import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'

export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://demotiles.maplibre.org/globe.json',
      center: [-114.0719, 51.0447],
      zoom: 5,
    })

    map.addControl(new maplibregl.NavigationControl())

    return () => {
      map.remove()
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="min-h-0 w-full flex-1"
      aria-label="Map of Alberta"
    />
  )
}
