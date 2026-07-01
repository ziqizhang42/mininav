import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import maplibregl from 'maplibre-gl'
import { ChevronDown, ChevronUp, LocateFixed, Navigation } from 'lucide-react'

import {
  requestRoute,
  type Coordinate,
  type RouteResponse,
} from '../routing/api'

import { initialRouteState, routeReducer, type RouteEvent } from './routeState'

import { RouteInstructionList } from '../guidance/RouteInstructionList'
import {
  calculateGuidanceProgress,
  routeLengthMeters,
  type GuidanceProgress,
} from '../guidance/geo'
import { useGeolocation } from '../guidance/useGeolocation'
import { useWakeLock } from '../guidance/useWakeLock'
import { useAutomaticRerouting } from '../guidance/useAutomaticRerouting'
import { useNavigationBearing } from '../guidance/useNavigationBearing'

import { GuidanceDebugPanel } from '../guidance/GuidanceDebugPanel'
import { trackedLocationFromGps } from '../guidance/locationSource'
import { useMockLocation } from '../guidance/useMockLocation'

import { SearchControl, type SearchField } from '../search/SearchControl'

const ROUTE_SOURCE_ID = 'route'
const ROUTE_CASING_LAYER_ID = 'route-casing'
const ROUTE_LAYER_ID = 'route-line'
const ROUTE_REMAINING_COLOR = '#1d4ed8'
const ROUTE_TRAVELED_COLOR = '#94a3b8'

