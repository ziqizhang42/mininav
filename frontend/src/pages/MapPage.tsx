import { MapCanvas } from '../features/map/MapCanvas'

export function MapPage() {
  return (
    <main className="flex h-dvh flex-col">
      <header className="shrink-0 border-b bg-white px-6 py-4">
        <h1 className="text-xl font-semibold">mininav</h1>
      </header>

      <MapCanvas />
    </main>
  )
}
