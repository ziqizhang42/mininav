import { useState, type ReactNode } from 'react'
import { ChevronDown, LoaderCircle, Navigation, Play, X } from 'lucide-react'

import {
  formatArrivalTime,
  formatDistance,
  formatDuration,
} from '../../lib/format'
import { RouteInstructionList } from '../guidance/RouteInstructionList'
import { SearchControl, type SearchField } from '../search/SearchControl'
import type { SearchBias, SearchResult } from '../search/api'
import type { RouteState } from './routeState'

export type LocationStatus = {
  text: string
  tone: 'muted' | 'error'
}

type Props = {
  routeState: RouteState
  originLabel: string | null
  destinationLabel: string | null
  activeSearchField: SearchField | null
  onActiveSearchFieldChange: (field: SearchField | null) => void
  currentLocationAvailable: boolean
  currentLocationLabel: string
  getSearchBias: () => SearchBias | undefined
  locationStatus: LocationStatus | null
  waitingForLocation: boolean
  onUseCurrentLocation: () => void
  onSelectOrigin: (result: SearchResult) => void
  onSelectDestination: (result: SearchResult) => void
  onStartGuidance: () => void
  onClearRoute: () => void
  devPanel?: ReactNode
}

export function PlanningPanel({
  routeState,
  originLabel,
  destinationLabel,
  activeSearchField,
  onActiveSearchFieldChange,
  currentLocationAvailable,
  currentLocationLabel,
  getSearchBias,
  locationStatus,
  waitingForLocation,
  onUseCurrentLocation,
  onSelectOrigin,
  onSelectDestination,
  onStartGuidance,
  onClearRoute,
  devPanel,
}: Props) {
  const [stepsOpen, setStepsOpen] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(min-width: 640px)').matches,
  )

  const hasSelection = Boolean(originLabel || destinationLabel)

  return (
    <section className="pointer-events-auto flex max-h-[85dvh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl ring-1 ring-slate-900/5 sm:max-h-[calc(100dvh-2rem)] sm:rounded-3xl">
      <div className="flex justify-center pt-2.5 sm:hidden">
        <span className="h-1.5 w-10 rounded-full bg-slate-200" />
      </div>

      <div className="flex items-center justify-between gap-2 px-4 pt-3 sm:px-5 sm:pt-4">
        <h1 className="flex items-center gap-2 text-base font-semibold tracking-tight text-slate-900">
          <span className="grid size-7 place-items-center rounded-lg bg-blue-600 text-white">
            <Navigation
              size={15}
              fill="currentColor"
              className="translate-x-[-7%] translate-y-[7%]"
              aria-hidden
            />
          </span>
          mininav
        </h1>

        {hasSelection && (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            onClick={onClearRoute}
          >
            <X size={14} aria-hidden />
            Clear
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5 sm:pb-5">
        <SearchControl
          activeField={activeSearchField}
          onActiveFieldChange={onActiveSearchFieldChange}
          originLabel={originLabel}
          destinationLabel={destinationLabel}
          currentLocationAvailable={currentLocationAvailable}
          currentLocationLabel={currentLocationLabel}
          getSearchBias={getSearchBias}
          onUseCurrentLocation={onUseCurrentLocation}
          onSelectOrigin={onSelectOrigin}
          onSelectDestination={onSelectDestination}
        />

        {routeState.status === 'idle' ||
        routeState.status === 'selecting-destination' ? (
          <p className="px-1 pt-3 text-sm text-slate-500">
            {planningHint(originLabel, destinationLabel)}
          </p>
        ) : null}

        {routeState.status === 'loading' && (
          <p className="flex items-center gap-2 px-1 pt-3 text-sm text-slate-500">
            <LoaderCircle size={16} className="animate-spin" aria-hidden />
            Calculating route...
          </p>
        )}

        {routeState.status === 'error' && (
          <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
            {routeState.message}
          </p>
        )}

        {routeState.status === 'success' && (
          <>
            <div className="mt-3 rounded-2xl bg-slate-900 p-4 text-white">
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-3xl leading-none font-bold tabular-nums">
                    {formatDuration(routeState.route.duration_seconds)}
                  </p>
                  <p className="mt-1.5 truncate text-sm text-white/60 tabular-nums">
                    {formatDistance(routeState.route.distance_meters)} · arrive{' '}
                    {formatArrivalTime(routeState.route.duration_seconds)}
                  </p>
                </div>

                <button
                  type="button"
                  className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full bg-white px-6 font-semibold text-slate-900 hover:bg-slate-100"
                  onClick={onStartGuidance}
                >
                  <Play size={16} fill="currentColor" aria-hidden />
                  Start
                </button>
              </div>

              {waitingForLocation && (
                <p className="mt-3 text-xs text-white/60">
                  Guidance needs your location. We will ask for it when you
                  start.
                </p>
              )}
            </div>

            <button
              type="button"
              className="mt-3 flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              aria-expanded={stepsOpen}
              aria-controls="route-instructions"
              onClick={() => setStepsOpen((open) => !open)}
            >
              {routeState.route.steps.length} steps
              <ChevronDown
                size={16}
                className={`transition-transform ${stepsOpen ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>

            {stepsOpen && (
              <div className="mt-2 overflow-hidden rounded-xl border border-slate-200">
                <RouteInstructionList
                  id="route-instructions"
                  route={routeState.route}
                  guidanceActive={false}
                  progress={null}
                  className="max-h-64"
                />
              </div>
            )}
          </>
        )}

        {locationStatus && (
          <p
            className={`px-1 pt-3 text-xs ${
              locationStatus.tone === 'error'
                ? 'text-rose-700'
                : 'text-slate-400'
            }`}
          >
            {locationStatus.text}
          </p>
        )}

        {devPanel}
      </div>
    </section>
  )
}

function planningHint(
  originLabel: string | null,
  destinationLabel: string | null,
) {
  if (originLabel && !destinationLabel) {
    return 'Now pick a destination.'
  }

  if (destinationLabel && !originLabel) {
    return 'Now pick a starting point.'
  }

  return 'Pick two points to build a route.'
}
