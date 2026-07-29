import { describe, expect, it } from 'vitest'

import {
  formatArrivalTime,
  formatDistance,
  formatDuration,
  formatGuidanceDistance,
} from './format'

describe('formatDistance', () => {
  it('uses metres below a kilometre', () => {
    expect(formatDistance(340.4)).toBe('340 m')
  })

  it('uses kilometres above a kilometre', () => {
    expect(formatDistance(4213)).toBe('4.2 km')
  })
})

describe('formatGuidanceDistance', () => {
  it('rounds close maneuvers to five metres', () => {
    expect(formatGuidanceDistance(63)).toEqual({ value: '65', unit: 'm' })
  })

  it('rounds mid-range maneuvers to ten metres', () => {
    expect(formatGuidanceDistance(387)).toEqual({ value: '390', unit: 'm' })
  })

  it('switches to kilometres past a kilometre', () => {
    expect(formatGuidanceDistance(1560)).toEqual({ value: '1.6', unit: 'km' })
  })

  it('never reports a negative distance', () => {
    expect(formatGuidanceDistance(-4)).toEqual({ value: '0', unit: 'm' })
  })
})

describe('formatDuration', () => {
  it('collapses very short durations', () => {
    expect(formatDuration(20)).toBe('< 1 min')
  })

  it('reports minutes below an hour', () => {
    expect(formatDuration(900)).toBe('15 min')
  })

  it('reports hours and minutes', () => {
    expect(formatDuration(4500)).toBe('1 hr 15 min')
  })

  it('omits minutes on the hour', () => {
    expect(formatDuration(7200)).toBe('2 hr')
  })
})

describe('formatArrivalTime', () => {
  it('adds the remaining duration to the current time', () => {
    const now = new Date('2026-07-28T09:15:00')

    expect(formatArrivalTime(30 * 60, now)).toBe(
      new Date('2026-07-28T09:45:00').toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      }),
    )
  })

  it('treats a negative remaining duration as arriving now', () => {
    const now = new Date('2026-07-28T09:15:00')

    expect(formatArrivalTime(-600, now)).toBe(
      now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
    )
  })
})
