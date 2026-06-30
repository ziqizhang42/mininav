import { describe, expect, it } from 'vitest'

import type { RouteResponse } from '../routing/api'
import {
  bearingDegrees,
  calculateGuidanceProgress,
  coordinateAlongRoute,
  interpolateBearing,
  offsetCoordinateMeters,
  routeBearingAt,
  routeLengthMeters,
} from './geo'

const origin = {
  longitude: -114.0719,
  latitude: 51.0447,
}

const turn = {
  longitude: -114.0619,
  latitude: 51.0447,
}

const destination = {
  longitude: -114.0619,
  latitude: 51.0547,
}

const route: RouteResponse = {
  origin: {
    ...origin,
    edge_id: 1,
    snap_distance_meters: 0,
  },
  destination: {
    ...destination,
    edge_id: 2,
    snap_distance_meters: 0,
  },
  distance_meters: 1810,
  duration_seconds: 300,
  edge_count: 2,
  geometry: {
    type: 'LineString',
    coordinates: [
      [origin.longitude, origin.latitude],
      [turn.longitude, turn.latitude],
      [destination.longitude, destination.latitude],
    ],
  },
  steps: [
    {
      sequence: 0,
      instruction: 'Head east on 1 Avenue',
      road_name: '1 Avenue',
      distance_meters: 700,
      duration_seconds: 120,
      maneuver: {
        type: 'depart',
        modifier: 'east',
        location: [origin.longitude, origin.latitude],
        bearing_before: null,
        bearing_after: 90,
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [origin.longitude, origin.latitude],
          [turn.longitude, turn.latitude],
        ],
      },
    },
    {
      sequence: 1,
      instruction: 'Turn left onto Centre Street',
      road_name: 'Centre Street',
      distance_meters: 1110,
      duration_seconds: 180,
      maneuver: {
        type: 'turn',
        modifier: 'left',
        location: [turn.longitude, turn.latitude],
        bearing_before: 90,
        bearing_after: 0,
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [turn.longitude, turn.latitude],
          [destination.longitude, destination.latitude],
        ],
      },
    },
    {
      sequence: 2,
      instruction: 'Arrive at destination',
      road_name: null,
      distance_meters: 0,
      duration_seconds: 0,
      maneuver: {
        type: 'arrive',
        modifier: null,
        location: [destination.longitude, destination.latitude],
        bearing_before: 0,
        bearing_after: null,
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [destination.longitude, destination.latitude],
          [destination.longitude, destination.latitude],
        ],
      },
    },
  ],
}

describe('calculateGuidanceProgress', () => {
  it('snaps an on-route position to the route', () => {
    const progress = calculateGuidanceProgress(route, {
      longitude: -114.0669,
      latitude: 51.0447,
    })

    expect(progress.distanceFromRouteMeters).toBeLessThan(5)
    expect(progress.isOffRoute).toBe(false)
    expect(progress.hasArrived).toBe(false)
  })

  it('reports the next instruction and distance before the turn', () => {
    const progress = calculateGuidanceProgress(route, {
      longitude: -114.0669,
      latitude: 51.0447,
    })

    expect(progress.activeStepIndex).toBe(0)
    expect(progress.nextInstruction).toBe('Turn left onto Centre Street')
    expect(progress.distanceToNextStepMeters).toBeGreaterThan(250)
    expect(progress.distanceToNextStepMeters).toBeLessThan(450)
  })

  it('advances to the arrival instruction after the turn', () => {
    const progress = calculateGuidanceProgress(route, {
      longitude: -114.0619,
      latitude: 51.0497,
    })

    expect(progress.activeStepIndex).toBe(1)
    expect(progress.nextInstruction).toBe('Arrive at destination')
  })

  it('detects off-route positions', () => {
    const progress = calculateGuidanceProgress(route, {
      longitude: -114.0669,
      latitude: 51.0477,
    })

    expect(progress.distanceFromRouteMeters).toBeGreaterThan(50)
    expect(progress.isOffRoute).toBe(true)
  })

  it('uses accuracy to avoid false off-route warnings', () => {
    const progress = calculateGuidanceProgress(
      route,
      {
        longitude: -114.0669,
        latitude: 51.0477,
      },
      300,
    )

    expect(progress.distanceFromRouteMeters).toBeGreaterThan(50)
    expect(progress.isOffRoute).toBe(false)
  })

  it('detects arrival near the destination', () => {
    const progress = calculateGuidanceProgress(route, {
      longitude: destination.longitude,
      latitude: destination.latitude,
    })

    expect(progress.hasArrived).toBe(true)
    expect(progress.remainingMeters).toBeLessThanOrEqual(50)
  })
})

describe('route geometry helpers', () => {
  it('calculates route length from route geometry', () => {
    const length = routeLengthMeters(route)

    expect(length).toBeGreaterThan(1800)
    expect(length).toBeLessThan(1830)
  })

  it('returns the first coordinate at the start of the route', () => {
    expect(coordinateAlongRoute(route, 0)).toEqual(origin)
  })

  it('returns the final coordinate past the end of the route', () => {
    expect(coordinateAlongRoute(route, 999_999)).toEqual(destination)
  })

  it('returns an interpolated coordinate along the route', () => {
    const coordinate = coordinateAlongRoute(route, 350)

    expect(coordinate.latitude).toBeCloseTo(origin.latitude, 5)
    expect(coordinate.longitude).toBeGreaterThan(origin.longitude)
    expect(coordinate.longitude).toBeLessThan(turn.longitude)
  })

  it('offsets a coordinate by meters', () => {
    const coordinate = offsetCoordinateMeters(origin, 100, 100)

    expect(coordinate.longitude).toBeGreaterThan(origin.longitude)
    expect(coordinate.latitude).toBeCloseTo(origin.latitude + 100 / 111_320, 5)
  })

  it('calculates bearings between coordinates', () => {
    expect(bearingDegrees(origin, turn)).toBeCloseTo(90)
    expect(bearingDegrees(turn, destination)).toBeCloseTo(0)
  })

  it('calculates route bearings from route progress', () => {
    expect(routeBearingAt(route, 100)).toBeCloseTo(90)
    expect(routeBearingAt(route, routeLengthMeters(route) - 100)).toBeCloseTo(0)
  })

  it('interpolates bearings across north', () => {
    expect(interpolateBearing(350, 10, 0.5)).toBeCloseTo(0)
  })

  it('creates an off-route simulation point that guidance detects', () => {
    const midpoint = coordinateAlongRoute(route, routeLengthMeters(route) / 2)
    const offRoutePoint = offsetCoordinateMeters(midpoint, 120, 120)

    const progress = calculateGuidanceProgress(route, offRoutePoint)

    expect(progress.distanceFromRouteMeters).toBeGreaterThan(50)
    expect(progress.isOffRoute).toBe(true)
  })

  it('creates a near-destination simulation point that guidance detects', () => {
    const nearDestination = coordinateAlongRoute(
      route,
      routeLengthMeters(route) - 20,
    )

    const progress = calculateGuidanceProgress(route, nearDestination)

    expect(progress.hasArrived).toBe(true)
  })
})
