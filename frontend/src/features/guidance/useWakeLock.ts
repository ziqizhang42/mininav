import { useEffect } from 'react'

type WakeLockSentinel = {
  release: () => Promise<void>
}

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinel>
  }
}

export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return

    let disposed = false
    let sentinel: WakeLockSentinel | null = null

    async function requestWakeLock() {
      try {
        sentinel =
          (await (navigator as WakeLockNavigator).wakeLock?.request(
            'screen',
          )) ?? null
      } catch {
        sentinel = null
      }
    }

    function handleVisibilityChange() {
      if (!disposed && document.visibilityState === 'visible') {
        void requestWakeLock()
      }
    }

    void requestWakeLock()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      void sentinel?.release()
    }
  }, [enabled])
}
