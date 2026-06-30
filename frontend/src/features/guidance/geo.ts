import type { Coordinate, RouteResponse } from '../routing/api'

export type GuidanceProgress = {
  snapped: Coordinate
  distanceFromRouteMeters: number
  remainingMeters: number
  distanceToNextStepMeters: number
  activeStepIndex: number
  nextInstruction: string
  isOffRoute: boolean
  hasArrived: boolean
}

const EARTH_RADIUS_METERS = 6_371_008.8
const OFF_ROUTE_METERS = 50
const ARRIVAL_METERS = 50

type RouteProjection = {
  coordinate: Coordinate
  distanceMeters: number
  alongMeters: number
  totalMeters: number
}

export function calculateGuidanceProgress(
  route: RouteResponse,
  position: Coordinate,
  accuracyMeters = 0,
): GuidanceProgress {
  const routeCoordinates = route.geometry.coordinates.map(
    ([longitude, latitude]) => ({ longitude, latitude }),
  )

  const projection = projectOntoRoute(routeCoordinates, position)
  const activeStepIndex = findActiveStepIndex(route, projection.alongMeters)
  const nextStep =
    route.steps[Math.min(activeStepIndex + 1, route.steps.length - 1)]
  const remainingMeters = Math.max(
    0,
    projection.totalMeters - projection.alongMeters,
  )
  const offRouteLimit = Math.max(OFF_ROUTE_METERS, accuracyMeters * 1.5)

  return {
    snapped: projection.coordinate,
    distanceFromRouteMeters: projection.distanceMeters,
    remainingMeters,
    distanceToNextStepMeters: Math.max(
      0,
      distanceToStep(route, projection.alongMeters, nextStep.sequence),
    ),
    activeStepIndex,
    nextInstruction: nextStep.instruction,
    isOffRoute: projection.distanceMeters > offRouteLimit,
    hasArrived: remainingMeters <= ARRIVAL_METERS,
  }
}

export function routeLengthMeters(route: RouteResponse) {
  const coordinates = route.geometry.coordinates.map(
    ([longitude, latitude]) => ({
      longitude,
      latitude,
    }),
  )

  return coordinates.reduce((sum, coordinate, index) => {
    if (index === 0) return sum
    return sum + distanceMeters(coordinates[index - 1], coordinate)
  }, 0)
}

export function coordinateAlongRoute(
  route: RouteResponse,
  alongMeters: number,
): Coordinate {
  const coordinates = route.geometry.coordinates.map(
    ([longitude, latitude]) => ({
      longitude,
      latitude,
    }),
  )

  let remainingMeters = Math.max(0, alongMeters)

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = coordinates[index]
    const end = coordinates[index + 1]
    const segmentMeters = distanceMeters(start, end)

    if (remainingMeters <= segmentMeters) {
      const fraction = segmentMeters === 0 ? 0 : remainingMeters / segmentMeters
      return {
        longitude:
          start.longitude + (end.longitude - start.longitude) * fraction,
        latitude: start.latitude + (end.latitude - start.latitude) * fraction,
      }
    }

    remainingMeters -= segmentMeters
  }

  return coordinates[coordinates.length - 1]
}

export function offsetCoordinateMeters(
  coordinate: Coordinate,
  eastMeters: number,
  northMeters: number,
): Coordinate {
  const metersPerDegreeLatitude = 111_320
  const metersPerDegreeLongitude =
    metersPerDegreeLatitude * Math.cos(radians(coordinate.latitude))

  return {
    longitude: coordinate.longitude + eastMeters / metersPerDegreeLongitude,
    latitude: coordinate.latitude + northMeters / metersPerDegreeLatitude,
  }
}

export function routeBearingAt(
  route: RouteResponse,
  alongMeters: number,
  lookaheadMeters = 25,
): number | null {
  const routeMeters = routeLengthMeters(route)
  const clampedAlongMeters = Math.min(routeMeters, Math.max(0, alongMeters))
  const start = coordinateAlongRoute(route, clampedAlongMeters)
  const ahead = coordinateAlongRoute(
    route,
    Math.min(routeMeters, clampedAlongMeters + lookaheadMeters),
  )

  if (distanceMeters(start, ahead) >= 1) {
    return bearingDegrees(start, ahead)
  }

  const behind = coordinateAlongRoute(
    route,
    Math.max(0, clampedAlongMeters - lookaheadMeters),
  )

  if (distanceMeters(behind, start) < 1) {
    return null
  }

  return bearingDegrees(behind, start)
}

