import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import maplibregl from 'maplibre-gl'
import { LocateFixed } from 'lucide-react'

import {
  requestRoute,
  type Coordinate,
  type RouteResponse,
} from '../routing/api'

import { initialRouteState, routeReducer, type RouteEvent } from './routeState'

import { RouteInstructionList } from '../guidance/RouteInstructionList'
import { NextManeuverCard } from '../guidance/NextManeuverCard'
import { TripStatusBar } from '../guidance/TripStatusBar'
import { PlanningPanel, type LocationStatus } from './PlanningPanel'
import { calculateGuidanceProgress, routeLengthMeters } from '../guidance/geo'
import { useGeolocation, type LocationState } from '../guidance/useGeolocation'
import { useWakeLock } from '../guidance/useWakeLock'
import { useAutomaticRerouting } from '../guidance/useAutomaticRerouting'
import { useNavigationBearing } from '../guidance/useNavigationBearing'

import { GuidanceDebugPanel } from '../guidance/GuidanceDebugPanel'
import {
  trackedLocationFromGps,
  type TrackedLocation,
} from '../guidance/locationSource'
import { useMockLocation } from '../guidance/useMockLocation'

import type { SearchField } from '../search/SearchControl'
import type { SearchBias } from '../search/api'

const ROUTE_SOURCE_ID = 'route'
const ROUTE_CASING_LAYER_ID = 'route-casing'
const ROUTE_LAYER_ID = 'route-line'
const ROUTE_REMAINING_COLOR = '#1d4ed8'
const ROUTE_TRAVELED_COLOR = '#94a3b8'
const GUIDANCE_PITCH = 45
const GUIDANCE_MIN_ZOOM = 16

