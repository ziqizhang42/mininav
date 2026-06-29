import { useEffect, useRef } from 'react'

import type { RouteResponse } from '../routing/api'
import type { GuidanceProgress } from './geo'
import { GuidancePanel } from './GuidancePanel'

type Props = {
  id?: string
  route: RouteResponse
  guidanceActive: boolean
  progress: GuidanceProgress | null
  isRerouting: boolean
  rerouteError?: string
  formatDistance: (meters: number) => string
  detailsExpanded?: boolean
  className?: string
}

export function RouteInstructionList({
  id,
  route,
  guidanceActive,
  progress,
  isRerouting,
  rerouteError,
  formatDistance,
  detailsExpanded,
  className,
}: Props) {
  const activeItemRef = useRef<HTMLLIElement | null>(null)
  const focusedSequence =
    guidanceActive && progress
      ? focusedInstructionSequence(route, progress)
      : null

  useEffect(() => {
    if (!guidanceActive || focusedSequence === null) return

    activeItemRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }, [focusedSequence, guidanceActive, detailsExpanded])

  return (
    <ol
      id={id}
      className={`space-y-2 overflow-y-auto ${className ?? ''}`}
      aria-label="Route instructions"
    >
      {route.steps.map((step) => {
        const isFocused = step.sequence === focusedSequence
        const isOffRoute = isFocused && progress?.isOffRoute

        return (
          <li
            key={step.sequence}
            ref={isFocused ? activeItemRef : undefined}
            aria-current={isFocused ? 'step' : undefined}
            className={`rounded-md border px-3 py-2 ${
              isFocused
                ? isOffRoute
                  ? 'border-red-200 bg-red-50 shadow-sm'
                  : 'border-blue-200 bg-blue-50 shadow-sm'
                : 'border-slate-200 bg-white'
            }`}
          >
            {isFocused && progress ? (
              <GuidancePanel
                progress={progress}
                isRerouting={isRerouting}
                rerouteError={rerouteError}
              />
            ) : (
              <>
                <p>{step.instruction}</p>
                {step.distance_meters > 0 && (
                  <p className="text-xs text-slate-500">
                    {formatDistance(step.distance_meters)}
                  </p>
                )}
              </>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function focusedInstructionSequence(
  route: RouteResponse,
  progress: GuidanceProgress,
) {
  if (progress.hasArrived) {
    return route.steps[route.steps.length - 1]?.sequence ?? null
  }

  return (
    route.steps[Math.min(progress.activeStepIndex + 1, route.steps.length - 1)]
      ?.sequence ?? null
  )
}
