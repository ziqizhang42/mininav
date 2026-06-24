import { z } from 'zod'

import { postJson } from '../../lib/api'

const coordinateSchema = z.object({
  longitude: z.number().min(-180).max(180),
  latitude: z.number().min(-90).max(90),
})

const snappedCoordinateSchema = coordinateSchema.extend({
  node_id: z.number().int(),
  snap_distance_meters: z.number().nonnegative(),
})

const routeResponseSchema = z.object({
  origin: snappedCoordinateSchema,
  destination: snappedCoordinateSchema,
  distance_meters: z.number().nonnegative(),
  duration_seconds: z.number().nonnegative(),
  edge_count: z.number().int().nonnegative(),
  geometry: z.object({
    type: z.literal('LineString'),
    coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
  }),
})

export type Coordinate = z.infer<typeof coordinateSchema>
export type RouteResponse = z.infer<typeof routeResponseSchema>

export function requestRoute(
  origin: Coordinate,
  destination: Coordinate,
): Promise<RouteResponse> {
  return postJson(
    '/v1/routes',
    { origin, destination, mode: 'driving' },
    routeResponseSchema,
  )
}