export function MapCanvas() {
  const rootRef = useRef<HTMLDivElement>(null)
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
  const clearRouteRef = useRef<(() => void) | null>(null)
  const pendingRecenterRef = useRef(false)
  const activeSearchFieldRef = useRef<SearchField | null>(null)
  const pendingDestinationRef = useRef<{
    coordinate: Coordinate
    label: string
  } | null>(null)

  const [bottomOverlay, setBottomOverlay] = useState<HTMLDivElement | null>(
    null,
  )
  const [stepsOpen, setStepsOpen] = useState(false)
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

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }))

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
      setStepsOpen(false)
      dispatchRoute({ type: 'resetRequested' })
    }

    clearRouteRef.current = clearRoute

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
      clearRouteRef.current = null
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

    // A recenter asked for before the first fix arrived is honoured here.
    const recenterRequested = pendingRecenterRef.current
    pendingRecenterRef.current = false

    if (guidanceActive) {
      map.easeTo({
        center: lngLat,
        zoom: Math.max(map.getZoom(), GUIDANCE_MIN_ZOOM),
        bearing: targetMapBearing,
        pitch: GUIDANCE_PITCH,
        offset: [0, guidanceCameraOffsetY(map)],
        duration: 500,
      })
    } else if (recenterRequested) {
      map.easeTo({
        center: lngLat,
        zoom: Math.max(map.getZoom(), 15),
        duration: 500,
      })
    }
  }, [guidanceActive, guidanceProgress, navigationBearingRef, trackedLocation])

  // Keep the MapLibre attribution and the location button clear of the bottom
  // overlay, whichever one is showing. Written straight to the DOM so a resize
  // does not re-render the map.
  useEffect(() => {
    const root = rootRef.current

    if (!root) return

    function measure() {
      if (!root || !bottomOverlay) return

      root.style.setProperty(
        '--mininav-bottom-inset',
        `${bottomOverlay.getBoundingClientRect().height}px`,
      )
    }

    if (!bottomOverlay) {
      root.style.setProperty('--mininav-bottom-inset', '0px')
      return
    }

    measure()

    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(measure)

    observer.observe(bottomOverlay)

    return () => observer.disconnect()
  }, [bottomOverlay])

  const showMyLocation = useCallback(() => {
    setLocationEnabled(true)

    const map = mapRef.current

    if (!map || !trackedLocation) {
      // Nothing to centre on yet: remember the request so the first fix moves
      // the map instead of needing a second press.
      pendingRecenterRef.current = true
      return
    }

    map.easeTo({
      center: [
        trackedLocation.coordinate.longitude,
        trackedLocation.coordinate.latitude,
      ],
      zoom: Math.max(map.getZoom(), 15),
      offset: guidanceActive ? [0, guidanceCameraOffsetY(map)] : [0, 0],
      duration: 500,
    })
  }, [guidanceActive, trackedLocation])

  const getSearchBias = useCallback((): SearchBias | undefined => {
    const map = mapRef.current

    if (!map) {
      return trackedLocation ? { focus: trackedLocation.coordinate } : undefined
    }

    const bounds = map.getBounds()
    const center = map.getCenter()
    const trackedCoordinate = trackedLocation?.coordinate
    const focus =
      trackedCoordinate &&
      bounds.contains([trackedCoordinate.longitude, trackedCoordinate.latitude])
        ? trackedCoordinate
        : { longitude: center.lng, latitude: center.lat }

    return {
      viewbox: {
        west: Math.max(-180, bounds.getWest()),
        south: Math.max(-90, bounds.getSouth()),
        east: Math.min(180, bounds.getEast()),
        north: Math.min(90, bounds.getNorth()),
      },
      focus,
    }
  }, [trackedLocation])

  const successState = routeState.status === 'success' ? routeState : null
  const navigating = guidanceEnabled && successState !== null
  const locationStatus = describeLocationStatus(location, trackedLocation)
  const devPanel = import.meta.env.DEV ? (
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
  ) : null

  return (
    <div ref={rootRef} className="relative h-full w-full overflow-hidden">
      {/*
        MapLibre's stylesheet forces `position: relative` on the map container,
        so it has to be sized with height rather than inset utilities.
      */}
      <div
        ref={containerRef}
        className="h-full w-full"
        aria-label="Map of Alberta"
      />

      <div className="pointer-events-none absolute right-3 bottom-[calc(var(--mininav-bottom-inset,0px)+0.75rem)] z-20 sm:right-4 sm:bottom-10">
        <button
          type="button"
          className="pointer-events-auto grid size-11 place-items-center rounded-full bg-white text-slate-700 shadow-lg ring-1 ring-slate-900/5 hover:bg-slate-50"
          onClick={showMyLocation}
        >
          <LocateFixed size={20} aria-hidden />
          <span className="sr-only">
            {navigating ? 'Recenter on my location' : 'Show my location'}
          </span>
        </button>
      </div>

      {navigating && successState ? (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 pt-[env(safe-area-inset-top)] sm:top-4 sm:right-auto sm:left-4 sm:w-[400px] sm:pt-0">
            <NextManeuverCard
              route={successState.route}
              progress={guidanceProgress}
              isRerouting={successState.isRerouting}
              rerouteError={successState.rerouteError}
              locationError={
                locationStatus?.tone === 'error' ? locationStatus.text : null
              }
              destinationLabel={destinationLabel}
            />

            {devPanel && (
              <div className="pointer-events-auto mx-2 mt-2 rounded-2xl bg-white/95 px-3 pb-2 shadow-lg ring-1 ring-slate-900/5 backdrop-blur sm:mx-0">
                {devPanel}
              </div>
            )}
          </div>

          <div
            ref={setBottomOverlay}
            className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col gap-2 sm:right-auto sm:bottom-4 sm:left-4 sm:w-[400px]"
          >
            {stepsOpen && (
              <div className="pointer-events-auto mx-2 overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-900/5 sm:mx-0">
                <RouteInstructionList
                  id="guidance-steps"
                  route={successState.route}
                  guidanceActive
                  progress={guidanceProgress}
                  className="max-h-[38dvh]"
                />
              </div>
            )}

            <TripStatusBar
              remainingMeters={
                guidanceProgress?.remainingMeters ??
                successState.route.distance_meters
              }
              remainingSeconds={
                guidanceProgress
                  ? estimateRemainingDurationSeconds(
                      successState.route,
                      guidanceProgress.remainingMeters,
                    )
                  : successState.route.duration_seconds
              }
              hasArrived={guidanceProgress?.hasArrived ?? false}
              stepsOpen={stepsOpen}
              stepsControlsId="guidance-steps"
              onToggleSteps={() => setStepsOpen((open) => !open)}
              onEndGuidance={() => {
                setGuidanceEnabled(false)
                setStepsOpen(false)
              }}
            />
          </div>
        </>
      ) : (
        <div
          ref={setBottomOverlay}
          className="absolute inset-x-0 bottom-0 z-20 sm:inset-auto sm:top-4 sm:left-4 sm:w-[400px]"
        >
          <PlanningPanel
            routeState={routeState}
            originLabel={originLabel}
            destinationLabel={destinationLabel}
            activeSearchField={activeSearchField}
            onActiveSearchFieldChange={setActiveSearchField}
            currentLocationAvailable={Boolean(trackedLocation)}
            currentLocationLabel={
              trackedLocation?.source === 'mock'
                ? 'Use mock location'
                : 'Use my current location'
            }
            getSearchBias={getSearchBias}
            locationStatus={locationStatus}
            waitingForLocation={!trackedLocation}
            onUseCurrentLocation={() => {
              setLocationEnabled(true)

              if (!trackedLocation) return

              selectCurrentLocationAsOriginRef.current?.(
                trackedLocation.coordinate,
              )
            }}
            onSelectOrigin={(result) => {
              selectOriginRef.current?.(
                { longitude: result.longitude, latitude: result.latitude },
                result.label,
              )
            }}
            onSelectDestination={(result) => {
              selectDestinationRef.current?.(
                { longitude: result.longitude, latitude: result.latitude },
                result.label,
              )
            }}
            onStartGuidance={() => {
              setLocationEnabled(true)
              setStepsOpen(false)
              setGuidanceEnabled(true)
            }}
            onClearRoute={() => clearRouteRef.current?.()}
            devPanel={devPanel}
          />
        </div>
      )}
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

/**
 * Keeps the puck below the middle of the screen while navigating so the road
 * ahead, not the road behind, fills the map.
 */
function guidanceCameraOffsetY(map: maplibregl.Map) {
  return Math.min(140, map.getContainer().clientHeight * 0.18)
}

function describeLocationStatus(
  location: LocationState,
  trackedLocation: TrackedLocation | null,
): LocationStatus | null {
  if (trackedLocation?.source === 'mock') {
    return { text: 'Mock location active', tone: 'muted' }
  }

  if (trackedLocation?.source === 'gps') {
    return {
      text: `GPS ready · ±${Math.round(trackedLocation.accuracyMeters)} m`,
      tone: 'muted',
    }
  }

  switch (location.status) {
    case 'locating':
      return { text: 'Locating...', tone: 'muted' }
    case 'unsupported':
      return {
        text: 'Location is not supported on this device.',
        tone: 'error',
      }
    case 'error':
      return { text: location.message, tone: 'error' }
    default:
      return null
  }
}
