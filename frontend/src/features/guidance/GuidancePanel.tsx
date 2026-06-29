import type { GuidanceProgress } from './geo'

type Props = {
  progress: GuidanceProgress
  isRerouting?: boolean
  rerouteError?: string
}

export function GuidancePanel({
  progress,
  isRerouting = false,
  rerouteError,
}: Props) {
  if (progress.hasArrived) {
    return <p className="font-medium">Arrived</p>
  }

  if (isRerouting) {
    return <p className="font-medium text-blue-700">Rerouting...</p>
  }

  if (progress.isOffRoute) {
    return (
      <div className="space-y-1">
        <p className="font-medium text-red-700">Off route. Rerouting soon...</p>
        {rerouteError && <p className="text-xs text-red-700">{rerouteError}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <p className="font-medium">{progress.nextInstruction}</p>
      <p className="text-slate-600">
        In {Math.round(progress.distanceToNextStepMeters)} m
      </p>
    </div>
  )
}
