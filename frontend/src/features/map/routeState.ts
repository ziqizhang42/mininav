import type { Coordinate, RouteResponse } from '../routing/api'

export type RouteState =
  | { status: 'idle' }
  | { status: 'selecting-destination'; origin: Coordinate }
  | {
      status: 'loading'
      origin: Coordinate
      destination: Coordinate
      requestId: number
    }
  | {
      status: 'success'
      origin: Coordinate
      destination: Coordinate
      route: RouteResponse
    }
  | { status: 'error'; message: string }

export type RouteEvent =
  | { type: 'resetRequested' }
  | { type: 'originSelected'; origin: Coordinate }
  | {
      type: 'routeRequested'
      origin: Coordinate
      destination: Coordinate
      requestId: number
    }
  | { type: 'routeSucceeded'; requestId: number; route: RouteResponse }
  | { type: 'routeFailed'; requestId: number; message: string }

export const initialRouteState: RouteState = { status: 'idle' }

export function routeReducer(state: RouteState, event: RouteEvent): RouteState {
  switch (event.type) {
    case 'resetRequested':
      return { status: 'idle' }

    case 'originSelected':
      return {
        status: 'selecting-destination',
        origin: event.origin,
      }

    case 'routeRequested':
      return {
        status: 'loading',
        origin: event.origin,
        destination: event.destination,
        requestId: event.requestId,
      }

    case 'routeSucceeded':
      if (state.status !== 'loading' || state.requestId !== event.requestId) {
        return state
      }

      return {
        status: 'success',
        origin: state.origin,
        destination: state.destination,
        route: event.route,
      }

    case 'routeFailed':
      if (state.status !== 'loading' || state.requestId !== event.requestId) {
        return state
      }

      return {
        status: 'error',
        message: event.message,
      }
  }
}
