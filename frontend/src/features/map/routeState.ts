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
      isRerouting: boolean
      rerouteRequestId: number | null
      rerouteError?: string
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
  | { type: 'rerouteRequested'; requestId: number }
  | { type: 'rerouteSucceeded'; requestId: number; route: RouteResponse }
  | { type: 'rerouteFailed'; requestId: number; message: string }

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
        isRerouting: false,
        rerouteRequestId: null,
      }

    case 'routeFailed':
      if (state.status !== 'loading' || state.requestId !== event.requestId) {
        return state
      }

      return {
        status: 'error',
        message: event.message,
      }

    case 'rerouteRequested':
      if (state.status !== 'success') {
        return state
      }

      return {
        ...state,
        isRerouting: true,
        rerouteRequestId: event.requestId,
        rerouteError: undefined,
      }

    case 'rerouteSucceeded':
      if (
        state.status !== 'success' ||
        state.rerouteRequestId !== event.requestId
      ) {
        return state
      }

      return {
        ...state,
        origin: event.route.origin,
        route: event.route,
        isRerouting: false,
        rerouteRequestId: null,
        rerouteError: undefined,
      }

    case 'rerouteFailed':
      if (
        state.status !== 'success' ||
        state.rerouteRequestId !== event.requestId
      ) {
        return state
      }

      return {
        ...state,
        isRerouting: false,
        rerouteRequestId: null,
        rerouteError: event.message,
      }
  }
}
