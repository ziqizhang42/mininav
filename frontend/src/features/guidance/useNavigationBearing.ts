import { useEffect, useRef } from 'react'

import type { RouteResponse } from '../routing/api'
import {
  bearingDegrees,
  distanceMeters,
  interpolateBearing,
  normalizeBearing,
  routeBearingAt,
  routeLengthMeters,
  type GuidanceProgress,
} from './geo'
import type { TrackedLocation } from './locationSource'

const ROUTE_LOOKAHEAD_METERS = 10
const MIN_MOVEMENT_METERS = 5
const MAX_MOVEMENT_METERS = 25
const MIN_HEADING_SPEED_METERS_PER_SECOND = 0.5
const BEARING_SMOOTHING = 1

type Options = {
  enabled: boolean
  route: RouteResponse | null
  progress: GuidanceProgress | null
  trackedLocation: TrackedLocation | null
}

export function useNavigationBearing({
  enabled,
  route,
  progress,
  trackedLocation,
}: Options) {
  const previousLocationRef = useRef<TrackedLocation | null>(null)
  const smoothedBearingRef = useRef<number | null>(null)
  const bearingRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) {
      previousLocationRef.current = null
      smoothedBearingRef.current = null
      bearingRef.current = null
      return
    }

    if (!trackedLocation) {
      return
    }

    const previousLocation = previousLocationRef.current
    previousLocationRef.current = trackedLocation

    const targetBearing = selectTargetBearing({
      route,
      progress,
      trackedLocation,
      previousLocation,
    })

    if (targetBearing === null) {
      bearingRef.current = smoothedBearingRef.current
      return
    }

    const nextBearing =
      smoothedBearingRef.current === null
        ? targetBearing
        : interpolateBearing(
            smoothedBearingRef.current,
            targetBearing,
            BEARING_SMOOTHING,
          )

    smoothedBearingRef.current = nextBearing
    bearingRef.current = nextBearing
  }, [enabled, route, progress, trackedLocation])

  return bearingRef
}

type BearingSelectionOptions = {
  route: RouteResponse | null
  progress: GuidanceProgress | null
  trackedLocation: TrackedLocation
  previousLocation: TrackedLocation | null
}

function selectTargetBearing({
  route,
  progress,
  trackedLocation,
  previousLocation,
}: BearingSelectionOptions) {
  if (route && progress && !progress.isOffRoute && !progress.hasArrived) {
    const traveledMeters = routeLengthMeters(route) - progress.remainingMeters
    const lookaheadMeters =
      progress.distanceToNextStepMeters > 0
        ? Math.min(ROUTE_LOOKAHEAD_METERS, progress.distanceToNextStepMeters)
        : ROUTE_LOOKAHEAD_METERS
    const routeBearing = routeBearingAt(route, traveledMeters, lookaheadMeters)

    if (routeBearing !== null) {
      return routeBearing
    }
  }

  if (
    trackedLocation.heading !== null &&
    Number.isFinite(trackedLocation.heading) &&
    (trackedLocation.speedMetersPerSecond === null ||
      trackedLocation.speedMetersPerSecond >=
        MIN_HEADING_SPEED_METERS_PER_SECOND)
  ) {
    return normalizeBearing(trackedLocation.heading)
  }

  if (!previousLocation || previousLocation.source !== trackedLocation.source) {
    return null
  }

  const movedMeters = distanceMeters(
    previousLocation.coordinate,
    trackedLocation.coordinate,
  )
  const movementThreshold = Math.min(
    MAX_MOVEMENT_METERS,
    Math.max(MIN_MOVEMENT_METERS, trackedLocation.accuracyMeters * 0.5),
  )

  if (movedMeters < movementThreshold) {
    return null
  }

  return bearingDegrees(previousLocation.coordinate, trackedLocation.coordinate)
}
