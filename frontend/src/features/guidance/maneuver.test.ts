import { describe, expect, it } from 'vitest'

import type { RouteResponse } from '../routing/api'
import type { GuidanceProgress } from './geo'
import {
  maneuverAction,
  maneuverTarget,
  stepProgressFraction,
  upcomingStepIndex,
  type RouteStep,
} from './maneuver'

function step(overrides: Partial<RouteStep> = {}): RouteStep {
  return {
    sequence: 0,
    instruction: 'Turn right onto Memorial Drive',
    road_name: 'Memorial Drive',
    distance_meters: 400,
    duration_seconds: 60,
    maneuver: {
      type: 'turn',
      modifier: 'right',
      location: [-114.07, 51.04],
      bearing_before: 0,
      bearing_after: 90,
    },
    geometry: {
      type: 'LineString',
      coordinates: [
        [-114.07, 51.04],
        [-114.06, 51.04],
      ],
    },
    ...overrides,
  }
}

function route(steps: RouteStep[]): RouteResponse {
  return {
    origin: {
      longitude: -114.07,
      latitude: 51.04,
      edge_id: 1,
      snap_distance_meters: 0,
    },
    destination: {
      longitude: -114.06,
      latitude: 51.05,
      edge_id: 2,
      snap_distance_meters: 0,
    },
    distance_meters: steps.reduce((sum, item) => sum + item.distance_meters, 0),
    duration_seconds: 300,
    edge_count: steps.length,
    geometry: {
      type: 'LineString',
      coordinates: [
        [-114.07, 51.04],
        [-114.06, 51.05],
      ],
    },
    steps,
  }
}

function progress(overrides: Partial<GuidanceProgress> = {}): GuidanceProgress {
  return {
    snapped: { longitude: -114.07, latitude: 51.04 },
    distanceFromRouteMeters: 3,
    remainingMeters: 800,
    distanceToNextStepMeters: 100,
    activeStepIndex: 0,
    nextInstruction: 'Turn right onto Memorial Drive',
    isOffRoute: false,
    hasArrived: false,
    ...overrides,
  }
}

describe('maneuverAction', () => {
  it('names turns without repeating the road', () => {
    expect(maneuverAction(step())).toBe('Turn right')
  })

  it('keeps slight turns short', () => {
    expect(
      maneuverAction(
        step({ maneuver: { ...step().maneuver, modifier: 'slight left' } }),
      ),
    ).toBe('Slight left')
  })

  it('spells out u-turns', () => {
    expect(
      maneuverAction(
        step({ maneuver: { ...step().maneuver, modifier: 'u-turn' } }),
      ),
    ).toBe('Make a U-turn')
  })

  it('uses the cardinal direction when departing', () => {
    expect(
      maneuverAction(
        step({
          maneuver: { ...step().maneuver, type: 'depart', modifier: 'north' },
        }),
      ),
    ).toBe('Head north')
  })

  it('falls back to continue for straight maneuvers', () => {
    expect(
      maneuverAction(
        step({
          maneuver: { ...step().maneuver, type: 'continue', modifier: null },
        }),
      ),
    ).toBe('Continue')
  })
})

describe('maneuverTarget', () => {
  it('uses the road the maneuver leads onto', () => {
    expect(maneuverTarget(step())).toBe('Memorial Drive')
  })

  it('labels unnamed roads', () => {
    expect(maneuverTarget(step({ road_name: null }))).toBe('Unnamed road')
  })

  it('labels the final step as the destination', () => {
    expect(
      maneuverTarget(
        step({
          road_name: null,
          maneuver: { ...step().maneuver, type: 'arrive', modifier: null },
        }),
      ),
    ).toBe('Destination')
  })
})

describe('upcomingStepIndex', () => {
  const steps = [
    step({ sequence: 0 }),
    step({ sequence: 1 }),
    step({ sequence: 2 }),
  ]

  it('points at the maneuver after the current step', () => {
    expect(
      upcomingStepIndex(route(steps), progress({ activeStepIndex: 0 })),
    ).toBe(1)
  })

  it('stops at the last step', () => {
    expect(
      upcomingStepIndex(route(steps), progress({ activeStepIndex: 2 })),
    ).toBe(2)
  })

  it('points at the last step once arrived', () => {
    expect(
      upcomingStepIndex(
        route(steps),
        progress({ activeStepIndex: 0, hasArrived: true }),
      ),
    ).toBe(2)
  })
})

describe('stepProgressFraction', () => {
  it('grows as the maneuver gets closer', () => {
    expect(
      stepProgressFraction(
        route([step({ distance_meters: 400 })]),
        progress({ distanceToNextStepMeters: 100 }),
      ),
    ).toBeCloseTo(0.75)
  })

  it('treats zero-length steps as complete', () => {
    expect(
      stepProgressFraction(
        route([step({ distance_meters: 0 })]),
        progress({ distanceToNextStepMeters: 0 }),
      ),
    ).toBe(1)
  })

  it('clamps when the driver overshoots the step', () => {
    expect(
      stepProgressFraction(
        route([step({ distance_meters: 400 })]),
        progress({ distanceToNextStepMeters: 900 }),
      ),
    ).toBe(0)
  })
})
