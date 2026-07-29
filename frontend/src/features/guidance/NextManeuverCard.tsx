import type { ReactNode } from 'react'
import { Flag, LoaderCircle, LocateFixed, TriangleAlert } from 'lucide-react'

import { formatGuidanceDistance } from '../../lib/format'
import type { RouteResponse } from '../routing/api'
import type { GuidanceProgress } from './geo'
import { ManeuverIcon } from './ManeuverIcon'
import {
  maneuverAction,
  maneuverTarget,
  stepProgressFraction,
  upcomingStepIndex,
  type RouteStep,
} from './maneuver'

/** Below this the banner says "Now" instead of counting down single metres. */
const IMMINENT_METERS = 20

type Tone = 'default' | 'arrived' | 'rerouting' | 'off-route' | 'waiting'

const TONE_BACKGROUND: Record<Tone, string> = {
  default: 'bg-slate-900',
  arrived: 'bg-emerald-600',
  rerouting: 'bg-amber-500',
  'off-route': 'bg-rose-600',
  waiting: 'bg-slate-700',
}

type Props = {
  route: RouteResponse
  progress: GuidanceProgress | null
  isRerouting: boolean
  rerouteError?: string
  locationError?: string | null
  destinationLabel: string | null
}

export function NextManeuverCard({
  route,
  progress,
  isRerouting,
  rerouteError,
  locationError,
  destinationLabel,
}: Props) {
  if (!progress) {
    // Guidance hides the planning panel, so a denied or unsupported location
    // has to be reported here or it looks like an endless wait for a fix.
    if (locationError) {
      return (
        <StatusBanner
          tone="off-route"
          icon={<TriangleAlert size={34} strokeWidth={2.5} aria-hidden />}
          title="No location"
          detail={locationError}
        />
      )
    }

    return (
      <StatusBanner
        tone="waiting"
        icon={<LocateFixed size={34} strokeWidth={2.5} aria-hidden />}
        title="Waiting for GPS"
        detail="Allow location access to start turn-by-turn guidance."
      />
    )
  }

  if (progress.hasArrived) {
    return (
      <StatusBanner
        tone="arrived"
        icon={<Flag size={34} strokeWidth={2.5} aria-hidden />}
        title="You have arrived"
        detail={destinationLabel ?? 'Destination reached'}
      />
    )
  }

  if (isRerouting) {
    return (
      <StatusBanner
        tone="rerouting"
        icon={
          <LoaderCircle
            size={34}
            strokeWidth={2.5}
            className="animate-spin"
            aria-hidden
          />
        }
        title="Rerouting"
        detail="Finding a new route from your position."
      />
    )
  }

  if (progress.isOffRoute) {
    return (
      <StatusBanner
        tone="off-route"
        icon={<TriangleAlert size={34} strokeWidth={2.5} aria-hidden />}
        title="Off route"
        detail={rerouteError ?? 'Head back to the highlighted route.'}
      />
    )
  }

  const stepIndex = upcomingStepIndex(route, progress)
  const step = route.steps[stepIndex]
  const followingStep = route.steps[stepIndex + 1]
  const action = maneuverAction(step)
  const target = maneuverTarget(step)
  const isImminent = progress.distanceToNextStepMeters <= IMMINENT_METERS
  const distance = formatGuidanceDistance(progress.distanceToNextStepMeters)

  return (
    <Banner tone="default">
      <div className="flex items-center gap-4 px-4 py-4 sm:px-5">
        <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-white/10 sm:size-[68px]">
          <ManeuverIcon maneuver={step.maneuver} size={38} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-1.5 leading-none" aria-hidden>
            {isImminent ? (
              <span className="text-4xl font-bold sm:text-5xl">Now</span>
            ) : (
              <>
                <span className="text-4xl font-bold tabular-nums sm:text-5xl">
                  {distance.value}
                </span>
                <span className="text-xl font-medium text-white/60">
                  {distance.unit}
                </span>
              </>
            )}
          </p>

          <p className="mt-2 truncate text-lg font-semibold sm:text-xl">
            {target}
          </p>
          <p className="truncate text-sm text-white/60">{action}</p>

          <span className="sr-only">
            {step.instruction}
            {isImminent ? ' now' : ` in ${distance.value} ${distance.unit}`}
          </span>
        </div>
      </div>

      <div className="h-1 bg-white/10">
        <div
          className="h-full bg-sky-400 transition-[width] duration-500 ease-out"
          style={{
            width: `${Math.round(stepProgressFraction(route, progress) * 100)}%`,
          }}
        />
      </div>

      {followingStep && <ThenStrip step={followingStep} />}
    </Banner>
  )
}

function ThenStrip({ step }: { step: RouteStep }) {
  return (
    <div className="flex items-center gap-2 bg-black/25 px-4 py-2.5 text-sm text-white/75 sm:px-5">
      <span className="shrink-0 text-white/50">then</span>
      <ManeuverIcon maneuver={step.maneuver} size={16} className="shrink-0" />
      <span className="truncate">
        <span className="font-medium">{maneuverAction(step)}</span>
        {step.maneuver.type !== 'arrive' && (
          <span className="text-white/60"> · {maneuverTarget(step)}</span>
        )}
      </span>
    </div>
  )
}

function StatusBanner({
  tone,
  icon,
  title,
  detail,
}: {
  tone: Tone
  icon: ReactNode
  title: string
  detail: string
}) {
  return (
    <Banner tone={tone}>
      <div className="flex items-center gap-4 px-4 py-4 sm:px-5">
        <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-white/15 sm:size-[68px]">
          {icon}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-2xl font-bold sm:text-3xl">{title}</p>
          <p className="mt-1 text-sm text-white/70">{detail}</p>
        </div>
      </div>
    </Banner>
  )
}

function Banner({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <section
      aria-label="Next maneuver"
      aria-live="polite"
      className={`pointer-events-auto overflow-hidden rounded-b-3xl text-white shadow-2xl ring-1 ring-black/10 sm:rounded-3xl ${TONE_BACKGROUND[tone]}`}
    >
      {children}
    </section>
  )
}
