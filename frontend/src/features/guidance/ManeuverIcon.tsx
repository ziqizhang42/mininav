import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  Navigation,
  Undo2,
} from 'lucide-react'

import type { RouteStep } from './maneuver'

type Props = {
  maneuver: RouteStep['maneuver']
  size?: number
  className?: string
}

export function ManeuverIcon({ maneuver, size = 20, className }: Props) {
  const iconProps = {
    size,
    strokeWidth: 2.5,
    className,
    'aria-hidden': true,
  } as const

  if (maneuver.type === 'arrive') {
    return <Flag {...iconProps} />
  }

  if (maneuver.type === 'depart') {
    // The arrow's ink sits up and to the right of its box (off-centre inside a tile until it is nudged back).
    return (
      <Navigation
        {...iconProps}
        className={`translate-x-[-7%] translate-y-[7%] ${className ?? ''}`}
      />
    )
  }

  switch (maneuver.modifier) {
    case 'left':
      return <CornerUpLeft {...iconProps} />
    case 'right':
      return <CornerUpRight {...iconProps} />
    case 'slight left':
      return <ArrowUpLeft {...iconProps} />
    case 'slight right':
      return <ArrowUpRight {...iconProps} />
    case 'u-turn':
      return <Undo2 {...iconProps} />
    default:
      return <ArrowUp {...iconProps} />
  }
}
