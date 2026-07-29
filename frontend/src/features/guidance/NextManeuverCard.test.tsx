import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { RouteResponse } from '../routing/api'
import type { GuidanceProgress } from './geo'
import { NextManeuverCard } from './NextManeuverCard'
import type { RouteStep } from './maneuver'

function step(
  sequence: number,
  roadName: string | null,
  overrides: Partial<RouteStep> = {},
): RouteStep {
  return {
    sequence,
    instruction: `Turn right onto ${roadName}`,
    road_name: roadName,
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

const route: RouteResponse = {
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
  distance_meters: 1200,
  duration_seconds: 300,
  edge_count: 3,
  geometry: {
    type: 'LineString',
    coordinates: [
      [-114.07, 51.04],
      [-114.06, 51.05],
    ],
  },
  steps: [
    step(0, 'Centre Street'),
    step(1, 'Memorial Drive'),
    step(2, 'Edmonton Trail'),
  ],
}

function progress(overrides: Partial<GuidanceProgress> = {}): GuidanceProgress {
  return {
    snapped: { longitude: -114.07, latitude: 51.04 },
    distanceFromRouteMeters: 4,
    remainingMeters: 900,
    distanceToNextStepMeters: 240,
    activeStepIndex: 0,
    nextInstruction: 'Turn right onto Memorial Drive',
    isOffRoute: false,
    hasArrived: false,
    ...overrides,
  }
}

function renderCard(
  overrides: Partial<Parameters<typeof NextManeuverCard>[0]>,
) {
  return render(
    <NextManeuverCard
      route={route}
      progress={progress()}
      isRerouting={false}
      destinationLabel="Bow Tower"
      {...overrides}
    />,
  )
}

describe('NextManeuverCard', () => {
  it('leads with the distance and road of the next maneuver', () => {
    renderCard({})

    expect(screen.getByText('240')).toBeInTheDocument()
    expect(screen.getByText('Memorial Drive')).toBeInTheDocument()
    expect(screen.getAllByText('Turn right')[0]).toBeInTheDocument()
  })

  it('previews the maneuver after the next one', () => {
    renderCard({})

    expect(screen.getByText('then')).toBeInTheDocument()
    expect(screen.getByText(/Edmonton Trail/)).toBeInTheDocument()
  })

  it('says "Now" once the maneuver is metres away', () => {
    renderCard({ progress: progress({ distanceToNextStepMeters: 12 }) })

    expect(screen.getByText('Now')).toBeInTheDocument()
  })

  it('asks for a location fix before guidance has one', () => {
    renderCard({ progress: null })

    expect(screen.getByText('Waiting for GPS')).toBeInTheDocument()
  })

  it('reports a location failure instead of waiting forever', () => {
    renderCard({ progress: null, locationError: 'User denied geolocation' })

    expect(screen.getByText('No location')).toBeInTheDocument()
    expect(screen.getByText('User denied geolocation')).toBeInTheDocument()
    expect(screen.queryByText('Waiting for GPS')).not.toBeInTheDocument()
  })

  it('announces rerouting ahead of the maneuver', () => {
    renderCard({ isRerouting: true })

    expect(screen.getByText('Rerouting')).toBeInTheDocument()
    expect(screen.queryByText('Memorial Drive')).not.toBeInTheDocument()
  })

  it('warns when the driver leaves the route', () => {
    renderCard({
      progress: progress({ isOffRoute: true }),
      rerouteError: 'No route from here',
    })

    expect(screen.getByText('Off route')).toBeInTheDocument()
    expect(screen.getByText('No route from here')).toBeInTheDocument()
  })

  it('confirms arrival with the destination label', () => {
    renderCard({ progress: progress({ hasArrived: true }) })

    expect(screen.getByText('You have arrived')).toBeInTheDocument()
    expect(screen.getByText('Bow Tower')).toBeInTheDocument()
  })
})