export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const userLocationMarkerRef = useRef<maplibregl.Marker | null>(null)
  const userLocationMarkerArrowRef = useRef<SVGElement | null>(null)
  const selectCurrentLocationAsOriginRef = useRef<
    ((coordinate: Coordinate) => void) | null
  >(null)
  const replaceRouteOnMapRef = useRef<((route: RouteResponse) => void) | null>(
    null,
  )
  const preGuidanceCameraRef = useRef<{
    center: maplibregl.LngLat
    zoom: number
    bearing: number
    pitch: number
  } | null>(null)
  const selectOriginRef = useRef<
    ((coordinate: Coordinate, label: string) => void) | null
  >(null)
  const selectDestinationRef = useRef<
    ((coordinate: Coordinate, label: string) => void) | null
  >(null)
  const activeSearchFieldRef = useRef<SearchField | null>(null)
  const pendingDestinationRef = useRef<{
    coordinate: Coordinate
    label: string
  } | null>(null)

  const [detailsExpanded, setDetailsExpanded] = useState(false)
  const [locationEnabled, setLocationEnabled] = useState(false)
  const [guidanceEnabled, setGuidanceEnabled] = useState(false)
  const [originLabel, setOriginLabel] = useState<string | null>(null)
  const [destinationLabel, setDestinationLabel] = useState<string | null>(null)
  const [activeSearchField, setActiveSearchField] =
    useState<SearchField | null>(null)
  const location = useGeolocation(locationEnabled)
  const mockLocation = useMockLocation()
  const gpsTrackedLocation = useMemo(
    () => trackedLocationFromGps(location),
    [location],
  )
  const trackedLocation = mockLocation.location ?? gpsTrackedLocation
  const [routeState, dispatch] = useReducer(routeReducer, initialRouteState)
  const routeStateRef = useRef(routeState)
  const dispatchRoute = useCallback(
    (event: RouteEvent) => {
      routeStateRef.current = routeReducer(routeStateRef.current, event)
      dispatch(event)
    },
    [dispatch],
  )
  const activeRoute = routeState.status === 'success' ? routeState.route : null
  const rerouteDestination =
    routeState.status === 'success' ? routeState.destination : null
  const isRerouting = routeState.status === 'success' && routeState.isRerouting

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

  const navigationBearingRef = useNavigationBearing({
    enabled: guidanceActive,
    route: activeRoute,
    progress: guidanceProgress,
    trackedLocation,
  })

  const handleRerouteStarted = useCallback(
    (requestId: number) => {
      dispatchRoute({ type: 'rerouteRequested', requestId })
    },
    [dispatchRoute],
  )

  const handleRerouteSucceeded = useCallback(
    (requestId: number, route: RouteResponse) => {
      dispatchRoute({ type: 'rerouteSucceeded', requestId, route })

      if (
        routeStateRef.current.status === 'success' &&
        routeStateRef.current.route === route
      ) {
        replaceRouteOnMapRef.current?.(route)
      }
    },
    [dispatchRoute],
  )

  const handleRerouteFailed = useCallback(
    (requestId: number, message: string) => {
      dispatchRoute({ type: 'rerouteFailed', requestId, message })
    },
    [dispatchRoute],
  )

  useAutomaticRerouting({
    enabled: guidanceActive,
    route: activeRoute,
    destination: rerouteDestination,
    trackedLocation,
    progress: guidanceProgress,
    isRerouting,
    requestRoute,
    onRerouteStarted: handleRerouteStarted,
    onRerouteSucceeded: handleRerouteSucceeded,
    onRerouteFailed: handleRerouteFailed,
  })

  useEffect(() => {
    routeStateRef.current = routeState
  }, [routeState])

  useEffect(() => {
    activeSearchFieldRef.current = activeSearchField

    const map = mapRef.current
    if (map) {
      map.getCanvas().style.cursor = activeSearchField ? 'crosshair' : ''
    }
  }, [activeSearchField])

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

      map.getCanvas().style.cursor = activeSearchFieldRef.current
        ? 'crosshair'
        : ''
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

      pendingDestinationRef.current = null
      setOriginLabel(null)
      setDestinationLabel(null)
      setActiveSearchField(null)
      setGuidanceEnabled(false)
      dispatchRoute({ type: 'resetRequested' })
    }

    selectCurrentLocationAsOriginRef.current = (coordinate: Coordinate) => {
      selectOriginCoordinate(coordinate, 'Current location')
    }

    function drawRoute(
      route: RouteResponse,
      options: { fitBounds?: boolean } = {},
    ) {
      const { fitBounds = true } = options
      const feature = {
        type: 'Feature' as const,
        properties: {},
        geometry: route.geometry,
      }

      const routeSource = map.getSource(ROUTE_SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined

      if (routeSource) {
        routeSource.setData(feature)
      } else {
        map.addSource(ROUTE_SOURCE_ID, {
          type: 'geojson',
          data: feature,
          lineMetrics: true,
        })

        map.addLayer({
          id: ROUTE_CASING_LAYER_ID,
          type: 'line',
          source: ROUTE_SOURCE_ID,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
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
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': ROUTE_REMAINING_COLOR,
            'line-width': 5,
            'line-opacity': 1,
          },
        })
      }

      if (!fitBounds) return

      const firstCoordinate = route.geometry.coordinates[0]
      const bounds = new maplibregl.LngLatBounds(
        firstCoordinate,
        firstCoordinate,
      )

      for (const coordinate of route.geometry.coordinates) {
        bounds.extend(coordinate)
      }

      map.fitBounds(bounds, { padding: 60, duration: 800 })
    }

    replaceRouteOnMapRef.current = (route: RouteResponse) => {
      originMarker?.setLngLat([route.origin.longitude, route.origin.latitude])
      destinationMarker?.setLngLat([
        route.destination.longitude,
        route.destination.latitude,
      ])
      drawRoute(route, { fitBounds: false })
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return
      }

      clearRoute()
    }

    function setOriginMarker(coordinate: Coordinate) {
      if (originMarker) {
        originMarker.setLngLat([coordinate.longitude, coordinate.latitude])
        return
      }

      originMarker = new maplibregl.Marker({ color: '#16a34a' })
        .setLngLat([coordinate.longitude, coordinate.latitude])
        .addTo(map)
    }

    function setDestinationMarker(coordinate: Coordinate) {
      if (destinationMarker) {
        destinationMarker.setLngLat([coordinate.longitude, coordinate.latitude])
        return
      }

      destinationMarker = new maplibregl.Marker({ color: '#dc2626' })
        .setLngLat([coordinate.longitude, coordinate.latitude])
        .addTo(map)
    }

    function selectOriginCoordinate(coordinate: Coordinate, label: string) {
      if (routeStateRef.current.status === 'loading') {
        return
      }
      setActiveSearchField(null)
      const selectedDestination = pendingDestinationRef.current

      clearRoute()
      pendingDestinationRef.current = selectedDestination

      setOriginLabel(label)
      setOriginMarker(coordinate)

      dispatchRoute({ type: 'originSelected', origin: coordinate })

      map.easeTo({
        center: [coordinate.longitude, coordinate.latitude],
        zoom: Math.max(map.getZoom(), 15),
        duration: 500,
      })

      if (selectedDestination) {
        setDestinationLabel(selectedDestination.label)
        void selectDestinationCoordinate(
          selectedDestination.coordinate,
          selectedDestination.label,
        )
      }
    }

    async function selectDestinationCoordinate(
      coordinate: Coordinate,
      label: string,
    ) {
      const currentRouteState = routeStateRef.current

      if (currentRouteState.status === 'loading') {
        return
      }
      setActiveSearchField(null)

      setDestinationLabel(label)
      pendingDestinationRef.current = { coordinate, label }
      setDestinationMarker(coordinate)

      if (
        currentRouteState.status !== 'selecting-destination' &&
        currentRouteState.status !== 'success'
      ) {
        map.easeTo({
          center: [coordinate.longitude, coordinate.latitude],
          zoom: Math.max(map.getZoom(), 15),
          duration: 500,
        })

        return
      }

      const selectedOrigin = currentRouteState.origin
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

    function handleMapClick(event: maplibregl.MapMouseEvent) {
      const selectedField = activeSearchFieldRef.current

      if (!selectedField) {
        return
      }

      const coordinate: Coordinate = {
        longitude: event.lngLat.lng,
        latitude: event.lngLat.lat,
      }

      if (selectedField === 'origin') {
        selectOriginCoordinate(coordinate, 'Map origin')
        return
      }

      void selectDestinationCoordinate(coordinate, 'Map destination')
    }

    selectOriginRef.current = selectOriginCoordinate
    selectDestinationRef.current = selectDestinationCoordinate

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
      userLocationMarkerArrowRef.current = null
      selectCurrentLocationAsOriginRef.current = null
      selectOriginRef.current = null
      selectDestinationRef.current = null
      pendingDestinationRef.current = null
      replaceRouteOnMapRef.current = null
      preGuidanceCameraRef.current = null
      mapRef.current = null
      map.remove()
    }
  }, [dispatchRoute])

  useEffect(() => {
    const map = mapRef.current

    if (!map || !map.getLayer(ROUTE_LAYER_ID)) {
      return
    }

    const progressFraction =
      guidanceActive && activeRoute && guidanceProgress
        ? traveledRouteFraction(activeRoute, guidanceProgress.remainingMeters)
        : 0

    map.setPaintProperty(
      ROUTE_LAYER_ID,
      'line-gradient',
      routeLineGradient(progressFraction),
    )
  }, [activeRoute, guidanceActive, guidanceProgress])

  useEffect(() => {
    const map = mapRef.current

    if (!map) {
      return
    }

    if (guidanceActive) {
      preGuidanceCameraRef.current ??= {
        center: map.getCenter(),
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      }
      return
    }

    const camera = preGuidanceCameraRef.current
    preGuidanceCameraRef.current = null

    if (!camera) {
      return
    }

    map.easeTo({ ...camera, duration: 500 })
  }, [guidanceActive])

  useEffect(() => {
    const map = mapRef.current

    if (!map) {
      return
    }

    if (!trackedLocation) {
      userLocationMarkerRef.current?.remove()
      userLocationMarkerRef.current = null
      userLocationMarkerArrowRef.current = null
      return
    }

    const lngLat: [number, number] = [
      trackedLocation.coordinate.longitude,
      trackedLocation.coordinate.latitude,
    ]

    if (!userLocationMarkerRef.current) {
      const markerElement = createUserLocationMarkerElement()
      userLocationMarkerArrowRef.current = markerElement.arrow

      userLocationMarkerRef.current = new maplibregl.Marker({
        element: markerElement.container,
        anchor: 'center',
      })
        .setLngLat(lngLat)
        .addTo(map)
    } else {
      userLocationMarkerRef.current.setLngLat(lngLat)
    }

    const markerBearing =
      navigationBearingRef.current ??
      (trackedLocation.heading !== null &&
      Number.isFinite(trackedLocation.heading)
        ? trackedLocation.heading
        : null)

    const targetMapBearing = guidanceActive
      ? (navigationBearingRef.current ?? map.getBearing())
      : map.getBearing()

    updateUserLocationMarkerBearing(
      userLocationMarkerArrowRef.current,
      markerBearing,
      targetMapBearing,
    )

    if (guidanceActive) {
      map.easeTo({
        center: lngLat,
        zoom: Math.max(map.getZoom(), 15),
        bearing: targetMapBearing,
        duration: 500,
      })
    }
  }, [guidanceActive, guidanceProgress, navigationBearingRef, trackedLocation])

  return (
    <div className="relative min-h-0 w-full flex-1 overflow-hidden">
      <div
        ref={containerRef}
        className="h-full w-full"
        aria-label="Map of Alberta"
      />

      <section
        className={`absolute right-3 bottom-3 left-3 z-10 flex flex-col overflow-hidden rounded-lg border bg-white/95 px-3 py-3 text-sm shadow-lg backdrop-blur sm:top-4 sm:right-auto sm:bottom-auto sm:left-4 sm:max-h-[calc(100%-2rem)] sm:w-96 sm:max-w-sm sm:px-4 ${detailsExpanded ? 'max-h-[72dvh]' : 'max-h-[32dvh]'}`}
        aria-live="polite"
      >
        <div className="mb-3 shrink-0 space-y-3">
          <SearchControl
            activeField={activeSearchField}
            onActiveFieldChange={setActiveSearchField}
            originLabel={originLabel}
            destinationLabel={destinationLabel}
            currentLocationAvailable={Boolean(trackedLocation)}
            currentLocationLabel={
              trackedLocation?.source === 'mock'
                ? 'Use mock location'
                : trackedLocation?.source === 'gps'
                  ? 'Use current GPS location'
                  : 'Use current location'
            }
            onUseCurrentLocation={() => {
              setLocationEnabled(true)

              if (!trackedLocation) return

              selectCurrentLocationAsOriginRef.current?.(
                trackedLocation.coordinate,
              )
            }}
            onSelectOrigin={(result) => {
              selectOriginRef.current?.(
                {
                  longitude: result.longitude,
                  latitude: result.latitude,
                },
                result.label,
              )
            }}
            onSelectDestination={(result) => {
              selectDestinationRef.current?.(
                {
                  longitude: result.longitude,
                  latitude: result.latitude,
                },
                result.label,
              )
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md border px-3 py-2 font-medium"
              onClick={() => setLocationEnabled(true)}
            >
              <LocateFixed size={16} />
              Locate
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
            <div
              className={
                routeState.status === 'success' && !detailsExpanded
                  ? 'hidden sm:block'
                  : undefined
              }
            >
              <GuidanceDebugPanel
                route={activeRoute}
                mockLocation={mockLocation.location}
                onSetCalgary={mockLocation.setCalgaryLocation}
                onClear={mockLocation.clear}
                onSetRouteStart={mockLocation.setRouteStart}
                onAdvance={mockLocation.advanceAlongRoute}
                onSetOffRoute={mockLocation.setOffRoute}
                onSetNearDestination={mockLocation.setNearDestination}
                isJittering={mockLocation.isJittering}
                onStartJitter={mockLocation.startGpsJitter}
              />
            </div>
          )}
        </div>
        {routeState.status !== 'loading' &&
          routeState.status !== 'error' &&
          routeState.status !== 'success' && (
            <p>
              {activeSearchField === 'origin'
                ? 'Click the map to set the origin, search above, or use current location.'
                : activeSearchField === 'destination'
                  ? 'Click the map to set the destination, or search above.'
                  : originLabel && !destinationLabel
                    ? 'Select Destination to finish the route.'
                    : destinationLabel && !originLabel
                      ? 'Select Origin to finish the route.'
                      : 'Select Origin or Destination to start.'}
            </p>
          )}

        {routeState.status === 'loading' && <p>Calculating route...</p>}

        {routeState.status === 'error' && (
          <p className="text-red-700">{routeState.message}</p>
        )}

        {routeState.status === 'success' && (
          <div className="flex min-h-0 flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="font-medium">
                  {routeState.isRerouting ? 'Rerouting...' : 'Route ready'}
                </p>
                <p>
                  {formatRouteSummary(
                    routeState.route,
                    guidanceProgress,
                    guidanceActive,
                  )}
                </p>
              </div>

              <button
                type="button"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-slate-700 sm:hidden"
                aria-expanded={detailsExpanded}
                aria-controls="route-instructions"
                onClick={() => setDetailsExpanded((expanded) => !expanded)}
              >
                {detailsExpanded ? (
                  <ChevronDown size={18} />
                ) : (
                  <ChevronUp size={18} />
                )}
                <span className="sr-only">
                  {detailsExpanded
                    ? 'Collapse route details'
                    : 'Expand route details'}
                </span>
              </button>
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
                  setDetailsExpanded(false)
                  setGuidanceEnabled(true)
                }}
              >
                <Navigation size={16} />
                {guidanceEnabled ? 'Stop guidance' : 'Start guidance'}
              </button>

              {guidanceEnabled && !trackedLocation && (
                <p className="text-xs text-slate-500">Waiting for GPS...</p>
              )}
            </div>
            <RouteInstructionList
              id="route-instructions"
              route={routeState.route}
              guidanceActive={guidanceActive}
              progress={guidanceProgress}
              isRerouting={routeState.isRerouting}
              rerouteError={routeState.rerouteError}
              formatDistance={formatDistance}
              detailsExpanded={detailsExpanded}
              className="min-h-0 flex-1 px-1 pb-1"
            />
          </div>
        )}
      </section>
    </div>
  )
}

