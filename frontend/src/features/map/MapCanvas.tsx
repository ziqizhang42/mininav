import { useEffect, useReducer, useRef } from 'react'
import maplibregl from 'maplibre-gl'

import {
  requestRoute,
  type Coordinate,
  type RouteResponse,
} from '../routing/api'

import { initialRouteState, routeReducer, type RouteEvent } from './routeState'

const ROUTE_SOURCE_ID = 'route'
const ROUTE_LAYER_ID = 'route-line'

export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [routeState, dispatch] = useReducer(routeReducer, initialRouteState)
  const routeStateRef = useRef(routeState)

  useEffect(() => {
    routeStateRef.current = routeState
  }, [routeState])

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

    let originMarker: maplibregl.Marker | null = null
    let destinationMarker: maplibregl.Marker | null = null
    let activeRequest = 0
    let disposed = false

    function dispatchRoute(event: RouteEvent) {
      routeStateRef.current = routeReducer(routeStateRef.current, event)
      dispatch(event)
    }

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

      dispatchRoute({ type: 'resetRequested' })
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

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return
      }

      clearRoute()
    }

    async function handleMapClick(event: maplibregl.MapMouseEvent) {
      const coordinate: Coordinate = {
        longitude: event.lngLat.lng,
        latitude: event.lngLat.lat,
      }

      const currentRouteState = routeStateRef.current

      if (currentRouteState.status === 'loading') {
        return
      }

      if (currentRouteState.status !== 'selecting-destination') {
        clearRoute()

        originMarker = new maplibregl.Marker({ color: '#16a34a' })
          .setLngLat([coordinate.longitude, coordinate.latitude])
          .addTo(map)

        dispatchRoute({ type: 'originSelected', origin: coordinate })

        return
      }

      const selectedOrigin = currentRouteState.origin

      destinationMarker = new maplibregl.Marker({ color: '#dc2626' })
        .setLngLat([coordinate.longitude, coordinate.latitude])
        .addTo(map)

      const requestNumber = ++activeRequest

      dispatchRoute({
        type: 'routeRequested',
        origin: selectedOrigin,
        destination: coordinate,
        requestId: requestNumber,
      })
      try {
        const route = await requestRoute(selectedOrigin, coordinate)

        if (disposed || requestNumber !== activeRequest) {
          return
        }

        dispatchRoute({
          type: 'routeSucceeded',
          requestId: requestNumber,
          route,
        })
        drawRoute(route)
      } catch (error) {
        if (disposed || requestNumber !== activeRequest) {
          return
        }

        dispatchRoute({
          type: 'routeFailed',
          requestId: requestNumber,
          message:
            error instanceof Error
              ? error.message
              : 'Unable to calculate route',
        })

        console.error('Unable to calculate route', error)
      }
    }

    map.on('click', handleMapClick)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      disposed = true
      map.off('click', handleMapClick)
      window.removeEventListener('keydown', handleKeyDown)
      originMarker?.remove()
      destinationMarker?.remove()
      map.remove()
    }
  }, [])

  return (
    <div className="relative min-h-0 w-full flex-1">
      <div
        ref={containerRef}
        className="h-full w-full"
        aria-label="Map of Alberta"
      />

      <section
        className="absolute top-4 left-4 z-10 max-w-sm rounded-md border bg-white/95 px-4 py-3 text-sm shadow-sm"
        aria-live="polite"
      >
        {routeState.status === 'idle' && <p>Click a start point.</p>}

        {routeState.status === 'selecting-destination' && (
          <p>Click a destination.</p>
        )}

        {routeState.status === 'loading' && <p>Calculating route...</p>}

        {routeState.status === 'error' && (
          <p className="text-red-700">{routeState.message}</p>
        )}

        {routeState.status === 'success' && (
          <div className="space-y-1">
            <p className="font-medium">Route ready</p>
            <p>
              {formatDistance(routeState.route.distance_meters)} ·{' '}
              {formatDuration(routeState.route.duration_seconds)}
            </p>
          </div>
        )}
      </section>
    </div>
  )
}

function formatDistance(meters: number) {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`
  }

  return `${Math.round(meters)} m`
}

function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60)

  if (minutes < 1) {
    return '< 1 min'
  }

  if (minutes < 60) {
    return `${minutes} min`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  if (remainingMinutes === 0) {
    return `${hours} hr`
  }

  return `${hours} hr ${remainingMinutes} min`
}
