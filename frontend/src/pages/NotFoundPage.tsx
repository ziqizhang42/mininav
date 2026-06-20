import { MapPinOff } from 'lucide-react'
import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <main className="grid min-h-dvh place-content-center gap-4 text-center">
      <MapPinOff className="mx-auto size-10" aria-hidden="true" />
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Link className="text-blue-700 underline" to="/">
        Return to the map
      </Link>
    </main>
  )
}
