import { useEffect, useRef } from 'react'

import { formatDistance } from '../../lib/format'
import type { RouteResponse } from '../routing/api'
import type { GuidanceProgress } from './geo'
import { ManeuverIcon } from './ManeuverIcon'
import { maneuverAction, maneuverTarget, upcomingStepIndex } from './maneuver'

type Props = {
  id?: string
  route: RouteResponse
  guidanceActive: boolean
  progress: GuidanceProgress | null
  className?: string
}

export function RouteInstructionList({
  id,
  route,
  guidanceActive,
  progress,
  className,
}: Props) {
  const activeItemRef = useRef<HTMLLIElement | null>(null)
  const focusedIndex =
    guidanceActive && progress ? upcomingStepIndex(route, progress) : null

  useEffect(() => {
    if (!guidanceActive || focusedIndex === null) return

    activeItemRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }, [focusedIndex, guidanceActive])

  return (
    <ol
      id={id}
      className={`divide-y divide-slate-100 overflow-y-auto overscroll-contain ${className ?? ''}`}
      aria-label="Route instructions"
    >
      {route.steps.map((step, index) => {
        const isFocused = index === focusedIndex
        const isPassed = focusedIndex !== null && index < focusedIndex

        return (
          <li
            key={step.sequence}
            ref={isFocused ? activeItemRef : undefined}
            aria-current={isFocused ? 'step' : undefined}
            className={`flex items-center gap-3 px-4 py-3 ${
              isFocused ? 'bg-blue-50' : isPassed ? 'opacity-50' : ''
            }`}
          >
            <span
              className={`grid size-9 shrink-0 place-items-center rounded-xl ${
                isFocused
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              <ManeuverIcon maneuver={step.maneuver} size={18} />
            </span>

            <div className="min-w-0 flex-1">
              <p
                className={`truncate ${isFocused ? 'font-semibold text-blue-900' : 'font-medium text-slate-900'}`}
              >
                {maneuverTarget(step)}
              </p>
              <p className="truncate text-xs text-slate-500">
                {maneuverAction(step)}
              </p>
            </div>

            {step.distance_meters > 0 && (
              <span className="shrink-0 text-sm text-slate-500 tabular-nums">
                {formatDistance(step.distance_meters)}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