export function bearingDegrees(start: Coordinate, end: Coordinate) {
  const startLatitude = radians(start.latitude)
  const endLatitude = radians(end.latitude)
  const longitudeDifference = radians(end.longitude - start.longitude)

  const y = Math.sin(longitudeDifference) * Math.cos(endLatitude)
  const x =
    Math.cos(startLatitude) * Math.sin(endLatitude) -
    Math.sin(startLatitude) *
      Math.cos(endLatitude) *
      Math.cos(longitudeDifference)

  return normalizeBearing(degrees(Math.atan2(y, x)))
}

export function interpolateBearing(from: number, to: number, fraction: number) {
  const delta = ((((to - from) % 360) + 540) % 360) - 180
  return normalizeBearing(from + delta * fraction)
}

export function normalizeBearing(value: number) {
  return ((value % 360) + 360) % 360
}

function degrees(radians: number) {
  return radians * (180 / Math.PI)
}

function findActiveStepIndex(route: RouteResponse, alongMeters: number) {
  let distance = 0

  for (const step of route.steps) {
    distance += step.distance_meters
    if (alongMeters <= distance) return step.sequence
  }

  return Math.max(0, route.steps.length - 1)
}

function distanceToStep(
  route: RouteResponse,
  alongMeters: number,
  sequence: number,
) {
  const stepStartMeters = route.steps
    .slice(0, sequence)
    .reduce((sum, step) => sum + step.distance_meters, 0)

  return stepStartMeters - alongMeters
}

function projectOntoRoute(
  routeCoordinates: Coordinate[],
  position: Coordinate,
): RouteProjection {
  let best: RouteProjection | null = null
  let traveledMeters = 0

  for (let index = 0; index < routeCoordinates.length - 1; index += 1) {
    const start = routeCoordinates[index]
    const end = routeCoordinates[index + 1]
    const segmentMeters = distanceMeters(start, end)
    const segmentProjection = projectOntoSegment(start, end, position)
    const distanceFromPosition = distanceMeters(
      position,
      segmentProjection.coordinate,
    )

    if (!best || distanceFromPosition < best.distanceMeters) {
      best = {
        coordinate: segmentProjection.coordinate,
        distanceMeters: distanceFromPosition,
        alongMeters:
          traveledMeters + segmentMeters * segmentProjection.fraction,
        totalMeters: 0,
      }
    }

    traveledMeters += segmentMeters
  }

  return {
    ...(best ?? {
      coordinate: routeCoordinates[0],
      distanceMeters: distanceMeters(position, routeCoordinates[0]),
      alongMeters: 0,
    }),
    totalMeters: traveledMeters,
  }
}

function projectOntoSegment(
  start: Coordinate,
  end: Coordinate,
  point: Coordinate,
) {
  const referenceLatitude =
    ((start.latitude + end.latitude) / 2) * (Math.PI / 180)
  const metersPerDegreeLatitude = 111_320
  const metersPerDegreeLongitude =
    metersPerDegreeLatitude * Math.cos(referenceLatitude)

  const ax = start.longitude * metersPerDegreeLongitude
  const ay = start.latitude * metersPerDegreeLatitude
  const bx = end.longitude * metersPerDegreeLongitude
  const by = end.latitude * metersPerDegreeLatitude
  const px = point.longitude * metersPerDegreeLongitude
  const py = point.latitude * metersPerDegreeLatitude

  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const rawFraction =
    lengthSquared === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSquared
  const fraction = Math.min(1, Math.max(0, rawFraction))

  return {
    fraction,
    coordinate: {
      longitude: start.longitude + (end.longitude - start.longitude) * fraction,
      latitude: start.latitude + (end.latitude - start.latitude) * fraction,
    },
  }
}

export function distanceMeters(start: Coordinate, end: Coordinate) {
  const startLatitude = radians(start.latitude)
  const endLatitude = radians(end.latitude)
  const latitudeDifference = endLatitude - startLatitude
  const longitudeDifference = radians(end.longitude - start.longitude)

  const a =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(longitudeDifference / 2) ** 2

  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function radians(degrees: number) {
  return degrees * (Math.PI / 180)
}
