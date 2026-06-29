import { AlertTriangle, FastForward, Flag, MapPin, X } from 'lucide-react'

import type { RouteResponse } from '../routing/api'
import type { TrackedLocation } from './locationSource'

type Props = {
  route: RouteResponse | null
  mockLocation: TrackedLocation | null
  onSetCalgary: () => void
  onClear: () => void
  onSetRouteStart: (route: RouteResponse) => void
  onAdvance: (route: RouteResponse) => void
  onSetOffRoute: (route: RouteResponse) => void
  onSetNearDestination: (route: RouteResponse) => void
}

export function GuidanceDebugPanel({
  route,
  mockLocation,
  onSetCalgary,
  onClear,
  onSetRouteStart,
  onAdvance,
  onSetOffRoute,
  onSetNearDestination,
}: Props) {
  return (
    <div className="border-t pt-3">
      <p className="mb-2 text-xs font-medium text-slate-500">Dev location</p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
          onClick={onSetCalgary}
        >
          <MapPin size={14} /> Calgary
        </button>

        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs disabled:opacity-50"
          disabled={!route}
          onClick={() => route && onSetRouteStart(route)}
        >
          <MapPin size={14} /> Route start
        </button>

        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs disabled:opacity-50"
          disabled={!route}
          onClick={() => route && onAdvance(route)}
        >
          <FastForward size={14} /> Advance
        </button>

        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs disabled:opacity-50"
          disabled={!route}
          onClick={() => route && onSetOffRoute(route)}
        >
          <AlertTriangle size={14} /> Off route
        </button>

        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs disabled:opacity-50"
          disabled={!route}
          onClick={() => route && onSetNearDestination(route)}
        >
          <Flag size={14} /> Arrive
        </button>

        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs disabled:opacity-50"
          disabled={!mockLocation}
          onClick={onClear}
        >
          <X size={14} /> Clear
        </button>
      </div>
    </div>
  )
}
