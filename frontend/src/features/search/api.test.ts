import { afterEach, describe, expect, it, vi } from 'vitest'

import { searchPlaces } from './api'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('searchPlaces', () => {
  it('sends the map viewbox and geographic focus', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('[]', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await searchPlaces('Starbucks', {
      viewbox: {
        west: -114.4,
        south: 50.8,
        east: -113.8,
        north: 51.3,
      },
      focus: {
        longitude: -114.0719,
        latitude: 51.0447,
      },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/search?q=Starbucks&viewbox=-114.4%2C50.8%2C-113.8%2C51.3&focus=-114.0719%2C51.0447',
      {
        headers: {
          Accept: 'application/json',
        },
      },
    )
  })
})
