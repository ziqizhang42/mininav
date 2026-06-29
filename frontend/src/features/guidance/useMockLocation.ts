import { useCallback, useState } from 'react'

import type { RouteResponse } from '../routing/api'
import {
  calculateGuidanceProgress,
  coordinateAlongRoute,
  offsetCoordinateMeters,
  routeLengthMeters,
} from './geo'
import type { TrackedLocation } from './locationSource'

const CALGARY_MOCK_LOCATION = {
  longitude: -114.0719,
  latitude: 51.0447,
}

function mockTrackedLocation(
  coordinate = CALGARY_MOCK_LOCATION,
): TrackedLocation {
  return {
    coordinate,
    accuracyMeters: 10,
    heading: null,
    source: 'mock',
  }
}

export function useMockLocation() {
  const [location, setLocation] = useState<TrackedLocation | null>(null)

  const setCalgaryLocation = useCallback(() => {
    setLocation(mockTrackedLocation())
  }, [])

  const clear = useCallback(() => {
    setLocation(null)
  }, [])

  const setRouteStart = useCallback((route: RouteResponse) => {
    setLocation(mockTrackedLocation(coordinateAlongRoute(route, 0)))
  }, [])

  const advanceAlongRoute = useCallback(
    (route: RouteResponse) => {
      const routeMeters = routeLengthMeters(route)
      const currentAlongMeters = progressAlongRoute(route, location)
      const nextAlongMeters = Math.min(routeMeters, currentAlongMeters + 100)

      setLocation(
        mockTrackedLocation(coordinateAlongRoute(route, nextAlongMeters)),
      )
    },
    [location],
  )

  const setOffRoute = useCallback(
    (route: RouteResponse) => {
      const currentAlongMeters = location
        ? progressAlongRoute(route, location)
        : routeLengthMeters(route) / 2
      const coordinate = coordinateAlongRoute(route, currentAlongMeters)

      setLocation(
        mockTrackedLocation(offsetCoordinateMeters(coordinate, 120, 120)),
      )
    },
    [location],
  )

  const setNearDestination = useCallback((route: RouteResponse) => {
    const nearEnd = Math.max(0, routeLengthMeters(route) - 20)
    setLocation(mockTrackedLocation(coordinateAlongRoute(route, nearEnd)))
  }, [])

  return {
    location,
    setCalgaryLocation,
    clear,
    setRouteStart,
    advanceAlongRoute,
    setOffRoute,
    setNearDestination,
  }
}

function progressAlongRoute(
  route: RouteResponse,
  location: TrackedLocation | null,
) {
  if (!location) {
    return 0
  }

  const routeMeters = routeLengthMeters(route)
  const progress = calculateGuidanceProgress(
    route,
    location.coordinate,
    location.accuracyMeters,
  )

  return Math.min(
    routeMeters,
    Math.max(0, routeMeters - progress.remainingMeters),
  )
}
