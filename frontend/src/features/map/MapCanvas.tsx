import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { LocateFixed, Navigation } from 'lucide-react'

import {
  requestRoute,
  type Coordinate,
  type RouteResponse,
} from '../routing/api'

import { initialRouteState, routeReducer, type RouteEvent } from './routeState'

import { GuidancePanel } from '../guidance/GuidancePanel'
import { calculateGuidanceProgress } from '../guidance/geo'
import { useGeolocation } from '../guidance/useGeolocation'
import { useWakeLock } from '../guidance/useWakeLock'

import { GuidanceDebugPanel } from '../guidance/GuidanceDebugPanel'
import { trackedLocationFromGps } from '../guidance/locationSource'
import { useMockLocation } from '../guidance/useMockLocation'

const ROUTE_SOURCE_ID = 'route'
const ROUTE_CASING_LAYER_ID = 'route-casing'
const ROUTE_LAYER_ID = 'route-line'

export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const userLocationMarkerRef = useRef<maplibregl.Marker | null>(null)
  const selectCurrentLocationAsOriginRef = useRef<
    ((coordinate: Coordinate) => void) | null
  >(null)
  const [locationEnabled, setLocationEnabled] = useState(false)
  const [guidanceEnabled, setGuidanceEnabled] = useState(false)
  const location = useGeolocation(locationEnabled)
  const mockLocation = useMockLocation()
  const gpsTrackedLocation = useMemo(
    () => trackedLocationFromGps(location),
    [location],
  )
  const trackedLocation = mockLocation.location ?? gpsTrackedLocation
  const [routeState, dispatch] = useReducer(routeReducer, initialRouteState)
  const routeStateRef = useRef(routeState)
  const activeRoute = routeState.status === 'success' ? routeState.route : null

  const guidanceActive = guidanceEnabled && routeState.status === 'success'
  useWakeLock(guidanceActive)

  const guidanceProgress = useMemo(() => {
    if (
      !guidanceActive ||
      routeState.status !== 'success' ||
      !trackedLocation
    ) {
      return null
    }

    return calculateGuidanceProgress(
      routeState.route,
      trackedLocation.coordinate,
      trackedLocation.accuracyMeters,
    )
  }, [guidanceActive, routeState, trackedLocation])

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

    mapRef.current = map

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

      for (const layerId of [ROUTE_LAYER_ID, ROUTE_CASING_LAYER_ID]) {
        if (map.getLayer(layerId)) {
          map.removeLayer(layerId)
        }
      }

      if (map.getSource(ROUTE_SOURCE_ID)) {
        map.removeSource(ROUTE_SOURCE_ID)
      }

      setGuidanceEnabled(false)
      dispatchRoute({ type: 'resetRequested' })
    }

    selectCurrentLocationAsOriginRef.current = (coordinate: Coordinate) => {
      clearRoute()

      originMarker = new maplibregl.Marker({ color: '#16a34a' })
        .setLngLat([coordinate.longitude, coordinate.latitude])
        .addTo(map)

      dispatchRoute({ type: 'originSelected', origin: coordinate })

      map.easeTo({
        center: [coordinate.longitude, coordinate.latitude],
        zoom: Math.max(map.getZoom(), 15),
        duration: 500,
      })
    }

    function drawRoute(route: RouteResponse) {
      const feature = {
        type: 'Feature' as const,
        properties: {},
        geometry: route.geometry,
      }

      map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data: feature })

      map.addLayer({
        id: ROUTE_CASING_LAYER_ID,
        type: 'line',
        source: ROUTE_SOURCE_ID,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#ffffff',
          'line-width': 9,
          'line-opacity': 0.95,
        },
      })

      map.addLayer({
        id: ROUTE_LAYER_ID,
        type: 'line',
        source: ROUTE_SOURCE_ID,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#1d4ed8',
          'line-width': 5,
          'line-opacity': 1,
        },
      })

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
        originMarker?.setLngLat([route.origin.longitude, route.origin.latitude])
        destinationMarker?.setLngLat([
          route.destination.longitude,
          route.destination.latitude,
        ])
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
      userLocationMarkerRef.current?.remove()
      userLocationMarkerRef.current = null
      selectCurrentLocationAsOriginRef.current = null
      mapRef.current = null
      map.remove()
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current

    if (!map) {
      return
    }

    if (!trackedLocation) {
      userLocationMarkerRef.current?.remove()
      userLocationMarkerRef.current = null
      return
    }

    const lngLat: [number, number] = [
      trackedLocation.coordinate.longitude,
      trackedLocation.coordinate.latitude,
    ]

    if (!userLocationMarkerRef.current) {
      userLocationMarkerRef.current = new maplibregl.Marker({
        color: '#2563eb',
      })
        .setLngLat(lngLat)
        .addTo(map)
    } else {
      userLocationMarkerRef.current.setLngLat(lngLat)
    }

    if (guidanceActive) {
      map.easeTo({
        center: lngLat,
        zoom: Math.max(map.getZoom(), 15),
        duration: 500,
      })
    }
  }, [guidanceActive, trackedLocation])

  return (
    <div className="relative min-h-0 w-full flex-1 overflow-hidden">
      <div
        ref={containerRef}
        className="h-full w-full"
        aria-label="Map of Alberta"
      />

      <section
        className="absolute top-4 right-4 left-4 z-10 flex max-h-[calc(100%-2rem)] flex-col overflow-hidden rounded-md border bg-white/95 px-4 py-3 text-sm shadow-sm sm:right-auto sm:w-96 sm:max-w-sm"
        aria-live="polite"
      >
        <div className="mb-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md border px-3 py-2 font-medium"
              onClick={() => setLocationEnabled(true)}
            >
              <LocateFixed size={16} />
              Locate
            </button>

            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md border px-3 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!trackedLocation}
              onClick={() => {
                if (!trackedLocation) {
                  setLocationEnabled(true)
                  return
                }

                selectCurrentLocationAsOriginRef.current?.(
                  trackedLocation.coordinate,
                )
              }}
            >
              Use as start
            </button>

            {!mockLocation.location && location.status === 'locating' && (
              <p className="text-xs text-slate-500">Locating...</p>
            )}

            {trackedLocation?.source === 'mock' && (
              <p className="text-xs text-slate-500">Mock GPS ready</p>
            )}

            {trackedLocation?.source === 'gps' && (
              <p className="text-xs text-slate-500">
                GPS ready · ±{Math.round(trackedLocation.accuracyMeters)} m
              </p>
            )}

            {!mockLocation.location && location.status === 'unsupported' && (
              <p className="text-xs text-red-700">Location is not supported.</p>
            )}

            {!mockLocation.location && location.status === 'error' && (
              <p className="text-xs text-red-700">{location.message}</p>
            )}
          </div>

          {import.meta.env.DEV && (
            <GuidanceDebugPanel
              route={activeRoute}
              mockLocation={mockLocation.location}
              onSetCalgary={mockLocation.setCalgaryLocation}
              onClear={mockLocation.clear}
              onSetRouteStart={mockLocation.setRouteStart}
              onAdvance={mockLocation.advanceAlongRoute}
              onSetOffRoute={mockLocation.setOffRoute}
              onSetNearDestination={mockLocation.setNearDestination}
            />
          )}
        </div>
        {routeState.status === 'idle' && (
          <p>Click a start point, or use your current location.</p>
        )}

        {routeState.status === 'selecting-destination' && (
          <p>Click a destination.</p>
        )}

        {routeState.status === 'loading' && <p>Calculating route...</p>}

        {routeState.status === 'error' && (
          <p className="text-red-700">{routeState.message}</p>
        )}

        {routeState.status === 'success' && (
          <div className="flex min-h-0 flex-col gap-3">
            <div className="space-y-1">
              <p className="font-medium">Route ready</p>
              <p>
                {formatDistance(routeState.route.distance_meters)} ·{' '}
                {formatDuration(routeState.route.duration_seconds)}
              </p>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-3 py-2 font-medium text-white disabled:bg-slate-300"
                onClick={() => {
                  if (guidanceEnabled) {
                    setGuidanceEnabled(false)
                    return
                  }

                  setLocationEnabled(true)
                  setGuidanceEnabled(true)
                }}
              >
                <Navigation size={16} />
                {guidanceEnabled ? 'Stop guidance' : 'Start guidance'}
              </button>

              {guidanceEnabled && !trackedLocation && (
                <p className="text-xs text-slate-500">Waiting for GPS...</p>
              )}

              {guidanceProgress && (
                <GuidancePanel progress={guidanceProgress} />
              )}
            </div>

            <ol
              className="-mx-1 min-h-0 space-y-2 overflow-y-auto px-1"
              aria-label="Route instructions"
            >
              {routeState.route.steps.map((step) => (
                <li
                  key={step.sequence}
                  className="border-t pt-2 first:border-t-0 first:pt-0"
                >
                  <p>{step.instruction}</p>
                  {step.distance_meters > 0 && (
                    <p className="text-xs text-slate-500">
                      {formatDistance(step.distance_meters)}
                    </p>
                  )}
                </li>
              ))}
            </ol>
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
