import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useGeolocation } from './useGeolocation'

const originalGeolocation = navigator.geolocation

function setGeolocation(value: Geolocation | undefined) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value,
  })
}

afterEach(() => {
  setGeolocation(originalGeolocation)
  vi.restoreAllMocks()
})

describe('useGeolocation', () => {
  it('returns idle while disabled', () => {
    const watchPosition = vi.fn()

    setGeolocation({
      watchPosition,
      clearWatch: vi.fn(),
    } as unknown as Geolocation)

    const { result } = renderHook(() => useGeolocation(false))

    expect(result.current).toEqual({ status: 'idle' })
    expect(watchPosition).not.toHaveBeenCalled()
  })

  it('returns unsupported when geolocation is unavailable', () => {
    setGeolocation(undefined)

    const { result } = renderHook(() => useGeolocation(true))

    expect(result.current).toEqual({ status: 'unsupported' })
  })

  it('watches location and returns the latest position', () => {
    let onSuccess: PositionCallback | null = null
    const clearWatch = vi.fn()
    const watchPosition = vi.fn((success: PositionCallback) => {
      onSuccess = success
      return 30
    })

    setGeolocation({
      watchPosition,
      clearWatch,
    } as unknown as Geolocation)

    const { result, unmount } = renderHook(() => useGeolocation(true))

    expect(result.current).toEqual({ status: 'locating' })

    act(() => {
      onSuccess?.({
        coords: {
          longitude: -114.0719,
          latitude: 51.0447,
          accuracy: 8,
          altitude: null,
          altitudeAccuracy: null,
          heading: 90,
          speed: null,
        },
        timestamp: Date.now(),
      } as GeolocationPosition)
    })

    expect(result.current).toEqual({
      status: 'ready',
      coordinate: {
        longitude: -114.0719,
        latitude: 51.0447,
      },
      accuracyMeters: 8,
      heading: 90,
      speedMetersPerSecond: null,
    })

    unmount()

    expect(clearWatch).toHaveBeenCalledWith(30)
  })

  it('returns geolocation errors', () => {
    let onError: PositionErrorCallback | null = null
    const watchPosition = vi.fn(
      (_success: PositionCallback, error: PositionErrorCallback | null) => {
        onError = error
        return 50
      },
    )

    setGeolocation({
      watchPosition,
      clearWatch: vi.fn(),
    } as unknown as Geolocation)

    const { result } = renderHook(() => useGeolocation(true))

    act(() => {
      onError?.({
        code: 1,
        message: 'User denied Geolocation',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError)
    })

    expect(result.current).toEqual({
      status: 'error',
      message: 'User denied Geolocation',
    })
  })
})
