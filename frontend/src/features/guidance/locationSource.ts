import type { Coordinate } from '../routing/api'
import type { LocationState } from './useGeolocation'

export type TrackedLocation = {
  coordinate: Coordinate
  accuracyMeters: number
  heading: number | null
  source: 'gps' | 'mock'
}

export function trackedLocationFromGps(
  location: LocationState,
): TrackedLocation | null {
  if (location.status !== 'ready') return null

  return {
    coordinate: location.coordinate,
    accuracyMeters: location.accuracyMeters,
    heading: location.heading,
    source: 'gps',
  }
}
