import { describe, expect, it } from 'vitest'

import type { Coordinate, RouteResponse } from '../routing/api'
import { initialRouteState, routeReducer, type RouteState } from './routeState'

const origin: Coordinate = {
  longitude: -114.0719,
  latitude: 51.0447,
}

const destination: Coordinate = {
  longitude: -113.981,
  latitude: 51.05,
}

const route: RouteResponse = {
  origin: {
    ...origin,
    edge_id: 1,
    snap_distance_meters: 12,
  },
  destination: {
    ...destination,
    edge_id: 2,
    snap_distance_meters: 18,
  },
  distance_meters: 1500,
  duration_seconds: 420,
  edge_count: 3,
  geometry: {
    type: 'LineString',
    coordinates: [
      [origin.longitude, origin.latitude],
      [destination.longitude, destination.latitude],
    ],
  },
}

function loadingState(requestId = 1): RouteState {
  return routeReducer(initialRouteState, {
    type: 'routeRequested',
    origin,
    destination,
    requestId,
  })
}

describe('routeReducer', () => {
  it('starts selecting a destination after an origin is selected', () => {
    expect(
      routeReducer(initialRouteState, {
        type: 'originSelected',
        origin,
      }),
    ).toEqual({
      status: 'selecting-destination',
      origin,
    })
  })

  it('enters loading when a route is requested', () => {
    expect(
      routeReducer(initialRouteState, {
        type: 'routeRequested',
        origin,
        destination,
        requestId: 1,
      }),
    ).toEqual({
      status: 'loading',
      origin,
      destination,
      requestId: 1,
    })
  })

  it('stores a successful route for the active request', () => {
    expect(
      routeReducer(loadingState(1), {
        type: 'routeSucceeded',
        requestId: 1,
        route,
      }),
    ).toEqual({
      status: 'success',
      origin,
      destination,
      route,
    })
  })

  it('ignores a successful route from a stale request', () => {
    const state = loadingState(1)

    expect(
      routeReducer(state, {
        type: 'routeSucceeded',
        requestId: 2,
        route,
      }),
    ).toBe(state)
  })

  it('stores an error for the active request', () => {
    expect(
      routeReducer(loadingState(1), {
        type: 'routeFailed',
        requestId: 1,
        message: 'No route found',
      }),
    ).toEqual({
      status: 'error',
      message: 'No route found',
    })
  })

  it('ignores an error from a stale request', () => {
    const state = loadingState(1)

    expect(
      routeReducer(state, {
        type: 'routeFailed',
        requestId: 2,
        message: 'No route found',
      }),
    ).toBe(state)
  })

  it('resets to idle from any state', () => {
    expect(routeReducer(loadingState(1), { type: 'resetRequested' })).toEqual(
      initialRouteState,
    )

    expect(
      routeReducer(
        {
          status: 'success',
          origin,
          destination,
          route,
        },
        { type: 'resetRequested' },
      ),
    ).toEqual(initialRouteState)

    expect(
      routeReducer(
        {
          status: 'error',
          message: 'No route found',
        },
        { type: 'resetRequested' },
      ),
    ).toEqual(initialRouteState)
  })
})
