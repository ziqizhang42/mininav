import type { GuidanceProgress } from './geo'

export function GuidancePanel({ progress }: { progress: GuidanceProgress }) {
  if (progress.hasArrived) {
    return <p className="font-medium">Arrived</p>
  }

  if (progress.isOffRoute) {
    return (
      <p className="font-medium text-red-700">
        Off route. Return to the highlighted route.
      </p>
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