function createUserLocationMarkerElement() {
  const container = document.createElement('div')
  container.style.width = '36px'
  container.style.height = '36px'
  container.style.display = 'flex'
  container.style.alignItems = 'center'
  container.style.justifyContent = 'center'
  container.style.pointerEvents = 'none'

  container.innerHTML = `
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <path d="M17 3 L27 29 L17 24 L7 29 Z" fill="#2563eb" stroke="#ffffff" stroke-width="3" stroke-linejoin="round" />
      <circle cx="17" cy="18" r="3" fill="#ffffff" opacity="0.9" />
    </svg>
  `

  const arrow = container.firstElementChild as SVGElement
  arrow.style.transformOrigin = 'center'
  arrow.style.transition = 'transform 180ms ease-out, opacity 180ms ease-out'

  return { container, arrow }
}

function updateUserLocationMarkerBearing(
  arrow: SVGElement | null,
  bearing: number | null,
  mapBearing: number,
) {
  if (!arrow) return

  if (bearing === null) {
    arrow.style.opacity = '0.75'
    arrow.style.transform = 'rotate(0deg)'
    return
  }

  arrow.style.opacity = '1'
  arrow.style.transform = `rotate(${bearing - mapBearing}deg)`
}

function traveledRouteFraction(route: RouteResponse, remainingMeters: number) {
  const routeMeters = routeLengthMeters(route)

  if (routeMeters <= 0) return 0

  return Math.min(1, Math.max(0, (routeMeters - remainingMeters) / routeMeters))
}

function routeLineGradient(progressFraction: number) {
  const split = Math.min(1, Math.max(0, progressFraction))

  return [
    'step',
    ['line-progress'],
    ROUTE_TRAVELED_COLOR,
    split,
    ROUTE_REMAINING_COLOR,
  ]
}

function formatRouteSummary(
  route: RouteResponse,
  progress: GuidanceProgress | null,
  guidanceActive: boolean,
) {
  const showingRemaining = guidanceActive && progress !== null
  const distanceMeters = showingRemaining
    ? progress.remainingMeters
    : route.distance_meters
  const durationSeconds = showingRemaining
    ? estimateRemainingDurationSeconds(route, progress.remainingMeters)
    : route.duration_seconds
  const suffix = showingRemaining ? ' left' : ''

  return `${formatDistance(distanceMeters)}${suffix} · ${formatDuration(
    durationSeconds,
  )}${suffix}`
}

function estimateRemainingDurationSeconds(
  route: RouteResponse,
  remainingMeters: number,
) {
  if (route.distance_meters <= 0) return 0

  const remainingFraction = Math.min(
    1,
    Math.max(0, remainingMeters / route.distance_meters),
  )

  return route.duration_seconds * remainingFraction
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
