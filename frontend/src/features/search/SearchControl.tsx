import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { LoaderCircle, LocateFixed, MapPin, Search, X } from 'lucide-react'

import { searchPlaces, type SearchResult } from './api'

export type SearchField = 'origin' | 'destination'

type Props = {
  originLabel: string | null
  destinationLabel: string | null
  currentLocationAvailable: boolean
  currentLocationLabel: string
  onUseCurrentLocation: () => void
  onSelectOrigin: (result: SearchResult) => void
  onSelectDestination: (result: SearchResult) => void
  activeField: SearchField | null
  onActiveFieldChange: (field: SearchField | null) => void
}

export function SearchControl({
  originLabel,
  destinationLabel,
  currentLocationAvailable,
  currentLocationLabel,
  onUseCurrentLocation,
  onSelectOrigin,
  onSelectDestination,
  activeField,
  onActiveFieldChange,
}: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!activeField || !window.matchMedia('(min-width: 640px)').matches) return

    inputRef.current?.focus()
  }, [activeField])

  function toggleField(field: SearchField) {
    onActiveFieldChange(activeField === field ? null : field)
    setQuery('')
    setResults([])
    setStatus('idle')
  }

  function closeField() {
    onActiveFieldChange(null)
    setResults([])
    setQuery('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmed = query.trim()
    if (!activeField || trimmed.length < 2) return

    setStatus('loading')

    try {
      setResults(await searchPlaces(trimmed))
      setStatus('idle')
    } catch (error) {
      setResults([])
      setStatus('error')
      console.error('Unable to search places', error)
    }
  }

  function selectResult(result: SearchResult) {
    if (!activeField) return

    if (activeField === 'origin') {
      onSelectOrigin(result)
    } else {
      onSelectDestination(result)
    }

    setQuery(result.label)
    setResults([])
    onActiveFieldChange(null)
  }

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <FieldRow
          label="From"
          value={originLabel}
          placeholder="Choose a starting point"
          active={activeField === 'origin'}
          marker={
            <span className="size-3.5 rounded-full border-[3.5px] border-slate-400" />
          }
          onClick={() => toggleField('origin')}
        />

        <div className="border-t border-slate-100" />

        <FieldRow
          label="To"
          value={destinationLabel}
          placeholder="Choose a destination"
          active={activeField === 'destination'}
          marker={<MapPin size={18} className="text-rose-600" aria-hidden />}
          onClick={() => toggleField('destination')}
        />
      </div>

      {activeField && (
        <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-700">
              {activeField === 'origin'
                ? 'Search a starting point'
                : 'Search a destination'}
            </p>
            <button
              type="button"
              className="grid size-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              onClick={closeField}
            >
              <X size={16} />
              <span className="sr-only">Close search</span>
            </button>
          </div>

          <form className="relative" onSubmit={handleSubmit}>
            <Search
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <input
              ref={inputRef}
              className="h-11 w-full rounded-xl bg-slate-100 pr-24 pl-9 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a place or address"
              aria-label={
                activeField === 'origin'
                  ? 'Search a starting point'
                  : 'Search a destination'
              }
            />
            <button
              type="submit"
              className="absolute top-1/2 right-1.5 inline-flex h-8 -translate-y-1/2 items-center rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300"
              disabled={status === 'loading'}
            >
              {status === 'loading' ? (
                <LoaderCircle size={16} className="animate-spin" aria-hidden />
              ) : (
                'Search'
              )}
              <span className="sr-only">Search</span>
            </button>
          </form>

          {activeField === 'origin' && (
            <button
              type="button"
              className="inline-flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
              disabled={!currentLocationAvailable}
              onClick={() => {
                onUseCurrentLocation()
                closeField()
              }}
            >
              <LocateFixed size={16} aria-hidden />
              {currentLocationLabel}
            </button>
          )}

          <p className="px-1 text-xs text-slate-400">
            Or tap the map to drop the{' '}
            {activeField === 'origin' ? 'start' : 'destination'} point.
          </p>

          {status === 'error' && (
            <p className="px-1 text-xs text-rose-700">Search is unavailable.</p>
          )}

          {results.length > 0 && (
            <div className="max-h-56 divide-y divide-slate-100 overflow-y-auto overscroll-contain rounded-xl border border-slate-200">
              {results.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  className="block w-full px-3 py-2.5 text-left text-sm hover:bg-slate-50"
                  onClick={() => selectResult(result)}
                >
                  <span className="block truncate font-medium text-slate-900">
                    {result.label}
                  </span>
                  {(result.category || result.type) && (
                    <span className="block truncate text-xs text-slate-500">
                      {[result.category, result.type]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FieldRow({
  label,
  value,
  placeholder,
  active,
  marker,
  onClick,
}: {
  label: string
  value: string | null
  placeholder: string
  active: boolean
  marker: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
        active ? 'bg-blue-50' : 'hover:bg-slate-50'
      }`}
      aria-pressed={active}
      onClick={onClick}
    >
      <span className="grid size-6 shrink-0 place-items-center">{marker}</span>

      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
          {label}
        </span>
        <span
          className={`block truncate ${
            value ? 'font-medium text-slate-900' : 'text-slate-400'
          }`}
        >
          {value ?? placeholder}
        </span>
      </span>
    </button>
  )
}
