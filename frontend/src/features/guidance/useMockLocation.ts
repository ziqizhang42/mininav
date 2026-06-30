import { useCallback, useEffect, useRef, useState } from 'react'

import type { Coordinate, RouteResponse } from '../routing/api'
import {
  calculateGuidanceProgress,
  coordinateAlongRoute,
  offsetCoordinateMeters,
  routeLengthMeters,
} from './geo'
import type { TrackedLocation } from './locationSource'

const CALGARY_MOCK_LOCATION: Coordinate = {
  longitude: -114.0719,
  latitude: 51.0447,
}

const GPS_JITTER_INTERVAL_MS = 700
const GPS_JITTER_SAMPLE_COUNT = 36
const GPS_JITTER_RADIUS_METERS = 8
const GPS_JITTER_STEP_METERS = 2.4
const GPS_JITTER_ACCURACY_METERS = 12

type MockTrackedLocationOptions = {
  accuracyMeters?: number
  heading?: number | null
  speedMetersPerSecond?: number | null
}

type JitterOffset = {
  eastMeters: number
  northMeters: number
}

function mockTrackedLocation(
  coordinate = CALGARY_MOCK_LOCATION,
  options: MockTrackedLocationOptions = {},
): TrackedLocation {
  return {
    coordinate,
    speedMetersPerSecond: options.speedMetersPerSecond ?? 0,
    accuracyMeters: options.accuracyMeters ?? 10,
    heading: options.heading ?? null,
    source: 'mock',
  }
}

export function useMockLocation() {
  const [location, setLocation] = useState<TrackedLocation | null>(null)
  const [isJittering, setIsJittering] = useState(false)
  const jitterTimerRef = useRef<number | null>(null)

  const stopGpsJitter = useCallback(() => {
    if (jitterTimerRef.current !== null) {
      window.clearInterval(jitterTimerRef.current)
      jitterTimerRef.current = null
    }

    setIsJittering(false)
  }, [])

  useEffect(() => {
    return () => {
      if (jitterTimerRef.current !== null) {
        window.clearInterval(jitterTimerRef.current)
      }
    }
  }, [])

  const setCalgaryLocation = useCallback(() => {
    stopGpsJitter()
    setLocation(mockTrackedLocation())
  }, [stopGpsJitter])

  const clear = useCallback(() => {
    stopGpsJitter()
    setLocation(null)
  }, [stopGpsJitter])

  const setRouteStart = useCallback(
    (route: RouteResponse) => {
      stopGpsJitter()
      setLocation(mockTrackedLocation(coordinateAlongRoute(route, 0)))
    },
    [stopGpsJitter],
  )

  const advanceAlongRoute = useCallback(
    (route: RouteResponse) => {
      stopGpsJitter()
      const routeMeters = routeLengthMeters(route)
      const currentAlongMeters = progressAlongRoute(route, location)
      const nextAlongMeters = Math.min(routeMeters, currentAlongMeters + 100)

      setLocation(
        mockTrackedLocation(coordinateAlongRoute(route, nextAlongMeters)),
      )
    },
    [location, stopGpsJitter],
  )

  const setOffRoute = useCallback(
    (route: RouteResponse) => {
      stopGpsJitter()
      const currentAlongMeters = location
        ? progressAlongRoute(route, location)
        : routeLengthMeters(route) / 2
      const coordinate = coordinateAlongRoute(route, currentAlongMeters)

      setLocation(
        mockTrackedLocation(offsetCoordinateMeters(coordinate, 120, 120)),
      )
    },
    [location, stopGpsJitter],
  )

  const setNearDestination = useCallback(
    (route: RouteResponse) => {
      stopGpsJitter()
      const nearEnd = Math.max(0, routeLengthMeters(route) - 20)
      setLocation(mockTrackedLocation(coordinateAlongRoute(route, nearEnd)))
    },
    [stopGpsJitter],
  )

  const startGpsJitter = useCallback(
    (route: RouteResponse | null) => {
      stopGpsJitter()

      const anchor =
        location?.coordinate ??
        (route ? coordinateAlongRoute(route, 0) : CALGARY_MOCK_LOCATION)
      let sampleCount = 0
      let jitterOffset: JitterOffset = { eastMeters: 0, northMeters: 0 }

      const emitJitteredLocation = () => {
        jitterOffset = nextJitterOffset(jitterOffset)

        setLocation(
          mockTrackedLocation(
            offsetCoordinateMeters(
              anchor,
              jitterOffset.eastMeters,
              jitterOffset.northMeters,
            ),
            {
              accuracyMeters: GPS_JITTER_ACCURACY_METERS,
              speedMetersPerSecond: 0,
            },
          ),
        )
      }

      setIsJittering(true)
      emitJitteredLocation()

      jitterTimerRef.current = window.setInterval(() => {
        sampleCount += 1

        if (sampleCount >= GPS_JITTER_SAMPLE_COUNT) {
          stopGpsJitter()
          return
        }

        emitJitteredLocation()
      }, GPS_JITTER_INTERVAL_MS)
    },
    [location, stopGpsJitter],
  )

  return {
    location,
    setCalgaryLocation,
    clear,
    setRouteStart,
    advanceAlongRoute,
    setOffRoute,
    setNearDestination,
    isJittering,
    startGpsJitter,
  }
}

function nextJitterOffset(offset: JitterOffset): JitterOffset {
  return clampJitterOffset({
    eastMeters: offset.eastMeters * 0.72 + randomJitterStepMeters(),
    northMeters: offset.northMeters * 0.72 + randomJitterStepMeters(),
  })
}

function randomJitterStepMeters() {
  return (Math.random() - 0.5) * GPS_JITTER_STEP_METERS * 2
}

function clampJitterOffset(offset: JitterOffset): JitterOffset {
  const distance = Math.hypot(offset.eastMeters, offset.northMeters)

  if (distance <= GPS_JITTER_RADIUS_METERS) {
    return offset
  }

  const scale = GPS_JITTER_RADIUS_METERS / distance

  return {
    eastMeters: offset.eastMeters * scale,
    northMeters: offset.northMeters * scale,
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
