import { useEffect, useRef } from 'react'

import type { Coordinate, RouteResponse } from '../routing/api'
import type { GuidanceProgress } from './geo'
import type { TrackedLocation } from './locationSource'

const OFF_ROUTE_CONFIRMATION_MS = 3_000
const REROUTE_COOLDOWN_MS = 10_000
const MAX_REROUTE_ACCURACY_METERS = 100

type AutomaticReroutingOptions = {
  enabled: boolean
  route: RouteResponse | null
  destination: Coordinate | null
  trackedLocation: TrackedLocation | null
  progress: GuidanceProgress | null
  isRerouting: boolean
  requestRoute: (
    origin: Coordinate,
    destination: Coordinate,
  ) => Promise<RouteResponse>
  onRerouteStarted: (requestId: number) => void
  onRerouteSucceeded: (requestId: number, route: RouteResponse) => void
  onRerouteFailed: (requestId: number, message: string) => void
}

type ReadyRerouteOptions = AutomaticReroutingOptions & {
  route: RouteResponse
  destination: Coordinate
  trackedLocation: TrackedLocation
  progress: GuidanceProgress
}

export function useAutomaticRerouting(options: AutomaticReroutingOptions) {
  const latestOptionsRef = useRef(options)
  const confirmationTimerRef = useRef<number | null>(null)
  const lastRerouteAtRef = useRef(-REROUTE_COOLDOWN_MS)
  const nextRequestIdRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    latestOptionsRef.current = options

    if (!isRerouteCandidate(options)) {
      clearConfirmationTimer(confirmationTimerRef)
      return
    }

    if (confirmationTimerRef.current !== null) {
      return
    }

    confirmationTimerRef.current = window.setTimeout(
      function runRerouteCheck() {
        confirmationTimerRef.current = null

        const latest = latestOptionsRef.current

        if (!isRerouteCandidate(latest)) {
          return
        }

        const now = Date.now()
        const cooldownRemaining =
          REROUTE_COOLDOWN_MS - (now - lastRerouteAtRef.current)

        if (latest.isRerouting || cooldownRemaining > 0) {
          confirmationTimerRef.current = window.setTimeout(
            runRerouteCheck,
            Math.max(1_000, cooldownRemaining),
          )
          return
        }

        const requestId = ++nextRequestIdRef.current
        lastRerouteAtRef.current = now

        latest.onRerouteStarted(requestId)

        void latest
          .requestRoute(latest.trackedLocation.coordinate, latest.destination)
          .then((route) => {
            if (!mountedRef.current) return
            latestOptionsRef.current.onRerouteSucceeded(requestId, route)
          })
          .catch((error: unknown) => {
            if (!mountedRef.current) return

            latestOptionsRef.current.onRerouteFailed(
              requestId,
              error instanceof Error ? error.message : 'Unable to reroute',
            )
          })
      },
      OFF_ROUTE_CONFIRMATION_MS,
    )
  })

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
      clearConfirmationTimer(confirmationTimerRef)
    }
  }, [])
}

function isRerouteCandidate(
  options: AutomaticReroutingOptions,
): options is ReadyRerouteOptions {
  return Boolean(
    options.enabled &&
    !options.isRerouting &&
    options.route &&
    options.destination &&
    options.trackedLocation &&
    options.progress &&
    !options.progress.hasArrived &&
    options.progress.isOffRoute &&
    options.trackedLocation.accuracyMeters <= MAX_REROUTE_ACCURACY_METERS,
  )
}

function clearConfirmationTimer(timerRef: { current: number | null }) {
  if (timerRef.current === null) {
    return
  }

  window.clearTimeout(timerRef.current)
  timerRef.current = null
}
