import { Check, ChevronDown, ChevronUp, Square } from 'lucide-react'

import {
  formatArrivalTime,
  formatDistance,
  formatDuration,
} from '../../lib/format'

type Props = {
  remainingMeters: number
  remainingSeconds: number
  hasArrived: boolean
  stepsOpen: boolean
  onToggleSteps: () => void
  onEndGuidance: () => void
  stepsControlsId: string
}

export function TripStatusBar({
  remainingMeters,
  remainingSeconds,
  hasArrived,
  stepsOpen,
  onToggleSteps,
  onEndGuidance,
  stepsControlsId,
}: Props) {
  return (
    <div className="pointer-events-auto rounded-t-3xl bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl ring-1 ring-slate-900/5 sm:rounded-3xl sm:pb-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          {hasArrived ? (
            <>
              <p className="text-2xl leading-tight font-semibold">Arrived</p>
              <p className="truncate text-sm text-slate-500">
                Guidance is finished
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl leading-tight font-semibold tabular-nums">
                {formatArrivalTime(remainingSeconds)}
              </p>
              <p className="truncate text-sm text-slate-500 tabular-nums">
                {formatDuration(remainingSeconds)} ·{' '}
                {formatDistance(remainingMeters)} left
              </p>
            </>
          )}
        </div>

        <button
          type="button"
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          aria-expanded={stepsOpen}
          aria-controls={stepsControlsId}
          onClick={onToggleSteps}
        >
          Steps
          {stepsOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>

        <button
          type="button"
          className={`inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-5 text-sm font-semibold text-white ${
            hasArrived
              ? 'bg-emerald-600 hover:bg-emerald-700'
              : 'bg-rose-600 hover:bg-rose-700'
          }`}
          onClick={onEndGuidance}
        >
          {hasArrived ? (
            <Check size={16} aria-hidden />
          ) : (
            <Square size={14} fill="currentColor" aria-hidden />
          )}
          {hasArrived ? 'Done' : 'End'}
        </button>
      </div>
    </div>
  )
}
