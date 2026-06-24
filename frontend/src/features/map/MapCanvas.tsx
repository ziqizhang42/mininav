import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'

import {
  requestRoute,
  type Coordinate,
  type RouteResponse,
} from '../routing/api'

const ROUTE_SOURCE_ID = 'route'
const ROUTE_LAYER_ID = 'route-line'

export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [-114.0719, 51.0447],
      zoom: 10,
    })

    let origin: Coordinate | null = null
    let originMarker: maplibregl.Marker | null = null
    let destinationMarker: maplibregl.Marker | null = null
    let activeRequest = 0
    let disposed = false

    map.on('style.load', () => {
      map.addLayer({
        id: 'house-numbers',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'housenumber',
        minzoom: 17,
        layout: {
          'text-field': ['to-string', ['get', 'housenumber']],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#6b6259',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1,
        },
      })

      map.getCanvas().style.cursor = 'crosshair'
    })

    map.addControl(new maplibregl.NavigationControl())

    function clearRoute() {
      activeRequest += 1

      originMarker?.remove()
      destinationMarker?.remove()
      originMarker = null
      destinationMarker = null

      if (map.getLayer(ROUTE_LAYER_ID)) {
        map.removeLayer(ROUTE_LAYER_ID)
      }

      if (map.getSource(ROUTE_SOURCE_ID)) {
        map.removeSource(ROUTE_SOURCE_ID)
      }
    }

    function drawRoute(route: RouteResponse) {
      const feature = {
        type: 'Feature' as const,
        properties: {},
        geometry: route.geometry,
      }

      map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data: feature })

      const firstSymbolLayer = map
        .getStyle()
        .layers.find((layer) => layer.type === 'symbol')?.id

      map.addLayer(
        {
          id: ROUTE_LAYER_ID,
          type: 'line',
          source: ROUTE_SOURCE_ID,
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': '#2563eb',
            'line-width': 5,
            'line-opacity': 0.85,
          },
        },
        firstSymbolLayer,
      )

      const firstCoordinate = route.geometry.coordinates[0]
      const bounds = new maplibregl.LngLatBounds(
        firstCoordinate,
        firstCoordinate,
      )

      for (const coordinate of route.geometry.coordinates) {
        bounds.extend(coordinate)
      }

      map.fitBounds(bounds, {
        padding: 60,
        duration: 800,
      })
    }

    async function handleMapClick(event: maplibregl.MapMouseEvent) {
      const coordinate: Coordinate = {
        longitude: event.lngLat.lng,
        latitude: event.lngLat.lat,
      }

      if (origin === null) {
        clearRoute()

        origin = coordinate
        originMarker = new maplibregl.Marker({ color: '#16a34a' })
          .setLngLat([coordinate.longitude, coordinate.latitude])
          .addTo(map)

        return
      }

      const selectedOrigin = origin
      origin = null

      destinationMarker = new maplibregl.Marker({ color: '#dc2626' })
        .setLngLat([coordinate.longitude, coordinate.latitude])
        .addTo(map)

      const requestNumber = ++activeRequest

      try {
        const route = await requestRoute(selectedOrigin, coordinate)

        if (disposed || requestNumber !== activeRequest) {
          return
        }

        drawRoute(route)
      } catch (error) {
        console.error('Unable to calculate route', error)
      }
    }

    map.on('click', handleMapClick)

    return () => {
      disposed = true
      map.off('click', handleMapClick)
      originMarker?.remove()
      destinationMarker?.remove()
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
