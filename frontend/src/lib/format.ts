export function formatDistance(meters: number) {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`
  }

  return `${Math.round(meters)} m`
}

export type GuidanceDistance = {
  value: string
  unit: string
}

// Distance for the large turn-by-turn banner
export function formatGuidanceDistance(meters: number): GuidanceDistance {
  if (meters >= 1000) {
    return { value: (meters / 1000).toFixed(1), unit: 'km' }
  }

  if (meters >= 100) {
    return { value: `${roundTo(meters, 10)}`, unit: 'm' }
  }

  return { value: `${roundTo(meters, 5)}`, unit: 'm' }
}

export function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60)

  if (minutes < 1) {
    return '< 1 min'
  }

  if (minutes < 60) {
    return `${minutes} min`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  if (remainingMinutes === 0) {
    return `${hours} hr`
  }

  return `${hours} hr ${remainingMinutes} min`
}

export function formatArrivalTime(secondsFromNow: number, now = new Date()) {
  const arrival = new Date(now.getTime() + Math.max(0, secondsFromNow) * 1000)

  return arrival.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function roundTo(value: number, step: number) {
  return Math.max(0, Math.round(value / step) * step)
}
