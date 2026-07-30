import { z } from 'zod'

import { getJson } from '../../lib/api'

const searchResultSchema = z.object({
  id: z.string(),
  label: z.string(),
  longitude: z.number().min(-180).max(180),
  latitude: z.number().min(-90).max(90),
  category: z.string().nullable(),
  type: z.string().nullable(),
})

const searchResultsSchema = z.array(searchResultSchema)

export type SearchResult = z.infer<typeof searchResultSchema>

export type SearchBias = {
  viewbox?: {
    west: number
    south: number
    east: number
    north: number
  }
  focus?: {
    longitude: number
    latitude: number
  }
}

export function searchPlaces(
  query: string,
  bias?: SearchBias,
): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query })

  if (bias?.viewbox) {
    const { west, south, east, north } = bias.viewbox
    params.set('viewbox', [west, south, east, north].join(','))
  }

  if (bias?.focus) {
    params.set('focus', [bias.focus.longitude, bias.focus.latitude].join(','))
  }

  return getJson(`/v1/search?${params.toString()}`, searchResultsSchema)
}
