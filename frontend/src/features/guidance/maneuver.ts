import type { RouteResponse } from '../routing/api'
import type { GuidanceProgress } from './geo'

export type RouteStep = RouteResponse['steps'][number]

// Short verb for the maneuver, without the road name.
export function maneuverAction(step: RouteStep) {
  const { type, modifier } = step.maneuver

  if (type === 'arrive') {
    return 'Arrive'
  }

  if (type === 'depart') {
    return modifier ? `Head ${modifier}` : 'Head out'
  }

  switch (modifier) {
    case 'left':
      return 'Turn left'
    case 'right':
      return 'Turn right'
    case 'slight left':
      return 'Slight left'
    case 'slight right':
      return 'Slight right'
    case 'u-turn':
      return 'Make a U-turn'
    default:
      return 'Continue'
  }
}

// Headline for the maneuver: the road it puts you on, or the destination.
export function maneuverTarget(step: RouteStep) {
  if (step.maneuver.type === 'arrive') {
    return 'Destination'
  }

  return step.road_name ?? 'Unnamed road'
}

// Index of the step whose maneuver the driver is currently approaching.
export function upcomingStepIndex(
  route: RouteResponse,
  progress: GuidanceProgress,
) {
  if (progress.hasArrived) {
    return Math.max(0, route.steps.length - 1)
  }

  return Math.min(progress.activeStepIndex + 1, route.steps.length - 1)
}

// How far the driver has come along the step they are on, as 0 to 1.
// Drives the progress bar under the maneuver banner.
export function stepProgressFraction(
  route: RouteResponse,
  progress: GuidanceProgress,
) {
  const currentStep = route.steps[progress.activeStepIndex]
  const stepMeters = currentStep?.distance_meters ?? 0

  if (stepMeters <= 0) {
    return 1
  }

  const traveled = stepMeters - progress.distanceToNextStepMeters

  return Math.min(1, Math.max(0, traveled / stepMeters))
}
