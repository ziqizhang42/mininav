import { useEffect, useState } from 'react'
import type { Coordinate } from '../routing/api'

export type LocationState =
  | { status: 'idle' }
  | { status: 'unsupported' }
  | { status: 'locating' }
  | {
      status: 'ready'
      coordinate: Coordinate
      accuracyMeters: number
      heading: number | null
    }
  | { status: 'error'; message: string }

type LocationResult = Extract<LocationState, { status: 'ready' | 'error' }>

export function useGeolocation(enabled: boolean): LocationState {
  const [result, setResult] = useState<LocationResult | null>(null)

  const geolocation =
    typeof navigator === 'undefined' ? undefined : navigator.geolocation

  useEffect(() => {
    if (!enabled || !geolocation) {
      return
    }

    const watchId = geolocation.watchPosition(
      (position) => {
        setResult({
          status: 'ready',
          coordinate: {
            longitude: position.coords.longitude,
            latitude: position.coords.latitude,
          },
          accuracyMeters: position.coords.accuracy,
          heading: position.coords.heading,
        })
      },
      (error) => setResult({ status: 'error', message: error.message }),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 },
    )

    return () => geolocation.clearWatch(watchId)
  }, [enabled, geolocation])

  if (!enabled) {
    return { status: 'idle' }
  }

  if (!geolocation) {
    return { status: 'unsupported' }
  }

  return result ?? { status: 'locating' }
}
