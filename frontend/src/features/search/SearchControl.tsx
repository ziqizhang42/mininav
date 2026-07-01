import { useState, type FormEvent } from 'react'
import { LocateFixed, Search, X } from 'lucide-react'

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

  function openField(field: SearchField) {
    onActiveFieldChange(field)
    setQuery('')
    setResults([])
    setStatus('idle')
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
      <div className="grid grid-cols-2 gap-2">
        <SearchTile
          title="Origin"
          value={originLabel}
          placeholder="Enter origin"
          active={activeField === 'origin'}
          onClick={() => openField('origin')}
        />
        <SearchTile
          title="Destination"
          value={destinationLabel}
          placeholder="Enter destination"
          active={activeField === 'destination'}
          onClick={() => openField('destination')}
        />
      </div>

      {activeField && (
        <div className="space-y-2 rounded-md border bg-white p-2">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium">
              {activeField === 'origin'
                ? 'Search origin'
                : 'Search destination'}
            </p>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center text-slate-600 hover:text-slate-900"
              onClick={() => {
                onActiveFieldChange(null)
                setResults([])
                setQuery('')
              }}
            >
              <X size={16} />
              <span className="sr-only">Close search</span>
            </button>
          </div>

          {activeField === 'origin' && (
            <button
              type="button"
              className="inline-flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left font-medium disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!currentLocationAvailable}
              onClick={() => {
                onUseCurrentLocation()
                onActiveFieldChange(null)
                setResults([])
                setQuery('')
              }}
            >
              <LocateFixed size={16} />
              {currentLocationLabel}
            </button>
          )}

          <form className="flex gap-2" onSubmit={handleSubmit}>
            <input
              className="min-w-0 flex-1 rounded-md border px-3 py-2"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                activeField === 'origin'
                  ? 'Search for a start place'
                  : 'Search for a destination'
              }
            />
            <button
              type="submit"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-700 text-white disabled:bg-slate-300"
              disabled={status === 'loading'}
            >
              <Search size={18} />
              <span className="sr-only">Search</span>
            </button>
          </form>

          {status === 'error' && (
            <p className="text-xs text-red-700">Search is unavailable.</p>
          )}

          {results.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-md border bg-white">
              {results.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  className="block w-full border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50"
                  onClick={() => selectResult(result)}
                >
                  <span className="block truncate font-medium">
                    {result.label}
                  </span>
                  {(result.category || result.type) && (
                    <span className="block text-xs text-slate-500">
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

function SearchTile({
  title,
  value,
  placeholder,
  active,
  onClick,
}: {
  title: string
  value: string | null
  placeholder: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`min-w-0 rounded-md border px-3 py-2 text-left ${
        active ? 'border-blue-300 bg-blue-50' : 'bg-white hover:bg-slate-50'
      }`}
      onClick={onClick}
    >
      <span className="block text-xs font-medium text-slate-500 uppercase">
        {title}
      </span>
      <span
        className={`mt-1 block truncate ${
          value ? 'font-medium text-slate-900' : 'text-slate-500'
        }`}
      >
        {value ?? placeholder}
      </span>
    </button>
  )
}
