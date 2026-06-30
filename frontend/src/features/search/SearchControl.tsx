import { useState, type FormEvent } from 'react'
import { Search } from 'lucide-react'

import { searchPlaces, type SearchResult } from './api'

export function SearchControl({
  onSelect,
}: {
  onSelect: (result: SearchResult) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmed = query.trim()
    if (trimmed.length < 2) return

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

  return (
    <div className="space-y-2">
      <form className="flex gap-2" onSubmit={handleSubmit}>
        <input
          className="min-w-0 flex-1 rounded-md border px-3 py-2"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search places"
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
              onClick={() => {
                onSelect(result)
                setQuery(result.label)
                setResults([])
              }}
            >
              <span className="block font-medium">{result.label}</span>
              {(result.category || result.type) && (
                <span className="block text-xs text-slate-500">
                  {[result.category, result.type].filter(Boolean).join(' · ')}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
