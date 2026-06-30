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

export function searchPlaces(query: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query })
  return getJson(`/v1/search?${params.toString()}`, searchResultsSchema)
}
